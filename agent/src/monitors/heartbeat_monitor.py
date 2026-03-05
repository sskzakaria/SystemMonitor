"""
heartbeat_monitor.py - Heartbeat Monitor

Responsibilities:
- System availability (always reports 'online' — backend determines idle/offline)
- Resource usage (CPU, memory, disk)
- Light user presence flags (has_active_user, user_count) — full session data is UserActivityMonitor's job
- Network connectivity (real socket probe)
- Health summary

NOT responsible for:
- Uptime (owned by UserActivityMonitor since sessions need it)
- Active session details (owned by UserActivityMonitor)
"""

import socket
import threading
import time

import psutil
from datetime import datetime, timezone
from typing import Any, Dict

from monitors.base_monitor import BaseMonitor
from core.config import HeartbeatMonitorConfig

# Connectivity probe target — uses Google DNS, no HTTP needed
_PROBE_HOST = "8.8.8.8"
_PROBE_PORT = 53
_PROBE_TIMEOUT = 3  # seconds


class HeartbeatMonitor(BaseMonitor):
    """
    Sends a regular pulse to the backend so it can determine machine status.

    Status logic (separation of concerns):
      - Agent always reports status='online' (if the agent is running, the machine is online)
      - Backend determines 'idle' (heartbeat received but no active users)
      - Backend determines 'offline' (no heartbeat within threshold)
    """

    def __init__(self, config: HeartbeatMonitorConfig = None):
        config = config or HeartbeatMonitorConfig()
        super().__init__("heartbeat_monitor", config)
        self.running = False
        self.monitor_thread = None
        self.interval = config.INTERVAL

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, interval: int = None):
        """Start continuous monitoring."""
        self.interval = interval or self.config.INTERVAL
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        self.logger.info(f"Heartbeat Monitor started with {self.interval}s interval")

    def stop(self):
        """Stop monitoring gracefully."""
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Heartbeat Monitor stopped")

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
        Collect heartbeat metrics.

        Calls psutil.users() exactly once and passes the result to sub-collectors
        that need it, avoiding redundant syscalls.
        """
        users = self._get_users_safe()

        return {
            "status": self._get_system_status(users),
            "resources": self._get_resource_usage(),
            "network": self._get_network_status(),
            "health_summary": self._get_health_summary(),
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

    def _get_system_status(self, users) -> Dict[str, Any]:
        """
        Return current system status.

        Always reports status='online' — the agent is running, so the machine is up.
        Provides has_active_user / user_count so the backend can decide idle vs online
        without us duplicating UserActivityMonitor's full session logic.
        """
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = int(time.time() - boot_time)

            user_count = len(users)

            return {
                "status": "online",          # Agent is alive → machine is online; backend owns idle/offline
                "has_active_user": user_count > 0,
                "user_count": user_count,
            }

        except Exception as e:
            self.logger.error(f"Error getting system status: {e}")
            return {"status": "error", "error": str(e)}

    def _get_resource_usage(self) -> Dict[str, Any]:
        """Collect CPU, memory, disk, and process metrics."""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            return {
                "cpu_usage_percent": round(cpu_percent, 2),
                "cpu_usage_per_core": [round(c, 2) for c in cpu_per_core],
                "cpu_core_count": psutil.cpu_count(logical=False),
                "cpu_thread_count": psutil.cpu_count(logical=True),

                "memory_total_gb": round(memory.total / (1024 ** 3), 2),
                "memory_used_gb": round(memory.used / (1024 ** 3), 2),
                "memory_available_gb": round(memory.available / (1024 ** 3), 2),
                "memory_usage_percent": round(memory.percent, 2),

                "disk_total_gb": round(disk.total / (1024 ** 3), 2),
                "disk_used_gb": round(disk.used / (1024 ** 3), 2),
                "disk_free_gb": round(disk.free / (1024 ** 3), 2),
                "disk_usage_percent": round(disk.percent, 2),

                "process_count": len(psutil.pids()),
            }

        except Exception as e:
            self.logger.error(f"Error getting resource usage: {e}")
            return {
                "cpu_usage_percent": 0,
                "memory_usage_percent": 0,
                "disk_usage_percent": 0,
                "error": str(e),
            }

    def _get_network_status(self) -> Dict[str, Any]:
        """
        Check real internet connectivity via a TCP probe to a known host,
        and collect NIC-level I/O counters.

        Previously this only checked if a non-loopback IP existed on any
        interface, which would return True on air-gapped machines. A real
        socket probe is more accurate.
        """
        try:
            internet_accessible = False
            try:
                with socket.create_connection((_PROBE_HOST, _PROBE_PORT), timeout=_PROBE_TIMEOUT):
                    internet_accessible = True
            except OSError:
                pass  # Probe failed — genuinely no internet

            net_io = psutil.net_io_counters()

            return {
                "internet_accessible": internet_accessible,
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
                "errors_in": net_io.errin,
                "errors_out": net_io.errout,
                "drops_in": net_io.dropin,
                "drops_out": net_io.dropout,
            }

        except Exception as e:
            self.logger.error(f"Error getting network status: {e}")
            return {"internet_accessible": False, "error": str(e)}

    def _get_health_summary(self) -> Dict[str, Any]:
        """
        Generate an overall health score and alert list.
        Uses a single cpu_percent call (no interval) since _get_resource_usage
        already did the blocking call just before this.
        """
        try:
            cpu_percent = psutil.cpu_percent(interval=None)  # Non-blocking; uses cached value
            memory_percent = psutil.virtual_memory().percent
            disk_percent = psutil.disk_usage("/").percent

            health_score = 100
            issues = []

            if cpu_percent > 90:
                health_score -= 30
                issues.append("cpu_critical")
            elif cpu_percent > 75:
                health_score -= 15
                issues.append("cpu_warning")

            if memory_percent > 90:
                health_score -= 30
                issues.append("memory_critical")
            elif memory_percent > 75:
                health_score -= 15
                issues.append("memory_warning")

            if disk_percent > 90:
                health_score -= 20
                issues.append("disk_critical")
            elif disk_percent > 80:
                health_score -= 10
                issues.append("disk_warning")

            if health_score >= 80:
                system_health = "healthy"
            elif health_score >= 50:
                system_health = "warning"
            else:
                system_health = "critical"

            return {
                "system_health": system_health,
                "health_score": max(0, health_score),
                "issues": issues,
                "alerts": self._generate_alerts(issues, cpu_percent, memory_percent, disk_percent),
            }

        except Exception as e:
            self.logger.error(f"Error generating health summary: {e}")
            return {
                "system_health": "unknown",
                "health_score": 0,
                "issues": ["error"],
                "alerts": [f"Health check failed: {e}"],
            }

    @staticmethod
    def _generate_alerts(issues: list, cpu: float, memory: float, disk: float) -> list:
        """Convert issue codes into human-readable alert strings."""
        alerts = []
        if "cpu_critical" in issues:
            alerts.append(f"CPU usage is critically high at {cpu:.1f}%")
        elif "cpu_warning" in issues:
            alerts.append(f"CPU usage is elevated at {cpu:.1f}%")
        if "memory_critical" in issues:
            alerts.append(f"Memory usage is critically high at {memory:.1f}%")
        elif "memory_warning" in issues:
            alerts.append(f"Memory usage is elevated at {memory:.1f}%")
        if "disk_critical" in issues:
            alerts.append(f"Disk space is critically low at {disk:.1f}% used")
        elif "disk_warning" in issues:
            alerts.append(f"Disk space is low at {disk:.1f}% used")
        return alerts

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
    import logging
    logging.basicConfig(level=logging.INFO)

    monitor = HeartbeatMonitor()
    print("\nRunning heartbeat monitor once...")
    data = monitor.run_monitor(run_now=True)

    import json
    print(json.dumps(data, indent=2, default=str))
    print("Done!")