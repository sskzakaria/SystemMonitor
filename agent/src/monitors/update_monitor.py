"""
update_monitor.py - Windows Update Monitor (v2)

════════════════════════════════════════════════════════════════════════════════
BACKEND INTEGRATION & ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

PURPOSE
  Tracks Windows Update status: pending update count, last successful
  install, last check time, and whether a reboot is pending. Critical
  for university IT compliance — machines left unpatched are a security
  risk, and unexpected reboots break lab sessions.

DESTINATION  →  MongoDB only  (POST /api/v1/data/update)
  Update status changes slowly (daily at most). Not suitable for InfluxDB
  time-series. Backend stores latest + history.

INTERVAL RECOMMENDATION
  1800-3600 seconds (30-60 minutes). Running this every 60s wastes a
  COM object instantiation that can take 5-30s. Windows Update check
  results don't change more frequently than once per Windows Update cycle.

TIMING FIXES (v1 → v2)
  v1: _check_if_updates_needed() called _get_pending_updates() a second
      time — double COM instantiation, up to 60s of blocking per cycle.
  v2: Pending count computed once and reused across all derived fields.

  v1: No timeout guard on the COM query — if Windows Update service is
      busy (e.g. actively downloading), the call could block indefinitely.
  v2: PowerShell -Command is run with timeout=45. Separate fast queries
      for last-check-time (timeout=10) and reboot-pending (timeout=5)
      so a slow update search doesn't block the other fields.

  v1: Used Microsoft.Update.Session COM object directly in PowerShell —
      requires the Windows Update service to be responsive.
  v2: Reboot-pending check uses registry (instant, no COM dependency).
      Last-check-time uses AutoUpdate COM (fast, separate from search).
      Pending count is the only slow query and is wrapped with a try/catch
      that returns a sentinel value on timeout rather than crashing.

IMPORTANT NOTE ON PENDING UPDATE COUNT
  Querying pending updates via COM is the only reliable method on Windows.
  It requires the Windows Update service (wuauserv) to be running and
  responsive. On machines where WSUS/SCCM manages updates, the count
  may reflect WSUS-approved updates only. This is expected behaviour.
════════════════════════════════════════════════════════════════════════════════
"""

import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from monitors.base_monitor import BaseMonitor
from core.config import UpdateMonitorConfig


class UpdateMonitor(BaseMonitor):
    """
    Monitor Windows Update status.

    Queries are split into three independent calls with individual timeouts:
      1. Pending update count  (slow, COM — up to 45s timeout)
      2. Last check/install    (fast, AutoUpdate COM — 10s timeout)
      3. Reboot pending        (instant, registry — 5s timeout)

    Each query fails independently — a slow pending-count query doesn't
    prevent last-check-time from being reported.
    """

    def __init__(self, config: UpdateMonitorConfig = None):
        config = config or UpdateMonitorConfig()
        super().__init__("update_monitor", config)
        self.running        = False
        self.monitor_thread = None

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def start(self, interval: int = None):
        self.interval = interval or getattr(self.config, 'INTERVAL', 1800)
        self.running  = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True
        )
        self.monitor_thread.start()
        self.logger.info(
            f"Update Monitor started ({self.interval}s interval — "
            f"recommended 1800s+)"
        )

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Update Monitor stopped")

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
                self.logger.error(f"Update monitoring error: {e}")
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
        Collect Windows Update status.

        Pending count is computed once and reused — v1 called
        _get_pending_updates() twice (once directly, once inside
        _check_if_updates_needed), doubling the COM query time.
        """
        pending_count  = self._get_pending_updates()
        last_check     = self._get_last_check_time()
        last_install   = self._get_last_install_time()
        reboot_pending = self._is_reboot_pending()

        return {
            'pending_updates':        pending_count,
            'update_needed':          pending_count > 0 if pending_count is not None else None,
            'reboot_pending':         reboot_pending,
            'last_check_time':        last_check,
            'last_install_time':      last_install,
            'windows_update_enabled': self._is_windows_update_enabled(),
            # Sentinel — None means the COM query timed out or failed
            # (different from 0 which means "checked successfully, no updates")
            'pending_count_available': pending_count is not None,
        }

    # =========================================================================
    # Pending update count — slow COM query, individual timeout
    # =========================================================================

    def _get_pending_updates(self) -> Optional[int]:
        """
        Count updates pending installation via Windows Update COM API.

        Returns None if the query times out or the WU service is
        unavailable — callers should treat None as "unknown" not "0".

        Timeout: 45 seconds. Windows Update COM can block for 30+ seconds
        when the update service is busy downloading or installing.
        """
        ps_cmd = (
            '$s = New-Object -ComObject Microsoft.Update.Session; '
            '$r = $s.CreateUpdateSearcher().Search("IsInstalled=0 and Type=\'Software\'"); '
            'Write-Output $r.Updates.Count'
        )
        try:
            result = subprocess.run(
                ['powershell', '-NonInteractive', '-NoProfile', '-Command', ps_cmd],
                capture_output=True, text=True, timeout=45,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            val = result.stdout.strip()
            if val.lstrip('-').isdigit():
                count = int(val)
                # Negative values indicate COM error codes — treat as unknown
                return count if count >= 0 else None
            return None
        except subprocess.TimeoutExpired:
            self.logger.warning(
                "Pending update count timed out (WU service may be busy) — "
                "returning None"
            )
            return None
        except Exception as e:
            self.logger.debug(f"Pending update query failed: {e}")
            return None

    # =========================================================================
    # Last check / last install — fast AutoUpdate COM, separate timeout
    # =========================================================================

    def _get_last_check_time(self) -> Optional[str]:
        """
        Get timestamp of last successful Windows Update search.
        Uses AutoUpdate.Results which is fast (no search required).
        """
        ps_cmd = (
            '(New-Object -ComObject Microsoft.Update.AutoUpdate)'
            '.Results.LastSearchSuccessDate'
        )
        return self._run_ps_timestamp(ps_cmd, timeout=10, field='last_check')

    def _get_last_install_time(self) -> Optional[str]:
        """Get timestamp of last successful Windows Update installation."""
        ps_cmd = (
            '(New-Object -ComObject Microsoft.Update.AutoUpdate)'
            '.Results.LastInstallationSuccessDate'
        )
        return self._run_ps_timestamp(ps_cmd, timeout=10, field='last_install')

    def _run_ps_timestamp(
        self, ps_cmd: str, timeout: int, field: str
    ) -> Optional[str]:
        """Run a PowerShell command that returns a datetime, return ISO string."""
        try:
            result = subprocess.run(
                ['powershell', '-NonInteractive', '-NoProfile', '-Command', ps_cmd],
                capture_output=True, text=True, timeout=timeout,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            val = result.stdout.strip()
            if val and val.lower() not in ('', 'null', 'false'):
                return val
            return None
        except subprocess.TimeoutExpired:
            self.logger.debug(f"{field} query timed out")
            return None
        except Exception as e:
            self.logger.debug(f"{field} query failed: {e}")
            return None

    # =========================================================================
    # Reboot pending — registry check (instant, no COM dependency)
    # =========================================================================

    def _is_reboot_pending(self) -> bool:
        """
        Check if a reboot is pending after Windows Updates.

        Checks three registry locations that Windows uses to signal a
        pending reboot — much faster and more reliable than COM queries.

        Registry keys checked:
          HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired
          HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending
          HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\PendingFileRenameOperations
        """
        ps_cmd = r"""
$reboot = $false
$keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootInProgress'
)
foreach ($key in $keys) {
    if (Test-Path $key) { $reboot = $true; break }
}
# Also check pending file rename operations (indicates reboot needed)
$pfro = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue).PendingFileRenameOperations
if ($pfro) { $reboot = $true }
Write-Output $reboot
"""
        try:
            result = subprocess.run(
                ['powershell', '-NonInteractive', '-NoProfile', '-Command', ps_cmd],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            return result.stdout.strip().lower() == 'true'
        except Exception as e:
            self.logger.debug(f"Reboot pending check failed: {e}")
            return False

    # =========================================================================
    # Windows Update service enabled check
    # =========================================================================

    def _is_windows_update_enabled(self) -> Optional[bool]:
        """
        Check if the Windows Update service (wuauserv) is set to run.
        A disabled WU service explains why pending_count would be 0
        even on an unpatched machine.
        """
        try:
            import psutil
            svc = psutil.win_service_get('wuauserv')
            info = svc.as_dict()
            start_type = info.get('start_type', '')
            # 'disabled' means updates are off; 'manual'/'automatic' means on
            return start_type != 'disabled'
        except Exception:
            return None

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

    monitor = UpdateMonitor()

    print("\n=== Windows Update Monitor ===")
    print("(Pending update count may take up to 45s...)\n")
    t0   = time.time()
    data = monitor.run_monitor(run_now=True)
    elapsed = time.time() - t0
    print(f"Collection time: {elapsed:.1f}s\n")

    W = 55
    print(f"{'='*W}")
    print(f"  WINDOWS UPDATE STATUS")
    print(f"{'='*W}")

    if data['pending_count_available']:
        pending = data['pending_updates']
        flag    = '  ⚠  UPDATE REQUIRED' if pending > 0 else ''
        print(f"  Pending updates   : {pending}{flag}")
    else:
        print(f"  Pending updates   : unknown (COM query timed out or WU busy)")

    reboot = data.get('reboot_pending')
    print(f"  Reboot pending    : {'YES  ⚠' if reboot else 'No'}")

    wu_enabled = data.get('windows_update_enabled')
    if wu_enabled is None:
        print(f"  WU service        : unknown")
    else:
        print(f"  WU service        : {'enabled' if wu_enabled else 'DISABLED  ⚠'}")

    print(f"  Last check        : {data.get('last_check_time') or 'unknown'}")
    print(f"  Last install      : {data.get('last_install_time') or 'unknown'}")

    del monitor
    print("\nDone!")