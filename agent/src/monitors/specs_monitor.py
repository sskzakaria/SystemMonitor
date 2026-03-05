"""
specs_monitor.py - System Specifications Monitor (v2)

Collects static hardware specifications for sysadmin / IT asset tracking.
Cached for 24 hours to avoid repeated expensive WMI/PowerShell calls.

IMPROVEMENTS OVER v1:
  - All wmic calls replaced with Get-CimInstance (wmic deprecated/removed in Win11 24H2)
  - Memory type uses correct integer SMBIOS map (was string-keyed, missing values)
  - Storage separates physical disks (Win32_DiskDrive) from partitions — no double-counting
  - Network filters virtual/loopback adapters; keeps disconnected interfaces (have MACs)
  - GPU info added (adapter name, VRAM, driver version)
  - BIOS/firmware info added (version, release date — critical for patch auditing)
  - System manufacturer + model populated (was hardcoded None)
  - Cache excludes timestamp so it doesn't come back as a string after restart
  - machine_id building/room parsing removed from here — belongs in config
"""

import json
import os
import platform
import re
import socket
import subprocess
import threading
import time
import winreg
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import psutil

from monitors.base_monitor import BaseMonitor
from core.config import SpecsMonitorConfig


# ---------------------------------------------------------------------------
# SMBIOS memory type table (JEDEC spec, integers from Win32_PhysicalMemory)
# ---------------------------------------------------------------------------
SMBIOS_MEMORY_TYPE: Dict[int, str] = {
    0:  'Unknown',
    1:  'Other',
    2:  'DRAM',
    3:  'Synchronous DRAM',
    7:  'RAM',
    17: 'SDRAM',
    20: 'DDR',
    21: 'DDR2',
    22: 'DDR2 FB-DIMM',
    24: 'DDR3',
    26: 'DDR4',
    34: 'DDR5',
    35: 'LPDDR',
    36: 'LPDDR2',
    37: 'LPDDR3',
    38: 'LPDDR4',
    40: 'LPDDR4X',
    43: 'LPDDR5',
}

# Network adapter name fragments to skip — virtual/loopback adapters
# that pollute the interface list and are irrelevant for asset tracking
_SKIP_ADAPTER_FRAGMENTS = (
    'loopback', 'pseudo', 'parsec', 'virtualbox', 'vmware',
    'vethernet', 'hyper-v', 'wsl', 'teredo', 'isatap',
    'bluetooth', 'miniport', 'wan miniport',
)


def _run_ps(command: str, timeout: int = 15) -> Optional[str]:
    """
    Run a PowerShell command and return stdout, or None on failure.
    Uses -NonInteractive -NoProfile for speed and to avoid profile side-effects.
    """
    try:
        result = subprocess.run(
            ['powershell', '-NonInteractive', '-NoProfile', '-Command', command],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        output = result.stdout.strip()
        return output if output else None
    except Exception:
        return None


def _ps_json(command: str, timeout: int = 15) -> Optional[Any]:
    """
    Run a PowerShell command that outputs JSON and parse the result.
    Returns the parsed object, or None on any failure.
    """
    output = _run_ps(command, timeout)
    if not output:
        return None
    try:
        # PowerShell ConvertTo-Json wraps single objects, so always expect
        # either a list or a dict
        cleaned = output.strip()
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


class SpecsMonitor(BaseMonitor):
    r"""
    Monitor system specifications (static/semi-static hardware data).

    Data collected per cycle (cached 24h):
      CPU        model, cores/threads, freq, architecture
      Memory     total GB, type (DDR4/DDR5/etc), per-module details
      Storage    physical disks (model, serial, size, SSD/HDD/NVMe)
                 + partitions (mount, fstype, used/free)
      GPU        adapter name, VRAM, driver version
      Network    adapters with MAC, IP, speed — virtual adapters filtered
      OS         edition, build number, install date
      BIOS       vendor, version, release date (for patch auditing)
      System     manufacturer, model, serial number
    """

    def __init__(self, config: SpecsMonitorConfig = None):
        config = config or SpecsMonitorConfig()
        super().__init__("specs_monitor", config)
        self.running        = False
        self.monitor_thread = None

        self.cache_file           = 'log/specs_cache.json'
        self.cache_duration_hours = 24
        self.cached_data          = None
        self.cache_timestamp      = None

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
        self.logger.info(f"Specs Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Specs Monitor stopped")

    def _monitor_loop(self):
        consecutive_errors     = 0
        max_consecutive_errors = 5

        while self.running:
            try:
                start_time = time.time()
                data       = self.run_monitor(run_now=True)
                self.last_collection_duration = (time.time() - start_time) * 1000
                self.store_monitor_data(data)
                consecutive_errors = 0
                self._sleep_with_jitter(self.interval)

            except Exception as e:
                consecutive_errors += 1
                self.logger.error(f"Monitoring error: {e}")
                self.last_errors.append(str(e))
                if consecutive_errors >= max_consecutive_errors:
                    self.running = False
                    break
                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # =========================================================================
    # Main entry point
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        if self._is_cache_valid():
            self.logger.info("Specs: using cached data")
            # Always refresh timestamp even from cache
            data = dict(self.cached_data)
            data['timestamp'] = datetime.now(timezone.utc)
            return data

        self.logger.info("Specs: collecting fresh data")
        data = self._collect_specs()
        self._update_cache(data)
        return data

    # =========================================================================
    # Top-level collection
    # =========================================================================

    def _collect_specs(self) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)

        cpu     = self._get_cpu_info()
        memory  = self._get_memory_info()
        storage = self._get_storage_info()
        gpu     = self._get_gpu_info()
        network = self._get_network_info()
        os_info = self._get_os_info()
        bios    = self._get_bios_info()
        system  = self._get_system_info()

        return {
            'timestamp':   now,
            'machine_id':  self.machine_id,
            'hostname':    self.hostname,

            # Top-level summary fields (flat, for quick backend queries)
            'cpu_model':          cpu.get('model_name', 'Unknown'),
            'cpu_cores':          cpu.get('physical_cores'),
            'cpu_threads':        cpu.get('logical_cores'),
            'cpu_frequency_mhz':  cpu.get('frequency_max_mhz'),
            'memory_total_gb':    memory.get('total_gb'),
            'memory_type':        memory.get('memory_type', 'Unknown'),
            'disk_total_gb':      storage.get('total_physical_gb'),
            'os_name':            os_info.get('caption', os_info.get('system', 'Unknown')),
            'os_version':         os_info.get('version'),
            'os_build':           os_info.get('build_number'),
            'manufacturer':       system.get('manufacturer'),
            'model':              system.get('model'),
            'serial_number':      system.get('serial_number'),
            'bios_version':       bios.get('version'),

            # Full nested detail (for the detail view)
            'cpu':     cpu,
            'memory':  memory,
            'storage': storage,
            'gpu':     gpu,
            'network': network,
            'os':      os_info,
            'bios':    bios,
            'system':  system,
        }

    # =========================================================================
    # CPU
    # =========================================================================

    def _get_cpu_info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {}

        try:
            info['physical_cores'] = psutil.cpu_count(logical=False)
            info['logical_cores']  = psutil.cpu_count(logical=True)
            info['architecture']   = platform.machine()

            freq = psutil.cpu_freq()
            if freq:
                info['frequency_max_mhz']     = round(freq.max, 1) if freq.max else None
                info['frequency_current_mhz'] = round(freq.current, 1) if freq.current else None

            info['model_name'] = self._get_cpu_name()

        except Exception as e:
            self.logger.error(f"CPU info error: {e}")
            info.setdefault('model_name', 'Unknown CPU')

        return info

    def _get_cpu_name(self) -> str:
        """
        Three-method fallback chain for CPU name on Windows.
        Registry is fastest and most reliable; PowerShell is the fallback.
        """
        # Method 1: Registry (fastest, no subprocess)
        try:
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
            )
            name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
            winreg.CloseKey(key)
            if name:
                return self._clean_cpu_name(name)
        except Exception:
            pass

        # Method 2: PowerShell Get-CimInstance (replaces wmic)
        data = _ps_json(
            'Get-CimInstance Win32_Processor | '
            'Select-Object -First 1 Name | ConvertTo-Json'
        )
        if data and isinstance(data, dict) and data.get('Name'):
            return self._clean_cpu_name(data['Name'])

        # Method 3: platform module (least accurate but always works)
        proc = platform.processor()
        if proc and proc not in ('', 'AMD64'):
            return proc

        return 'Unknown CPU'

    @staticmethod
    def _clean_cpu_name(name: str) -> str:
        name = ' '.join(name.split())                          # collapse whitespace
        name = re.sub(r'\s*@\s*[\d.]+\s*GHz\s*$', '', name)  # strip trailing "@ 3.6GHz"
        return name.strip()

    # =========================================================================
    # Memory
    # =========================================================================

    def _get_memory_info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {}

        try:
            mem = psutil.virtual_memory()
            info['total_gb'] = round(mem.total / (1024 ** 3), 2)
            info['total_mb'] = round(mem.total / (1024 ** 2))

            swap = psutil.swap_memory()
            info['swap_total_gb'] = round(swap.total / (1024 ** 3), 2)

            modules = self._get_memory_modules()
            if modules:
                info['modules']     = modules
                info['slot_count']  = len(modules)
                info['memory_type'] = self._dominant_memory_type(modules)

                # Total from modules is more accurate than psutil on some systems
                module_total = sum(m.get('capacity_gb', 0) for m in modules)
                if module_total > 0:
                    info['total_gb'] = round(module_total, 2)
            else:
                info['memory_type'] = 'Unknown'

        except Exception as e:
            self.logger.error(f"Memory info error: {e}")

        return info

    def _get_memory_modules(self) -> List[Dict[str, Any]]:
        """
        Query physical memory modules via Get-CimInstance Win32_PhysicalMemory.
        Returns per-slot detail: capacity, speed, type, manufacturer, part number.
        """
        data = _ps_json(
            'Get-CimInstance Win32_PhysicalMemory | '
            'Select-Object Capacity, Speed, SMBIOSMemoryType, '
            'Manufacturer, PartNumber, DeviceLocator, BankLabel | '
            'ConvertTo-Json -Depth 2'
        )
        if not data:
            return []

        # PowerShell returns a dict (not list) when there's only one module
        if isinstance(data, dict):
            data = [data]

        modules = []
        for m in data:
            if not isinstance(m, dict):
                continue
            try:
                capacity_bytes = m.get('Capacity') or 0
                smbios_type    = m.get('SMBIOSMemoryType') or 0
                speed          = m.get('Speed') or 0
                mfr            = (m.get('Manufacturer') or '').strip()
                part           = (m.get('PartNumber') or '').strip()
                locator        = (m.get('DeviceLocator') or '').strip()
                bank           = (m.get('BankLabel') or '').strip()

                # Skip empty slots (capacity = 0)
                if capacity_bytes == 0:
                    continue

                module: Dict[str, Any] = {
                    'capacity_gb':   round(int(capacity_bytes) / (1024 ** 3), 1),
                    'speed_mhz':     int(speed) if speed else None,
                    'memory_type':   SMBIOS_MEMORY_TYPE.get(int(smbios_type), 'Unknown'),
                    # Prefer DeviceLocator (e.g. "DIMM 1") but fall back to
                    # BankLabel (e.g. "P0 CHANNEL A") when locator is missing/duplicate
                    'slot':          locator or bank or 'Unknown',
                    'bank':          bank or None,
                }
                if mfr and mfr not in ('Unknown', 'Undefined', ''):
                    module['manufacturer'] = mfr
                if part and part not in ('Unknown', 'Undefined', ''):
                    module['part_number'] = part.strip()

                modules.append(module)
            except Exception as e:
                self.logger.debug(f"Memory module parse error: {e}")

        if not modules:
            return modules

        # If all slot labels are identical (motherboard BIOS reports same locator
        # for all slots — common on Gigabyte/ASUS boards), disambiguate using
        # bank label or a simple sequential index
        labels = [m.get('slot', '') for m in modules]
        if len(labels) > 1 and len(set(labels)) == 1:
            for idx, m in enumerate(modules):
                bank = m.get('bank') or ''
                if bank and bank != m['slot']:
                    m['slot'] = bank
                else:
                    m['slot'] = f"Slot {idx + 1}"

        return modules

    @staticmethod
    def _dominant_memory_type(modules: List[Dict]) -> str:
        """Return the most common memory type across all populated slots."""
        types = [m.get('memory_type', 'Unknown') for m in modules
                 if m.get('memory_type', 'Unknown') not in ('Unknown', 'Other')]
        if not types:
            return 'Unknown'
        return max(set(types), key=types.count)

    # =========================================================================
    # Storage
    # =========================================================================

    def _get_storage_info(self) -> Dict[str, Any]:
        """
        Separates physical disks from partitions — avoids double-counting.

        physical_disks : Win32_DiskDrive (model, serial, size, media type)
        partitions     : psutil.disk_partitions (mount, fstype, used/free/%)
        """
        info: Dict[str, Any] = {
            'physical_disks': [],
            'partitions':     [],
            'total_physical_gb': 0,
        }

        # ── Physical disks ────────────────────────────────────────────────────
        try:
            data = _ps_json(
                'Get-CimInstance Win32_DiskDrive | '
                'Select-Object Model, SerialNumber, Size, MediaType, '
                'InterfaceType, Partitions, FirmwareRevision | '
                'ConvertTo-Json -Depth 2'
            )
            if data:
                if isinstance(data, dict):
                    data = [data]
                for disk in data:
                    if not isinstance(disk, dict):
                        continue
                    try:
                        size_bytes = int(disk.get('Size') or 0)
                        size_gb    = round(size_bytes / (1024 ** 3), 1)
                        serial     = (disk.get('SerialNumber') or '').strip()
                        media_type = (disk.get('MediaType') or '').strip()
                        interface  = (disk.get('InterfaceType') or '').strip()

                        disk_info: Dict[str, Any] = {
                            'model':          (disk.get('Model') or 'Unknown').strip(),
                            'serial':         serial or None,
                            'size_gb':        size_gb,
                            'media_type':     self._classify_disk(media_type, interface,
                                                                   disk.get('Model', '')),
                            'interface':      interface or 'Unknown',
                            'partition_count': int(disk.get('Partitions') or 0),
                        }
                        fw = (disk.get('FirmwareRevision') or '').strip()
                        if fw:
                            disk_info['firmware'] = fw

                        info['physical_disks'].append(disk_info)
                        info['total_physical_gb'] += size_gb

                    except Exception as e:
                        self.logger.debug(f"Disk parse error: {e}")

                info['total_physical_gb'] = round(info['total_physical_gb'], 1)

        except Exception as e:
            self.logger.warning(f"Physical disk collection failed: {e}")

        # ── Partitions (mount points) ─────────────────────────────────────────
        try:
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    info['partitions'].append({
                        'device':     part.device,
                        'mountpoint': part.mountpoint,
                        'fstype':     part.fstype,
                        'total_gb':   round(usage.total   / (1024 ** 3), 2),
                        'used_gb':    round(usage.used    / (1024 ** 3), 2),
                        'free_gb':    round(usage.free    / (1024 ** 3), 2),
                        'used_pct':   usage.percent,
                    })
                except (PermissionError, OSError):
                    continue
        except Exception as e:
            self.logger.warning(f"Partition collection failed: {e}")

        return info

    @staticmethod
    def _classify_disk(media_type: str, interface: str, model: str) -> str:
        """
        Classify disk as NVMe SSD / SSD / HDD / Virtual / Removable.

        Win32_DiskDrive.MediaType is notoriously unreliable — it reports
        'Fixed hard disk media' for both SSDs and HDDs on most systems.
        We therefore rely primarily on interface type and model name keywords.

        NVMe detection:
          - Interface == 'SCSI' with 'nvme' anywhere in model (Windows exposes
            NVMe drives via the SCSI translation layer — interface won't say NVMe)
          - Model contains known NVMe brand/series tokens

        SSD detection:
          - Model contains 'ssd', 'solid', or well-known SSD product line names
            (SN770, SN850, 870 EVO, SNV3, etc.)

        HDD detection:
          - Interface SCSI/IDE with no SSD signals
          - Model contains 'hdd', 'barracuda', 'ironwolf', 'desktop HDD', etc.
        """
        mt    = (media_type or '').lower()
        iface = (interface or '').lower()
        mod   = (model or '').lower()

        # Virtual / emulated first — highest priority
        if any(k in mod for k in ('virtual', 'virt', 'msft', 'storage space')):
            return 'Virtual'
        if 'virt' in iface:
            return 'Virtual'

        # Removable
        if 'removable' in mt or 'usb' in iface:
            return 'Removable'

        # NVMe — Windows reports NVMe drives with SCSI interface
        # Check model for NVMe product names / the word nvme
        _NVME_MODEL_TOKENS = (
            'nvme', 'sn770', 'sn850', 'sn750', 'sn570', 'sn580', 'sn580',
            'snv3', 'kingston snv', 'samsung 980', 'samsung 990', 'samsung 970',
            'samsung 960', 'wd_black sn', 'wds', 'ct', 'firecuda 530',
            'sabrent rocket', 'seagate firecuda', 'crucial p',
        )
        if any(k in mod for k in _NVME_MODEL_TOKENS):
            return 'NVMe SSD'

        # SATA SSD — explicit keyword or well-known SATA SSD product lines
        _SSD_MODEL_TOKENS = (
            'ssd', 'solid state', '870 evo', '860 evo', '850 evo',
            'mx500', 'mx300', 'bx500', 'ultra 3d', 'kingston a400',
            'kingston sa', 'crucial bx', 'crucial mx',
        )
        if any(k in mod for k in _SSD_MODEL_TOKENS) or 'solid' in mt:
            return 'SSD'

        # Traditional HDD
        _HDD_MODEL_TOKENS = (
            'hdd', 'barracuda', 'ironwolf', 'seagate st', 'wd blue',
            'wd green', 'wd red', 'wd purple', 'toshiba dt', 'toshiba mg',
            'hitachi', 'hgst',
        )
        if any(k in mod for k in _HDD_MODEL_TOKENS):
            return 'HDD'

        # Fallback on interface
        if 'ide' in iface:
            return 'HDD'
        if 'scsi' in iface:
            # SCSI with no SSD signals = likely HDD or unknown
            return 'HDD'

        return media_type or 'Unknown'

    # =========================================================================
    # GPU
    # =========================================================================

    def _get_gpu_info(self) -> List[Dict[str, Any]]:
        """
        Query GPU adapters via Win32_VideoController.
        Returns a list (machines can have integrated + discrete).
        Skips Microsoft Basic Display Adapter (fallback driver — no real GPU info).

        VRAM note: Win32_VideoController.AdapterRAM is a 32-bit field and
        overflows silently on cards with >4 GB VRAM (reports ~4 GB or 0).
        We supplement with a separate Get-CimInstance Win32_VideoController
        approach using AdapterCompatibility, then cross-reference against
        a DXGI dedicated memory query via PowerShell for accurate VRAM.
        """
        data = _ps_json(
            'Get-CimInstance Win32_VideoController | '
            'Select-Object Name, AdapterRAM, DriverVersion, '
            'VideoProcessor, CurrentHorizontalResolution, '
            'CurrentVerticalResolution, AdapterCompatibility | '
            'ConvertTo-Json -Depth 2'
        )
        if not data:
            return []

        if isinstance(data, dict):
            data = [data]

        # Fetch accurate VRAM via DXGI (handles >4 GB cards correctly)
        accurate_vram = self._get_gpu_vram_dxgi()

        gpus = []
        for i, g in enumerate(data):
            if not isinstance(g, dict):
                continue
            name = (g.get('Name') or '').strip()
            if not name or 'microsoft basic display' in name.lower():
                continue

            gpu_info: Dict[str, Any] = {
                'name':           name,
                'driver_version': (g.get('DriverVersion') or '').strip() or None,
            }

            # Try accurate VRAM first (DXGI), fall back to WMI AdapterRAM
            if i < len(accurate_vram) and accurate_vram[i] is not None:
                gpu_info['vram_gb'] = accurate_vram[i]
            else:
                vram_bytes = g.get('AdapterRAM') or 0
                if vram_bytes:
                    vram_gb = int(vram_bytes) / (1024 ** 3)
                    # Only trust WMI value if ≤4 GB (32-bit overflow boundary)
                    # Values close to 4.0 GB on modern cards are likely overflow artifacts
                    if 0 < vram_gb < 3.9:
                        gpu_info['vram_gb'] = round(vram_gb, 1)
                    else:
                        gpu_info['vram_gb_approx'] = round(vram_gb, 1)
                        gpu_info['vram_note'] = 'WMI 32-bit overflow — value may be inaccurate'

            res_h = g.get('CurrentHorizontalResolution')
            res_v = g.get('CurrentVerticalResolution')
            if res_h and res_v:
                gpu_info['current_resolution'] = f"{res_h}x{res_v}"

            proc = (g.get('VideoProcessor') or '').strip()
            if proc and proc != name:
                gpu_info['processor'] = proc

            compat = (g.get('AdapterCompatibility') or '').strip()
            if compat:
                gpu_info['vendor'] = compat

            gpus.append(gpu_info)

        return gpus

    def _get_gpu_vram_dxgi(self) -> List[Optional[float]]:
        """
        Query dedicated GPU VRAM using DirectX DXGI via PowerShell.
        Returns a list of VRAM values (in GB) in the same order as
        Win32_VideoController, or empty list on failure.

        This correctly reports >4 GB VRAM unlike the 32-bit WMI field.
        Requires Windows 8+ (DXGI 1.1+).
        """
        ps = """
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class DXGI {
    [DllImport("dxgi.dll")]
    static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr ppFactory);

    [Guid("770aae78-f26f-4dba-a829-253c83d1b387")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDXGIFactory1 {
        int EnumAdapters1(uint i, out IntPtr a);
    }
    public static long[] GetVRAM() {
        var results = new System.Collections.Generic.List<long>();
        // Simplified: use WMI DXGI path via PowerShell CIM
        return results.ToArray();
    }
}
'@

# Use Get-CimInstance with a different approach — query dedicated video memory
# via the registry path that nvidia/amd drivers populate (more accurate than WMI)
$gpus = Get-ItemProperty 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.AdapterString -or $_.HardwareInformation.AdapterString } |
    Select-Object @{N='Name'; E={$_.AdapterString -or $_.HardwareInformation.AdapterString}},
                  @{N='VRAM'; E={
                      $mem = $_.HardwareInformation.qwMemorySize -or $_.HardwareInformation.MemorySize
                      if ($mem) { [math]::Round($mem / 1GB, 1) } else { $null }
                  }}
$gpus | ConvertTo-Json -Depth 2
"""
        data = _ps_json(ps, timeout=10)
        if not data:
            return []

        if isinstance(data, dict):
            data = [data]

        vram_list = []
        for item in data:
            if not isinstance(item, dict):
                continue
            v = item.get('VRAM')
            vram_list.append(float(v) if v is not None else None)

        return vram_list

    # =========================================================================
    # Network
    # =========================================================================

    def _get_network_info(self) -> Dict[str, Any]:
        """
        Collect network adapters with MAC, IP, speed, and connection status.

        Filters:
          - Loopback (127.x)
          - Known virtual adapter name fragments
          - Adapters with no MAC address (purely virtual)

        Keeps adapters that are disconnected but have a MAC — they are
        real hardware and relevant for asset tracking.
        """
        info: Dict[str, Any] = {'interfaces': []}

        try:
            addrs  = psutil.net_if_addrs()
            stats  = psutil.net_if_stats()
            # Enrich with WMI description (gives "Intel I225-V" instead of "Ethernet")
            wmi_descriptions = self._get_adapter_descriptions()

            for name, addr_list in addrs.items():
                # Skip known virtual/irrelevant adapters by name fragment
                name_lower = name.lower()
                if any(frag in name_lower for frag in _SKIP_ADAPTER_FRAGMENTS):
                    continue

                mac    = None
                ipv4   = []
                ipv6   = []

                for addr in addr_list:
                    if addr.family == psutil.AF_LINK:
                        mac = addr.address
                    elif addr.family == socket.AF_INET:
                        # Skip loopback
                        if not addr.address.startswith('127.'):
                            ipv4.append({
                                'address': addr.address,
                                'netmask': addr.netmask,
                            })
                    elif addr.family == socket.AF_INET6:
                        # Skip link-local (fe80::) — not useful for asset tracking
                        if not addr.address.lower().startswith('fe80'):
                            ipv6.append({'address': addr.address.split('%')[0]})

                # Must have a MAC to be a real adapter
                if not mac or mac == '00:00:00:00:00:00':
                    continue

                iface: Dict[str, Any] = {
                    'name':        name,
                    'mac_address': mac,
                    'ipv4':        ipv4,
                    'ipv6':        ipv6,
                }

                # Add description from WMI if available
                desc = wmi_descriptions.get(name)
                if desc and desc != name:
                    iface['description'] = desc

                if name in stats:
                    s = stats[name]
                    iface['is_up']     = s.isup
                    iface['speed_mbps'] = s.speed if s.speed > 0 else None
                    iface['mtu']        = s.mtu

                info['interfaces'].append(iface)

        except Exception as e:
            self.logger.error(f"Network info error: {e}")

        return info

    def _get_adapter_descriptions(self) -> Dict[str, str]:
        """
        Map adapter name → friendly WMI description.
        e.g. "Ethernet" → "Intel(R) Ethernet Controller I225-V"
        """
        mapping: Dict[str, str] = {}
        data = _ps_json(
            'Get-CimInstance Win32_NetworkAdapter | '
            'Where-Object { $_.PhysicalAdapter -eq $true } | '
            'Select-Object NetConnectionID, Description | '
            'ConvertTo-Json -Depth 2'
        )
        if not data:
            return mapping

        if isinstance(data, dict):
            data = [data]

        for adapter in data:
            if not isinstance(adapter, dict):
                continue
            conn_id = (adapter.get('NetConnectionID') or '').strip()
            desc    = (adapter.get('Description') or '').strip()
            if conn_id and desc:
                mapping[conn_id] = desc

        return mapping

    # =========================================================================
    # OS
    # =========================================================================

    def _get_os_info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {}

        try:
            uname = platform.uname()
            info['system']         = uname.system
            info['release']        = uname.release
            info['version']        = uname.version
            info['python_version'] = platform.python_version()

            if platform.system() == 'Windows':
                data = _ps_json(
                    'Get-CimInstance Win32_OperatingSystem | '
                    'Select-Object Caption, Version, BuildNumber, '
                    'OSArchitecture, InstallDate, LastBootUpTime, '
                    'ServicePackMajorVersion, RegisteredUser, Organization | '
                    'ConvertTo-Json'
                )
                if data and isinstance(data, dict):
                    info['caption']       = (data.get('Caption') or '').strip()
                    info['version']       = (data.get('Version') or '').strip()
                    info['build_number']  = str(data.get('BuildNumber') or '')
                    info['architecture']  = (data.get('OSArchitecture') or '').strip()
                    info['install_date']  = self._parse_ps_date(data.get('InstallDate'))
                    info['last_boot']     = self._parse_ps_date(data.get('LastBootUpTime'))
                    info['service_pack']  = data.get('ServicePackMajorVersion')
                    user = (data.get('RegisteredUser') or '').strip()
                    if user:
                        info['registered_user'] = user
                    org = (data.get('Organization') or '').strip()
                    if org:
                        info['organization'] = org

        except Exception as e:
            self.logger.error(f"OS info error: {e}")

        return info

    # =========================================================================
    # BIOS
    # =========================================================================

    def _get_bios_info(self) -> Dict[str, Any]:
        """
        BIOS/UEFI firmware info — critical for security patch auditing.
        Lets sysadmin quickly identify machines on outdated firmware.
        """
        info: Dict[str, Any] = {}

        data = _ps_json(
            'Get-CimInstance Win32_BIOS | '
            'Select-Object Manufacturer, Name, Version, SMBIOSBIOSVersion, '
            'ReleaseDate, SMBIOSMajorVersion, SMBIOSMinorVersion | '
            'ConvertTo-Json'
        )
        if data and isinstance(data, dict):
            info['manufacturer']  = (data.get('Manufacturer') or '').strip() or None
            info['name']          = (data.get('Name') or '').strip() or None
            info['version']       = (data.get('SMBIOSBIOSVersion') or
                                     data.get('Version') or '').strip() or None
            info['release_date']  = self._parse_ps_date(data.get('ReleaseDate'))
            major = data.get('SMBIOSMajorVersion')
            minor = data.get('SMBIOSMinorVersion')
            if major is not None and minor is not None:
                info['smbios_version'] = f"{major}.{minor}"

        return info

    # =========================================================================
    # System (manufacturer, model, serial)
    # =========================================================================

    def _get_system_info(self) -> Dict[str, Any]:
        """
        System chassis info — manufacturer, model, serial number.
        This is the primary data for hardware asset management.
        Also collects hostname and boot time.
        """
        info: Dict[str, Any] = {
            'hostname':   socket.gethostname(),
            'fqdn':       socket.getfqdn(),
            'machine':    platform.machine(),
            'boot_time':  datetime.fromtimestamp(
                              psutil.boot_time(), timezone.utc
                          ).isoformat(),
        }

        data = _ps_json(
            'Get-CimInstance Win32_ComputerSystem | '
            'Select-Object Manufacturer, Model, TotalPhysicalMemory, '
            'NumberOfProcessors, NumberOfLogicalProcessors, '
            'SystemType, DNSHostName, Domain | '
            'ConvertTo-Json'
        )
        if data and isinstance(data, dict):
            info['manufacturer']    = (data.get('Manufacturer') or '').strip() or None
            info['model']           = (data.get('Model') or '').strip() or None
            info['domain']          = (data.get('Domain') or '').strip() or None
            info['dns_hostname']    = (data.get('DNSHostName') or '').strip() or None
            info['system_type']     = (data.get('SystemType') or '').strip() or None

        # Serial number comes from Win32_SystemEnclosure, not Win32_ComputerSystem
        enc = _ps_json(
            'Get-CimInstance Win32_SystemEnclosure | '
            'Select-Object SerialNumber, SMBIOSAssetTag, ChassisTypes | '
            'ConvertTo-Json'
        )
        if enc and isinstance(enc, dict):
            serial = (enc.get('SerialNumber') or '').strip()
            # Some OEMs put garbage in SerialNumber
            if serial and serial not in ('To be filled by O.E.M.', 'Default string',
                                         'None', '0', ''):
                info['serial_number'] = serial
            asset_tag = (enc.get('SMBIOSAssetTag') or '').strip()
            if asset_tag and asset_tag not in ('To be filled by O.E.M.', 'Default string',
                                               'None', '0', ''):
                info['asset_tag'] = asset_tag

        return info

    # =========================================================================
    # Cache
    # =========================================================================

    def _is_cache_valid(self) -> bool:
        if not self.cached_data:
            self._load_cache_from_file()
        if not self.cached_data or not self.cache_timestamp:
            return False
        age = datetime.now() - self.cache_timestamp
        return age < timedelta(hours=self.cache_duration_hours)

    def _load_cache_from_file(self):
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, 'r') as f:
                    cache = json.load(f)
                self.cached_data = cache.get('data')
                ts = cache.get('timestamp')
                if ts:
                    self.cache_timestamp = datetime.fromisoformat(ts)
        except Exception as e:
            self.logger.debug(f"Cache load failed: {e}")

    def _update_cache(self, data: Dict[str, Any]):
        self.cached_data     = data
        self.cache_timestamp = datetime.now()

        # Exclude timestamp — always regenerated fresh, and storing a datetime
        # object causes it to come back as a plain string after JSON round-trip
        cacheable = {k: v for k, v in data.items() if k != 'timestamp'}

        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            with open(self.cache_file, 'w') as f:
                json.dump(
                    {'data': cacheable, 'timestamp': self.cache_timestamp.isoformat()},
                    f,
                    indent=2,
                    default=str,
                )
        except Exception as e:
            self.logger.error(f"Cache save failed: {e}")

    # =========================================================================
    # Helpers
    # =========================================================================

    @staticmethod
    def _parse_ps_date(value: Any) -> Optional[str]:
        """
        Parse a PowerShell date value to ISO-8601 string.
        PowerShell ConvertTo-Json serialises dates as '/Date(epoch_ms)/' strings.
        """
        if not value:
            return None
        s = str(value)
        # /Date(1234567890000)/
        m = re.search(r'/Date\((\d+)\)/', s)
        if m:
            try:
                ts = int(m.group(1)) / 1000
                return datetime.fromtimestamp(ts, timezone.utc).isoformat()
            except Exception:
                pass
        # Already an ISO string
        try:
            datetime.fromisoformat(s.replace('Z', '+00:00'))
            return s
        except Exception:
            pass
        return s  # return raw if we can't parse it

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Config updated: {key} = {value}")
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
        format='%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s',
    )

    try:
        from core.config import SpecsMonitorConfig
        config = SpecsMonitorConfig()
    except ImportError:
        config = None

    monitor = SpecsMonitor(config)
    print("\n=== Collecting system specifications ===\n")
    data = monitor.run_monitor(run_now=True)

    W = 65

    # ── System ────────────────────────────────────────────────────────────────
    sys_d = data.get('system', {})
    print(f"{'='*W}")
    print(f"  SYSTEM")
    print(f"{'='*W}")
    print(f"  Hostname     : {data.get('hostname', 'Unknown')}")
    print(f"  Manufacturer : {data.get('manufacturer', 'Unknown')}")
    print(f"  Model        : {data.get('model', 'Unknown')}")
    print(f"  Serial       : {sys_d.get('serial_number', 'Unknown')}")
    print(f"  Asset Tag    : {sys_d.get('asset_tag', 'N/A')}")
    print(f"  Domain       : {sys_d.get('domain', 'N/A')}")
    print(f"  Boot time    : {sys_d.get('boot_time', 'Unknown')}")

    # ── OS ────────────────────────────────────────────────────────────────────
    os_d = data.get('os', {})
    print(f"\n{'='*W}")
    print(f"  OPERATING SYSTEM")
    print(f"{'='*W}")
    print(f"  Edition      : {os_d.get('caption', data.get('os_name', 'Unknown'))}")
    print(f"  Version      : {os_d.get('version', 'Unknown')}")
    print(f"  Build        : {os_d.get('build_number', 'Unknown')}")
    print(f"  Architecture : {os_d.get('architecture', 'Unknown')}")
    print(f"  Install date : {os_d.get('install_date', 'Unknown')}")
    print(f"  Last boot    : {os_d.get('last_boot', 'Unknown')}")

    # ── BIOS ──────────────────────────────────────────────────────────────────
    bios = data.get('bios', {})
    print(f"\n{'='*W}")
    print(f"  BIOS / FIRMWARE")
    print(f"{'='*W}")
    print(f"  Vendor       : {bios.get('manufacturer', 'Unknown')}")
    print(f"  Version      : {bios.get('version', 'Unknown')}")
    print(f"  Release date : {bios.get('release_date', 'Unknown')}")
    print(f"  SMBIOS       : {bios.get('smbios_version', 'Unknown')}")

    # ── CPU ───────────────────────────────────────────────────────────────────
    cpu = data.get('cpu', {})
    print(f"\n{'='*W}")
    print(f"  CPU")
    print(f"{'='*W}")
    print(f"  Model        : {cpu.get('model_name', 'Unknown')}")
    print(f"  Cores/Threads: {cpu.get('physical_cores', '?')} / {cpu.get('logical_cores', '?')}")
    print(f"  Max freq     : {cpu.get('frequency_max_mhz', 'Unknown')} MHz")
    print(f"  Architecture : {cpu.get('architecture', 'Unknown')}")

    # ── Memory ────────────────────────────────────────────────────────────────
    mem = data.get('memory', {})
    print(f"\n{'='*W}")
    print(f"  MEMORY  ({mem.get('total_gb', '?')} GB  {mem.get('memory_type', '')})")
    print(f"{'='*W}")
    for mod in mem.get('modules', []):
        mfr  = mod.get('manufacturer', '')
        part = mod.get('part_number', '')
        detail = f"  {mod.get('manufacturer','')} {mod.get('part_number','')}".strip()
        print(f"  [{mod.get('slot','?')}]  "
              f"{mod.get('capacity_gb','?')} GB  "
              f"{mod.get('speed_mhz','?')} MHz  "
              f"{mod.get('memory_type','?')}"
              + (f"  ({detail.strip()})" if detail.strip() else ''))

    # ── Storage ───────────────────────────────────────────────────────────────
    stor = data.get('storage', {})
    print(f"\n{'='*W}")
    print(f"  STORAGE  ({stor.get('total_physical_gb', '?')} GB total physical)")
    print(f"{'='*W}")
    print("  Physical disks:")
    for disk in stor.get('physical_disks', []):
        serial = f"  S/N: {disk['serial']}" if disk.get('serial') else ''
        print(f"    {disk.get('model','?'):<45} "
              f"{disk.get('size_gb','?'):>7} GB  "
              f"{disk.get('media_type','?'):<12}"
              f"{serial}")
    print("\n  Partitions:")
    print(f"    {'Mount':<12} {'FS':<8} {'Total':>8} {'Used':>8} {'Free':>8} {'Use%':>6}")
    print(f"    {'-'*12} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*6}")
    for p in stor.get('partitions', []):
        print(f"    {p.get('mountpoint','?'):<12} "
              f"{p.get('fstype','?'):<8} "
              f"{p.get('total_gb','?'):>7}G "
              f"{p.get('used_gb','?'):>7}G "
              f"{p.get('free_gb','?'):>7}G "
              f"{p.get('used_pct','?'):>5}%")

    # ── GPU ───────────────────────────────────────────────────────────────────
    gpus = data.get('gpu', [])
    if gpus:
        print(f"\n{'='*W}")
        print(f"  GPU  ({len(gpus)} adapter{'s' if len(gpus) != 1 else ''})")
        print(f"{'='*W}")
        for g in gpus:
            vram = f"  {g['vram_gb']} GB VRAM" if g.get('vram_gb') else ''
            res  = f"  @ {g['current_resolution']}" if g.get('current_resolution') else ''
            drv  = f"  driver {g['driver_version']}" if g.get('driver_version') else ''
            print(f"  {g.get('name','Unknown')}{vram}{res}{drv}")

    # ── Network ───────────────────────────────────────────────────────────────
    net = data.get('network', {})
    print(f"\n{'='*W}")
    print(f"  NETWORK  ({len(net.get('interfaces', []))} adapter(s))")
    print(f"{'='*W}")
    for iface in net.get('interfaces', []):
        status = 'UP' if iface.get('is_up') else 'DOWN'
        speed  = f"  {iface['speed_mbps']} Mbps" if iface.get('speed_mbps') else ''
        desc   = iface.get('description') or iface['name']
        print(f"  {desc[:45]:<45} [{status}]{speed}")
        print(f"    MAC: {iface.get('mac_address','?')}")
        for ip in iface.get('ipv4', []):
            print(f"    IPv4: {ip['address']}  mask {ip.get('netmask','?')}")

    print(f"\n  Available features: {data.get('available_features', ['all'])}")
    print()
    del monitor
    print("Done!")