"""
event_log_monitor.py - Windows Event Log Monitor

Collects important Windows Event Logs for system administrators:
- System errors and warnings
- Security events (logins, logouts, failed authentication)
- Application crashes and service failures

Windows-Only Implementation.

Design notes:
- psutil is not used here — win32evtlog is the correct library for Event Logs.
- Timestamps are converted to UTC via .astimezone(timezone.utc), not reconstructed
  from raw fields (which would silently produce wrong times on non-UTC machines).
- Event dicts are copied before augmentation in _filter_critical_events() to avoid
  mutating the source lists.
- A per-cycle cursor (self._last_read_epoch) prevents re-sending events seen in
  previous cycles, keeping MongoDB history documents small and non-redundant.
"""

import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import win32con
import win32evtlog
import win32evtlogutil

from monitors.base_monitor import BaseMonitor
from core.config import EventLogMonitorConfig


class EventLogMonitor(BaseMonitor):
    """
    Monitor for Windows Event Logs.

    Collects from System, Security, and Application logs, filters for
    administrator-relevant events, and reports a deduplicated delta each cycle.
    """

    # Maps log category → set of event IDs considered critical
    CRITICAL_EVENT_IDS: Dict[str, List[int]] = {
        "system": [
            1074,   # System shutdown/restart (user-initiated)
            6005,   # Event Log service started (boot marker)
            6006,   # Event Log service stopped
            6008,   # Unexpected/dirty shutdown
            1001,   # BugCheck (BSOD follow-up)
            7000,   # Service failed to start
            7001,   # Service start dependency failure
            7022,   # Service hung on starting
            7023,   # Service terminated with error
            7024,   # Service terminated unexpectedly (SCM)
            7026,   # Boot-start/system-start driver failed to load
            7031,   # Service crashed, SCM will restart
            7034,   # Service crashed unexpectedly
        ],
        "security": [
            4624,   # Successful logon
            4625,   # Failed logon
            4634,   # Account logoff
            4647,   # User-initiated logoff
            4648,   # Logon with explicit credentials (RunAs)
            4719,   # System audit policy changed
            4720,   # User account created
            4722,   # User account enabled
            4723,   # Password change attempt
            4724,   # Password reset attempt
            4725,   # User account disabled
            4726,   # User account deleted
            4732,   # Member added to security-enabled local group
            4733,   # Member removed from security-enabled local group
        ],
        "application": [
            1000,   # Application error (faulting app)
            1001,   # Windows Error Reporting follow-up
            1002,   # Application hang
        ],
    }

    # Human-readable descriptions for event IDs
    EVENT_REASONS: Dict[str, Dict[int, str]] = {
        "system": {
            1074: "System shutdown/restart",
            6005: "Event Log service started",
            6006: "Event Log service stopped",
            6008: "Unexpected shutdown",
            1001: "System error (BugCheck)",
            7000: "Service failed to start",
            7001: "Service start dependency failure",
            7022: "Service hung on starting",
            7023: "Service terminated with error",
            7024: "Service terminated unexpectedly",
            7026: "Boot driver failed to load",
            7031: "Service terminated unexpectedly (SCM restart pending)",
            7034: "Service crashed",
        },
        "security": {
            4624: "Successful logon",
            4625: "Failed logon attempt",
            4634: "Account logoff",
            4647: "User-initiated logoff",
            4648: "Logon using explicit credentials",
            4719: "Audit policy changed",
            4720: "User account created",
            4722: "User account enabled",
            4723: "Password change attempt",
            4724: "Password reset attempt",
            4725: "User account disabled",
            4726: "User account deleted",
            4732: "Member added to security group",
            4733: "Member removed from security group",
        },
        "application": {
            1000: "Application error",
            1001: "Application error (Windows Error Reporting)",
            1002: "Application hang",
        },
    }

    def __init__(self, config: EventLogMonitorConfig = None):
        config = config or EventLogMonitorConfig()
        super().__init__("event_log_monitor", config)

        self.max_events_per_log: int = getattr(config, "MAX_EVENTS_PER_LOG", 50)
        self.hours_lookback: int = getattr(config, "HOURS_LOOKBACK", 24)

        # Cursor: only report events newer than this epoch each cycle.
        # Initialised to (now - lookback) so the first cycle collects history,
        # and subsequent cycles only collect new events.
        self._last_read_epoch: float = time.time() - (self.hours_lookback * 3600)

        self.running = False
        self.monitor_thread: Optional[threading.Thread] = None

        self.logger.info("Event Log Monitor initialized")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, interval: int = None):
        """Start continuous monitoring."""
        self.interval = interval or self.config.INTERVAL
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        self.logger.info(f"Event Log Monitor started with {self.interval}s interval")

    def stop(self):
        """Stop monitoring gracefully."""
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Event Log Monitor stopped")

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

                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # ------------------------------------------------------------------
    # Main collection
    # ------------------------------------------------------------------

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Collect Windows Event Log data for the current cycle.

        Only events newer than self._last_read_epoch are returned, so each
        MongoDB history document contains a true delta rather than re-sending
        the full 24h window every cycle.
        """
        try:
            data = self.get_common_data()  # Adds machine_id, hostname, timestamp, etc.

            cycle_start = time.time()

            data["system_events"] = self._get_event_log("System")
            data["security_events"] = self._get_event_log("Security")
            data["application_events"] = self._get_event_log("Application")

            # Advance cursor so next cycle only fetches genuinely new events
            self._last_read_epoch = cycle_start

            data["summary"] = self._create_summary(data)
            data["critical_events"] = self._filter_critical_events(data)

            data["total_system_events"] = len(data["system_events"])
            data["total_security_events"] = len(data["security_events"])
            data["total_application_events"] = len(data["application_events"])
            data["total_critical_events"] = len(data["critical_events"])

            return data

        except Exception as e:
            self.logger.error(f"Error collecting event log data: {e}")
            self.last_errors.append(str(e))
            return {
                **self.get_common_data(),
                "system_events": [],
                "security_events": [],
                "application_events": [],
                "critical_events": [],
                "summary": {},
                "error": str(e),
            }

    # ------------------------------------------------------------------
    # Collectors
    # ------------------------------------------------------------------

    def _get_event_log(self, log_name: str) -> List[Dict[str, Any]]:
        """
        Read events from a Windows Event Log since the last cycle cursor.

        Fixes vs original:
        - Outer while loop is also gated by events_read so we stop fetching
          new batches once the per-log limit is hit.
        - record.TimeGenerated is converted via .astimezone(timezone.utc)
          instead of being reconstructed as a fake-UTC naive datetime.
        - Message is capped BEFORE SafeFormatMessage is called on a truncated
          string — actually SafeFormatMessage works on the record, not a string,
          so we just truncate the result and keep a tight try/except.
        """
        events: List[Dict[str, Any]] = []
        cutoff_epoch = self._last_read_epoch

        try:
            hand = win32evtlog.OpenEventLog(None, log_name)
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

            try:
                while len(events) < self.max_events_per_log:
                    records = win32evtlog.ReadEventLog(hand, flags, 0)
                    if not records:
                        break  # No more records in this log

                    for record in records:
                        if len(events) >= self.max_events_per_log:
                            break

                        try:
                            # .TimeGenerated is a pywintypes.datetime (local-time-aware).
                            # Convert to UTC — do NOT reconstruct from raw fields.
                            event_dt_utc: datetime = record.TimeGenerated.astimezone(timezone.utc)
                            event_epoch = event_dt_utc.timestamp()

                            # Skip events already reported in a previous cycle
                            if event_epoch <= cutoff_epoch:
                                # Events are returned newest-first; once we're behind
                                # the cursor we can stop reading this log entirely.
                                return events

                            event_type = self._get_event_type(record.EventType)

                            try:
                                message = win32evtlogutil.SafeFormatMessage(record, log_name) or ""
                                if len(message) > 500:
                                    message = message[:500] + "..."
                            except Exception:
                                message = "Unable to format message"

                            events.append({
                                "event_id": record.EventID & 0xFFFF,
                                "event_type": event_type,
                                "source": record.SourceName or "Unknown",
                                "category": record.EventCategory,
                                "time_generated": event_dt_utc.isoformat(),
                                "time_epoch": event_epoch,
                                "computer": record.ComputerName or "Unknown",
                                "message": message,
                                "log_name": log_name,
                            })

                        except Exception as e:
                            self.logger.debug(f"Error processing {log_name} record: {e}")

            finally:
                win32evtlog.CloseEventLog(hand)

        except Exception as e:
            self.logger.error(f"Error reading {log_name} event log: {e}")

        return events

    @staticmethod
    def _get_event_type(event_type: int) -> str:
        """Convert win32 event type code to a readable string."""
        return {
            win32con.EVENTLOG_ERROR_TYPE: "Error",
            win32con.EVENTLOG_WARNING_TYPE: "Warning",
            win32con.EVENTLOG_INFORMATION_TYPE: "Information",
            win32con.EVENTLOG_AUDIT_SUCCESS: "Audit Success",
            win32con.EVENTLOG_AUDIT_FAILURE: "Audit Failure",
        }.get(event_type, "Unknown")

    def _create_summary(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Tally events by type across all three logs."""
        summary = {
            "system": {"errors": 0, "warnings": 0, "information": 0},
            "security": {"audit_success": 0, "audit_failure": 0},
            "application": {"errors": 0, "warnings": 0, "information": 0},
        }

        for event in data.get("system_events", []):
            t = event.get("event_type", "").lower()
            if "error" in t:
                summary["system"]["errors"] += 1
            elif "warning" in t:
                summary["system"]["warnings"] += 1
            elif "information" in t:
                summary["system"]["information"] += 1

        for event in data.get("security_events", []):
            t = event.get("event_type", "").lower()
            if "success" in t:
                summary["security"]["audit_success"] += 1
            elif "failure" in t:
                summary["security"]["audit_failure"] += 1

        for event in data.get("application_events", []):
            t = event.get("event_type", "").lower()
            if "error" in t:
                summary["application"]["errors"] += 1
            elif "warning" in t:
                summary["application"]["warnings"] += 1
            elif "information" in t:
                summary["application"]["information"] += 1

        summary["total_errors"] = summary["system"]["errors"] + summary["application"]["errors"]
        summary["total_warnings"] = summary["system"]["warnings"] + summary["application"]["warnings"]

        return summary

    def _filter_critical_events(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Return augmented copies of events that match critical event ID lists.

        Copies each matched event dict before adding priority/reason so the
        source lists (system_events, etc.) are not mutated.
        """
        critical: List[Dict[str, Any]] = []

        log_map = {
            "system": data.get("system_events", []),
            "security": data.get("security_events", []),
            "application": data.get("application_events", []),
        }

        priority_overrides = {4625: "high"}  # Failed logon is elevated within security

        for log_key, events in log_map.items():
            critical_ids = set(self.CRITICAL_EVENT_IDS.get(log_key, []))
            for event in events:
                eid = event.get("event_id")
                if eid not in critical_ids:
                    continue

                augmented = dict(event)  # Shallow copy — do not mutate original
                augmented["priority"] = priority_overrides.get(eid, "medium" if log_key == "security" else "critical")
                augmented["reason"] = self.EVENT_REASONS.get(log_key, {}).get(eid, "Unknown event")
                critical.append(augmented)

        # Newest first
        critical.sort(key=lambda x: x.get("time_epoch", 0), reverse=True)
        return critical

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


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)

    monitor = EventLogMonitor()
    print(f"\nRunning event log monitor once (lookback: {monitor.hours_lookback}h)...")
    data = monitor.run_monitor(run_now=True)

    summary = data.get("summary", {})
    print(f"\nMachine: {data.get('machine_id')} ({data.get('hostname')})")
    print(f"\nSystem  — errors: {summary.get('system', {}).get('errors', 0)}, "
          f"warnings: {summary.get('system', {}).get('warnings', 0)}")
    print(f"Security — failures: {summary.get('security', {}).get('audit_failure', 0)}, "
          f"successes: {summary.get('security', {}).get('audit_success', 0)}")
    print(f"App     — errors: {summary.get('application', {}).get('errors', 0)}")
    print(f"\nCritical events: {data.get('total_critical_events', 0)}")
    for ev in data.get("critical_events", [])[:5]:
        print(f"  [{ev['priority'].upper()}] ID {ev['event_id']} – {ev['reason']} @ {ev['time_generated']}")

    print("\nDone!")