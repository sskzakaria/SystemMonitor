"""
main.py - University Monitor Agent

DEPLOYMENT
==========
Ansible drops the EXE on each machine and creates a Task Scheduler task
that runs:  UniversityMonitor.exe  (no arguments) at system startup.

On every boot that task fires the EXE which:
  1. Installs itself as a Windows service if not already installed
  2. Starts the service if not already running
  3. Exits immediately if already running — fully idempotent

The Windows SCM then owns the process forever:
  - Auto-starts on every boot
  - Restarts automatically on crash (3 attempts, 1 minute apart)
  - No further Ansible runs or manual steps needed

COMMAND LINE
============
  (no args)   Bootstrap: install + start service if needed, then exit
  run         Foreground console mode for testing (Ctrl+C to stop)
  install     Register service manually
  start       Start service manually
  stop        Stop service manually
  remove      Unregister service
  debug       Run service in foreground with SCM output

LOG
===
  C:\\ProgramData\\UniversityMonitor\\monitor.log
"""

import logging
import os
import sys
import time
from pathlib import Path

import servicemanager
import win32event
import win32service
import win32serviceutil

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "UniversityMonitor"
LOG_FILE = DATA_DIR / "monitor.log"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging — file handler is essential; services have no stdout/stderr
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-30s | %(levelname)-8s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("UniversityMonitor")

# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------
SERVICE_NAME         = "UniversityMonitor"
SERVICE_DISPLAY_NAME = "University Monitor Agent"
SERVICE_DESCRIPTION  = (
    "Monitors system health, user activity, event logs, and security "
    "software. Sends telemetry to the University Monitor backend."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_exe_path() -> str:
    """Path to this executable — works for PyInstaller EXE and raw script."""
    if getattr(sys, "frozen", False):
        return sys.executable
    return f'"{sys.executable}" "{os.path.abspath(__file__)}"'


def _is_service_installed() -> bool:
    try:
        win32serviceutil.QueryServiceStatus(SERVICE_NAME)
        return True
    except Exception:
        return False


def _is_service_running() -> bool:
    try:
        status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)
        return status[1] == win32service.SERVICE_RUNNING
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Service installation
# ---------------------------------------------------------------------------

def _install_service():
    """
    Register the service with the Windows SCM.
      - Startup type : Automatic
      - Account      : SYSTEM
      - Crash recovery: restart after 60s, up to 3 times, reset after 24h
    """
    import win32service as ws

    logger.info(f"Service: installing '{SERVICE_NAME}'...")

    hscm = ws.OpenSCManager(None, None, ws.SC_MANAGER_CREATE_SERVICE)
    try:
        hs = ws.CreateService(
            hscm,
            SERVICE_NAME,
            SERVICE_DISPLAY_NAME,
            ws.SERVICE_ALL_ACCESS,
            ws.SERVICE_WIN32_OWN_PROCESS,
            ws.SERVICE_AUTO_START,
            ws.SERVICE_ERROR_NORMAL,
            _get_exe_path(),
            None, 0, None, None, None,
        )

        ws.ChangeServiceConfig2(hs, ws.SERVICE_CONFIG_DESCRIPTION, SERVICE_DESCRIPTION)

        ws.ChangeServiceConfig2(
            hs,
            ws.SERVICE_CONFIG_FAILURE_ACTIONS,
            {
                "ResetPeriod": 86400,
                "RebootMsg":   "",
                "Command":     "",
                "Actions": [
                    (ws.SC_ACTION_RESTART, 60000),
                    (ws.SC_ACTION_RESTART, 60000),
                    (ws.SC_ACTION_RESTART, 60000),
                ],
            },
        )

        ws.CloseServiceHandle(hs)
        logger.info(f"Service: '{SERVICE_NAME}' installed successfully.")

    finally:
        ws.CloseServiceHandle(hscm)


def _start_service():
    """Start the service and wait up to 30 seconds for it to reach RUNNING."""
    import pywintypes

    logger.info(f"Service: starting '{SERVICE_NAME}'...")
    try:
        win32serviceutil.StartService(SERVICE_NAME)
    except pywintypes.error as e:
        if e.winerror == 1056:  # ERROR_SERVICE_ALREADY_RUNNING
            logger.info("Service: already running.")
            return
        raise

    for _ in range(30):
        time.sleep(1)
        if _is_service_running():
            logger.info("Service: running.")
            return

    logger.warning("Service: did not reach RUNNING state within 30 seconds — check the log.")


# ---------------------------------------------------------------------------
# Bootstrap — called on every boot via Task Scheduler task (managed by Ansible)
# ---------------------------------------------------------------------------

def bootstrap():
    """
    Idempotent setup: install + start the service if needed, exit if already running.
    Called when the EXE is launched with no arguments (by the Task Scheduler task).
    """
    logger.info("Bootstrap: checking service state...")

    if _is_service_running():
        logger.info("Bootstrap: service is already running — nothing to do.")
        return

    if not _is_service_installed():
        _install_service()

    _start_service()
    logger.info(f"Bootstrap: complete. Log: {LOG_FILE}")


# ---------------------------------------------------------------------------
# Windows Service class
# ---------------------------------------------------------------------------

class UniversityMonitorService(win32serviceutil.ServiceFramework):
    _svc_name_         = SERVICE_NAME
    _svc_display_name_ = SERVICE_DISPLAY_NAME
    _svc_description_  = SERVICE_DESCRIPTION

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._monitors   = []
        self._running    = False

    def SvcStop(self):
        logger.info("Stop signal received from SCM")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self._running = False
        win32event.SetEvent(self._stop_event)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        logger.info(f"Service started — log: {LOG_FILE}")
        self._running = True

        try:
            self._start_monitors()
            win32event.WaitForSingleObject(self._stop_event, win32event.INFINITE)
        except Exception as e:
            logger.exception(f"Fatal error in SvcDoRun: {e}")
        finally:
            self._stop_monitors()
            logger.info("Service stopped cleanly")
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STOPPED,
                (self._svc_name_, ""),
            )

    def _start_monitors(self):
        logger.info("Starting monitors...")
        (
            HeartbeatMonitor, UserActivityMonitor,
            EventLogMonitor, SecuritySoftwareMonitor,
            HeartbeatMonitorConfig, UserActivityMonitorConfig,
            EventLogMonitorConfig, SecuritySoftwareMonitorConfig,
        ) = _import_monitors()

        for name, cls, cfg in [
            ("HeartbeatMonitor",        HeartbeatMonitor,        HeartbeatMonitorConfig()),
            ("UserActivityMonitor",     UserActivityMonitor,     UserActivityMonitorConfig()),
            ("EventLogMonitor",         EventLogMonitor,         EventLogMonitorConfig()),
            ("SecuritySoftwareMonitor", SecuritySoftwareMonitor, SecuritySoftwareMonitorConfig()),
        ]:
            try:
                m = cls(cfg)
                m.start()
                self._monitors.append(m)
                logger.info(f"  ✓ {name} started")
            except Exception as e:
                logger.error(f"  ✗ {name} failed to start: {e}")

    def _stop_monitors(self):
        logger.info("Stopping monitors...")
        for m in reversed(self._monitors):
            try:
                m.stop()
                logger.info(f"  ✓ {m.__class__.__name__} stopped")
            except Exception as e:
                logger.warning(f"  ✗ {m.__class__.__name__} stop error: {e}")
        self._monitors.clear()


# ---------------------------------------------------------------------------
# Console mode — testing only
# ---------------------------------------------------------------------------

def run_console():
    logger.info("Console mode — Ctrl+C to stop")
    (
        HeartbeatMonitor, UserActivityMonitor,
        EventLogMonitor, SecuritySoftwareMonitor,
        HeartbeatMonitorConfig, UserActivityMonitorConfig,
        EventLogMonitorConfig, SecuritySoftwareMonitorConfig,
    ) = _import_monitors()

    monitors = []
    for cls, cfg_cls in [
        (HeartbeatMonitor,        HeartbeatMonitorConfig),
        (UserActivityMonitor,     UserActivityMonitorConfig),
        (EventLogMonitor,         EventLogMonitorConfig),
        (SecuritySoftwareMonitor, SecuritySoftwareMonitorConfig),
    ]:
        try:
            m = cls(cfg_cls())
            m.start()
            monitors.append(m)
            logger.info(f"  ✓ {cls.__name__} started")
        except Exception as e:
            logger.error(f"  ✗ {cls.__name__} failed: {e}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Stopping...")
    finally:
        for m in reversed(monitors):
            try:
                m.stop()
            except Exception:
                pass
        logger.info("All monitors stopped")


# ---------------------------------------------------------------------------
# Lazy monitor imports
# ---------------------------------------------------------------------------

def _import_monitors():
    from monitors.heartbeat_monitor import HeartbeatMonitor
    from monitors.user_activity_monitor import UserActivityMonitor
    from monitors.event_log_monitor import EventLogMonitor
    from monitors.security_software_monitor import SecuritySoftwareMonitor
    from core.config import (
        HeartbeatMonitorConfig,
        UserActivityMonitorConfig,
        EventLogMonitorConfig,
        SecuritySoftwareMonitorConfig,
    )
    return (
        HeartbeatMonitor, UserActivityMonitor,
        EventLogMonitor, SecuritySoftwareMonitor,
        HeartbeatMonitorConfig, UserActivityMonitorConfig,
        EventLogMonitorConfig, SecuritySoftwareMonitorConfig,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args:
        # No arguments — either SCM launched us as a service, or Task Scheduler
        # fired us for the bootstrap check. Distinguish by trying the SCM
        # dispatcher first; if we weren't launched by the SCM it raises and
        # we fall through to bootstrap().
        try:
            servicemanager.Initialize()
            servicemanager.PrepareToHostSingle(UniversityMonitorService)
            servicemanager.StartServiceCtrlDispatcher()
        except Exception:
            bootstrap()

    elif args[0].lower() == "run":
        run_console()

    else:
        # install / start / stop / remove / debug
        win32serviceutil.HandleCommandLine(UniversityMonitorService)
