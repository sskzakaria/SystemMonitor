"""
user_activity_monitor.py - User Activity Monitor

Responsibilities:
- Active user sessions (full detail)
- Login history (24h)
- User summary (active_user, session count, unique users)
- System uptime  ← owned here; HeartbeatMonitor no longer duplicates this

NOT responsible for:
- Resource usage (owned by HeartbeatMonitor)
- Network status (owned by HeartbeatMonitor)
- Health scoring (owned by HeartbeatMonitor)

Design notes:
- psutil.users() is called ONCE per cycle in run_monitor() and passed down
  to every sub-collector that needs it, avoiding redundant syscalls.
- All datetimes use timezone.utc for consistency.
- active_user is derived from sessions only (no os.environ fallback —
  that reflected the agent's process owner, not the interactive user).
- status is always 'online'; backend determines idle/offline from heartbeat age.
"""

import platform
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import psutil

from monitors.base_monitor import BaseMonitor
from core.config import UserActivityMonitorConfig

# Windows-specific RDP/console session enumeration
if platform.system() == "Windows":
    try:
        import win32ts
    except ImportError:
        win32ts = None
else:
    win32ts = None


class UserActivityMonitor(BaseMonitor):
    """
    Monitors user sessions and login history.

    Provides the active_user and session data the frontend and backend both
    need, without duplicating system-level metrics that HeartbeatMonitor owns.
    """

    def __init__(self, config: UserActivityMonitorConfig = None):
        config = config or UserActivityMonitorConfig()
        super().__init__("user_activity_monitor", config)
        self.running = False
        self.monitor_thread = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, interval: int = None):
        """Start continuous monitoring."""
        self.interval = interval or self.config.INTERVAL
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        self.logger.info(f"User Activity Monitor started with {self.interval}s interval")

    def stop(self):
        """Stop monitoring gracefully."""
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("User Activity Monitor stopped")

    def _monitor_loop(self):
        """Continuous monitoring loop with exponential-backoff error recovery."""
        consecutive_errors = 0
        max_consecutive_errors = 5

        while self.running:
            try:
                start_time = time.time()
                data = self.run_monitor(run_now=True)
                self.last_collection_duration = (time.time() - start_time) * 1000

                self.store_monitor_data(data)
                consecutive_errors = 0

                self._sleep_with_jitter(self.interval)

            except Exception as e:
                consecutive_errors += 1
                self.logger.error(f"Monitoring error: {e}")
                self.last_errors.append(str(e))

                if consecutive_errors >= max_consecutive_errors:
                    self.logger.error(
                        f"Too many consecutive errors ({consecutive_errors}), stopping monitor"
                    )
                    self.running = False
                    break

                wait_time = min(self.interval, 2 ** consecutive_errors)
                time.sleep(wait_time)

    # ------------------------------------------------------------------
    # Main collection
    # ------------------------------------------------------------------

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Collect user activity information.

        psutil.users() is called once here and threaded through to all
        sub-collectors that need it — no redundant syscalls per cycle.
        """
        users = self._get_users_safe()

        active_sessions = self._get_active_sessions(users)
        user_summary = self._get_user_summary(users)

        # Derive active_user from sessions first, then summary — no env var fallback
        active_user: Optional[str] = None
        if active_sessions:
            active_user = active_sessions[0].get("user")
        if not active_user:
            active_user = user_summary.get("current_user")  # already None-safe

        return {
            "active_user": active_user,              # Primary field frontend needs
            "active_sessions": active_sessions,
            "login_history_24h": self._get_login_history(users),
            "user_summary": user_summary,
            "uptime": self._get_uptime(),             # Owned here, not in HeartbeatMonitor
        }

    # ------------------------------------------------------------------
    # Collectors
    # ------------------------------------------------------------------

    def _get_users_safe(self):
        """Return psutil.users() or [] on failure."""
        try:
            return psutil.users()
        except Exception as e:
            self.logger.error(f"Error fetching users: {e}")
            return []

    def _get_active_sessions(self, users) -> List[Dict[str, Any]]:
        """
        Build the list of active user sessions.

        Uses the pre-fetched users list (no extra psutil.users() call).
        Appends Windows RDP/console sessions when win32ts is available.
        All timestamps are UTC-aware.
        """
        sessions = []

        try:
            for user in users:
                sessions.append({
                    "user": user.name,
                    "terminal": user.terminal or "console",
                    "host": user.host or "local",
                    "started_epoch": int(user.started),
                    "started_iso": datetime.fromtimestamp(user.started, timezone.utc).isoformat(),
                    "pid": getattr(user, "pid", None),
                    "type": "psutil_session",
                })

            # Windows: augment with RDP / active console sessions from win32ts
            if platform.system() == "Windows" and win32ts:
                try:
                    for session in win32ts.WTSEnumerateSessions(win32ts.WTS_CURRENT_SERVER_HANDLE):
                        if session["State"] != win32ts.WTSActive:
                            continue
                        try:
                            username = win32ts.WTSQuerySessionInformation(
                                win32ts.WTS_CURRENT_SERVER_HANDLE,
                                session["SessionId"],
                                win32ts.WTSUserName,
                            )
                            if username:
                                sessions.append({
                                    "user": username,
                                    "session_id": session["SessionId"],
                                    "session_name": session["WinStationName"],
                                    "state": "active",
                                    "type": "windows_session",
                                })
                        except Exception as e:
                            self.logger.debug(f"Could not get Windows session details: {e}")
                except Exception as e:
                    self.logger.debug(f"Could not enumerate Windows sessions: {e}")

        except Exception as e:
            self.logger.error(f"Error building active sessions: {e}")

        return sessions

    def _get_login_history(self, users, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Return login events within the past `hours` for the pre-fetched user list.

        All datetimes are UTC-aware (previously mixed naive/aware — now consistent).
        Duration is calculated relative to now (UTC).
        """
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            now_utc = datetime.now(timezone.utc)
            history = []

            for user in users:
                login_time = datetime.fromtimestamp(user.started, timezone.utc)
                if login_time < cutoff:
                    continue

                duration_seconds = int((now_utc - login_time).total_seconds())
                history.append({
                    "user": user.name,
                    "login_time_epoch": int(user.started),
                    "login_time_iso": login_time.isoformat(),
                    "terminal": user.terminal or "console",
                    "host": user.host or "local",
                    "duration_seconds": duration_seconds,
                    "duration_minutes": duration_seconds // 60,
                    "duration_hours": duration_seconds // 3600,
                })

            # Most recent login first
            history.sort(key=lambda x: x["login_time_epoch"], reverse=True)
            return history

        except Exception as e:
            self.logger.error(f"Error getting login history: {e}")
            return []

    def _get_user_summary(self, users) -> Dict[str, Any]:
        """
        Summarise the current user state from the pre-fetched user list.

        current_user is derived from psutil sessions only — the os.environ
        fallback was removed because it reflected the agent's process owner,
        not the interactive user, and was silently wrong on multi-user systems.
        """
        try:
            unique_users = list({u.name for u in users})
            current_user = users[0].name if users else None  # None is cleaner than 'Unknown'

            return {
                "total_sessions": len(users),
                "unique_users": len(unique_users),
                "user_list": unique_users,
                "has_active_users": len(users) > 0,
                "current_user": current_user,
            }

        except Exception as e:
            self.logger.error(f"Error getting user summary: {e}")
            return {
                "total_sessions": 0,
                "unique_users": 0,
                "user_list": [],
                "has_active_users": False,
                "current_user": None,
            }

    def _get_uptime(self) -> Dict[str, Any]:
        """
        Return system uptime information.

        Owned by UserActivityMonitor (removed from HeartbeatMonitor to
        eliminate duplication). Sessions need boot_time anyway, so it
        belongs here.
        """
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = int(time.time() - boot_time)

            days = uptime_seconds // 86400
            hours = (uptime_seconds % 86400) // 3600
            minutes = (uptime_seconds % 3600) // 60

            return {
                "boot_time_epoch": int(boot_time),
                "boot_time_iso": datetime.fromtimestamp(boot_time, timezone.utc).isoformat(),
                "uptime_seconds": uptime_seconds,
                "uptime_days": days,
                "uptime_hours": hours,
                "uptime_minutes": minutes,
                "uptime_human": f"{days}d {hours}h {minutes}m",
            }

        except Exception as e:
            self.logger.error(f"Error getting uptime: {e}")
            return {
                "boot_time_epoch": 0,
                "uptime_seconds": 0,
                "uptime_human": "Unknown",
                "error": str(e),
            }

    # ------------------------------------------------------------------
    # Config hot-reload
    # ------------------------------------------------------------------

    def update_config(self, **kwargs):
        """Dynamically update monitor configuration."""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Updated config: {key} = {value}")
            else:
                self.logger.warning(f"Invalid config key: {key}")

        if "INTERVAL" in kwargs and self.running:
            self.logger.info("Restarting monitor with new interval")
            self.stop()
            self.start()


if __name__ == "__main__":
    import json
    import logging

    logging.basicConfig(level=logging.INFO)

    monitor = UserActivityMonitor()
    print("\nRunning user activity monitor once...")
    data = monitor.run_monitor(run_now=True)

    print(json.dumps(data, indent=2, default=str))
    print("Done!")