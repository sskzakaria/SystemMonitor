"""
application_monitor.py - Application Monitor (v2)

════════════════════════════════════════════════════════════════════════════════
BACKEND INTEGRATION & ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

PURPOSE
  Tracks running processes: top CPU/memory consumers, application categories,
  process counts by status. Useful for detecting unexpected software, heavy
  processes, and lab usage patterns (is anyone running Chrome? VS Code?).

DESTINATION  →  MongoDB only  (POST /api/v1/data/application)
  Process lists are not time-series data suitable for InfluxDB.
  The backend stores latest + history in MongoDB.
  Exception: process_count and thread_count are already sent by
  hardware_monitor to InfluxDB — NOT duplicated here.

WHAT THIS MONITOR DOES NOT OWN
  cpu_usage_percent     →  hardware_monitor (real-time, every 30s, InfluxDB)
  memory_usage_percent  →  hardware_monitor (real-time, every 30s, InfluxDB)
  process_count         →  hardware_monitor (real-time, every 30s, InfluxDB)
  thread_count          →  hardware_monitor (real-time, every 30s, InfluxDB)

  _get_system_totals() was removed — it was a duplicate of hardware_monitor
  data collected on a slower, less accurate interval.

TIMING FIXES (v1 → v2)
  v1: proc.cpu_percent(interval=0.1) inside a loop over all processes
      → 200+ processes × 100ms blocking sleep = potentially 20+ seconds
  v2: Two-pass approach — seed all processes with interval=None, sleep
      once globally for 0.5s, then read all at once. Total: ~0.5s for
      all processes combined regardless of process count.

  v1: psutil.cpu_percent(interval=0.1) called twice in _get_system_totals
      (blocking, and duplicating hardware_monitor)
  v2: _get_system_totals() removed entirely.
════════════════════════════════════════════════════════════════════════════════
"""

import threading
import time
import psutil
from collections import Counter
from typing import Any, Dict, List

from monitors.base_monitor import BaseMonitor
from core.config import ApplicationMonitorConfig


# ---------------------------------------------------------------------------
# Application category keyword sets
# Compiled once at module load — not rebuilt every cycle
# ---------------------------------------------------------------------------
_CATEGORIES: Dict[str, tuple] = {
    'browsers':      ('chrome', 'firefox', 'msedge', 'edge', 'safari',
                      'brave', 'opera', 'vivaldi', 'iexplore'),
    'office':        ('winword', 'excel', 'powerpnt', 'outlook', 'onenote',
                      'msaccess', 'mspub', 'lync'),
    'development':   ('code', 'devenv', 'pycharm', 'idea', 'eclipse',
                      'androidstudio', 'xcode', 'vim', 'nvim', 'sublime_text',
                      'atom', 'rider', 'clion', 'goland', 'webstorm',
                      'datagrip', 'rubymine', 'phpstorm'),
    'communication': ('slack', 'teams', 'discord', 'zoom', 'skype',
                      'telegram', 'signal', 'mattermost', 'webex'),
    'media':         ('spotify', 'vlc', 'wmplayer', 'groove', 'itunes',
                      'winamp', 'mpv', 'mpc-hc', 'mpc-be'),
    'system':        ('svchost', 'lsass', 'csrss', 'winlogon', 'wininit',
                      'services', 'smss', 'registry', 'dwm', 'fontdrvhost',
                      'spoolsv', 'taskhostw', 'sihost', 'ctfmon'),
}


def _categorise(name: str) -> str:
    """Return category key for a process name, defaulting to 'other'."""
    n = name.lower().replace('.exe', '')
    for category, keywords in _CATEGORIES.items():
        if any(kw in n for kw in keywords):
            return category
    return 'other'


class ApplicationMonitor(BaseMonitor):
    """
    Monitor running processes and application mix.

    Uses a two-pass CPU measurement strategy to avoid blocking the thread
    for each process individually:
      Pass 1: seed cpu_percent for all processes (non-blocking, returns 0.0)
      Sleep:  0.5s once for the entire process list
      Pass 2: read cpu_percent for all processes (non-blocking, returns delta)

    Total CPU measurement time: ~0.5s regardless of process count.
    """

    def __init__(self, config: ApplicationMonitorConfig = None):
        config = config or ApplicationMonitorConfig()
        super().__init__("application_monitor", config)
        self.running        = False
        self.monitor_thread = None
        self.top_n          = getattr(config, 'TRACK_TOP_PROCESSES', 10)
        self.cpu_count      = psutil.cpu_count(logical=True) or 1

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
        self.logger.info(f"Application Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Application Monitor stopped")

    def _monitor_loop(self):
        consecutive_errors = 0
        while self.running:
            try:
                t0   = time.time()
                data = self.run_monitor(run_now=True)
                self.last_collection_duration = (time.time() - t0) * 1000
                self.store_monitor_data(data)
                consecutive_errors = 0
                self._sleep_with_jitter(self.interval)
            except Exception as e:
                consecutive_errors += 1
                self.logger.error(f"Application monitoring error: {e}")
                self.last_errors.append(str(e))
                if consecutive_errors >= 5:
                    self.running = False
                    break
                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # =========================================================================
    # Main collection
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Collect process metrics.

        CPU measurement uses a two-pass approach:
          1. Iterate all processes with cpu_percent(interval=None) → seeds baseline
          2. Sleep 0.5s once
          3. Iterate again with cpu_percent(interval=None) → returns delta %

        This gives accurate per-process CPU in ~0.5s total instead of
        100ms × N_processes with the old interval= approach.
        """
        attrs = ['pid', 'name', 'status', 'username',
                 'memory_info', 'memory_percent']

        # ── Pass 1: seed CPU baseline ─────────────────────────────────────────
        proc_objects = []
        for proc in psutil.process_iter(attrs):
            try:
                proc.cpu_percent(interval=None)   # seeds — always returns 0.0
                proc_objects.append(proc)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        # ── Single global sleep ───────────────────────────────────────────────
        time.sleep(0.5)

        # ── Pass 2: read CPU deltas ───────────────────────────────────────────
        process_data: List[Dict[str, Any]] = []
        status_counts: Counter = Counter()

        for proc in proc_objects:
            try:
                info       = proc.as_dict(attrs=attrs)
                cpu_raw    = proc.cpu_percent(interval=None)
                # Normalise: divide by logical CPU count so 100% = all cores busy
                cpu_norm   = round(cpu_raw / self.cpu_count, 2)
                mem_info   = info.get('memory_info')
                mem_mb     = round(mem_info.rss / (1024 ** 2), 2) if mem_info else 0.0

                status_counts[info.get('status', 'unknown')] += 1

                process_data.append({
                    'pid':              info.get('pid'),
                    'name':             info.get('name', ''),
                    'status':           info.get('status', 'unknown'),
                    'username':         info.get('username', ''),
                    'cpu_percent':      cpu_norm,
                    'cpu_percent_raw':  round(cpu_raw, 2),
                    'memory_mb':        mem_mb,
                    'memory_percent':   round(info.get('memory_percent') or 0, 2),
                    'category':         _categorise(info.get('name', '')),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return {
            'process_summary':        self._summarise(process_data, status_counts),
            'top_by_cpu':             self._top_cpu(process_data),
            'top_by_memory':          self._top_memory(process_data),
            'application_categories': self._category_counts(process_data),
        }

    # =========================================================================
    # Derived views — all operate on the already-collected process_data list
    # so no additional psutil calls are needed
    # =========================================================================

    def _summarise(
        self,
        process_data: List[Dict],
        status_counts: Counter,
    ) -> Dict[str, Any]:
        return {
            'total_processes': len(process_data),
            'running':  status_counts.get(psutil.STATUS_RUNNING,  0),
            'sleeping': status_counts.get(psutil.STATUS_SLEEPING, 0),
            'zombie':   status_counts.get(psutil.STATUS_ZOMBIE,   0),
            'stopped':  status_counts.get(psutil.STATUS_STOPPED,  0),
        }

    def _top_cpu(self, process_data: List[Dict]) -> List[Dict[str, Any]]:
        """Top N processes by normalised CPU %. Excludes idle processes."""
        active = [p for p in process_data if p['cpu_percent_raw'] > 0.1]
        active.sort(key=lambda x: x['cpu_percent'], reverse=True)
        return [
            {
                'pid':             p['pid'],
                'name':            p['name'],
                'cpu_percent':     p['cpu_percent'],
                'cpu_percent_raw': p['cpu_percent_raw'],
                'username':        p['username'],
            }
            for p in active[:self.top_n]
        ]

    def _top_memory(self, process_data: List[Dict]) -> List[Dict[str, Any]]:
        """Top N processes by RSS memory. Excludes processes using <10 MB."""
        heavy = [p for p in process_data if p['memory_mb'] > 10]
        heavy.sort(key=lambda x: x['memory_mb'], reverse=True)
        return [
            {
                'pid':            p['pid'],
                'name':           p['name'],
                'memory_mb':      p['memory_mb'],
                'memory_percent': p['memory_percent'],
                'username':       p['username'],
            }
            for p in heavy[:self.top_n]
        ]

    def _category_counts(self, process_data: List[Dict]) -> Dict[str, int]:
        """Count processes per application category."""
        counts: Dict[str, int] = {k: 0 for k in _CATEGORIES}
        counts['other'] = 0
        for p in process_data:
            counts[p['category']] = counts.get(p['category'], 0) + 1
        return counts

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
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

    monitor = ApplicationMonitor()

    print("\n=== Application Monitor ===\n")
    t0   = time.time()
    data = monitor.run_monitor(run_now=True)
    elapsed = time.time() - t0
    print(f"Collection time: {elapsed:.2f}s\n")

    summary = data['process_summary']
    print(f"Processes: {summary['total_processes']}  "
          f"(running={summary['running']}  "
          f"sleeping={summary['sleeping']}  "
          f"zombie={summary['zombie']})")

    print(f"\nTop {len(data['top_by_cpu'])} by CPU (normalised 0-100%):")
    print(f"  {'PID':<7} {'Name':<30} {'CPU%':>6}  {'Raw%':>6}  {'User'}")
    print(f"  {'-'*7} {'-'*30} {'-'*6}  {'-'*6}  {'-'*20}")
    for p in data['top_by_cpu']:
        print(f"  {p['pid']:<7} {p['name']:<30} "
              f"{p['cpu_percent']:>5.2f}%  {p['cpu_percent_raw']:>5.2f}%  "
              f"{p['username']}")

    print(f"\nTop {len(data['top_by_memory'])} by Memory:")
    print(f"  {'PID':<7} {'Name':<30} {'MB':>8}  {'%':>6}")
    print(f"  {'-'*7} {'-'*30} {'-'*8}  {'-'*6}")
    for p in data['top_by_memory']:
        print(f"  {p['pid']:<7} {p['name']:<30} "
              f"{p['memory_mb']:>7.1f}M  {p['memory_percent']:>5.2f}%")

    print("\nApplication categories:")
    for cat, count in sorted(data['application_categories'].items(),
                              key=lambda x: -x[1]):
        if count:
            bar = '█' * min(count, 40)
            print(f"  {cat:<15} {count:>4}  {bar}")

    del monitor
    print("\nDone!")