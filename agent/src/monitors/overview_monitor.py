"""
overview_monitor.py - System Overview Monitor (Windows focused)

Provides system overview and summary information.
"""

import threading
import time
import platform
import psutil
from datetime import datetime, timezone
from typing import Dict, Any

from monitors.base_monitor import BaseMonitor 
from core.config import OverviewMonitorConfig


class OverviewMonitor(BaseMonitor):
    """
    System overview monitor
    
    Features:
    - System summary
    - Windows build info
    - Installation date
    - Overall system status
    """
    
    def __init__(self, config: OverviewMonitorConfig = None):
        config = config or OverviewMonitorConfig()
        super().__init__("overview_monitor", config)
        self.running = False
        self.monitor_thread = None

    def start(self, interval: int = None):
        """Start monitoring"""
        self.interval = interval or self.config.INTERVAL
        self.running = True
        
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        
        self.logger.info(f"Overview Monitor started")

    def stop(self):
        """Stop monitoring"""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)

    def _monitor_loop(self):
        """Continuous monitoring loop"""
        while self.running:
            try:
                start_time = time.time()
                data = self.run_monitor(run_now=True)
                self.last_collection_duration = (time.time() - start_time) * 1000
                
                self.store_monitor_data(data)
                self._sleep_with_jitter(self.interval)
                
            except Exception as e:
                self.logger.error(f"Monitoring error: {e}")
                time.sleep(self.interval)

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """Collect overview data"""
        return {
            'system_info': self._get_system_info(),
            'resource_summary': self._get_resource_summary(),
            'uptime_info': self._get_uptime_info()
        }

    def _get_system_info(self) -> Dict[str, Any]:
        """Get system information"""
        info = {}
        
        try:
            uname = platform.uname()
            info['system'] = uname.system
            info['release'] = uname.release
            info['version'] = uname.version
            info['machine'] = uname.machine
            info['processor'] = uname.processor
            
            if platform.system() == "Windows":
                import subprocess
                try:
                    result = subprocess.run(
                        ['systeminfo'],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    for line in result.stdout.split('\n'):
                        if 'OS Name:' in line:
                            info['os_name'] = line.split(':', 1)[1].strip()
                        elif 'OS Build:' in line:
                            info['os_build'] = line.split(':', 1)[1].strip()
                except:
                    pass
        except Exception as e:
            self.logger.error(f"System info error: {e}")
        
        return info

    def _get_resource_summary(self) -> Dict[str, Any]:
        """Get resource usage summary"""
        try:
            cpu = psutil.cpu_percent(interval=1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return {
                'cpu_usage_percent': round(cpu, 2),
                'memory_usage_percent': round(mem.percent, 2),
                'disk_usage_percent': round(disk.percent, 2)
            }
        except Exception as e:
            self.logger.error(f"Resource summary error: {e}")
            return {}

    def _get_uptime_info(self) -> Dict[str, Any]:
        """Get system uptime"""
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = int(time.time() - boot_time)
            
            days = uptime_seconds // 86400
            hours = (uptime_seconds % 86400) // 3600
            
            return {
                'boot_time_epoch': int(boot_time),
                'uptime_seconds': uptime_seconds,
                'uptime_days': days,
                'uptime_hours': hours,
                'uptime_human': f"{days}d {hours}h"
            }
        except Exception as e:
            self.logger.error(f"Uptime error: {e}")
            return {}


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    
    monitor = OverviewMonitor()
    print("\nRunning overview monitor once...")
    monitor.run_once()
    print("Done!")
