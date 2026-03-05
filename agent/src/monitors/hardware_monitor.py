"""
hardware_monitor.py - Hardware Monitor (v2)

════════════════════════════════════════════════════════════════════════════════
BACKEND INTEGRATION & ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

TIER / ROLE
  This is the REAL-TIME monitor. It runs every 15-30 seconds and is the
  primary source of time-series data for Grafana dashboards and live alerts.

DESTINATION
  → InfluxDB  (time-series metrics, via backend)
  → MongoDB   (hardware_monitor_latest  — one doc per machine, upserted)
              (hardware_monitor_history — append-only, 30-day TTL)

ENDPOINT
  POST /api/v1/data/hardware

WHAT THIS MONITOR OWNS (dynamic, changes every cycle)
  CPU      usage %, per-core %, current freq, temperature
  Memory   used %, used GB, available GB, swap %
  Disk     I/O rates (MB/s, IOPS), per-partition free % (for alerting)
  Network  upload Mbps, download Mbps (delta from counters)
  GPU      usage %, memory used %, temperature  (via GPUtil/pynvml)
  System   process count, thread count, uptime, logged-in users

WHAT THIS MONITOR DOES NOT OWN
  network_monitor   →  ping latency, quality score, DNS, interface list
                        (runs every 2-5 min, too expensive for 30s cycle)
  specs_monitor     →  CPU model, RAM config, disk models, BIOS, GPU name
                        (cached 24h, static hardware identity)
  usb_monitor       →  USB device snapshots and connect/disconnect events

DUPLICATION REMOVED vs v1
  - _get_network_metrics no longer re-queries net_io_counters raw bytes
    (specs_monitor and network_monitor both did this too)
  - Disk partition usage is now a lightweight per-partition dict, not a
    duplicate of specs_monitor's physical disk query
  - GPU name/VRAM/driver are NOT collected here — that's specs_monitor.
    Here we only collect runtime metrics: load %, memory used %, temp

FIELD NAMES match backend FIELD_MAPPINGS from the v4.0 spec document.

GPU SUPPORT
  Primary:  pynvml  (NVIDIA, most accurate — direct driver access)
  Fallback: GPUtil  (wrapper around nvidia-smi, works for basic metrics)
  AMD:      psutil sensors + Win32_VideoController for temp (limited)
  If no GPU library is available, gpu_available=False and GPU fields omitted.
════════════════════════════════════════════════════════════════════════════════
"""

import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil

from monitors.base_monitor import BaseMonitor
from core.config import MonitorConfig

# ---------------------------------------------------------------------------
# Optional GPU libraries — graceful degradation if neither is installed
# ---------------------------------------------------------------------------
try:
    import pynvml
    pynvml.nvmlInit()
    PYNVML_AVAILABLE = True
except Exception:
    PYNVML_AVAILABLE = False

try:
    import GPUtil
    GPUTIL_AVAILABLE = True
except ImportError:
    GPUTIL_AVAILABLE = False


class HardwareMonitor(BaseMonitor):
    r"""
    Real-time hardware metrics monitor.

    Runs every 15-30 seconds. Sends flat payload to backend which writes
    to both InfluxDB (time-series/Grafana) and MongoDB (latest + history).

    Tracks previous I/O counters in memory to compute per-cycle deltas
    for disk throughput (MB/s, IOPS) and network throughput (Mbps).
    On the first cycle these delta fields are 0.0 — this is expected.
    """

    def __init__(self, config: MonitorConfig = None):
        config = config or MonitorConfig()
        super().__init__("hardware_monitor", config)

        self.running        = False
        self.monitor_thread = None

        # State for delta calculations (I/O rates require two snapshots)
        self._prev_disk_io:   Optional[Any]  = None
        self._prev_net_io:    Optional[Any]  = None
        self._prev_timestamp: Optional[float] = None

        # Warm up psutil CPU measurement — first call always returns 0.0
        # because it needs a baseline interval. Calling it twice here means
        # the first real cycle gets an accurate reading.
        try:
            psutil.cpu_percent(interval=None)
            psutil.cpu_percent(interval=None, percpu=True)
        except Exception:
            pass

        self._gpu_backend = self._detect_gpu_backend()
        self.logger.info(
            f"Hardware Monitor initialised  "
            f"(GPU backend: {self._gpu_backend or 'none'})"
        )

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def start(self, interval: int = None):
        self.interval = interval or getattr(self.config, 'HARDWARE_INTERVAL', 30)
        self.running  = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True
        )
        self.monitor_thread.start()
        self.logger.info(f"Hardware Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        if PYNVML_AVAILABLE:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
        self.logger.info("Hardware Monitor stopped")

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
                self.logger.error(f"Hardware monitoring error: {e}")
                self.last_errors.append(str(e))
                if consecutive_errors >= max_consecutive_errors:
                    self.logger.error("Too many consecutive errors, stopping")
                    self.running = False
                    break
                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # =========================================================================
    # Main collection — flat payload matching backend FIELD_MAPPINGS
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Collect all real-time hardware metrics.

        Returns a FLAT dict. All keys match the backend v4.0 FIELD_MAPPINGS
        so the backend can write directly to both InfluxDB and MongoDB without
        any field name translation on the agent side.
        """
        now           = datetime.now(timezone.utc)
        current_time  = time.monotonic()

        # Snapshot I/O counters BEFORE collecting other metrics so the
        # elapsed time is as accurate as possible
        current_disk_io = self._safe_disk_io()
        current_net_io  = self._safe_net_io()

        # Compute elapsed since last cycle (used for rate calculations)
        elapsed = (
            current_time - self._prev_timestamp
            if self._prev_timestamp is not None
            else None
        )

        payload: Dict[str, Any] = {
            'timestamp': now.isoformat(),
        }

        # Collect each section — one failure must not abort the rest
        payload.update(self._collect_cpu())
        payload.update(self._collect_memory())
        payload.update(self._collect_disk(current_disk_io, elapsed))
        payload.update(self._collect_network(current_net_io, elapsed))
        payload.update(self._collect_gpu())
        payload.update(self._collect_system())

        # Update state for next cycle
        self._prev_disk_io   = current_disk_io
        self._prev_net_io    = current_net_io
        self._prev_timestamp = current_time

        return payload

    # =========================================================================
    # CPU
    # =========================================================================

    def _collect_cpu(self) -> Dict[str, Any]:
        """
        CPU usage, per-core breakdown, current frequency, and temperature.

        cpu_percent(interval=None) is non-blocking because we called it
        twice in __init__ to seed the baseline. All subsequent calls return
        the delta since the last call.
        """
        m: Dict[str, Any] = {}
        try:
            m['cpu_usage_percent'] = round(psutil.cpu_percent(interval=None), 2)

            per_core = psutil.cpu_percent(interval=None, percpu=True)
            m['cpu_per_core_usage'] = [round(c, 2) for c in per_core]

            freq = psutil.cpu_freq()
            if freq:
                m['cpu_frequency_mhz'] = round(freq.current, 1)

            # CPU stats — useful for detecting interrupt storms
            stats = psutil.cpu_stats()
            m['ctx_switches'] = stats.ctx_switches
            m['interrupts']   = stats.interrupts

            # Temperature
            temp = self._get_cpu_temp()
            if temp is not None:
                m['cpu_temperature_c']     = temp
                m['sensors_available']     = True
            else:
                m['sensors_available']     = False

        except Exception as e:
            self.logger.error(f"CPU collection error: {e}")

        return m

    def _get_cpu_temp(self) -> Optional[float]:
        """
        Get CPU temperature. Strategy:
          1. psutil.sensors_temperatures() — works on Linux, sometimes Windows
          2. Windows: query LibreHardwareMonitor WMI namespace if running
          3. None if unavailable (temperature is optional)

        On Windows, psutil.sensors_temperatures() is only available if
        LibreHardwareMonitor or OpenHardwareMonitor is running as a service
        and has exposed the WMI namespace.
        """
        # Strategy 1: psutil sensors (Linux native, Windows with LHM)
        if hasattr(psutil, 'sensors_temperatures'):
            try:
                sensors = psutil.sensors_temperatures()
                if sensors:
                    # Priority order for CPU temp sensor names
                    cpu_keys = ('coretemp', 'k10temp', 'zenpower', 'cpu_thermal',
                                'acpitz', 'cpu-thermal')
                    for key in cpu_keys:
                        if key in sensors:
                            entries = [e.current for e in sensors[key] if e.current > 0]
                            if entries:
                                return round(max(entries), 1)  # report hottest core

                    # Fallback: find any entry with "package" or "tctl" in label
                    for key, entries in sensors.items():
                        for e in entries:
                            label = (e.label or '').lower()
                            if 'package' in label or 'tctl' in label:
                                if e.current > 0:
                                    return round(e.current, 1)
            except Exception:
                pass

        # Strategy 2: LibreHardwareMonitor WMI (Windows, if LHM service is running)
        if platform.system() == 'Windows':
            try:
                result = subprocess.run(
                    ['powershell', '-NonInteractive', '-NoProfile', '-Command',
                     'Get-CimInstance -Namespace root/LibreHardwareMonitor '
                     '-ClassName Sensor '
                     '| Where-Object { $_.SensorType -eq "Temperature" '
                     '-and ($_.Name -like "*CPU*" -or $_.Name -like "*Package*") } '
                     '| Sort-Object Value -Descending '
                     '| Select-Object -First 1 -ExpandProperty Value'],
                    capture_output=True, text=True, timeout=3,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                val = result.stdout.strip()
                if val:
                    return round(float(val), 1)
            except Exception:
                pass

        return None

    # =========================================================================
    # Memory
    # =========================================================================

    def _collect_memory(self) -> Dict[str, Any]:
        m: Dict[str, Any] = {}
        try:
            vm = psutil.virtual_memory()
            m['memory_usage_percent'] = round(vm.percent, 2)
            m['memory_used_gb']       = round(vm.used      / (1024 ** 3), 2)
            m['memory_available_gb']  = round(vm.available / (1024 ** 3), 2)
            m['memory_free_gb']       = round(vm.free      / (1024 ** 3), 2)
            m['memory_total_gb']      = round(vm.total     / (1024 ** 3), 2)

            swap = psutil.swap_memory()
            m['swap_usage_percent'] = round(swap.percent, 2)
            m['swap_used_gb']       = round(swap.used  / (1024 ** 3), 2)
            m['swap_total_gb']      = round(swap.total / (1024 ** 3), 2)

        except Exception as e:
            self.logger.error(f"Memory collection error: {e}")
        return m

    # =========================================================================
    # Disk
    # =========================================================================

    def _collect_disk(
        self,
        current_io: Optional[Any],
        elapsed: Optional[float],
    ) -> Dict[str, Any]:
        """
        Disk I/O rates (MB/s, IOPS) computed as deltas since last cycle.
        Also collects per-partition usage so the backend can alert on
        individual drives filling up — not just total aggregate.

        Note: disk_total_gb / disk_used_gb / disk_usage_percent in the
        payload are the AGGREGATE across all partitions (for InfluxDB).
        Per-partition detail is in the 'partitions' list (for MongoDB alerts).
        """
        m: Dict[str, Any] = {}

        # ── I/O rates ─────────────────────────────────────────────────────────
        try:
            if current_io and self._prev_disk_io and elapsed and elapsed > 0:
                read_bytes  = current_io.read_bytes  - self._prev_disk_io.read_bytes
                write_bytes = current_io.write_bytes - self._prev_disk_io.write_bytes
                read_ops    = current_io.read_count  - self._prev_disk_io.read_count
                write_ops   = current_io.write_count - self._prev_disk_io.write_count

                m['disk_read_mb']   = round(max(0, read_bytes)  / elapsed / (1024 ** 2), 2)
                m['disk_write_mb']  = round(max(0, write_bytes) / elapsed / (1024 ** 2), 2)
                m['disk_read_iops'] = round(max(0, read_ops)    / elapsed, 1)
                m['disk_write_iops']= round(max(0, write_ops)   / elapsed, 1)
            else:
                m['disk_read_mb']    = 0.0
                m['disk_write_mb']   = 0.0
                m['disk_read_iops']  = 0.0
                m['disk_write_iops'] = 0.0
        except Exception as e:
            self.logger.error(f"Disk I/O rate error: {e}")

        # ── Per-partition usage ───────────────────────────────────────────────
        partitions: List[Dict[str, Any]] = []
        total_bytes = used_bytes = 0

        try:
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    partitions.append({
                        'mountpoint':   part.mountpoint,
                        'fstype':       part.fstype,
                        'total_gb':     round(usage.total / (1024 ** 3), 2),
                        'used_gb':      round(usage.used  / (1024 ** 3), 2),
                        'free_gb':      round(usage.free  / (1024 ** 3), 2),
                        'usage_percent': round(usage.percent, 1),
                    })
                    total_bytes += usage.total
                    used_bytes  += usage.used
                except (PermissionError, OSError):
                    continue
        except Exception as e:
            self.logger.error(f"Partition collection error: {e}")

        m['partitions'] = partitions

        # Aggregate totals for InfluxDB (matches backend FIELD_MAPPINGS)
        if total_bytes > 0:
            m['disk_total_gb']      = round(total_bytes / (1024 ** 3), 2)
            m['disk_used_gb']       = round(used_bytes  / (1024 ** 3), 2)
            m['disk_free_gb']       = round((total_bytes - used_bytes) / (1024 ** 3), 2)
            m['disk_usage_percent'] = round((used_bytes / total_bytes) * 100, 2)

        # Also store cumulative I/O counters for the backend to compute its own deltas
        if current_io:
            m['disk_read_bytes']  = current_io.read_bytes
            m['disk_write_bytes'] = current_io.write_bytes

        return m

    # =========================================================================
    # Network throughput
    # =========================================================================

    def _collect_network(
        self,
        current_io: Optional[Any],
        elapsed:    Optional[float],
    ) -> Dict[str, Any]:
        """
        Network upload/download throughput as per-cycle deltas (Mbps).

        Deliberately minimal — this monitor only owns throughput rates.
        Ping latency, quality score, interface list, DNS, gateway all
        belong to network_monitor which runs on a slower cadence.

        Raw cumulative counters are also included so the backend can
        independently verify deltas if needed.
        """
        m: Dict[str, Any] = {}
        try:
            if current_io and self._prev_net_io and elapsed and elapsed > 0:
                sent_bytes  = current_io.bytes_sent   - self._prev_net_io.bytes_sent
                recv_bytes  = current_io.bytes_recv   - self._prev_net_io.bytes_recv
                pkts_sent   = current_io.packets_sent - self._prev_net_io.packets_sent
                pkts_recv   = current_io.packets_recv - self._prev_net_io.packets_recv

                m['network_upload_mbps']          = round(max(0, sent_bytes) * 8 / elapsed / 1_000_000, 3)
                m['network_download_mbps']        = round(max(0, recv_bytes) * 8 / elapsed / 1_000_000, 3)
                m['network_packets_sent_per_sec'] = round(max(0, pkts_sent) / elapsed, 1)
                m['network_packets_recv_per_sec'] = round(max(0, pkts_recv) / elapsed, 1)
            else:
                m['network_upload_mbps']          = 0.0
                m['network_download_mbps']        = 0.0
                m['network_packets_sent_per_sec'] = 0.0
                m['network_packets_recv_per_sec'] = 0.0

            if current_io:
                m['net_bytes_sent']   = current_io.bytes_sent
                m['net_bytes_recv']   = current_io.bytes_recv
                m['network_errors']   = current_io.errin + current_io.errout
                m['network_drops']    = current_io.dropin + current_io.dropout

        except Exception as e:
            self.logger.error(f"Network throughput error: {e}")
        return m

    # =========================================================================
    # GPU  (runtime metrics only — name/VRAM/driver are in specs_monitor)
    # =========================================================================

    def _collect_gpu(self) -> Dict[str, Any]:
        """
        GPU runtime metrics: utilisation %, memory used %, temperature.
        Static info (name, total VRAM, driver version) is in specs_monitor.

        Tries pynvml first (most accurate for NVIDIA), then GPUtil,
        then returns gpu_available=False.
        """
        if PYNVML_AVAILABLE:
            return self._gpu_via_pynvml()
        if GPUTIL_AVAILABLE:
            return self._gpu_via_gputil()
        return {'gpu_available': False}

    def _gpu_via_pynvml(self) -> Dict[str, Any]:
        """NVIDIA GPU metrics via pynvml (direct driver access, most accurate)."""
        m: Dict[str, Any] = {'gpu_available': False}
        try:
            count = pynvml.nvmlDeviceGetCount()
            if count == 0:
                return m

            m['gpu_available'] = True
            m['gpus']          = []

            for i in range(count):
                handle  = pynvml.nvmlDeviceGetHandleByIndex(i)
                util    = pynvml.nvmlDeviceGetUtilizationRates(handle)
                mem     = pynvml.nvmlDeviceGetMemoryInfo(handle)
                temp    = pynvml.nvmlDeviceGetTemperature(
                    handle, pynvml.NVML_TEMPERATURE_GPU
                )

                mem_used_pct = round((mem.used / mem.total) * 100, 1) if mem.total else 0

                gpu_entry: Dict[str, Any] = {
                    'id':                  i,
                    'load_percent':        round(util.gpu, 1),
                    'memory_used_percent': mem_used_pct,
                    'memory_used_mb':      round(mem.used  / (1024 ** 2), 0),
                    'memory_total_mb':     round(mem.total / (1024 ** 2), 0),
                    'temperature_c':       temp,
                }

                # Power draw (not available on all cards)
                try:
                    power_mw = pynvml.nvmlDeviceGetPowerUsage(handle)
                    gpu_entry['power_watts'] = round(power_mw / 1000, 1)
                except Exception:
                    pass

                # Fan speed (not available on all cards / laptop GPUs)
                try:
                    fan_pct = pynvml.nvmlDeviceGetFanSpeed(handle)
                    gpu_entry['fan_percent'] = fan_pct
                except Exception:
                    pass

                m['gpus'].append(gpu_entry)

            # Primary GPU summary fields (for InfluxDB — single-value fields)
            if m['gpus']:
                primary = m['gpus'][0]
                m['gpu_usage_percent']        = primary['load_percent']
                m['gpu_memory_usage_percent'] = primary['memory_used_percent']
                m['gpu_memory_used_mb']       = primary['memory_used_mb']
                m['gpu_temperature_c']        = primary['temperature_c']
                if 'power_watts' in primary:
                    m['gpu_power_watts']      = primary['power_watts']

        except Exception as e:
            self.logger.debug(f"pynvml GPU collection error: {e}")
            m['gpu_available'] = False

        return m

    def _gpu_via_gputil(self) -> Dict[str, Any]:
        """NVIDIA GPU metrics via GPUtil (wraps nvidia-smi, fallback)."""
        m: Dict[str, Any] = {'gpu_available': False}
        try:
            gpus = GPUtil.getGPUs()
            if not gpus:
                return m

            m['gpu_available'] = True
            m['gpus'] = []

            for gpu in gpus:
                if gpu.memoryTotal and gpu.memoryTotal > 0:
                    mem_pct = round((gpu.memoryUsed / gpu.memoryTotal) * 100, 1)
                else:
                    mem_pct = 0

                entry: Dict[str, Any] = {
                    'id':                  gpu.id,
                    'load_percent':        round(gpu.load * 100, 1),
                    'memory_used_percent': mem_pct,
                    'memory_used_mb':      gpu.memoryUsed,
                    'memory_total_mb':     gpu.memoryTotal,
                    'temperature_c':       gpu.temperature,
                }
                m['gpus'].append(entry)

            if m['gpus']:
                primary = m['gpus'][0]
                m['gpu_usage_percent']        = primary['load_percent']
                m['gpu_memory_usage_percent'] = primary['memory_used_percent']
                m['gpu_memory_used_mb']       = primary['memory_used_mb']
                m['gpu_temperature_c']        = primary['temperature_c']

        except Exception as e:
            self.logger.debug(f"GPUtil collection error: {e}")
            m['gpu_available'] = False

        return m

    # =========================================================================
    # System
    # =========================================================================

    def _collect_system(self) -> Dict[str, Any]:
        """
        System-level metrics: process/thread count, uptime, active users.
        These are cheap psutil calls — no subprocess required.
        """
        m: Dict[str, Any] = {}
        try:
            m['process_count'] = len(psutil.pids())

            # Thread count — iterate with exception safety
            thread_total = 0
            for proc in psutil.process_iter(['num_threads']):
                try:
                    nt = proc.info.get('num_threads') or 0
                    thread_total += nt
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            m['thread_count'] = thread_total

            boot_time    = psutil.boot_time()
            m['uptime_hours'] = round((time.time() - boot_time) / 3600, 2)
            m['boot_time']    = datetime.fromtimestamp(
                boot_time, tz=timezone.utc
            ).isoformat()

            m['logged_in_users'] = len(psutil.users())

        except Exception as e:
            self.logger.error(f"System metrics error: {e}")
        return m

    # =========================================================================
    # Helpers
    # =========================================================================

    @staticmethod
    def _safe_disk_io() -> Optional[Any]:
        """Return disk I/O counters, or None on failure."""
        try:
            return psutil.disk_io_counters()
        except Exception:
            return None

    @staticmethod
    def _safe_net_io() -> Optional[Any]:
        """Return net I/O counters, or None on failure."""
        try:
            return psutil.net_io_counters()
        except Exception:
            return None

    @staticmethod
    def _detect_gpu_backend() -> Optional[str]:
        if PYNVML_AVAILABLE:
            try:
                if pynvml.nvmlDeviceGetCount() > 0:
                    return 'pynvml'
            except Exception:
                pass
        if GPUTIL_AVAILABLE:
            try:
                if GPUtil.getGPUs():
                    return 'gputil'
            except Exception:
                pass
        return None

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Config updated: {key} = {value}")
        if 'HARDWARE_INTERVAL' in kwargs and self.running:
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
        from core.config import MonitorConfig
        config = MonitorConfig()
    except ImportError:
        config = None

    monitor = HardwareMonitor(config)

    print("\n=== Hardware Monitor — Cycle 1 (baseline) ===")
    data1 = monitor.run_monitor(run_now=True)

    print("Waiting 3 seconds for meaningful I/O delta...\n")
    time.sleep(3)

    print("=== Hardware Monitor — Cycle 2 (with deltas) ===\n")
    data = monitor.run_monitor(run_now=True)

    W = 65

    # ── CPU ───────────────────────────────────────────────────────────────────
    print(f"{'='*W}")
    print(f"  CPU")
    print(f"{'='*W}")
    print(f"  Usage        : {data.get('cpu_usage_percent', '?')}%")
    per_core = data.get('cpu_per_core_usage', [])
    if per_core:
        cores_str = '  '.join(f"{c:.1f}%" for c in per_core)
        print(f"  Per-core     : {cores_str}")
    print(f"  Frequency    : {data.get('cpu_frequency_mhz', '?')} MHz")
    temp = data.get('cpu_temperature_c')
    if temp:
        print(f"  Temperature  : {temp}°C")
    else:
        print(f"  Temperature  : N/A (LHM not running or unsupported)")
    print(f"  Ctx switches : {data.get('ctx_switches', '?'):,}")

    # ── Memory ────────────────────────────────────────────────────────────────
    print(f"\n{'='*W}")
    print(f"  MEMORY")
    print(f"{'='*W}")
    print(f"  Usage        : {data.get('memory_usage_percent', '?')}%  "
          f"({data.get('memory_used_gb','?')} / {data.get('memory_total_gb','?')} GB)")
    print(f"  Available    : {data.get('memory_available_gb', '?')} GB")
    print(f"  Swap         : {data.get('swap_used_gb','?')} / {data.get('swap_total_gb','?')} GB  "
          f"({data.get('swap_usage_percent','?')}%)")

    # ── Disk ──────────────────────────────────────────────────────────────────
    print(f"\n{'='*W}")
    print(f"  DISK I/O")
    print(f"{'='*W}")
    print(f"  Read         : {data.get('disk_read_mb','?')} MB/s  "
          f"({data.get('disk_read_iops','?')} IOPS)")
    print(f"  Write        : {data.get('disk_write_mb','?')} MB/s  "
          f"({data.get('disk_write_iops','?')} IOPS)")
    print(f"\n  Partitions:")
    print(f"  {'Mount':<12} {'FS':<8} {'Used%':>6}  {'Free':>8}  {'Total':>8}")
    print(f"  {'-'*12} {'-'*8} {'-'*6}  {'-'*8}  {'-'*8}")
    for p in data.get('partitions', []):
        alert = ' ⚠' if p['usage_percent'] >= 90 else ''
        print(f"  {p['mountpoint']:<12} {p['fstype']:<8} "
              f"{p['usage_percent']:>5.1f}%  "
              f"{p['free_gb']:>7.1f}G  "
              f"{p['total_gb']:>7.1f}G{alert}")

    # ── Network ───────────────────────────────────────────────────────────────
    print(f"\n{'='*W}")
    print(f"  NETWORK THROUGHPUT")
    print(f"{'='*W}")
    print(f"  Upload       : {data.get('network_upload_mbps','?')} Mbps")
    print(f"  Download     : {data.get('network_download_mbps','?')} Mbps")
    print(f"  Pkt sent/s   : {data.get('network_packets_sent_per_sec','?')}")
    print(f"  Pkt recv/s   : {data.get('network_packets_recv_per_sec','?')}")
    errs = data.get('network_errors', 0)
    if errs:
        print(f"  Errors       : {errs}  ⚠")

    # ── GPU ───────────────────────────────────────────────────────────────────
    if data.get('gpu_available'):
        print(f"\n{'='*W}")
        print(f"  GPU")
        print(f"{'='*W}")
        for g in data.get('gpus', []):
            print(f"  GPU {g['id']}:")
            print(f"    Load         : {g.get('load_percent','?')}%")
            print(f"    VRAM used    : {g.get('memory_used_percent','?')}%  "
                  f"({g.get('memory_used_mb','?')} / {g.get('memory_total_mb','?')} MB)")
            print(f"    Temperature  : {g.get('temperature_c','?')}°C")
            if 'power_watts' in g:
                print(f"    Power        : {g['power_watts']} W")
            if 'fan_percent' in g:
                print(f"    Fan          : {g['fan_percent']}%")
    else:
        print(f"\n  GPU: not available (install pynvml or GPUtil for NVIDIA support)")

    # ── System ────────────────────────────────────────────────────────────────
    print(f"\n{'='*W}")
    print(f"  SYSTEM")
    print(f"{'='*W}")
    print(f"  Processes    : {data.get('process_count','?')}")
    print(f"  Threads      : {data.get('thread_count','?'):,}")
    print(f"  Uptime       : {data.get('uptime_hours','?'):.1f} hours")
    print(f"  Users logged : {data.get('logged_in_users','?')}")

    print()
    del monitor
    print("Done!")