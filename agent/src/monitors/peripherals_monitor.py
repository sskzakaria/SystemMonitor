"""
peripherals_monitor.py

Audio source priority:
  1. pycaw  (MMDevice API) — enumerates eRender / eCapture separately,
             no dependency on device.flow attribute, suppresses COMError
             warnings from virtual audio devices (Voicemeeter / VB-Audio)
  2. sounddevice (PortAudio) — correct split, but duplicates per sample rate
  3. WMI    — last resort, no input/output direction available

Install:
    pip install pycaw        # primary (recommended)
    pip install sounddevice  # secondary fallback
"""

import sys
import os
import threading
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

if __name__ == "__main__":
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from monitors.base_monitor import WindowsWMIMonitor

# --- pycaw (MMDevice API) ---
try:
    from pycaw.pycaw import AudioUtilities  # used only for availability check
    PYCAW_AVAILABLE = True
except ImportError:
    PYCAW_AVAILABLE = False

# --- sounddevice (PortAudio fallback) ---
try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False
    sd = None


class PeripheralsMonitor(WindowsWMIMonitor):
    """
    Monitor for peripheral devices: displays, audio, power.

    Audio source priority: pycaw → sounddevice → WMI
    """

    def __init__(self, config=None):
        super().__init__('peripherals_monitor', config)

        self.working_features = {
            'displays': True,
            'audio':    True,
            'power':    True,
        }

        self.collect_displays = getattr(config, 'COLLECT_DISPLAYS', True)
        self.collect_audio    = getattr(config, 'COLLECT_AUDIO',    True)
        self.collect_power    = getattr(config, 'COLLECT_POWER',    True)

        self.running        = False
        self.monitor_thread = None

        self.logger.info("Peripherals Monitor initialized")

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def start(self, interval: int = None):
        self.interval = interval or self.config.INTERVAL
        self.running  = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True
        )
        self.monitor_thread.start()
        self.logger.info(f"Peripherals Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Peripherals Monitor stopped")

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
                        self.logger.error("Stopping after too many consecutive errors")
                        self.running = False
                        break
                    time.sleep(min(self.interval, 2 ** consecutive_errors))
        finally:
            self._cleanup_com_for_thread()

    # =========================================================================
    # Data Collection
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        data = {
            'timestamp': datetime.now(timezone.utc),
            'displays':  [],
            'audio': {
                'input_devices':  [],
                'output_devices': [],
                'default_input':  'unknown',
                'default_output': 'unknown',
            },
            'power': {}
        }

        if self.collect_displays and self.working_features['displays']:
            try:
                data['displays'] = self._get_display_info()
            except Exception as e:
                self.logger.warning(f"Display collection failed: {e}")
                self.working_features['displays'] = False
                data['display_error'] = str(e)

        if self.collect_audio and self.working_features['audio']:
            try:
                data['audio'] = self._get_audio_info()
            except Exception as e:
                self.logger.warning(f"Audio collection failed: {e}")
                self.working_features['audio'] = False
                data['audio']['error'] = str(e)

        if self.collect_power and self.working_features['power']:
            try:
                data['power'] = self._get_power_info()
            except Exception as e:
                self.logger.warning(f"Power collection failed: {e}")
                self.working_features['power'] = False
                data['power'] = {'error': str(e)}

        data['total_displays']      = len(data['displays'])
        data['total_audio_inputs']  = len(data['audio'].get('input_devices', []))
        data['total_audio_outputs'] = len(data['audio'].get('output_devices', []))
        data['available_features']  = [f for f, ok in self.working_features.items() if ok]

        return data

    # =========================================================================
    # Display Info
    # =========================================================================

    def _get_display_info(self) -> List[Dict[str, Any]]:
        """
        Two WMI sources combined:
          1. Win32_VideoController  — GPU adapters (resolution, refresh rate)
          2. WmiMonitorID (root\wmi) — physical monitor manufacturer/model/serial

        Virtual adapters (Parsec, VirtualMonitor) are tagged virtual=True
        and have no WmiMonitorID entry.
        """
        wmi_cimv2 = self._get_wmi_connection()

        # GPU adapters
        gpu_adapters = []
        for ctrl in wmi_cimv2.Win32_VideoController():
            try:
                info = {
                    'gpu_name':       ctrl.Name or 'Unknown',
                    'adapter_type':   ctrl.AdapterCompatibility or 'Unknown',
                    'driver_version': ctrl.DriverVersion or 'Unknown',
                    'status':         ctrl.Status or 'Unknown',
                    'virtual':        False,
                }
                if getattr(ctrl, 'CurrentHorizontalResolution', None):
                    info['horizontal_resolution'] = ctrl.CurrentHorizontalResolution
                if getattr(ctrl, 'CurrentVerticalResolution', None):
                    info['vertical_resolution'] = ctrl.CurrentVerticalResolution
                if getattr(ctrl, 'CurrentRefreshRate', None):
                    info['refresh_rate'] = ctrl.CurrentRefreshRate
                if getattr(ctrl, 'AdapterRAM', None):
                    info['adapter_ram_mb'] = round(ctrl.AdapterRAM / (1024 * 1024), 2)
                name_lower = (ctrl.Name or '').lower()
                if any(v in name_lower for v in ('parsec', 'virtual', 'indirect')):
                    info['virtual'] = True
                gpu_adapters.append(info)
            except Exception as e:
                self.logger.debug(f"Error reading GPU adapter: {e}")

        # Physical monitor IDs from root\wmi
        physical_monitors = []
        try:
            import wmi as _wmi
            wmi_root = _wmi.WMI(namespace='root\\wmi')

            def _decode(arr):
                if not arr:
                    return None
                result = ''.join(chr(c) for c in arr if c != 0).strip()
                return result or None

            for mon in wmi_root.WmiMonitorID():
                try:
                    physical_monitors.append({
                        'manufacturer': _decode(getattr(mon, 'ManufacturerName', None)) or 'Unknown',
                        'model':        _decode(getattr(mon, 'UserFriendlyName', None)) or 'Unknown',
                        'serial':       _decode(getattr(mon, 'SerialNumberID', None)),
                        'year':         getattr(mon, 'YearOfManufacture', None),
                        'week':         getattr(mon, 'WeekOfManufacture', None),
                    })
                except Exception as e:
                    self.logger.debug(f"Error reading WmiMonitorID entry: {e}")
        except Exception as e:
            self.logger.debug(f"WmiMonitorID unavailable (non-critical): {e}")

        # Merge: pair physical monitors with non-virtual GPU adapters
        displays = []
        phys_iter = iter(physical_monitors)

        for adapter in gpu_adapters:
            entry = dict(adapter)
            if not adapter['virtual']:
                phys = next(phys_iter, None)
                if phys:
                    entry['monitor_manufacturer'] = phys['manufacturer']
                    entry['monitor_model']         = phys['model']
                    if phys['serial']:
                        entry['monitor_serial'] = phys['serial']
                    if phys['year']:
                        entry['monitor_year'] = phys['year']
            displays.append(entry)

        for phys in phys_iter:
            displays.append({
                'gpu_name':            'Unknown',
                'monitor_manufacturer': phys['manufacturer'],
                'monitor_model':        phys['model'],
                'serial':              phys.get('serial'),
                'virtual':             False,
            })

        return displays

    # =========================================================================
    # Audio Info
    # =========================================================================

    def _get_audio_info(self) -> Dict[str, Any]:
        """
        Priority: pycaw → sounddevice → WMI
        """
        if PYCAW_AVAILABLE:
            try:
                return self._get_audio_pycaw()
            except Exception as e:
                self.logger.debug(f"pycaw failed, trying sounddevice: {e}")

        if SOUNDDEVICE_AVAILABLE:
            try:
                return self._get_audio_sounddevice()
            except Exception as e:
                self.logger.debug(f"sounddevice failed, falling back to WMI: {e}")

        return self._get_audio_wmi()

    def _get_audio_pycaw(self) -> Dict[str, Any]:
        """
        Enumerate via pycaw (Windows MMDevice API).

        WHAT THE TEST REVEALED:
          - GetAllDevices() works and returns all 130 devices
          - GetAllSpeakers/GetAllMicrophones() don't exist in this pycaw version
          - device.flow attribute doesn't exist in this pycaw version
          - Fresh threads need CoInitialize called manually

        FLOW DIRECTION — parsed from device ID:
          {0.0.0.00000000}.{guid}  →  eRender  (output)
          {0.0.1.00000000}.{guid}  →  eCapture (input)

        None-named devices are disabled/disconnected endpoints — skipped.
        """
        import warnings as _warnings

        audio_info = {
            'input_devices':  [],
            'output_devices': [],
            'default_input':  'unknown',
            'default_output': 'unknown',
            'source':         'pycaw',
        }

        # --- Default output (GetSpeakers returns a wrapped object with .id) ---
        default_out_id = None
        default_in_id  = None
        try:
            spk = AudioUtilities.GetSpeakers()
            audio_info['default_output'] = spk.FriendlyName
            default_out_id = spk.id
        except Exception:
            pass

        # --- Default input ---
        # GetMicrophone() returns a raw POINTER(IMMDevice) in this pycaw
        # version — no .FriendlyName, but .GetId() works as a COM call.
        # We grab the ID here and match the name after enumeration below.
        try:
            mic_raw = AudioUtilities.GetMicrophone()
            if hasattr(mic_raw, 'FriendlyName') and mic_raw.FriendlyName:
                # Newer pycaw — wrapped object
                audio_info['default_input'] = mic_raw.FriendlyName
                default_in_id = mic_raw.id
            elif hasattr(mic_raw, 'GetId'):
                # Older pycaw — raw COM pointer, GetId() returns LPWSTR
                raw_id = mic_raw.GetId()
                # comtypes LPWSTR can be a ctypes pointer or a plain string
                default_in_id = raw_id.value if hasattr(raw_id, 'value') else str(raw_id)
        except Exception:
            pass

        # --- Enumerate all devices, split by ID prefix ---
        out_idx = 0
        in_idx  = 0
        try:
            with _warnings.catch_warnings():
                _warnings.simplefilter("ignore")
                all_devices = AudioUtilities.GetAllDevices()

            for dev in all_devices:
                try:
                    name = dev.FriendlyName
                    did  = dev.id

                    if not name:          # skip disabled/disconnected
                        continue

                    # Parse flow from Windows device ID third segment:
                    #   {0.0.0.00000000}.{guid}  →  0 = eRender  (output)
                    #   {0.0.1.00000000}.{guid}  →  1 = eCapture (input)
                    flow_digit = None
                    if did and did.startswith('{0.0.'):
                        try:
                            flow_digit = int(did[5])
                        except (ValueError, IndexError):
                            pass

                    if flow_digit == 0:
                        audio_info['output_devices'].append({
                            'index':      out_idx,
                            'id':         did,
                            'name':       name,
                            'is_default': did == default_out_id,
                        })
                        out_idx += 1
                    elif flow_digit == 1:
                        audio_info['input_devices'].append({
                            'index':      in_idx,
                            'id':         did,
                            'name':       name,
                            'is_default': did == default_in_id,
                        })
                        in_idx += 1

                except Exception as e:
                    self.logger.debug(f"Error reading pycaw device: {e}")

        except Exception as e:
            self.logger.debug(f"GetAllDevices() failed: {e}")
            raise

        # --- Resolve default input name from ID (matched post-enumeration) ---
        if default_in_id and audio_info['default_input'] == 'unknown':
            for dev in audio_info['input_devices']:
                if dev['id'] == default_in_id:
                    audio_info['default_input'] = dev['name']
                    dev['is_default'] = True
                    break

        return audio_info


    def _get_audio_sounddevice(self) -> Dict[str, Any]:
        """Enumerate via sounddevice (PortAudio). May include duplicates."""
        audio_info = {
            'input_devices':  [],
            'output_devices': [],
            'default_input':  'unknown',
            'default_output': 'unknown',
            'source':         'sounddevice',
        }

        devices         = sd.query_devices()
        default_in_idx  = sd.default.device[0]
        default_out_idx = sd.default.device[1]

        for i, device in enumerate(devices):
            base = {
                'index':       i,
                'name':        device['name'],
                'sample_rate': int(device['default_samplerate']),
                'is_default':  False,
            }
            if device['max_input_channels'] > 0:
                entry = {**base, 'channels': device['max_input_channels']}
                if i == default_in_idx:
                    entry['is_default'] = True
                    audio_info['default_input'] = device['name']
                audio_info['input_devices'].append(entry)

            if device['max_output_channels'] > 0:
                entry = {**base, 'channels': device['max_output_channels']}
                if i == default_out_idx:
                    entry['is_default'] = True
                    audio_info['default_output'] = device['name']
                audio_info['output_devices'].append(entry)

        return audio_info

    def _get_audio_wmi(self) -> Dict[str, Any]:
        """Last resort — WMI cannot distinguish input from output."""
        audio_info = {
            'input_devices':  [],
            'output_devices': [],
            'default_input':  'unknown',
            'default_output': 'unknown',
            'devices':        [],
            'source':         'wmi',
        }

        wmi = self._get_wmi_connection()
        for dev in wmi.Win32_SoundDevice():
            try:
                audio_info['devices'].append({
                    'name':         dev.Name or 'Unknown',
                    'manufacturer': dev.Manufacturer or 'Unknown',
                    'status':       dev.Status or 'Unknown',
                    'device_id':    dev.DeviceID or 'Unknown',
                })
            except Exception as e:
                self.logger.debug(f"Error reading WMI audio device: {e}")

        self.logger.warning(
            "Audio via WMI fallback — direction unavailable. "
            "Install pycaw: pip install pycaw"
        )
        return audio_info

    # =========================================================================
    # Power Info
    # =========================================================================

    def _get_power_info(self) -> Dict[str, Any]:
        """
        Power/battery info from WMI.

        PCSystemType codes (Win32_ComputerSystem):
          1=Desktop, 2=Mobile/Laptop, 3=Workstation, 4=Enterprise Server,
          5=SOHO Server, 6=Appliance PC, 7=Performance Server, 8=Maximum

        BatteryStatus codes (Win32_Battery):
          1=Discharging, 2=On AC/Charging, 3=Fully Charged,
          6,7,8,9=Various charging states
        """
        power = {
            'on_battery':      False,
            'battery_present': False,
            'battery_percent': None,
            'charging':        False,
            'machine_type':    'unknown',
            'on_ac':           True,
        }

        wmi = self._get_wmi_connection()

        # Detect machine type (desktop vs laptop)
        try:
            for cs in wmi.Win32_ComputerSystem():
                pc_type = getattr(cs, 'PCSystemType', None)
                type_map = {
                    1: 'desktop', 2: 'laptop', 3: 'workstation',
                    4: 'server',  5: 'server', 6: 'appliance',
                    7: 'server',
                }
                power['machine_type'] = type_map.get(pc_type, 'unknown')
                break
        except Exception as e:
            self.logger.debug(f"Error reading PCSystemType: {e}")

        # Battery details
        batteries = list(wmi.Win32_Battery())
        if batteries:
            bat = batteries[0]
            power['battery_present'] = True
            try:
                if getattr(bat, 'EstimatedChargeRemaining', None) is not None:
                    power['battery_percent'] = bat.EstimatedChargeRemaining
                if getattr(bat, 'BatteryStatus', None):
                    s = bat.BatteryStatus
                    power['on_battery']          = (s == 1)
                    power['on_ac']               = (s != 1)
                    power['charging']            = (s in [2, 6, 7, 8, 9])
                    power['battery_status_code'] = s
                if getattr(bat, 'EstimatedRunTime', None):
                    rt = bat.EstimatedRunTime
                    if rt != 71582788:  # Windows magic number for "unknown"
                        power['estimated_runtime_minutes'] = rt
                if getattr(bat, 'Name', None):
                    power['battery_name'] = bat.Name
                if getattr(bat, 'DesignCapacity', None):
                    power['design_capacity_mwh'] = bat.DesignCapacity
                if getattr(bat, 'FullChargeCapacity', None):
                    power['full_charge_capacity_mwh'] = bat.FullChargeCapacity
                    if getattr(bat, 'DesignCapacity', None) and bat.DesignCapacity > 0:
                        power['battery_health_pct'] = round(
                            bat.FullChargeCapacity / bat.DesignCapacity * 100, 1
                        )
            except Exception as e:
                self.logger.debug(f"Error reading battery details: {e}")
        else:
            power['battery_present'] = False
            power['machine_type']    = power.get('machine_type', 'desktop')

        return power

    # =========================================================================
    # Config
    # =========================================================================

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Config updated: {key} = {value}")

        if 'COLLECT_DISPLAYS' in kwargs:
            self.collect_displays = kwargs['COLLECT_DISPLAYS']
        if 'COLLECT_AUDIO' in kwargs:
            self.collect_audio = kwargs['COLLECT_AUDIO']
        if 'COLLECT_POWER' in kwargs:
            self.collect_power = kwargs['COLLECT_POWER']

        if 'INTERVAL' in kwargs and self.running:
            self.stop()
            self.start()


# =============================================================================
# Pretty-print helpers
# =============================================================================

def _print_audio(audio: Dict[str, Any]):
    source = audio.get('source', 'unknown')
    print(f"\n{'='*65}")
    print(f"  AUDIO DEVICES  (source: {source})")
    print(f"{'='*65}")

    if source in ('pycaw', 'sounddevice'):
        outputs = audio.get('output_devices', [])
        inputs  = audio.get('input_devices', [])

        def _header():
            if source == 'pycaw':
                print(f"  {'Idx':<5} {'Default':<9} {'Name'}")
                print(f"  {'-'*5} {'-'*9} {'-'*48}")
            else:
                print(f"  {'Idx':<5} {'Default':<9} {'Name':<42} {'Ch':>3} {'Hz':>8}")
                print(f"  {'-'*5} {'-'*9} {'-'*42} {'-'*3} {'-'*8}")

        def _row(d):
            flag = '  <---' if d.get('is_default') else ''
            dflt = 'YES' if d.get('is_default') else 'no'
            if source == 'pycaw':
                print(f"  {d['index']:<5} {dflt:<9} {d['name']}{flag}")
            else:
                print(f"  {d['index']:<5} {dflt:<9} {d['name'][:42]:<42} "
                      f"{d.get('channels','?'):>3} {d.get('sample_rate','?'):>8}{flag}")

        print(f"\n  OUTPUT DEVICES ({len(outputs)} found)")
        _header()
        for d in outputs:
            _row(d)

        print(f"\n  INPUT DEVICES ({len(inputs)} found)")
        _header()
        for d in inputs:
            _row(d)

        print(f"\n  Default output : {audio.get('default_output')}")
        print(f"  Default input  : {audio.get('default_input')}")

        if source == 'sounddevice':
            print("\n  ℹ  sounddevice may list the same device multiple times")
            print("     (once per sample rate). Install pycaw for clean results:")
            print("     pip install pycaw")

    elif source == 'wmi':
        devices = audio.get('devices', [])
        print(f"\n  DEVICES — direction unknown (WMI fallback, {len(devices)} found)")
        print(f"  {'Name':<45} {'Manufacturer':<25} {'Status'}")
        print(f"  {'-'*45} {'-'*25} {'-'*10}")
        for d in devices:
            print(f"  {d['name'][:45]:<45} {d['manufacturer'][:25]:<25} {d['status']}")
        print("\n  ⚠  Install pycaw: pip install pycaw")
    else:
        print("  No audio data collected.")
    print()


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    # Suppress duplicate root logger — see base_monitor note below
    logging.getLogger().handlers = []
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s'
    )

    if PYCAW_AVAILABLE:
        print("\n[audio] Using pycaw (MMDevice API)")
    elif SOUNDDEVICE_AVAILABLE:
        print("\n[audio] pycaw not found — using sounddevice")
    else:
        print("\n[audio] No audio library — falling back to WMI")

    try:
        from core.config import PeripheralsMonitorConfig
        config = PeripheralsMonitorConfig()
    except ImportError:
        config = None

    monitor = PeripheralsMonitor(config)

    print("\n=== Running peripherals monitor once ===")
    data = monitor.run_once()

    # Displays
    print(f"\n{'='*65}")
    print(f"  DISPLAYS ({data.get('total_displays', 0)} found)")
    print(f"{'='*65}")
    for i, d in enumerate(data.get('displays', [])):
        virtual_tag = "  [virtual]" if d.get('virtual') else ""
        res = ""
        if 'horizontal_resolution' in d and 'vertical_resolution' in d:
            res = f"  {d['horizontal_resolution']}x{d['vertical_resolution']}"
            if 'refresh_rate' in d:
                res += f" @ {d['refresh_rate']}Hz"
        gpu = d.get('gpu_name', d.get('name', 'Unknown'))
        print(f"  [{i}] {gpu}{res}{virtual_tag}")
        if d.get('monitor_model') and d['monitor_model'] != 'Unknown':
            mfr = d.get('monitor_manufacturer', '')
            mdl = d.get('monitor_model', '')
            ser = f"  SN:{d['monitor_serial']}" if d.get('monitor_serial') else ""
            yr  = f"  ({d['monitor_year']})" if d.get('monitor_year') else ""
            print(f"       Monitor: {mfr} {mdl}{ser}{yr}")

    # Audio
    _print_audio(data.get('audio', {}))

    # Power
    power = data.get('power', {})
    print(f"{'='*65}")
    print(f"  POWER  (machine type: {power.get('machine_type', 'unknown')})")
    print(f"{'='*65}")
    if power.get('battery_present'):
        pct      = power.get('battery_percent', '?')
        status   = 'charging' if power.get('charging') else ('on battery' if power.get('on_battery') else 'AC')
        print(f"  Battery : {pct}%  ({status})")
        if 'battery_health_pct' in power:
            print(f"  Health  : {power['battery_health_pct']}% of design capacity")
        if 'estimated_runtime_minutes' in power:
            print(f"  Runtime : {power['estimated_runtime_minutes']} min remaining")
        if 'battery_name' in power:
            print(f"  Name    : {power['battery_name']}")
    else:
        ac_status = 'on AC power' if power.get('on_ac', True) else 'unknown power source'
        print(f"  No battery — {ac_status}")

    print(f"\n  Available features : {data.get('available_features', [])}")
    print(f"  Audio source used  : {data.get('audio', {}).get('source', 'unknown')}")
    print()

    # Release WMI objects BEFORE CoUninitialize to prevent Win32 IUnknown errors.
    # The WMI connection is cached in _thread_local.wmi — deleting it lets COM
    # release all IUnknown refs cleanly before CoUninitialize tears down the apartment.
    if hasattr(monitor._thread_local, 'wmi'):
        del monitor._thread_local.wmi
    monitor._cleanup_com_for_thread()
    del monitor
    print("Done!")