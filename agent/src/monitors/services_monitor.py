"""
services_monitor.py - Windows Services Monitor (v2)

════════════════════════════════════════════════════════════════════════════════
BACKEND INTEGRATION & ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

PURPOSE
  Tracks Windows service states. Primary value is alerting on critical
  services going down (antivirus stopped, Windows Update disabled, etc.)
  and providing a service inventory for the IT dashboard.

DESTINATION  →  MongoDB only  (POST /api/v1/data/services)
  Service status is not time-series data — you want current state and
  change history, not a graph of "how many services were running at 3pm".

COLLECTION STRATEGY
  Uses Get-Service via PowerShell (replaces `sc query` text parsing).
  Reasons:
  - `sc query type= service state= all` returns raw text; counting the
    string "RUNNING" double-counts service display names containing that
    word, and is locale-sensitive (French Windows says "EN COURS")
  - Get-Service returns structured objects, is locale-independent, and
    is ~3x faster than sc query for the full list
  - psutil.win_service_iter() is the Python-native option and is used
    for critical service checks (no subprocess overhead)

UNUSED IMPORT REMOVED
  v1 imported psutil inside the Windows guard but never used it in
  _get_services_summary(). psutil.win_service_iter() is now actually used.

INTERVAL RECOMMENDATION
  60-120 seconds. Services don't change frequently. Running this every
  30s wastes a PowerShell spawn for data that hasn't changed.
════════════════════════════════════════════════════════════════════════════════
"""

import subprocess
import threading
import time
from typing import Any, Dict, List, Optional

import psutil

from monitors.base_monitor import BaseMonitor
from core.config import ServicesMonitorConfig


# ---------------------------------------------------------------------------
# Services that are commonly critical in a university lab environment.
# Config can override / extend this list via CRITICAL_SERVICES.
# ---------------------------------------------------------------------------
_DEFAULT_CRITICAL = [
    'WinDefend',        # Windows Defender
    'Sense',            # Microsoft Defender for Endpoint (EDR)
    'MpsSvc',           # Windows Firewall
    'wuauserv',         # Windows Update
    'EventLog',         # Windows Event Log
    'Spooler',          # Print Spooler (relevant for labs)
    'LanmanWorkstation',# Workstation (SMB client — needed for network shares)
    'Dhcp',             # DHCP Client
    'Dnscache',         # DNS Client cache
]

# Services that are expected to be stopped — don't alert on these
_EXPECTED_STOPPED = {
    'RemoteRegistry',   # Should be off unless IT needs it
    'Fax',
    'XblGameSave',
    'XboxNetApiSvc',
}


class ServicesMonitor(BaseMonitor):
    """
    Monitor Windows services status.

    Checks critical services via psutil.win_service_iter() (fast, no subprocess)
    and gets overall service counts via a single PowerShell call.
    """

    def __init__(self, config: ServicesMonitorConfig = None):
        config = config or ServicesMonitorConfig()
        super().__init__("services_monitor", config)
        self.running          = False
        self.monitor_thread   = None

        # Merge config-provided critical services with defaults
        config_critical = getattr(config, 'CRITICAL_SERVICES', [])
        self.critical_services: List[str] = list(
            dict.fromkeys(_DEFAULT_CRITICAL + config_critical)  # preserves order, deduplicates
        )

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
        self.logger.info(f"Services Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Services Monitor stopped")

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
                self.logger.error(f"Services monitoring error: {e}")
                self.last_errors.append(str(e))
                if consecutive_errors >= 5:
                    self.running = False
                    break
                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # =========================================================================
    # Main collection
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        critical = self._get_critical_services_status()
        summary  = self._get_services_summary()

        # Derive alert list from critical services that are unexpectedly stopped
        alerts = [
            s['name'] for s in critical
            if s['status'] == 'stopped'
            and s['name'] not in _EXPECTED_STOPPED
        ]

        return {
            'services_summary':   summary,
            'critical_services':  critical,
            'alerts':             alerts,
            'has_alerts':         len(alerts) > 0,
        }

    # =========================================================================
    # Critical services — psutil (fast, no subprocess)
    # =========================================================================

    def _get_critical_services_status(self) -> List[Dict[str, Any]]:
        """
        Check each critical service using psutil.win_service_iter().

        psutil is faster than a subprocess per service because it queries
        the Windows Service Control Manager directly via Win32 API.
        Falls back to PowerShell for services psutil can't access.
        """
        results = []

        for name in self.critical_services:
            entry = self._check_service_psutil(name)
            if entry is None:
                entry = self._check_service_powershell(name)
            if entry:
                results.append(entry)

        return results

    def _check_service_psutil(self, name: str) -> Optional[Dict[str, Any]]:
        """Query a single service via psutil. Returns None on failure."""
        try:
            svc = psutil.win_service_get(name)
            info = svc.as_dict()
            return {
                'name':         name,
                'display_name': info.get('display_name', name),
                'status':       info.get('status', 'unknown'),   # 'running', 'stopped', etc.
                'start_type':   info.get('start_type', 'unknown'),  # 'automatic', 'manual', etc.
                'pid':          info.get('pid'),
                'source':       'psutil',
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError):
            return None
        except Exception:
            return None

    def _check_service_powershell(self, name: str) -> Optional[Dict[str, Any]]:
        """Fallback: query a service via PowerShell Get-Service."""
        try:
            result = subprocess.run(
                ['powershell', '-NonInteractive', '-NoProfile', '-Command',
                 f'Get-Service -Name "{name}" -ErrorAction SilentlyContinue '
                 f'| Select-Object Name, DisplayName, Status, StartType '
                 f'| ConvertTo-Json'],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            if not result.stdout.strip():
                return {
                    'name':   name,
                    'status': 'not_found',
                    'source': 'powershell',
                }

            import json
            data = json.loads(result.stdout)
            return {
                'name':         name,
                'display_name': data.get('DisplayName', name),
                'status':       data.get('Status', 'unknown').lower()
                                    .replace('4', 'running')    # numeric → string
                                    .replace('1', 'stopped'),
                'start_type':   str(data.get('StartType', 'unknown')).lower(),
                'source':       'powershell',
            }
        except Exception as e:
            self.logger.debug(f"PowerShell service check failed for {name}: {e}")
            return {
                'name':   name,
                'status': 'error',
                'source': 'powershell',
            }

    # =========================================================================
    # Overall summary — PowerShell Get-Service (structured, locale-independent)
    # =========================================================================

    def _get_services_summary(self) -> Dict[str, Any]:
        """
        Get total running/stopped/disabled counts via PowerShell Get-Service.

        Uses structured objects instead of parsing `sc query` text output.
        `sc query` is locale-sensitive and double-counts service names
        that contain the words RUNNING or STOPPED.
        """
        try:
            result = subprocess.run(
                ['powershell', '-NonInteractive', '-NoProfile', '-Command',
                 'Get-Service | Group-Object Status | '
                 'Select-Object Name, Count | ConvertTo-Json'],
                capture_output=True, text=True, timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

            if not result.stdout.strip():
                return self._summary_via_psutil()

            import json
            groups = json.loads(result.stdout)
            if isinstance(groups, dict):
                groups = [groups]

            counts: Dict[str, int] = {}
            total = 0
            for g in groups:
                status = str(g.get('Name', '')).lower()
                count  = int(g.get('Count', 0))
                counts[status] = count
                total += count

            return {
                'total':    total,
                'running':  counts.get('running', 0),
                'stopped':  counts.get('stopped', 0),
                'paused':   counts.get('paused', 0),
                'source':   'powershell',
            }

        except Exception as e:
            self.logger.warning(f"PowerShell service summary failed, falling back: {e}")
            return self._summary_via_psutil()

    def _summary_via_psutil(self) -> Dict[str, Any]:
        """Fallback summary using psutil.win_service_iter()."""
        counts: Dict[str, int] = {}
        try:
            for svc in psutil.win_service_iter():
                try:
                    status = svc.status()
                    counts[status] = counts.get(status, 0) + 1
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    continue
        except Exception as e:
            self.logger.error(f"psutil service iteration failed: {e}")

        total = sum(counts.values())
        return {
            'total':   total,
            'running': counts.get('running', 0),
            'stopped': counts.get('stopped', 0),
            'paused':  counts.get('paused', 0),
            'source':  'psutil',
        }

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        if 'CRITICAL_SERVICES' in kwargs:
            config_critical = kwargs['CRITICAL_SERVICES']
            self.critical_services = list(
                dict.fromkeys(_DEFAULT_CRITICAL + config_critical)
            )
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

    monitor = ServicesMonitor()

    print("\n=== Services Monitor ===\n")
    t0   = time.time()
    data = monitor.run_monitor(run_now=True)
    elapsed = time.time() - t0
    print(f"Collection time: {elapsed:.2f}s\n")

    s = data['services_summary']
    print(f"Services: {s.get('total','?')} total  "
          f"| {s.get('running','?')} running  "
          f"| {s.get('stopped','?')} stopped  "
          f"| {s.get('paused', 0)} paused  "
          f"(via {s.get('source','?')})")

    print(f"\nCritical services ({len(data['critical_services'])}):")
    print(f"  {'Service':<25} {'Status':<12} {'Start type':<12} {'Source'}")
    print(f"  {'-'*25} {'-'*12} {'-'*12} {'-'*10}")
    for svc in data['critical_services']:
        status_icon = '✓' if svc['status'] == 'running' else '✗'
        print(f"  {svc['name']:<25} "
              f"{status_icon} {svc['status']:<10} "
              f"{svc.get('start_type', '?'):<12} "
              f"{svc.get('source','?')}")

    if data['has_alerts']:
        print(f"\n⚠  ALERTS — unexpected stopped services:")
        for name in data['alerts']:
            print(f"  - {name}")
    else:
        print("\n✓ No alerts — all critical services running as expected")

    del monitor
    print("\nDone!")