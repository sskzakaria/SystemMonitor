"""
security_software_monitor.py - Security & Software Monitor

Collects:
- Antivirus/Security software status  (WMI SecurityCenter2)
- Firewall status                      (WMI SecurityCenter2)
- Windows Defender detailed status     (WMI root\\Microsoft\\Windows\\Defender)
- Installed programs                   (Windows Registry)
- Security summary

Windows-Only Implementation.

Design notes:
- WMI connections are obtained via self._get_wmi_connection() from the
  WindowsWMIMonitor base class — no bare wmi.WMI() calls inside methods,
  which would bypass the base class's thread-safety guarantees.
- productState bit-decoding follows the documented SecurityCenter2 layout:
    bits 12-13: enabled flag  (non-zero = enabled)
    bits  4- 5: update flag   (0 = up to date, non-zero = out of date)
- Windows Defender status is fetched via WMI (root\\Microsoft\\Windows\\Defender,
  MSFT_MpComputerStatus) instead of spawning a PowerShell subprocess every cycle.
- working_features resets on success so transient WMI hiccups don't permanently
  disable a feature for the lifetime of the process.
- Registry subkey handles are always closed in a finally block with a guard
  against double-close on failed opens.
- _create_security_summary() checks real_time_protection, not just enabled.
- run_monitor() uses self.get_common_data() for timestamps, consistent with
  EventLogMonitor.
"""

import threading
import time
import winreg
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from monitors.base_monitor import WindowsWMIMonitor
from core.config import SecuritySoftwareMonitorConfig


# How many consecutive failures before a feature is temporarily skipped
_FEATURE_FAILURE_THRESHOLD = 3
# How many successful cycles before a previously-failed feature is retried
_FEATURE_RETRY_AFTER_CYCLES = 5


class SecuritySoftwareMonitor(WindowsWMIMonitor):
    """
    Monitor for security software status and installed programs.

    Inherits thread-safe WMI connection management from WindowsWMIMonitor.
    Each collection feature degrades independently and auto-recovers after
    a successful cycle window.
    """

    def __init__(self, config: SecuritySoftwareMonitorConfig = None):
        config = config or SecuritySoftwareMonitorConfig()
        super().__init__("security_software_monitor", config)

        # Feature toggles from config
        self.collect_antivirus: bool = getattr(config, "COLLECT_ANTIVIRUS", True)
        self.collect_firewall: bool = getattr(config, "COLLECT_FIREWALL", True)
        self.collect_defender: bool = getattr(config, "COLLECT_DEFENDER_DETAILS", True)
        self.collect_programs: bool = getattr(config, "COLLECT_INSTALLED_PROGRAMS", True)
        self.max_programs: int = getattr(config, "MAX_PROGRAMS_TO_COLLECT", 500)

        # Per-feature failure counters for auto-recovery
        # Format: {feature: consecutive_failure_count}
        self._feature_failures: Dict[str, int] = {
            "antivirus": 0,
            "firewall": 0,
            "defender": 0,
            "programs": 0,
        }
        self._successful_cycles: int = 0

        self.running = False
        self.monitor_thread: Optional[threading.Thread] = None

        self.logger.info("Security & Software Monitor initialized")

    # ------------------------------------------------------------------
    # Feature skip / recovery helpers
    # ------------------------------------------------------------------

    def _feature_ok(self, name: str) -> bool:
        """Return True if the feature is below the failure threshold."""
        return self._feature_failures[name] < _FEATURE_FAILURE_THRESHOLD

    def _record_feature_failure(self, name: str, error: Exception):
        self._feature_failures[name] += 1
        self.logger.warning(
            f"{name} collection failed "
            f"({self._feature_failures[name]}/{_FEATURE_FAILURE_THRESHOLD}): {error}"
        )

    def _record_feature_success(self, name: str):
        self._feature_failures[name] = 0  # Reset on any success

    def _maybe_reset_failures(self):
        """
        After enough successful cycles, retry previously-failed features.
        Prevents a transient WMI hiccup from permanently blinding the monitor.
        """
        self._successful_cycles += 1
        if self._successful_cycles >= _FEATURE_RETRY_AFTER_CYCLES:
            for name in self._feature_failures:
                if self._feature_failures[name] >= _FEATURE_FAILURE_THRESHOLD:
                    self.logger.info(f"Retrying previously-failed feature: {name}")
                    self._feature_failures[name] = 0
            self._successful_cycles = 0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, interval: int = None):
        """Start continuous monitoring."""
        self.interval = interval or self.config.INTERVAL
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        self.logger.info(f"Security Software Monitor started with {self.interval}s interval")

    def stop(self):
        """Stop monitoring gracefully."""
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Security Software Monitor stopped")

    def _monitor_loop(self):
        """
        Continuous monitoring loop.

        COM is initialised once per thread by the WindowsWMIMonitor base class
        via _init_com_for_thread() / _cleanup_com_for_thread().
        """
        self._init_com_for_thread()
        consecutive_errors = 0
        max_consecutive_errors = 10

        try:
            while self.running:
                try:
                    if not self.circuit_breaker.is_available():
                        self.logger.warning("Circuit breaker OPEN, skipping collection")
                        time.sleep(self.interval)
                        continue

                    start_time = time.time()
                    data = self.circuit_breaker.call(self.run_monitor, run_now=True)
                    duration_ms = (time.time() - start_time) * 1000

                    self.last_collection_duration = duration_ms
                    self.health_metrics.record_success(duration_ms)
                    self.store_monitor_data(data)

                    self._maybe_reset_failures()
                    consecutive_errors = 0

                    self._sleep_with_jitter(self.interval)

                except Exception as e:
                    consecutive_errors += 1
                    error_msg = f"{type(e).__name__}: {e}"
                    self.health_metrics.record_failure(error_msg)
                    self.last_errors.append(str(e))
                    self.logger.error(f"Collection error ({consecutive_errors}/{max_consecutive_errors}): {e}")

                    if consecutive_errors >= max_consecutive_errors:
                        self.logger.error("Stopping after too many consecutive errors")
                        self.running = False
                        break

                    time.sleep(min(self.interval, 2 ** consecutive_errors))
        finally:
            self._cleanup_com_for_thread()

    # ------------------------------------------------------------------
    # Main collection
    # ------------------------------------------------------------------

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Collect security and software data with per-feature graceful degradation.

        Uses self.get_common_data() for timestamps (consistent with EventLogMonitor).
        """
        data = self.get_common_data()
        data.update({
            "antivirus": [],
            "firewall": [],
            "windows_defender": {},
            "installed_programs": [],
            "installed_programs_count": 0,
        })

        if self.collect_antivirus and self._feature_ok("antivirus"):
            try:
                data["antivirus"] = self._get_antivirus_status()
                self._record_feature_success("antivirus")
            except Exception as e:
                self._record_feature_failure("antivirus", e)
                data["antivirus_error"] = str(e)

        if self.collect_firewall and self._feature_ok("firewall"):
            try:
                data["firewall"] = self._get_firewall_status()
                self._record_feature_success("firewall")
            except Exception as e:
                self._record_feature_failure("firewall", e)
                data["firewall_error"] = str(e)

        if self.collect_defender and self._feature_ok("defender"):
            try:
                data["windows_defender"] = self._get_windows_defender_status()
                self._record_feature_success("defender")
            except Exception as e:
                self._record_feature_failure("defender", e)
                data["windows_defender"] = {"error": str(e)}

        if self.collect_programs and self._feature_ok("programs"):
            try:
                data["installed_programs"] = self._get_installed_programs()
                data["installed_programs_count"] = len(data["installed_programs"])
                self._record_feature_success("programs")
            except Exception as e:
                self._record_feature_failure("programs", e)
                data["programs_error"] = str(e)

        data["security_summary"] = self._create_security_summary(data)
        data["available_features"] = [
            f for f in self._feature_failures if self._feature_ok(f)
        ]

        return data

    # ------------------------------------------------------------------
    # Collectors
    # ------------------------------------------------------------------

    def _get_antivirus_status(self) -> List[Dict[str, Any]]:
        """
        Query AntiVirusProduct from WMI SecurityCenter2.

        Uses the base class WMI connection (self._get_wmi_connection) rather
        than creating a fresh wmi.WMI() object, which would bypass thread safety.

        productState decoding (SecurityCenter2 documented layout):
          bits 12-13: 0x0000 = disabled, non-zero = enabled
          bits  4- 5: 0x00   = up to date, non-zero = out of date
        """
        wmi_sc = self._get_wmi_connection(namespace="root\\SecurityCenter2")
        products = []

        for av in wmi_sc.AntiVirusProduct():
            try:
                state = int(av.productState)
                enabled = bool((state >> 12) & 0xF)
                up_to_date = ((state >> 4) & 0xF) == 0

                products.append({
                    "display_name": av.displayName or "Unknown",
                    "instance_guid": av.instanceGuid or "Unknown",
                    "product_state": state,
                    "enabled": enabled,
                    "up_to_date": up_to_date,
                    "path_to_executable": getattr(av, "pathToSignedProductExe", "Unknown"),
                })
            except Exception as e:
                self.logger.debug(f"Error reading antivirus product: {e}")

        return products

    def _get_firewall_status(self) -> List[Dict[str, Any]]:
        """
        Query FirewallProduct from WMI SecurityCenter2.

        Same bit-decoding as antivirus — enabled is bits 12-13.
        """
        wmi_sc = self._get_wmi_connection(namespace="root\\SecurityCenter2")
        products = []

        for fw in wmi_sc.FirewallProduct():
            try:
                state = int(fw.productState)
                enabled = bool((state >> 12) & 0xF)

                products.append({
                    "display_name": fw.displayName or "Unknown",
                    "instance_guid": fw.instanceGuid or "Unknown",
                    "product_state": state,
                    "enabled": enabled,
                    "path_to_executable": getattr(fw, "pathToSignedProductExe", "Unknown"),
                })
            except Exception as e:
                self.logger.debug(f"Error reading firewall product: {e}")

        return products

    def _get_windows_defender_status(self) -> Dict[str, Any]:
        """
        Fetch Windows Defender status via WMI (root\\Microsoft\\Windows\\Defender).

        Replaced the original subprocess PowerShell call — spawning a new
        PowerShell process every 30s is expensive (1-2s startup, extra memory).
        The WMI class MSFT_MpComputerStatus provides the same data in-process.
        """
        try:
            wmi_def = self._get_wmi_connection(namespace="root\\Microsoft\\Windows\\Defender")
            status_list = wmi_def.MSFT_MpComputerStatus()

            if not status_list:
                return {"installed": False, "enabled": False}

            s = status_list[0]

            return {
                "installed": True,
                "enabled": bool(getattr(s, "AntivirusEnabled", False)),
                "real_time_protection": bool(getattr(s, "RealTimeProtectionEnabled", False)),
                "behavioral_monitoring": bool(getattr(s, "BehaviorMonitorEnabled", False)),
                "ioav_protection": bool(getattr(s, "IoavProtectionEnabled", False)),
                "antivirus_signature_age": getattr(s, "AntivirusSignatureAge", None),
                "antivirus_signature_version": getattr(s, "AntivirusSignatureVersion", None),
                "last_quick_scan": str(getattr(s, "QuickScanEndTime", "Unknown")),
                "last_full_scan": str(getattr(s, "FullScanEndTime", "Unknown")),
            }

        except Exception as e:
            self.logger.debug(f"Windows Defender WMI query failed: {e}")
            return {"installed": False, "enabled": False, "error": str(e)}

    def _get_installed_programs(self) -> List[Dict[str, Any]]:
        """
        Read installed programs from Windows Registry uninstall keys.

        Registry subkeys are always closed in a finally block. A separate
        `opened` flag prevents double-close when OpenKey itself raises before
        the handle is assigned.
        """
        programs: List[Dict[str, Any]] = []

        registry_paths = [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ]

        for hive, path in registry_paths:
            if len(programs) >= self.max_programs:
                break

            try:
                root_key = winreg.OpenKey(hive, path)
            except (OSError, PermissionError) as e:
                self.logger.debug(f"Cannot open registry path {path}: {e}")
                continue

            try:
                idx = 0
                while len(programs) < self.max_programs:
                    try:
                        subkey_name = winreg.EnumKey(root_key, idx)
                    except OSError:
                        break  # No more subkeys

                    subkey = None
                    try:
                        subkey = winreg.OpenKey(root_key, subkey_name)

                        try:
                            display_name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                        except (OSError, FileNotFoundError):
                            idx += 1
                            continue  # No DisplayName — skip silently

                        if not display_name:
                            idx += 1
                            continue

                        program: Dict[str, Any] = {"name": display_name}

                        for field, reg_key in [
                            ("version", "DisplayVersion"),
                            ("publisher", "Publisher"),
                            ("install_date", "InstallDate"),
                        ]:
                            try:
                                program[field] = winreg.QueryValueEx(subkey, reg_key)[0]
                            except (OSError, FileNotFoundError):
                                pass

                        programs.append(program)

                    except (OSError, PermissionError) as e:
                        self.logger.debug(f"Cannot open subkey {subkey_name}: {e}")
                    finally:
                        if subkey is not None:
                            subkey.Close()

                    idx += 1

            finally:
                root_key.Close()

        return programs

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def _create_security_summary(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Produce an overall security posture summary.

        Checks real_time_protection explicitly — Defender can be "enabled"
        but have real-time protection disabled, which is a meaningful gap.
        """
        issues: List[str] = []

        antivirus_enabled = any(av.get("enabled") for av in data.get("antivirus", []))
        if not antivirus_enabled:
            issues.append("No antivirus enabled")

        firewall_enabled = any(fw.get("enabled") for fw in data.get("firewall", []))
        if not firewall_enabled:
            issues.append("No firewall enabled")

        defender = data.get("windows_defender", {})
        if defender.get("installed"):
            if not defender.get("enabled"):
                issues.append("Windows Defender disabled")
            elif not defender.get("real_time_protection"):
                # Enabled but real-time protection is off — still a warning
                issues.append("Windows Defender real-time protection disabled")

        sig_age = defender.get("antivirus_signature_age")
        if isinstance(sig_age, (int, float)) and sig_age > 7:
            issues.append(f"Defender signatures are {int(sig_age)} days old")

        if len(issues) == 0:
            overall_status = "secure"
        elif len(issues) == 1:
            overall_status = "warning"
        else:
            overall_status = "at_risk"

        return {
            "overall_status": overall_status,
            "antivirus_enabled": antivirus_enabled,
            "firewall_enabled": firewall_enabled,
            "real_time_protection": defender.get("real_time_protection", False),
            "issues": issues,
        }

    # ------------------------------------------------------------------
    # Config hot-reload
    # ------------------------------------------------------------------

    def update_config(self, **kwargs):
        """Dynamically update monitor configuration."""
        mapping = {
            "COLLECT_ANTIVIRUS": "collect_antivirus",
            "COLLECT_FIREWALL": "collect_firewall",
            "COLLECT_DEFENDER_DETAILS": "collect_defender",
            "COLLECT_INSTALLED_PROGRAMS": "collect_programs",
            "MAX_PROGRAMS_TO_COLLECT": "max_programs",
        }
        for key, value in kwargs.items():
            if key in mapping:
                setattr(self, mapping[key], value)
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Updated config: {key} = {value}")
            else:
                self.logger.warning(f"Unknown config key: {key}")

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

    monitor = SecuritySoftwareMonitor()
    print("\n=== Running security software monitor once ===")
    data = monitor.run_monitor(run_now=True)

    print(f"\nAntivirus products : {len(data.get('antivirus', []))}")
    for av in data.get("antivirus", []):
        print(f"  {av['display_name']} — enabled={av['enabled']}, up_to_date={av['up_to_date']}")

    print(f"Firewall products  : {len(data.get('firewall', []))}")
    for fw in data.get("firewall", []):
        print(f"  {fw['display_name']} — enabled={fw['enabled']}")

    d = data.get("windows_defender", {})
    print(f"Windows Defender   : installed={d.get('installed')}, "
          f"enabled={d.get('enabled')}, real_time={d.get('real_time_protection')}, "
          f"sig_age={d.get('antivirus_signature_age')}d")

    print(f"Installed programs : {data.get('installed_programs_count', 0)}")
    print(f"Security status    : {data.get('security_summary', {}).get('overall_status')}")
    print(f"Issues             : {data.get('security_summary', {}).get('issues', [])}")
    print(f"Available features : {data.get('available_features', [])}")
    print("\nDone!")