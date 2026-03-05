"""
setup.py - Build script for University Monitor Agent

Produces a self-contained deployment package at dist\UniversityMonitor\ containing:
  - UniversityMonitor.exe          the agent (bundled Python + all dependencies)
  - RegisterTask.xml               Task Scheduler task definition
  - install_service.ps1            manual install helper (optional)
  - INSTALL.txt                    plain-English instructions

DEPLOYMENT FLOW
===============
  Developer machine  (once, ever):
    pip install pyinstaller
    python setup.py build

  Each target PC  (once per PC):
    1. Copy dist\UniversityMonitor\ folder to the PC (USB / network share / GPO)
    2. Run as Administrator:
         schtasks /Create /XML "C:\Path\To\RegisterTask.xml" /TN "UniversityMonitorBootstrap"
       OR double-click RegisterTask.xml and import it via Task Scheduler GUI.
    3. Either reboot, or run the task immediately:
         schtasks /Run /TN "UniversityMonitorBootstrap"

  What happens next (automatic, forever):
    - Task Scheduler fires UniversityMonitor.exe --bootstrap at system startup
    - The EXE sees the service is not installed → installs it → starts it → exits
    - On every subsequent boot the EXE fires again, sees the service is already
      running, logs "nothing to do", and exits — completely idempotent
    - The Windows SCM handles all future starts, crash recovery, and restarts

WHY --onedir NOT --onefile
==========================
Windows services run before the user environment is set up. --onefile extracts
itself to %TEMP% at runtime, which may not be accessible or writable that early.
--onedir keeps all DLLs alongside the EXE in one fixed, stable location.
"""

import os
import sys
import shutil
import subprocess
import textwrap
from pathlib import Path

# ---------------------------------------------------------------------------
# Build configuration
# ---------------------------------------------------------------------------

APP_NAME   = "UniversityMonitor"
ENTRY_POINT = "main.py"
ICON_FILE  = "assets/icon.ico"     # Optional — remove ICON_ARG below if absent
DIST_DIR   = Path("dist")
BUILD_DIR  = Path("build")
OUTPUT_DIR = DIST_DIR / APP_NAME

# Modules that PyInstaller's static analyser misses because they are loaded
# dynamically (lazy imports, COM, win32 internals, etc.)
HIDDEN_IMPORTS = [
    # Service framework
    "win32serviceutil",
    "win32service",
    "win32event",
    "servicemanager",
    # Event log monitor
    "win32evtlog",
    "win32evtlogutil",
    "win32con",
    # User activity monitor (Windows sessions)
    "win32ts",
    # Security software monitor (WMI)
    "wmi",
    "win32api",
    "win32com",
    "win32com.client",
    "win32com.server",
    "pythoncom",
    "pywintypes",
    # psutil Windows backend
    "psutil",
    "psutil._pswindows",
    # Stdlib sometimes missed
    "winreg",
    "socket",
    "threading",
    "logging.handlers",
    "json",
    # Our own packages (lazy-imported in main.py)
    "monitors.heartbeat_monitor",
    "monitors.user_activity_monitor",
    "monitors.event_log_monitor",
    "monitors.security_software_monitor",
    "monitors.base_monitor",
    "core.config",
]

# Data directories to bundle (source → destination inside the EXE folder)
DATAS = [
    ("monitors", "monitors"),
    ("core",     "core"),
]

# ---------------------------------------------------------------------------
# Task Scheduler XML
#
# Trigger : At system startup
# Action  : Run UniversityMonitor.exe --bootstrap
# Run as  : SYSTEM (highest privileges — required for WMI, Event Logs, Registry)
# Settings: Run whether user is logged on or not, hidden, no time limit
#
# The placeholder %%EXE_PATH%% is replaced at build time with the actual path.
# The placeholder %%WORKING_DIR%% is the folder the EXE lives in.
#
# Note: The task is intentionally left with a placeholder path so the XML can
# be imported from any location — the import script (or IT admin) updates the
# path before importing, OR the EXE self-registers its own path at first run.
# ---------------------------------------------------------------------------
TASK_XML_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Bootstraps the University Monitor Agent service on startup.
Runs once: installs the service if not present, starts it, then exits.
On subsequent boots the EXE detects the service is already running and exits immediately.</Description>
    <Author>University IT</Author>
  </RegistrationInfo>

  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <!-- Small delay so the SCM and WMI are fully initialised before we query them -->
      <Delay>PT30S</Delay>
    </BootTrigger>
  </Triggers>

  <Principals>
    <Principal id="Author">
      <!-- Run as SYSTEM — required for WMI SecurityCenter2, Event Logs, Registry -->
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>

  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>

  <Actions Context="Author">
    <Exec>
      <Command>%%EXE_PATH%%</Command>
      <Arguments>--bootstrap</Arguments>
      <WorkingDirectory>%%WORKING_DIR%%</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"""

INSTALL_INSTRUCTIONS = """\
University Monitor Agent — Deployment Package
=============================================

WHAT THIS IS
------------
A self-contained monitoring agent that runs as a Windows service.
No Python installation is required on the target machine.


REQUIREMENTS
------------
  - Windows 10 / 11 or Windows Server 2016+
  - Administrator rights for installation


DEPLOYMENT (recommended — Task Scheduler)
------------------------------------------
1. Copy this entire folder to the target PC.
   Suggested location: C:\\Program Files\\UniversityMonitor\\

2. Edit RegisterTask.xml:
   Replace %%EXE_PATH%% with the full path to UniversityMonitor.exe
   Replace %%WORKING_DIR%% with the folder path
   Example:
     <Command>C:\\Program Files\\UniversityMonitor\\UniversityMonitor.exe</Command>
     <WorkingDirectory>C:\\Program Files\\UniversityMonitor</WorkingDirectory>

3. Import the task (run as Administrator):
   schtasks /Create /XML "RegisterTask.xml" /TN "UniversityMonitorBootstrap"

4. Run the task immediately (or reboot):
   schtasks /Run /TN "UniversityMonitorBootstrap"

   The EXE will install itself as a Windows service and start running.
   On every subsequent boot it starts automatically — no further action needed.


ALTERNATIVE — Manual install via PowerShell
--------------------------------------------
  Right-click install_service.ps1 → Run as Administrator → Choose option 1, then 2


LOGS
----
  C:\\ProgramData\\UniversityMonitor\\monitor.log


UNINSTALL
---------
  1. Right-click install_service.ps1 → Run as Administrator → Option 5 (Remove Service)
  2. schtasks /Delete /TN "UniversityMonitorBootstrap" /F
  3. Delete this folder
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean():
    for d in [BUILD_DIR, DIST_DIR]:
        if d.exists():
            print(f"  Removing {d}...")
            shutil.rmtree(d)
    spec = Path(f"{APP_NAME}.spec")
    if spec.exists():
        spec.unlink()
    print("  Clean complete.\n")


def check_pyinstaller():
    try:
        import PyInstaller
        print(f"  PyInstaller {PyInstaller.__version__} found.")
    except ImportError:
        print("  PyInstaller not found — installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])


def build_exe():
    check_pyinstaller()

    icon_arg = None
    if Path(ICON_FILE).exists():
        icon_arg = f"--icon={ICON_FILE}"
    else:
        print(f"  [INFO] No icon at {ICON_FILE} — building without icon")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onedir",           # One folder, not one file — required for services
        "--name", APP_NAME,
        "--console",          # Keep console for debugging; change to --noconsole when confirmed working
    ]

    if icon_arg:
        cmd.append(icon_arg)

    for imp in HIDDEN_IMPORTS:
        cmd += ["--hidden-import", imp]

    sep = ";" if sys.platform == "win32" else ":"
    for src, dst in DATAS:
        if Path(src).exists():
            cmd += ["--add-data", f"{src}{sep}{dst}"]
        else:
            print(f"  [WARN] Data path not found, skipping: {src}")

    # Force-collect win32/COM DLLs that PyInstaller's analyser misses
    for pkg in ["win32com", "win32", "pythoncom", "pywintypes", "wmi"]:
        cmd += ["--collect-all", pkg]

    cmd.append(ENTRY_POINT)

    print("\nRunning PyInstaller:\n  " + " ".join(cmd) + "\n")
    result = subprocess.run(cmd)
    return result.returncode == 0


def post_build():
    if not OUTPUT_DIR.exists():
        print(f"[ERROR] Output directory not found: {OUTPUT_DIR}")
        return

    exe_path     = f"%~dp0{APP_NAME}.exe"   # Relative — works from any install location
    working_dir  = "%~dp0"

    # Write Task Scheduler XML with placeholder paths
    # IT admin / install script replaces these before importing
    xml_path = OUTPUT_DIR / "RegisterTask.xml"
    xml_path.write_text(
        TASK_XML_TEMPLATE
        .replace("%%EXE_PATH%%",    f"C:\\Program Files\\{APP_NAME}\\{APP_NAME}.exe")
        .replace("%%WORKING_DIR%%", f"C:\\Program Files\\{APP_NAME}"),
        encoding="utf-16",   # Task Scheduler requires UTF-16 XML
    )
    print(f"  Written RegisterTask.xml (edit paths if not installing to Program Files)")

    # Copy supporting files
    for src in ["install_service.ps1", "requirements.txt"]:
        if Path(src).exists():
            shutil.copy2(src, OUTPUT_DIR / src)
            print(f"  Copied {src}")
        else:
            print(f"  [WARN] {src} not found — skipping")

    # Write install instructions
    (OUTPUT_DIR / "INSTALL.txt").write_text(INSTALL_INSTRUCTIONS, encoding="utf-8")
    print(f"  Written INSTALL.txt")

    print(f"\n  Deployment package ready:\n    {OUTPUT_DIR.resolve()}\n")
    print("  Copy the entire folder to target machines and follow INSTALL.txt\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    do_clean = "--clean" in sys.argv or "clean" in sys.argv
    do_build = "build" in sys.argv or len(sys.argv) == 1

    print("=" * 60)
    print(f"  {APP_NAME} — EXE Builder")
    print("=" * 60 + "\n")

    if do_clean:
        print("[1/3] Cleaning previous build...")
        clean()

    if do_build:
        print("[2/3] Building EXE with PyInstaller...")
        success = build_exe()

        if success:
            print("\n[3/3] Post-build: generating deployment package...")
            post_build()
            print("[DONE] Build succeeded!")
            print(f"       Package: {OUTPUT_DIR.resolve()}")
        else:
            print("\n[FAILED] PyInstaller returned an error.")
            sys.exit(1)
