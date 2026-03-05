"""
usb_devices_monitor.py - USB Monitor v3 (Snapshot-Diff + Registry Audit)

ARCHITECTURE:
  - No event log dependency (disabled by default on most machines)
  - No persistent WMI subscription (lost on restart anyway)
  - Snapshot-diff engine: detects connect/disconnect by comparing WMI snapshots
  - Registry audit: HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR for ever-seen devices
  - Physical device deduplication: one physical device = one entry (collapses multi-interface)
  - Root hub filtering: virtual hub constructs excluded from device count
  - Controller protocol inferred from name (WMI ProtocolSupported value unreliable)
  - Backend owns authoritative history; agent ships diffs each cycle

BACKEND INTEGRATION:
  POST /api/computers/<id>/usb
  {
    "snapshot":  [...],   # current connected devices (deduplicated)
    "events":    [...],   # connect/disconnect diffs since last cycle
    "audit":     [...],   # registry ever-seen list (storage devices)
    "timestamp": "..."
  }
"""

import re
import time
import winreg
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Set, Tuple

import sys
import os
if __name__ == "__main__":
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from monitors.base_monitor import WindowsWMIMonitor


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Device IDs that are virtual/internal and not useful for lab monitoring
_ROOT_HUB_PREFIXES = ('USB\\ROOT_HUB', 'USB\\ROOTHUB')

# Interfaces that represent the same physical USB device (multi-interface)
# We keep the most descriptive one and drop duplicates on VID:PID
_PREFER_INTERFACE_KEYWORDS = (
    # audio interface names take priority over generic "USB Composite Device"
    'audio', 'dantes', 'inline',
    # camera
    'webcam', 'camera', 'cam',
    # phone
    'iphone', 'android', 'mobile device usb device',
    # storage
    'disk', 'storage', 'flash',
    # input
    'keyboard', 'mouse',
)


class USBDevicesMonitor(WindowsWMIMonitor):
    r"""
    USB device monitor using snapshot-diff + registry audit strategy.

    Each cycle:
      1. Query current USB devices via WMI (snapshot)
      2. Deduplicate multi-interface devices (one physical device = one entry)
      3. Filter virtual root hubs
      4. Diff against previous snapshot to emit connect/disconnect events
      5. Scan HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR for audit list
      6. POST {snapshot, events, audit} to backend

    The backend is the authoritative store for history.
    The agent only needs the previous snapshot in memory.
    """

    def __init__(self, config=None):
        super().__init__("usb_devices_monitor", config)

        self.include_hubs        = getattr(config, 'INCLUDE_HUBS',          False)  # root hubs off by default
        self.include_controllers = getattr(config, 'INCLUDE_CONTROLLERS',   True)
        self.categorize_devices  = getattr(config, 'CATEGORIZE_DEVICES',    True)
        self.include_audit       = getattr(config, 'USB_INCLUDE_AUDIT',     True)
        self.deduplicate         = getattr(config, 'USB_DEDUPLICATE',       True)

        # Snapshot-diff state (in-memory, session lifetime only)
        # Key: stable device key (vid_pid or device_id) → device dict
        self._previous_snapshot: Dict[str, Dict] = {}
        self._snapshot_lock = threading.Lock()
        self._first_cycle   = True  # suppress flood of "connected" on startup

        self.working_features = {
            'usb_devices':     True,
            'usb_controllers': True,
            'usb_audit':       True,
        }

        self.running        = False
        self.monitor_thread = None

        self.logger.info("USB Devices Monitor initialised (snapshot-diff mode)")

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def start(self, interval: int = None):
        self.interval       = interval or self.config.INTERVAL
        self.running        = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True
        )
        self.monitor_thread.start()
        self.logger.info(f"USB Devices Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("USB Devices Monitor stopped")

    # =========================================================================
    # Monitor Loop
    # =========================================================================

    def _monitor_loop(self):
        self._init_com_for_thread()
        consecutive_errors     = 0
        max_consecutive_errors = 10

        try:
            while self.running:
                try:
                    if not self.circuit_breaker.is_available():
                        self.logger.warning("Circuit breaker OPEN, skipping")
                        time.sleep(self.interval)
                        continue

                    start_time  = time.time()
                    data        = self.circuit_breaker.call(self.run_monitor, run_now=True)
                    duration_ms = (time.time() - start_time) * 1000

                    self.last_collection_duration = duration_ms
                    self.health_metrics.record_success(duration_ms)
                    self.store_monitor_data(data)
                    consecutive_errors = 0
                    self._sleep_with_jitter(self.interval)

                except Exception as e:
                    consecutive_errors += 1
                    self.health_metrics.record_failure(f"{type(e).__name__}: {e}")
                    self.last_errors.append(str(e))
                    log = self.logger.warning if consecutive_errors <= 3 else self.logger.error
                    log(f"Collection error ({consecutive_errors}/{max_consecutive_errors}): {e}")
                    if consecutive_errors >= max_consecutive_errors:
                        self.running = False
                        break
                    time.sleep(min(self.interval, 2 ** consecutive_errors))
        finally:
            self._cleanup_com_for_thread()

    # =========================================================================
    # Main Collection
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        r"""
        Collect USB snapshot, diff events, and registry audit.

        Returns a dict structured for POST /api/computers/<id>/usb:
          snapshot  - deduplicated list of currently connected physical devices
          events    - connect/disconnect diffs since last cycle
          audit     - HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR ever-seen list
        """
        now = datetime.now(timezone.utc)

        data: Dict[str, Any] = {
            'timestamp':           now,
            'snapshot':            [],
            'events':              [],
            'audit':               [],
            'usb_controllers':     [],
            'devices_by_category': {
                'storage': [], 'input': [], 'audio': [],
                'hubs': [], 'printers': [], 'other': []
            },
        }

        # 1. Current snapshot (raw WMI → filtered → deduplicated)
        if self.working_features['usb_devices']:
            try:
                raw     = self._get_usb_devices_raw()
                cleaned = self._filter_and_dedup(raw)
                data['snapshot'] = cleaned
                if self.categorize_devices:
                    data['devices_by_category'] = self._categorize_devices(cleaned)
            except Exception as e:
                self.logger.warning(f"USB snapshot failed: {e}")
                self.working_features['usb_devices'] = False
                data['snapshot_error'] = str(e)

        # 2. Diff → connect/disconnect events
        data['events'] = self._diff_snapshots(data['snapshot'], now)

        # 3. Registry audit (ever-seen storage devices)
        if self.include_audit and self.working_features['usb_audit']:
            try:
                data['audit'] = self._get_registry_audit()
            except Exception as e:
                self.logger.warning(f"USB registry audit failed: {e}")
                self.working_features['usb_audit'] = False
                data['audit_error'] = str(e)

        # 4. Controllers
        if self.include_controllers and self.working_features['usb_controllers']:
            try:
                data['usb_controllers'] = self._get_usb_controllers()
            except Exception as e:
                self.logger.warning(f"USB controllers failed: {e}")
                self.working_features['usb_controllers'] = False

        # Summary
        cats = data['devices_by_category']
        data['total_usb_devices']     = len(data['snapshot'])
        data['total_storage_devices'] = len(cats['storage'])
        data['total_input_devices']   = len(cats['input'])
        data['total_audio_devices']   = len(cats['audio'])
        data['total_hubs']            = len(cats['hubs'])
        data['total_printers']        = len(cats['printers'])
        data['total_events']          = len(data['events'])
        data['total_audit_devices']   = len(data['audit'])
        data['available_features']    = [
            f for f, ok in self.working_features.items() if ok
        ]

        return data

    # =========================================================================
    # WMI: Raw USB Device Query
    # =========================================================================

    @staticmethod
    def _parse_vid_pid(device_id: str) -> Tuple[Optional[str], Optional[str]]:
        r"""
        Extract VID and PID from a Windows USB device ID string.
        e.g. USB\VID_0BDA&PID_8153\... -> ('0BDA', '8153')
        """
        vid = pid = None
        m = re.search(r'VID_([0-9A-Fa-f]{4})', device_id)
        if m:
            vid = m.group(1).upper()
        m = re.search(r'PID_([0-9A-Fa-f]{4})', device_id)
        if m:
            pid = m.group(1).upper()
        return vid, pid

    @staticmethod
    def _is_root_hub(device_id: str) -> bool:
        """Return True if the device is a virtual USB root hub."""
        uid = device_id.upper()
        return any(uid.startswith(p) for p in _ROOT_HUB_PREFIXES)

    def _get_usb_devices_raw(self) -> List[Dict[str, Any]]:
        """
        Query all active USB PnP devices from WMI.
        Returns the raw list before deduplication/filtering.
        Filters to USB\\ prefix in Python (WQL LIKE + backslash is unreliable).
        """
        devices = []
        wmi     = self._get_wmi_connection()

        for device in wmi.Win32_PnPEntity(ConfigManagerErrorCode=0):
            device_id = getattr(device, 'DeviceID', '') or ''
            if not device_id.upper().startswith('USB\\'):
                continue
            try:
                vid, pid = self._parse_vid_pid(device_id)
                is_root  = self._is_root_hub(device_id)

                info: Dict[str, Any] = {
                    'name':         device.Name         or 'Unknown',
                    'device_id':    device_id,
                    'description':  device.Description  or 'Unknown',
                    'manufacturer': device.Manufacturer or 'Unknown',
                    'status':       device.Status       or 'Unknown',
                    'is_root_hub':  is_root,
                }

                if vid:
                    info['vid']     = vid
                if pid:
                    info['pid']     = pid
                if vid and pid:
                    info['vid_pid'] = f"{vid}:{pid}"

                if getattr(device, 'PNPClass', None):
                    info['pnp_class'] = device.PNPClass
                if getattr(device, 'Service',  None):
                    info['service']   = device.Service
                if getattr(device, 'Present',  None) is not None:
                    info['present']   = device.Present

                devices.append(info)

            except Exception as e:
                self.logger.debug(f"Error reading USB device: {e}")

        return devices

    # =========================================================================
    # Filtering and Deduplication
    # =========================================================================

    def _filter_and_dedup(self, raw: List[Dict]) -> List[Dict]:
        """
        1. Optionally remove root hubs (virtual, not useful for lab monitoring)
        2. Optionally deduplicate multi-interface devices:
             One physical USB device (e.g. an iPhone) registers multiple
             logical interfaces in Windows — "Apple iPhone", "Apple Mobile
             Device USB Composite Device", "Apple Mobile Device USB Device".
             We collapse these to the single most-descriptive entry, keyed
             on VID:PID.  Devices without VID:PID are kept as-is.
        """
        # Step 1: root hub filter
        # Two cases to catch:
        #   a) Device ID matches USB\ROOT_HUB* prefix  (is_root_hub flag)
        #   b) No VID:PID AND name contains "root hub" (Windows sometimes
        #      doesn't expose VID/PID for root hubs, so the flag alone misses them)
        if not self.include_hubs:
            raw = [
                d for d in raw
                if not d.get('is_root_hub', False)
                and not (
                    not d.get('vid_pid')
                    and 'root hub' in d.get('name', '').lower()
                )
            ]

        if not self.deduplicate:
            return raw

        # Step 2: group by VID:PID, keep best representative per group
        no_vidpid: List[Dict]              = []
        by_vidpid: Dict[str, List[Dict]]   = {}

        for d in raw:
            vp = d.get('vid_pid')
            if not vp:
                no_vidpid.append(d)
            else:
                by_vidpid.setdefault(vp, []).append(d)

        result: List[Dict] = []
        for vp, group in by_vidpid.items():
            if len(group) == 1:
                result.append(group[0])
            else:
                result.append(self._pick_best_interface(group))

        result.extend(no_vidpid)
        return result

    # Generic names Windows assigns when no specific driver is loaded.
    # These are penalised in _pick_best_interface so a more descriptive
    # interface name always wins.
    _GENERIC_NAMES = frozenset({
        'usb composite device',
        'usb input device',
        'usb audio device',
        'usb device',
    })

    @staticmethod
    def _pick_best_interface(group: List[Dict]) -> Dict:
        """
        From a group of devices sharing the same VID:PID, pick the most
        descriptive interface name.  Scoring priority:
          1. Name matches a known descriptive keyword  (+1000 per keyword rank)
          2. Name is NOT a generic Windows fallback    (generics score 0)
          3. Longest name (more specific wins ties)

        Also merges the full device_id list onto the chosen entry so the
        backend knows all Windows interface IDs for this physical device.
        """
        def score(d: Dict) -> int:
            name = d.get('name', '').lower()
            # Hard penalise generic names — always lose to anything specific
            if name in USBDevicesMonitor._GENERIC_NAMES:
                return 0
            for i, kw in enumerate(_PREFER_INTERFACE_KEYWORDS):
                if kw in name:
                    return len(_PREFER_INTERFACE_KEYWORDS) - i + 1000
            return len(name)  # longer = more specific as tiebreaker

        best = max(group, key=score)

        # Attach all device_ids so backend can reference any interface
        all_ids = [d['device_id'] for d in group if d.get('device_id')]
        if len(all_ids) > 1:
            best = dict(best)   # don't mutate original
            best['all_device_ids']    = all_ids
            best['interface_count']   = len(group)

        return best

    # =========================================================================
    # Snapshot-Diff Engine
    # =========================================================================

    def _diff_snapshots(
        self,
        current_devices: List[Dict],
        timestamp: datetime
    ) -> List[Dict]:
        """
        Compare the current snapshot against the previous one.
        Emits 'connected' / 'disconnected' events for any change.

        Diff key: vid_pid if available, else device_id.
        This ensures deduplication doesn't cause false positives in the diff.

        First cycle: silently initialises the baseline — no events emitted
        (avoids flooding the backend on startup).
        """
        events: List[Dict] = []

        def _key(d: Dict) -> str:
            return d.get('vid_pid') or d.get('device_id', '')

        current_map: Dict[str, Dict] = {
            _key(d): d for d in current_devices if _key(d)
        }

        with self._snapshot_lock:
            if self._first_cycle:
                self._previous_snapshot = current_map
                self._first_cycle       = False
                return events

            prev_keys:    Set[str] = set(self._previous_snapshot.keys())
            current_keys: Set[str] = set(current_map.keys())

            for key in (current_keys - prev_keys):
                device = current_map[key]
                events.append(self._make_event('connected', device, timestamp))
                self.logger.info(
                    f"USB CONNECTED:    {device.get('name','?'):45s} "
                    f"VID:PID={device.get('vid_pid','?:?')}"
                )

            for key in (prev_keys - current_keys):
                device = self._previous_snapshot[key]
                events.append(self._make_event('disconnected', device, timestamp))
                self.logger.info(
                    f"USB DISCONNECTED: {device.get('name','?'):45s} "
                    f"VID:PID={device.get('vid_pid','?:?')}"
                )

            self._previous_snapshot = current_map

        return events

    @staticmethod
    def _make_event(action: str, device: Dict, timestamp: datetime) -> Dict:
        return {
            'timestamp': timestamp.isoformat(),
            'action':    action,
            'device_id': device.get('device_id', ''),
            'name':      device.get('name', 'Unknown'),
            'vid':       device.get('vid'),
            'pid':       device.get('pid'),
            'vid_pid':   device.get('vid_pid'),
            'source':    'snapshot_diff',
        }

    # =========================================================================
    # USB Controllers
    # =========================================================================

    def _get_usb_controllers(self) -> List[Dict[str, Any]]:
        """
        Query USB controllers. Infers protocol from controller name
        since WMI's ProtocolSupported field is unreliable (AMD xHCI
        controllers incorrectly report protocol 16 / OHCI).
        """
        controllers = []
        wmi = self._get_wmi_connection()

        for ctrl in wmi.Win32_USBController():
            try:
                info: Dict[str, Any] = {
                    'name':         ctrl.Name         or 'Unknown',
                    'device_id':    ctrl.DeviceID     or 'Unknown',
                    'manufacturer': ctrl.Manufacturer or 'Unknown',
                    'status':       ctrl.Status       or 'Unknown',
                }
                if getattr(ctrl, 'Description', None):
                    info['description'] = ctrl.Description

                info['protocol'] = self._infer_usb_protocol(ctrl.Name or '')

                controllers.append(info)
            except Exception as e:
                self.logger.debug(f"Error reading USB controller: {e}")

        return controllers

    @staticmethod
    def _infer_usb_protocol(name: str) -> str:
        """
        Infer USB protocol version from controller name string.
        More reliable than WMI ProtocolSupported across vendor implementations.
        """
        n = name.lower()
        if 'xhci' in n or '3.1' in n or '3.10' in n:
            return 'USB 3.1 (xHCI)'
        if '3.0' in n or 'xhci' in n:
            return 'USB 3.0 (xHCI)'
        if 'ehci' in n or '2.0' in n:
            return 'USB 2.0 (EHCI)'
        if 'ohci' in n or '1.1' in n:
            return 'USB 1.1 (OHCI)'
        if 'uhci' in n or '1.0' in n:
            return 'USB 1.0 (UHCI)'
        return 'Unknown'

    # =========================================================================
    # Registry Audit  (USBSTOR — ever-seen storage devices)
    # =========================================================================

    def _get_registry_audit(self) -> List[Dict[str, Any]]:
        r"""
        Scan HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR for every USB storage
        device ever connected to this machine.

        Returns a list with vendor, product, and serial number.
        No timestamps — the registry doesn't store them here — but the list
        survives reboots and requires zero configuration.

        Key structure:
          USBSTOR
          +-- Disk&Ven_<vendor>&Prod_<product>&Rev_<rev>   <- device class key
              +-- <serial>&0                               <- instance key
        """
        audit   = []
        reg_key = r"SYSTEM\CurrentControlSet\Enum\USBSTOR"

        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_key) as root:
                i = 0
                while True:
                    try:
                        device_class = winreg.EnumKey(root, i)
                        i += 1
                    except OSError:
                        break

                    try:
                        with winreg.OpenKey(root, device_class) as class_key:
                            j = 0
                            while True:
                                try:
                                    instance_name = winreg.EnumKey(class_key, j)
                                    j += 1
                                except OSError:
                                    break

                                try:
                                    entry = self._read_usbstor_instance(
                                        class_key, device_class, instance_name
                                    )
                                    if entry:
                                        audit.append(entry)
                                except Exception as e:
                                    self.logger.debug(f"USBSTOR instance read error: {e}")
                    except Exception as e:
                        self.logger.debug(f"USBSTOR class key error: {e}")

        except FileNotFoundError:
            self.logger.debug("USBSTOR key not found (no USB storage ever connected)")
        except PermissionError:
            self.logger.warning("Permission denied reading USBSTOR registry key")
        except Exception as e:
            self.logger.warning(f"Registry audit failed: {e}")

        return audit

    def _read_usbstor_instance(
        self,
        class_key,
        device_class: str,
        instance_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Read one USBSTOR instance and return a structured dict.

        device_class format : Disk&Ven_<vendor>&Prod_<product>&Rev_<rev>
        instance_name       : <serial>&0  (the serial survives reboots)
        """
        with winreg.OpenKey(class_key, instance_name) as inst_key:
            def _reg_get(name: str) -> Optional[str]:
                try:
                    val, _ = winreg.QueryValueEx(inst_key, name)
                    return str(val).strip() if val else None
                except OSError:
                    return None

            friendly_name = _reg_get('FriendlyName')
            hardware_ids  = _reg_get('HardwareID')
            mfr           = _reg_get('Mfg')

            vendor  = self._parse_usbstor_field(device_class, 'Ven')
            product = self._parse_usbstor_field(device_class, 'Prod')
            rev     = self._parse_usbstor_field(device_class, 'Rev')

            # Strip trailing &0 / &1 from instance name to get bare serial
            serial = re.sub(r'&\d+$', '', instance_name).strip()
            # Devices without real serials get a Windows-generated placeholder
            if serial in ('', '0', '00000000000000000'):
                serial = None

            vid = pid = None
            if hardware_ids:
                vid, pid = self._parse_vid_pid(hardware_ids)

            entry: Dict[str, Any] = {
                'device_class': device_class,
                'instance':     instance_name,
                'friendly_name': (
                    friendly_name
                    or f"{vendor or ''} {product or ''}".strip()
                    or 'Unknown'
                ),
                'vendor':       vendor,
                'product':      product,
                'revision':     rev,
                'serial':       serial,
                'manufacturer': mfr,
                'source':       'registry_usbstor',
            }

            if vid:
                entry['vid'] = vid
            if pid:
                entry['pid'] = pid
            if vid and pid:
                entry['vid_pid'] = f"{vid}:{pid}"

            return entry

    @staticmethod
    def _parse_usbstor_field(device_class: str, field: str) -> Optional[str]:
        """
        Extract a named field from a USBSTOR device class string.
        e.g. _parse_usbstor_field('Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00', 'Ven')
             -> 'SanDisk'
        """
        m = re.search(rf'{field}_([^&]+)', device_class, re.IGNORECASE)
        return m.group(1).strip() if m else None

    # =========================================================================
    # Device Categorisation
    # =========================================================================

    def _categorize_devices(self, devices: List[Dict]) -> Dict[str, List[Dict]]:
        categorized: Dict[str, List[Dict]] = {
            'storage': [], 'input': [], 'audio': [],
            'hubs': [], 'printers': [], 'other': []
        }
        for device in devices:
            name    = device.get('name', '').lower()
            desc    = device.get('description', '').lower()
            pnp     = device.get('pnp_class', '').lower()
            service = device.get('service', '').lower()

            if any(k in name or k in desc or k in pnp
                   for k in ('disk', 'storage', 'mass storage', 'flash', 'usbstor')):
                categorized['storage'].append(device)
            elif any(k in name or k in desc or k in pnp or k in service
                     for k in ('keyboard', 'mouse', 'hid', 'input', 'pointing')):
                categorized['input'].append(device)
            elif any(k in name or k in desc or k in pnp
                     for k in ('audio', 'sound', 'microphone', 'headset', 'speaker',
                                'scarlett', 'focusrite')):
                categorized['audio'].append(device)
            elif 'hub' in name or 'hub' in desc or 'hub' in pnp:
                categorized['hubs'].append(device)
            elif 'print' in name or 'print' in desc or 'print' in pnp:
                categorized['printers'].append(device)
            else:
                categorized['other'].append(device)

        return categorized

    # =========================================================================
    # Backend dispatch override
    # =========================================================================

    def store_monitor_data(self, data: Dict):
        """
        Override base store to route USB data to the dedicated endpoint
        POST /api/computers/<id>/usb instead of the generic data endpoint.
        """
        payload = {
            'timestamp': data['timestamp'].isoformat(),
            'snapshot':  data['snapshot'],
            'events':    data['events'],
            'audit':     data['audit'],
        }
        try:
            self._post_to_backend(
                f'/api/computers/{self.computer_id}/usb', payload
            )
        except Exception as e:
            self.logger.warning(f"Failed to post USB data to backend: {e}")

    # =========================================================================
    # Config hot-reload
    # =========================================================================

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Config updated: {key} = {value}")

        if 'CATEGORIZE_DEVICES'  in kwargs: self.categorize_devices  = kwargs['CATEGORIZE_DEVICES']
        if 'INCLUDE_HUBS'        in kwargs: self.include_hubs        = kwargs['INCLUDE_HUBS']
        if 'INCLUDE_CONTROLLERS' in kwargs: self.include_controllers = kwargs['INCLUDE_CONTROLLERS']
        if 'USB_INCLUDE_AUDIT'   in kwargs: self.include_audit       = kwargs['USB_INCLUDE_AUDIT']
        if 'USB_DEDUPLICATE'     in kwargs: self.deduplicate         = kwargs['USB_DEDUPLICATE']

        if 'INTERVAL' in kwargs and self.running:
            self.stop()
            self.start()


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    import logging
    logging.getLogger().handlers = []
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s'
    )

    try:
        from core.config import USBDevicesMonitorConfig
        config = USBDevicesMonitorConfig()
    except ImportError:
        config = None

    monitor = USBDevicesMonitor(config)
    print("\n=== Running USB Devices Monitor (snapshot-diff mode) ===\n")
    data = monitor.run_once()

    # ── Snapshot ──────────────────────────────────────────────────────────────
    print(f"{'='*65}")
    print(f"  CURRENT USB DEVICES ({data.get('total_usb_devices', 0)} found)")
    print(f"{'='*65}")
    cats = data.get('devices_by_category', {})
    print(f"  Storage  : {data.get('total_storage_devices', 0)}")
    print(f"  Input    : {data.get('total_input_devices', 0)}")
    print(f"  Audio    : {data.get('total_audio_devices', 0)}")
    print(f"  Hubs     : {data.get('total_hubs', 0)}")
    print(f"  Printers : {len(cats.get('printers', []))}")
    print(f"  Other    : {len(cats.get('other', []))}")

    print(f"\n  {'VID:PID':<10} {'Ifaces':<7} {'Name':<40} {'Manufacturer'}")
    print(f"  {'-'*10} {'-'*7} {'-'*40} {'-'*20}")
    for d in data.get('snapshot', []):
        vp     = d.get('vid_pid', '?:?')
        mfr    = (d.get('manufacturer', '') or '')[:20]
        if mfr in ('Unknown', '(Standard USB Host Controller)', ''):
            mfr = ''
        ifaces = str(d.get('interface_count', 1))
        print(f"  {vp:<10} {ifaces:<7} {d['name'][:40]:<40} {mfr}")

    # ── Diff events ───────────────────────────────────────────────────────────
    events = data.get('events', [])
    print(f"\n{'='*65}")
    print(f"  DIFF EVENTS this cycle ({len(events)})")
    print(f"{'='*65}")
    if events:
        for ev in events:
            ts  = ev['timestamp'][:19].replace('T', ' ')
            act = ev['action'].upper()
            vp  = ev.get('vid_pid', '?:?')
            print(f"  [{ts}] {act:<14} {vp:<10} {ev.get('name','?')}")
    else:
        print("  None (first cycle establishes baseline)")

    # ── Registry audit ────────────────────────────────────────────────────────
    audit = data.get('audit', [])
    print(f"\n{'='*65}")
    print(f"  REGISTRY AUDIT — USB storage ever connected ({len(audit)} devices)")
    print(f"{'='*65}")
    if audit:
        print(f"  {'Friendly Name':<35} {'Vendor':<12} {'Product':<15} Serial")
        print(f"  {'-'*35} {'-'*12} {'-'*15} {'-'*20}")
        for a in audit:
            name   = (a.get('friendly_name') or 'Unknown')[:35]
            vendor = (a.get('vendor') or '')[:12]
            prod   = (a.get('product') or '')[:15]
            serial = a.get('serial') or '(no serial)'
            print(f"  {name:<35} {vendor:<12} {prod:<15} {serial}")
    else:
        print("  No USB storage devices found in registry.")

    # ── Controllers ───────────────────────────────────────────────────────────
    controllers = data.get('usb_controllers', [])
    if controllers:
        print(f"\n{'='*65}")
        print(f"  USB CONTROLLERS ({len(controllers)} found)")
        print(f"{'='*65}")
        for c in controllers:
            proto = f"  [{c.get('protocol', '')}]" if c.get('protocol') else ''
            print(f"  {c['name']}{proto}")

    print(f"\n  Available features: {data.get('available_features', [])}")
    print()

    monitor._cleanup_com_for_thread()
    del monitor
    print("Done!")