"""
network_monitor.py - Network Monitor (v2)

════════════════════════════════════════════════════════════════════════════════
BACKEND INTEGRATION & ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

PURPOSE
  Monitors live network health, performance, and configuration each cycle.
  Distinct from specs_monitor which collects static adapter hardware info
  (MAC addresses, adapter descriptions) — that data lives in specs and is
  cached for 24 hours. Network monitor is purely dynamic/runtime data.

DIVISION OF RESPONSIBILITY
  ┌─────────────────────┬──────────────────────┬────────────────────────────┐
  │ Data                │ Monitor              │ Why                        │
  ├─────────────────────┼──────────────────────┼────────────────────────────┤
  │ MAC address         │ specs_monitor        │ Static hardware identity   │
  │ Adapter description │ specs_monitor        │ Static, cached 24h         │
  │ NIC speed (max)     │ specs_monitor        │ Hardware capability        │
  │ DNS servers         │ network_monitor      │ Changes (DHCP lease)       │
  │ IP address          │ network_monitor      │ Changes (DHCP lease)       │
  │ Default gateway     │ network_monitor      │ Changes (network change)   │
  │ Ping latency        │ network_monitor      │ Dynamic per-cycle          │
  │ Packet loss         │ network_monitor      │ Dynamic per-cycle          │
  │ Traffic counters    │ network_monitor      │ Dynamic per-cycle          │
  │ Quality score       │ network_monitor      │ Derived from live data     │
  └─────────────────────┴──────────────────────┴────────────────────────────┘

WHAT THIS MONITOR DOES NOT COLLECT (already in specs_monitor)
  - MAC addresses (static, in specs.network.interfaces)
  - Physical adapter hardware descriptions
  - NIC driver info

PAYLOAD (POST /api/computers/<id>/data  →  key: "network")
  {
    "timestamp":    "2026-03-04T16:00:00Z",
    "primary_ip":   "10.0.0.180",
    "gateway":      "10.0.0.1",
    "dns_servers":  ["8.8.8.8", "8.8.4.4"],
    "quality_score": 95,
    "online":       true,

    "connectivity": {
      "internet_accessible": true,
      "gateway_reachable":   true,
      "dns_working":         true,
      "gateway_latency_ms":  1.2,
      "dns_latency_ms":      8.3,
      "targets": [
        { "host": "8.8.8.8", "reachable": true, "latency_ms": 12.4, "packet_loss": 0 }
      ]
    },

    "performance": {
      "avg_latency_ms":      14.2,
      "min_latency_ms":      11.1,
      "max_latency_ms":      18.6,
      "jitter_ms":           2.4,
      "packet_loss_percent": 0.0
    },

    "interfaces": [
      {
        "name":        "Wi-Fi",
        "is_up":       true,
        "speed_mbps":  286,
        "ipv4":        [{ "address": "10.0.0.180", "netmask": "255.255.255.0" }],
        "gateway":     "10.0.0.1"
      }
    ],

    "traffic": {
      "bytes_sent":    12345678,
      "bytes_recv":    87654321,
      "packets_sent":  12345,
      "packets_recv":  54321,
      "errors_in":     0,
      "errors_out":    0,
      "drops_in":      0,
      "drops_out":     0
    }
  }

MONGODB COLLECTION:  network_metrics
  - Index: { computer_id: 1, timestamp: -1 }
  - Retention: keep 30 days (network data is high-volume)
  - No upsert — append each cycle for trend analysis

QUALITY SCORE THRESHOLDS (for frontend alerting):
  90-100  Excellent  (green)
  70-89   Good       (green/yellow)
  50-69   Degraded   (yellow)
  1-49    Poor       (orange)
  0       Offline    (red)
════════════════════════════════════════════════════════════════════════════════
"""

import re
import socket
import statistics
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil

from monitors.base_monitor import BaseMonitor
from core.config import NetworkMonitorConfig


# ---------------------------------------------------------------------------
# Virtual / irrelevant adapter name fragments to exclude from interface list.
# These are not real physical adapters and pollute primary IP detection.
# ---------------------------------------------------------------------------
_VIRTUAL_ADAPTER_FRAGMENTS = (
    'loopback', 'pseudo', 'parsec', 'virtualbox', 'vmware',
    'vethernet', 'hyper-v', 'wsl', 'teredo', 'isatap',
    'miniport', 'wan miniport', 'tap-windows', 'tunnelbear',
    'local area connection*',   # Windows auto-generated virtual NICs
)


class NetworkMonitor(BaseMonitor):
    """
    Monitor live network health, performance, and configuration.

    Each cycle collects:
      - Ping latency / packet loss / jitter to configured targets
      - Gateway reachability and latency
      - DNS resolution latency
      - Active interface IP addresses and connection status
      - Traffic counters (bytes/packets sent & received)
      - Overall quality score (0–100)

    Does NOT collect: MAC addresses, adapter descriptions, driver info.
    Those are static hardware attributes owned by specs_monitor.
    """

    def __init__(self, config: NetworkMonitorConfig = None):
        config = config or NetworkMonitorConfig()
        super().__init__("network_monitor", config)
        self.running        = False
        self.monitor_thread = None
        self.ping_targets   = getattr(config, 'PING_TARGETS', ['8.8.8.8', '1.1.1.1', '8.8.4.4'])

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
        self.logger.info(f"Network Monitor started ({self.interval}s interval)")

    def stop(self):
        self.running = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        self.logger.info("Network Monitor stopped")

    def _monitor_loop(self):
        consecutive_errors     = 0
        max_consecutive_errors = 5

        while self.running:
            try:
                start_time = time.time()
                data       = self.run_monitor(run_now=True)
                self.last_collection_duration = (time.time() - start_time) * 1000
                self.store_monitor_data(data)
                consecutive_errors = 0
                self._sleep_with_jitter(self.interval)

            except Exception as e:
                consecutive_errors += 1
                self.logger.error(f"Network monitoring error: {e}")
                self.last_errors.append(str(e))
                if consecutive_errors >= max_consecutive_errors:
                    self.logger.error("Too many consecutive errors, stopping")
                    self.running = False
                    break
                time.sleep(min(self.interval, 2 ** consecutive_errors))

    # =========================================================================
    # Main collection
    # =========================================================================

    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)

        # Collect building blocks independently so one failure doesn't
        # prevent the rest from running
        connectivity = self._test_connectivity()
        performance  = self._test_performance()
        interfaces   = self._get_interfaces()
        traffic      = self._get_traffic_stats()
        gateway      = self._get_default_gateway()
        dns_servers  = self._get_dns_servers()
        primary_ip   = self._get_primary_ip(interfaces, gateway)
        quality      = self._calculate_quality_score(connectivity, performance)

        return {
            'timestamp':     now,
            'primary_ip':    primary_ip,
            'gateway':       gateway,
            'dns_servers':   dns_servers,
            'quality_score': quality,
            'online':        connectivity.get('internet_accessible', False),
            'connectivity':  connectivity,
            'performance':   performance,
            'interfaces':    interfaces,
            'traffic':       traffic,
        }

    # =========================================================================
    # Connectivity tests
    # =========================================================================

    def _test_connectivity(self) -> Dict[str, Any]:
        """
        Test internet reachability, gateway ping, and DNS resolution.
        Runs ping targets in parallel threads to avoid serial timeout waits.
        """
        results: Dict[str, Any] = {
            'internet_accessible': False,
            'gateway_reachable':   False,
            'dns_working':         False,
            'gateway_latency_ms':  None,
            'dns_latency_ms':      None,
            'targets':             [],
        }

        # ── Ping targets in parallel ──────────────────────────────────────────
        ping_results: List[Optional[Dict]] = [None] * len(self.ping_targets)

        def _ping_worker(idx: int, host: str):
            ping_results[idx] = self._ping_host(host)

        threads = [
            threading.Thread(target=_ping_worker, args=(i, h), daemon=True)
            for i, h in enumerate(self.ping_targets)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        for host, result in zip(self.ping_targets, ping_results):
            r = result or {'success': False, 'latency_ms': None, 'packet_loss': 100}
            results['targets'].append({
                'host':        host,
                'reachable':   r['success'],
                'latency_ms':  r.get('latency_ms'),
                'packet_loss': r.get('packet_loss', 100),
            })
            if r['success']:
                results['internet_accessible'] = True

        # ── Gateway ───────────────────────────────────────────────────────────
        gateway = self._get_default_gateway()
        if gateway:
            gw_ping = self._ping_host(gateway)
            results['gateway_reachable']  = gw_ping['success']
            results['gateway_latency_ms'] = gw_ping.get('latency_ms')

        # ── DNS ───────────────────────────────────────────────────────────────
        dns = self._test_dns('google.com')
        results['dns_working']    = dns['success']
        results['dns_latency_ms'] = dns.get('latency_ms')

        return results

    # =========================================================================
    # Performance metrics (latency / jitter / packet loss)
    # =========================================================================

    def _test_performance(self) -> Dict[str, Any]:
        """
        Collect latency statistics against the first two ping targets.
        3 pings per target → 6 samples total for jitter calculation.
        """
        perf: Dict[str, Any] = {
            'avg_latency_ms':      None,
            'min_latency_ms':      None,
            'max_latency_ms':      None,
            'jitter_ms':           None,
            'packet_loss_percent': 0.0,
        }

        latencies    = []
        total_pings  = 0
        failed_pings = 0

        for target in self.ping_targets[:2]:
            for _ in range(3):
                total_pings += 1
                result = self._ping_host(target, count=1)
                if result['success'] and result.get('latency_ms') is not None:
                    latencies.append(result['latency_ms'])
                else:
                    failed_pings += 1

        if latencies:
            perf['avg_latency_ms'] = round(statistics.mean(latencies), 2)
            perf['min_latency_ms'] = round(min(latencies), 2)
            perf['max_latency_ms'] = round(max(latencies), 2)
            if len(latencies) > 1:
                perf['jitter_ms'] = round(statistics.stdev(latencies), 2)

        if total_pings > 0:
            perf['packet_loss_percent'] = round(
                (failed_pings / total_pings) * 100, 1
            )

        return perf

    # =========================================================================
    # Network interfaces (runtime state only — no MAC/hardware info)
    # =========================================================================

    def _get_interfaces(self) -> List[Dict[str, Any]]:
        """
        Get current runtime state of network interfaces:
          - Is it up?
          - What IP does it currently have?
          - Current link speed (may differ from hardware max on wireless)
          - Which interfaces have the default gateway on their subnet?

        Deliberately excludes MAC addresses and adapter descriptions —
        those are static hardware attributes that belong in specs_monitor.

        Filters out virtual adapters (TAP, Hyper-V, Parsec, etc.) to keep
        the list meaningful for a sysadmin.
        """
        interfaces = []
        gateway    = self._get_default_gateway()

        try:
            stats = psutil.net_if_stats()
            addrs = psutil.net_if_addrs()

            for name, addr_list in addrs.items():
                # Filter virtual adapters
                name_lower = name.lower()
                if any(frag in name_lower for frag in _VIRTUAL_ADAPTER_FRAGMENTS):
                    continue

                ipv4 = []
                ipv6 = []

                for addr in addr_list:
                    if addr.family == socket.AF_INET:
                        if not addr.address.startswith('127.'):
                            entry: Dict[str, Any] = {
                                'address': addr.address,
                                'netmask': addr.netmask,
                            }
                            if self._is_apipa(addr.address):
                                entry['apipa'] = True   # flag DHCP failure
                            ipv4.append(entry)
                    elif addr.family == socket.AF_INET6:
                        # Skip link-local — not actionable for monitoring
                        if not addr.address.lower().startswith('fe80'):
                            ipv6.append({'address': addr.address.split('%')[0]})

                # Skip interfaces with no usable addresses
                if not ipv4 and not ipv6:
                    continue

                iface: Dict[str, Any] = {
                    'name': name,
                    'ipv4': ipv4,
                    'ipv6': ipv6,
                }

                if name in stats:
                    s = iface_stats = stats[name]
                    iface['is_up']      = s.isup
                    iface['speed_mbps'] = s.speed if s.speed > 0 else None
                    iface['mtu']        = s.mtu

                # Flag which interface has the gateway on its subnet
                if gateway and ipv4:
                    iface['has_gateway'] = any(
                        self._same_subnet(addr['address'], gateway, addr.get('netmask', ''))
                        for addr in ipv4
                    )
                    if iface.get('has_gateway'):
                        iface['gateway'] = gateway

                interfaces.append(iface)

        except Exception as e:
            self.logger.error(f"Interface enumeration error: {e}")

        # Sort: UP interfaces first, then by whether they have a gateway
        interfaces.sort(
            key=lambda x: (not x.get('is_up', False), not x.get('has_gateway', False))
        )

        return interfaces

    # =========================================================================
    # Traffic statistics
    # =========================================================================

    def _get_traffic_stats(self) -> Dict[str, Any]:
        """
        System-wide cumulative network I/O counters since boot.
        The backend should store these as snapshots and compute deltas
        between cycles to get per-interval throughput.
        """
        traffic: Dict[str, Any] = {}
        try:
            c = psutil.net_io_counters()
            traffic = {
                'bytes_sent':    c.bytes_sent,
                'bytes_recv':    c.bytes_recv,
                'packets_sent':  c.packets_sent,
                'packets_recv':  c.packets_recv,
                'errors_in':     c.errin,
                'errors_out':    c.errout,
                'drops_in':      c.dropin,
                'drops_out':     c.dropout,
            }
        except Exception as e:
            self.logger.error(f"Traffic stats error: {e}")
        return traffic

    # =========================================================================
    # Quality score
    # =========================================================================

    def _calculate_quality_score(
        self,
        connectivity: Dict[str, Any],
        performance:  Dict[str, Any],
    ) -> int:
        """
        Score overall network quality 0–100.

        Deductions:
          -50  No internet access
          -20  Gateway unreachable
          -15  DNS broken
          -20  Packet loss > 5%   / -10 if > 2%
          -15  Avg latency > 200ms / -10 if > 100ms
          -5   Jitter > 20ms       / -2  if > 10ms

        Score of 0 means completely offline.
        """
        if not connectivity.get('internet_accessible', False):
            return 0

        score = 100

        if not connectivity.get('gateway_reachable', False):
            score -= 20
        if not connectivity.get('dns_working', False):
            score -= 15

        loss = performance.get('packet_loss_percent', 0) or 0
        if loss > 5:
            score -= 20
        elif loss > 2:
            score -= 10

        latency = performance.get('avg_latency_ms') or 0
        if latency > 200:
            score -= 15
        elif latency > 100:
            score -= 10

        jitter = performance.get('jitter_ms') or 0
        if jitter > 20:
            score -= 5
        elif jitter > 10:
            score -= 2

        return max(0, min(100, score))

    # =========================================================================
    # Helpers: ping / DNS / gateway / DNS servers
    # =========================================================================

    def _ping_host(self, host: str, count: int = 1, timeout_sec: int = 2) -> Dict[str, Any]:
        """
        Ping a host using the OS ping command.
        Returns success, latency_ms, and packet_loss.

        Uses CREATE_NO_WINDOW on Windows to suppress console flicker.
        """
        result = {'success': False, 'latency_ms': None, 'packet_loss': 100}

        try:
            # Windows: -n count -w timeout_ms
            # Linux/mac: -c count -W timeout_sec
            import platform as _platform
            is_win = _platform.system().lower() == 'windows'
            cmd = (
                ['ping', '-n', str(count), '-w', str(timeout_sec * 1000), host]
                if is_win else
                ['ping', '-c', str(count), '-W', str(timeout_sec), host]
            )

            kwargs: Dict[str, Any] = dict(
                capture_output=True, text=True, timeout=timeout_sec + 3
            )
            if is_win:
                kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW

            proc = subprocess.run(cmd, **kwargs)

            if proc.returncode == 0:
                result['success']      = True
                result['packet_loss']  = 0

                # Parse latency — handles both "time=14ms" and "time<1ms" formats
                m = re.search(r'[Tt]ime[<=](\d+\.?\d*)\s*ms', proc.stdout)
                if m:
                    result['latency_ms'] = float(m.group(1))
                else:
                    # Fallback: Average line on Windows "Average = 14ms"
                    m2 = re.search(r'[Aa]verage\s*=\s*(\d+)\s*ms', proc.stdout)
                    if m2:
                        result['latency_ms'] = float(m2.group(1))

        except subprocess.TimeoutExpired:
            self.logger.debug(f"Ping timeout: {host}")
        except Exception as e:
            self.logger.debug(f"Ping error ({host}): {e}")

        return result

    def _test_dns(self, hostname: str) -> Dict[str, Any]:
        """Test DNS resolution and measure latency."""
        result: Dict[str, Any] = {
            'success': False, 'latency_ms': None, 'resolved_ip': None
        }
        try:
            t0       = time.monotonic()
            resolved = socket.gethostbyname(hostname)
            latency  = (time.monotonic() - t0) * 1000
            result.update(success=True, latency_ms=round(latency, 2), resolved_ip=resolved)
        except Exception as e:
            self.logger.debug(f"DNS resolution failed ({hostname}): {e}")
        return result

    def _get_default_gateway(self) -> Optional[str]:
        """
        Get default gateway IP.
        Uses PowerShell Get-NetRoute on Windows (replaces ipconfig parsing
        which is locale-dependent and fragile).
        """
        try:
            import platform as _platform
            if _platform.system().lower() == 'windows':
                out = subprocess.run(
                    ['powershell', '-NonInteractive', '-NoProfile', '-Command',
                     '(Get-NetRoute -DestinationPrefix "0.0.0.0/0" '
                     '| Sort-Object RouteMetric '
                     '| Select-Object -First 1).NextHop'],
                    capture_output=True, text=True, timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                gw = out.stdout.strip()
                if gw and not gw.startswith('::') and gw != '0.0.0.0':
                    return gw
            else:
                out = subprocess.check_output(
                    ['ip', 'route'], text=True, timeout=5
                )
                for line in out.splitlines():
                    if line.startswith('default'):
                        parts = line.split()
                        if len(parts) > 2:
                            return parts[2]
        except Exception as e:
            self.logger.debug(f"Default gateway lookup failed: {e}")
        return None

    def _get_dns_servers(self) -> List[str]:
        """
        Get configured DNS servers.
        Uses PowerShell Get-DnsClientServerAddress on Windows (replaces
        locale-sensitive ipconfig /all parsing).
        """
        servers: List[str] = []
        try:
            import platform as _platform
            if _platform.system().lower() == 'windows':
                out = subprocess.run(
                    ['powershell', '-NonInteractive', '-NoProfile', '-Command',
                     'Get-DnsClientServerAddress -AddressFamily IPv4 '
                     '| Where-Object { $_.ServerAddresses } '
                     '| Select-Object -ExpandProperty ServerAddresses '
                     '| Sort-Object -Unique'],
                    capture_output=True, text=True, timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                for line in out.stdout.splitlines():
                    ip = line.strip()
                    if ip and not ip.startswith('127.') and not ip.startswith('169.254.'):
                        servers.append(ip)
            else:
                with open('/etc/resolv.conf') as f:
                    for line in f:
                        if line.startswith('nameserver'):
                            parts = line.split()
                            if len(parts) > 1:
                                servers.append(parts[1])
        except Exception as e:
            self.logger.debug(f"DNS server lookup failed: {e}")
        return servers

    def _get_primary_ip(
        self,
        interfaces: List[Dict[str, Any]],
        gateway: Optional[str],
    ) -> Optional[str]:
        """
        Return the IP address of the best interface — the one most likely
        used for outbound traffic.

        Priority:
          1. Interface that has the gateway on its subnet (definitive)
          2. UP interface with a non-APIPA address
          3. Any interface with a non-APIPA address
        """
        # Prefer interface with confirmed gateway on subnet
        for iface in interfaces:
            if iface.get('has_gateway') and iface.get('ipv4'):
                ip = iface['ipv4'][0]['address']
                if not self._is_apipa(ip):
                    return ip

        # Next: UP, non-APIPA
        for iface in interfaces:
            if iface.get('is_up') and iface.get('ipv4'):
                for entry in iface['ipv4']:
                    if not self._is_apipa(entry['address']):
                        return entry['address']

        # Last resort: any non-APIPA
        for iface in interfaces:
            for entry in iface.get('ipv4', []):
                if not self._is_apipa(entry['address']):
                    return entry['address']

        return None

    @staticmethod
    def _is_apipa(ip: str) -> bool:
        """Return True if IP is an APIPA self-assigned address (169.254.x.x)."""
        return ip.startswith('169.254.')

    @staticmethod
    def _same_subnet(ip: str, gateway: str, netmask: str) -> bool:
        """
        Simple subnet membership check without importing ipaddress module.
        Returns True if ip and gateway are on the same /24 or masked subnet.
        """
        try:
            # Fast path: same first 3 octets (covers /24 and wider)
            ip_parts  = ip.split('.')
            gw_parts  = gateway.split('.')
            if len(ip_parts) != 4 or len(gw_parts) != 4:
                return False
            if ip_parts[:3] == gw_parts[:3]:
                return True
            # Slower path: apply netmask
            if netmask:
                mask_parts = netmask.split('.')
                if len(mask_parts) == 4:
                    ip_masked = [int(a) & int(m) for a, m in zip(ip_parts, mask_parts)]
                    gw_masked = [int(a) & int(m) for a, m in zip(gw_parts, mask_parts)]
                    return ip_masked == gw_masked
        except Exception:
            pass
        return False

    def update_config(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Config updated: {key} = {value}")
        if 'PING_TARGETS' in kwargs:
            self.ping_targets = kwargs['PING_TARGETS']
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

    try:
        from core.config import NetworkMonitorConfig
        config = NetworkMonitorConfig()
    except ImportError:
        config = None

    monitor = NetworkMonitor(config)
    print("\n=== Running Network Monitor ===\n")
    data = monitor.run_monitor(run_now=True)

    W = 65

    # ── Status ────────────────────────────────────────────────────────────────
    online  = '✓ ONLINE' if data.get('online') else '✗ OFFLINE'
    quality = data.get('quality_score', 0)
    grade   = ('Excellent' if quality >= 90 else
               'Good'      if quality >= 70 else
               'Degraded'  if quality >= 50 else
               'Poor'      if quality > 0  else 'Offline')

    print(f"{'='*W}")
    print(f"  STATUS: {online}   Quality: {quality}/100  ({grade})")
    print(f"{'='*W}")
    print(f"  Primary IP : {data.get('primary_ip', 'Unknown')}")
    print(f"  Gateway    : {data.get('gateway', 'Unknown')}")
    dns = ', '.join(data.get('dns_servers', [])) or 'Unknown'
    print(f"  DNS        : {dns}")

    # ── Connectivity ──────────────────────────────────────────────────────────
    conn = data.get('connectivity', {})
    print(f"\n{'='*W}")
    print(f"  CONNECTIVITY")
    print(f"{'='*W}")
    print(f"  Internet  : {'✓' if conn.get('internet_accessible') else '✗'}")
    gw_ms = f"  {conn.get('gateway_latency_ms','?')}ms" if conn.get('gateway_reachable') else ' ✗'
    print(f"  Gateway   : {'✓' if conn.get('gateway_reachable') else '✗'}{gw_ms}")
    dns_ms = f"  {conn.get('dns_latency_ms','?')}ms" if conn.get('dns_working') else ' ✗'
    print(f"  DNS       : {'✓' if conn.get('dns_working') else '✗'}{dns_ms}")
    print(f"\n  {'Host':<16} {'Status':<10} {'Latency':>10} {'Loss':>8}")
    print(f"  {'-'*16} {'-'*10} {'-'*10} {'-'*8}")
    for t in conn.get('targets', []):
        status = '✓ reachable' if t['reachable'] else '✗ timeout'
        lat    = f"{t['latency_ms']}ms" if t.get('latency_ms') is not None else '-'
        loss   = f"{t['packet_loss']}%"
        print(f"  {t['host']:<16} {status:<10} {lat:>10} {loss:>8}")

    # ── Performance ───────────────────────────────────────────────────────────
    perf = data.get('performance', {})
    print(f"\n{'='*W}")
    print(f"  PERFORMANCE")
    print(f"{'='*W}")
    print(f"  Avg latency  : {perf.get('avg_latency_ms', 'N/A')} ms")
    print(f"  Min / Max    : {perf.get('min_latency_ms', 'N/A')} / {perf.get('max_latency_ms', 'N/A')} ms")
    print(f"  Jitter       : {perf.get('jitter_ms', 'N/A')} ms")
    print(f"  Packet loss  : {perf.get('packet_loss_percent', 0)}%")

    # ── Interfaces ────────────────────────────────────────────────────────────
    ifaces = data.get('interfaces', [])
    print(f"\n{'='*W}")
    print(f"  ACTIVE INTERFACES ({len(ifaces)} shown)")
    print(f"{'='*W}")
    for iface in ifaces:
        status = 'UP  ' if iface.get('is_up') else 'DOWN'
        speed  = f"  {iface['speed_mbps']} Mbps" if iface.get('speed_mbps') else ''
        gw_tag = '  [gateway]' if iface.get('has_gateway') else ''
        print(f"  {iface['name']:<35} [{status}]{speed}{gw_tag}")
        for ip in iface.get('ipv4', []):
            apipa_tag = ' (APIPA — DHCP failed)' if ip.get('apipa') else ''
            print(f"    IPv4: {ip['address']}/{ip.get('netmask','?')}{apipa_tag}")

    # ── Traffic ───────────────────────────────────────────────────────────────
    traf = data.get('traffic', {})
    print(f"\n{'='*W}")
    print(f"  TRAFFIC  (cumulative since boot)")
    print(f"{'='*W}")

    def _fmt_bytes(b: int) -> str:
        for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
            if b < 1024:
                return f"{b:.1f} {unit}"
            b /= 1024
        return f"{b:.1f} PB"

    print(f"  Sent     : {_fmt_bytes(traf.get('bytes_sent', 0))}  "
          f"({traf.get('packets_sent', 0):,} packets)")
    print(f"  Received : {_fmt_bytes(traf.get('bytes_recv', 0))}  "
          f"({traf.get('packets_recv', 0):,} packets)")
    errs = traf.get('errors_in', 0) + traf.get('errors_out', 0)
    drops = traf.get('drops_in', 0) + traf.get('drops_out', 0)
    if errs or drops:
        print(f"  Errors   : {errs}   Drops: {drops}")

    print()
    del monitor
    print("Done!")