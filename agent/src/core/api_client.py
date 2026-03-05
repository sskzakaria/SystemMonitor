"""
api_client.py - Backend API Client for University Computer Monitoring System

Async HTTP client for sending monitor data to the backend with:
- Connection pooling
- Circuit breaker pattern
- Retry logic with exponential backoff
- Rate limiting
- Fallback URLs
- Health checks

Endpoints used by this agent:
  POST /api/v1/data/heartbeat          ← HeartbeatMonitor
  POST /api/v1/data/user-activity      ← UserActivityMonitor
  POST /api/v1/data/event-logs         ← EventLogMonitor
  POST /api/v1/data/security-software  ← SecuritySoftwareMonitor
"""

import asyncio
import logging
import time
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    CLOSED    = "closed"     # Normal operation
    OPEN      = "open"       # Too many failures — requests blocked
    HALF_OPEN = "half_open"  # Testing whether the service has recovered


class CircuitBreaker:
    """
    Prevents the agent from hammering a backend that is down.

    States:
      CLOSED    → requests flow normally
      OPEN      → requests blocked until timeout elapses
      HALF_OPEN → one probe request allowed; success → CLOSED, failure → OPEN
    """

    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout           = timeout
        self.failure_count     = 0
        self.last_failure_time: Optional[float] = None
        self.state             = CircuitState.CLOSED

    def is_available(self) -> bool:
        """Return True if requests are currently allowed."""
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.timeout:
                self.state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker HALF_OPEN — probing service")
                return True
            return False
        return True

    def on_success(self):
        if self.state == CircuitState.HALF_OPEN:
            logger.info("Circuit breaker CLOSED — service recovered")
        self.failure_count = 0
        self.state         = CircuitState.CLOSED

    def on_failure(self):
        self.failure_count    += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold and self.state != CircuitState.OPEN:
            self.state = CircuitState.OPEN
            logger.warning(
                f"Circuit breaker OPEN after {self.failure_count} failures — "
                f"blocking requests for {self.timeout}s"
            )


# ---------------------------------------------------------------------------
# API Client
# ---------------------------------------------------------------------------

class BackendAPIClient:
    """
    Async HTTP client for sending monitor data to the backend.

    Usage:
        async with BackendAPIClient(config) as client:
            await client.send_heartbeat(data)
    """

    def __init__(self, config):
        self.config   = config
        self.base_url = self._get_backend_url(config)

        self.session: Optional[aiohttp.ClientSession] = None
        self.timeout = aiohttp.ClientTimeout(
            total=getattr(config, "BACKEND_TIMEOUT", 30),
            connect=10,
            sock_read=20,
        )

        self.circuit_breaker = CircuitBreaker(
            failure_threshold=getattr(config, "CIRCUIT_BREAKER_THRESHOLD", 5),
            timeout=getattr(config, "CIRCUIT_BREAKER_TIMEOUT", 60),
        )

        self.retry_count = getattr(config, "BACKEND_RETRY_ATTEMPTS", 3)
        self.retry_delay = getattr(config, "BACKEND_RETRY_DELAY", 1.0)

        self.rate_limit_requests  = getattr(config, "RATE_LIMIT_REQUESTS", 100)
        self.rate_limit_window    = getattr(config, "RATE_LIMIT_WINDOW", 60)
        self.request_timestamps: List[float] = []

        # Statistics
        self.total_requests      = 0
        self.successful_requests = 0
        self.failed_requests     = 0

        logger.info(f"API Client initialised: {self.base_url}")

    # ------------------------------------------------------------------
    # Config helpers
    # ------------------------------------------------------------------

    def _get_backend_url(self, config) -> str:
        """Resolve backend URL from config, trying several attribute names."""
        for attr in ["BACKEND_URL", "backend_url", "API_URL", "api_url", "BASE_URL", "base_url"]:
            url = getattr(config, attr, None)
            if url:
                if "0.0.0.0" in url:
                    url = url.replace("0.0.0.0", "localhost")
                return url.rstrip("/")
        logger.warning("No backend URL found in config — using default: http://localhost:8001")
        return "http://localhost:8001"

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(
            ssl=False,
            limit=getattr(self.config, "CONNECTION_POOL_SIZE", 10),
            limit_per_host=getattr(self.config, "CONNECTION_POOL_PER_HOST", 5),
            keepalive_timeout=60,
            enable_cleanup_closed=True,
            ttl_dns_cache=300,
            force_close=False,
        )
        self.session = aiohttp.ClientSession(
            timeout=self.timeout,
            connector=connector,
            headers={
                "Content-Type": "application/json",
                "User-Agent": f'UniversityMonitor/{getattr(self.config, "VERSION", "2.0.0")}',
                "Accept": "application/json",
            },
            trust_env=True,
            raise_for_status=False,
        )
        logger.info("API Client session opened")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
            await asyncio.sleep(0.1)   # Allow connections to drain
        logger.info("API Client session closed")

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    def _check_rate_limit(self) -> bool:
        now = time.time()
        self.request_timestamps = [
            ts for ts in self.request_timestamps if now - ts < self.rate_limit_window
        ]
        if len(self.request_timestamps) >= self.rate_limit_requests:
            logger.warning(
                f"Rate limit exceeded ({len(self.request_timestamps)}"
                f"/{self.rate_limit_requests} requests in {self.rate_limit_window}s)"
            )
            return False
        self.request_timestamps.append(now)
        return True

    # ------------------------------------------------------------------
    # Retry logic
    # ------------------------------------------------------------------

    async def _retry_request(self, func, *args, **kwargs):
        """Execute an async function with exponential-backoff retry."""
        last_exception = None

        for attempt in range(self.retry_count):
            try:
                if not self._check_rate_limit():
                    await asyncio.sleep(self.retry_delay)
                    continue
                return await func(*args, **kwargs)

            except asyncio.TimeoutError as e:
                last_exception = e
                if attempt < self.retry_count - 1:
                    delay = self.retry_delay * (2 ** attempt)
                    logger.warning(f"Timeout (attempt {attempt + 1}/{self.retry_count}), retrying in {delay}s")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"All {self.retry_count} attempts failed (timeout)")

            except aiohttp.ClientError as e:
                last_exception = e
                if attempt < self.retry_count - 1:
                    delay = self.retry_delay * (2 ** attempt)
                    logger.warning(f"Connection error (attempt {attempt + 1}/{self.retry_count}), retrying in {delay}s: {e}")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"All {self.retry_count} attempts failed: {e}")

            except Exception as e:
                last_exception = e
                logger.error(f"Unexpected error on attempt {attempt + 1}/{self.retry_count}: {e}")
                if attempt < self.retry_count - 1:
                    await asyncio.sleep(self.retry_delay * (2 ** attempt))

        raise last_exception

    # ------------------------------------------------------------------
    # Public send methods — one per active monitor
    # ------------------------------------------------------------------

    async def send_heartbeat(self, data: Dict[str, Any]) -> bool:
        """Send HeartbeatMonitor data → POST /api/v1/data/heartbeat"""
        return await self._send_to_endpoint("heartbeat", data)

    async def send_user_activity(self, data: Dict[str, Any]) -> bool:
        """Send UserActivityMonitor data → POST /api/v1/data/user-activity"""
        return await self._send_to_endpoint("user-activity", data)

    async def send_event_logs(self, data: Dict[str, Any]) -> bool:
        """Send EventLogMonitor data → POST /api/v1/data/event-logs"""
        return await self._send_to_endpoint("event-logs", data)

    async def send_security(self, data: Dict[str, Any]) -> bool:
        """Send SecuritySoftwareMonitor data → POST /api/v1/data/security-software"""
        return await self._send_to_endpoint("security-software", data)

    async def send_hardware(self, data: Dict[str, Any]) -> bool:
        """Send HardwareMonitor data → POST /api/v1/data/hardware"""
        return await self._send_to_endpoint("hardware", data)

    async def send_network(self, data: Dict[str, Any]) -> bool:
        """Send NetworkMonitor data → POST /api/v1/data/network"""
        return await self._send_to_endpoint("network", data)

    async def send_applications(self, data: Dict[str, Any]) -> bool:
        """Send ApplicationMonitor data → POST /api/v1/data/application"""
        return await self._send_to_endpoint("application", data)

    async def send_services(self, data: Dict[str, Any]) -> bool:
        """Send ServicesMonitor data → POST /api/v1/data/services"""
        return await self._send_to_endpoint("services", data)

    async def send_specs(self, data: Dict[str, Any]) -> bool:
        """Send SpecsMonitor data → POST /api/v1/data/specs"""
        return await self._send_to_endpoint("specs", data)

    async def send_updates(self, data: Dict[str, Any]) -> bool:
        """Send UpdateMonitor data → POST /api/v1/data/update"""
        return await self._send_to_endpoint("update", data)

    async def send_overview(self, data: Dict[str, Any]) -> bool:
        """Send OverviewMonitor data → POST /api/v1/data/overview"""
        return await self._send_to_endpoint("overview", data)

    async def send_peripherals(self, data: Dict[str, Any]) -> bool:
        """Send PeripheralsMonitor data → POST /api/v1/data/peripherals"""
        return await self._send_to_endpoint("peripherals", data)

    async def send_usb_devices(self, data: Dict[str, Any]) -> bool:
        """Send USBDevicesMonitor data → POST /api/v1/data/usb-devices"""
        return await self._send_to_endpoint("usb-devices", data)

    # ------------------------------------------------------------------
    # Core send logic
    # ------------------------------------------------------------------

    async def _send_to_endpoint(self, endpoint: str, data: Dict[str, Any]) -> bool:
        """
        POST serialised data to /api/v1/data/<endpoint>.
        Tries primary URL then any configured fallback URLs.
        Accepts HTTP 200 and 201 as success.
        """
        self.total_requests += 1

        # Build URL list: primary + fallbacks, deduplicated
        base_urls = [self.base_url]
        fallbacks = getattr(self.config, "BACKEND_FALLBACK_URLS", None)
        if isinstance(fallbacks, str) and fallbacks.strip():
            base_urls.extend(u.strip() for u in fallbacks.split(",") if u.strip())
        elif isinstance(fallbacks, list):
            base_urls.extend(fallbacks)

        seen, unique_urls = set(), []
        for u in base_urls:
            u = u.rstrip("/")
            if u and u not in seen:
                seen.add(u)
                unique_urls.append(u)

        for base_url in unique_urls:
            url = f"{base_url}/api/v1/data/{endpoint}"

            try:
                json_data = self._serialize_for_json(data)

                if not self.session:
                    logger.warning("Session not initialised — creating new session")
                    await self.__aenter__()

                if not self.circuit_breaker.is_available():
                    logger.warning(f"Circuit breaker OPEN — skipping {endpoint}")
                    return False

                async def send_request():
                    async with self.session.post(url, json=json_data) as response:
                        text = await response.text()
                        if response.status in (200, 201):
                            logger.debug(f"✓ {endpoint} sent (HTTP {response.status})")
                            self.successful_requests += 1
                            self.circuit_breaker.on_success()
                            return True
                        else:
                            logger.error(f"✗ {endpoint} failed: HTTP {response.status} — {text}")
                            self.failed_requests += 1
                            self.circuit_breaker.on_failure()
                            return False

                result = await self._retry_request(send_request)
                if result:
                    return True

            except Exception as e:
                logger.error(f"Error sending {endpoint} to {url}: {e}")
                self.failed_requests += 1
                self.circuit_breaker.on_failure()
                continue  # Try next URL

        logger.error(f"Failed to send {endpoint} to all configured URLs")
        return False

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def check_backend_health(self) -> Dict[str, Any]:
        """GET /health — returns status dict."""
        try:
            if not self.session:
                await self.__aenter__()

            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    health = await response.json()
                    logger.info(f"Backend health: {health.get('status', 'unknown')}")
                    return health
                text = await response.text()
                logger.warning(f"Health check failed: HTTP {response.status} — {text}")
                return {"status": "unhealthy", "error": f"HTTP {response.status}", "details": text}

        except aiohttp.ClientError as e:
            logger.error(f"Health check connection error: {e}")
            return {"status": "unreachable", "error": "Connection failed", "details": str(e)}
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return {"status": "unreachable", "error": str(e)}

    async def test_connection(self) -> bool:
        """Return True if the backend is reachable and healthy."""
        try:
            health = await self.check_backend_health()
            return health.get("status") == "healthy"
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def _serialize_for_json(self, data: Any) -> Any:
        """Recursively convert non-JSON-serialisable types (datetime, bytes, set)."""
        if isinstance(data, datetime):
            return data.isoformat()
        if isinstance(data, dict):
            return {k: self._serialize_for_json(v) for k, v in data.items()}
        if isinstance(data, (list, tuple)):
            return [self._serialize_for_json(i) for i in data]
        if isinstance(data, set):
            return [self._serialize_for_json(i) for i in data]
        if isinstance(data, bytes):
            return data.decode("utf-8", errors="ignore")
        return data

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------

    def get_statistics(self) -> Dict[str, Any]:
        rate = (self.successful_requests / self.total_requests * 100) if self.total_requests else 0
        return {
            "total_requests":          self.total_requests,
            "successful_requests":     self.successful_requests,
            "failed_requests":         self.failed_requests,
            "success_rate":            round(rate, 2),
            "circuit_breaker_state":   self.circuit_breaker.state.value,
            "circuit_breaker_failures": self.circuit_breaker.failure_count,
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_api_client(config) -> BackendAPIClient:
    return BackendAPIClient(config)


__all__ = ["BackendAPIClient", "create_api_client", "CircuitBreaker", "CircuitState"]


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    class TestConfig:
        BACKEND_URL            = "http://localhost:8001"
        BACKEND_TIMEOUT        = 30
        BACKEND_RETRY_ATTEMPTS = 3
        VERSION                = "2.0.0"

    async def test_api_client():
        config = TestConfig()

        async with create_api_client(config) as client:
            print("\n=== Backend Health ===")
            health = await client.check_backend_health()
            print(f"  {health}")

            connected = await client.test_connection()
            print(f"\n=== Connection: {'✓ reachable' if connected else '✗ unreachable'} ===")

            if connected:
                # Test each active monitor endpoint
                print("\n=== Sending test data ===")

                ok = await client.send_heartbeat({
                    "machine_id": "TEST-001",
                    "status": "online",
                    "has_active_user": True,
                    "user_count": 1,
                    "resources": {"cpu_usage_percent": 45.0, "memory_usage_percent": 62.0},
                })
                print(f"  send_heartbeat     : {'✓' if ok else '✗'}")

                ok = await client.send_user_activity({
                    "machine_id": "TEST-001",
                    "active_user": "test.user",
                    "active_sessions": [],
                    "user_summary": {"has_active_users": True, "current_user": "test.user"},
                })
                print(f"  send_user_activity : {'✓' if ok else '✗'}")

                ok = await client.send_event_logs({
                    "machine_id": "TEST-001",
                    "system_events": [],
                    "security_events": [],
                    "application_events": [],
                    "critical_events": [],
                    "summary": {},
                })
                print(f"  send_event_logs    : {'✓' if ok else '✗'}")

                ok = await client.send_security({
                    "machine_id": "TEST-001",
                    "antivirus": [],
                    "firewall": [],
                    "windows_defender": {},
                    "security_summary": {"overall_status": "secure"},
                })
                print(f"  send_security      : {'✓' if ok else '✗'}")

                print("\n=== Statistics ===")
                for k, v in client.get_statistics().items():
                    print(f"  {k}: {v}")

    try:
        asyncio.run(test_api_client())
        print("\n✓ Test complete")
    except KeyboardInterrupt:
        print("\nInterrupted")
    except Exception as e:
        import traceback
        print(f"\n✗ Test failed: {e}")
        traceback.print_exc()