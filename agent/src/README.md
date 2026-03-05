# University Monitor Agent

Windows monitoring agent that runs as a background service and sends system data to the backend API.

---

## Requirements

- Windows 10 / 11 or Windows Server 2016+
- Python 3.9 or newer — [python.org/downloads](https://www.python.org/downloads/)
- Administrator rights

---

## 1. Install Python Dependencies

Open **Command Prompt as Administrator**, navigate to the agent folder, then run:

```cmd
pip install -r requirements.txt
```

### Fix pywin32 after install (required — do this every time you reinstall pywin32)

After `pip install` completes, you must run the pywin32 post-install script or the Windows service and event log features will not work. Find and run it like this:

```cmd
python -c "import os, sys; os.system(sys.executable + ' ' + os.path.join(os.path.dirname(sys.executable), 'Scripts', 'pywin32_postinstall.py') + ' -install')"
```

Or find the script manually and run it:

```cmd
# Find where Python is installed
where python

# Then run the script from that location, e.g.:
python C:\Users\YourName\AppData\Local\Programs\Python\Python311\Scripts\pywin32_postinstall.py -install
```

You should see: `Registered: pythoncom311.dll` and similar lines. If you see errors, make sure you are running as Administrator.

---

## 2. Configure the Agent

Copy `.env` to the agent root folder and edit the backend URL to point at your server:

```env
BACKEND_URL=http://your-server-ip:8001
```

---

## 3. Run the Agent

### Option A — Console mode (for testing, runs in the terminal)

```cmd
python main.py run
```

You will see live log output from all monitors. Press **Ctrl+C** to stop.
This is the best way to verify everything is working before installing as a service.

### Option B — Install and run as a Windows Service (for production)

```cmd
# Install the service
python main.py install

# Start it
python main.py start
```

The service will now start automatically on every boot and restart itself if it crashes. You do not need to keep a terminal open.

### Other service commands

```cmd
python main.py stop      # Stop the service
python main.py restart   # Restart the service
python main.py remove    # Uninstall the service completely
python main.py status    # Check if it is running
```

---

## 4. Verify It Is Working

**Check the log file:**

```
C:\ProgramData\UniversityMonitor\monitor.log
```

You should see lines like:

```
2026-03-05 10:00:01 | heartbeat_monitor     | INFO  | Heartbeat Monitor started with 30s interval
2026-03-05 10:00:31 | heartbeat_monitor     | DEBUG | ✓ Data sent to backend (heartbeat)
```

**Test a single monitor without starting everything:**

```cmd
python monitors/heartbeat_monitor.py
python monitors/user_activity_monitor.py
python monitors/hardware_monitor.py
python monitors/event_log_monitor.py
python monitors/security_software_monitor.py
```

Each monitor prints one collection cycle to the console and exits — useful for quickly checking if a specific monitor works.

**Test the backend connection:**

```cmd
python core/api_client.py
```



