"""
Rate limiting middleware for API protection
"""
from fastapi import Request, HTTPException, status
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Simple in-memory rate limiter
    For production, use Redis-based rate limiting
    """
    
    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000
    ):
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        
        # Store: {identifier: [(timestamp, count), ...]}
        self._minute_buckets: Dict[str, list] = defaultdict(list)
        self._hour_buckets: Dict[str, list] = defaultdict(list)
    
    def _cleanup_old_entries(self, buckets: dict, max_age_seconds: int):
        """Remove entries older than max_age_seconds"""
        now = datetime.now()
        cutoff = now - timedelta(seconds=max_age_seconds)
        
        for key in list(buckets.keys()):
            buckets[key] = [
                (ts, count) for ts, count in buckets[key]
                if ts > cutoff
            ]
            if not buckets[key]:
                del buckets[key]
    
    def check_rate_limit(self, identifier: str) -> Tuple[bool, str]:
        """
        Check if request is within rate limits
        Returns: (allowed: bool, reason: str)
        """
        now = datetime.now()
        
        # Cleanup old entries
        self._cleanup_old_entries(self._minute_buckets, 60)
        self._cleanup_old_entries(self._hour_buckets, 3600)
        
        # Check minute limit
        minute_requests = sum(
            count for ts, count in self._minute_buckets[identifier]
        )
        if minute_requests >= self.requests_per_minute:
            return False, f"Rate limit exceeded: {self.requests_per_minute} requests/minute"
        
        # Check hour limit
        hour_requests = sum(
            count for ts, count in self._hour_buckets[identifier]
        )
        if hour_requests >= self.requests_per_hour:
            return False, f"Rate limit exceeded: {self.requests_per_hour} requests/hour"
        
        # Record request
        self._minute_buckets[identifier].append((now, 1))
        self._hour_buckets[identifier].append((now, 1))
        
        return True, "OK"
    
    def get_stats(self) -> dict:
        """Get rate limiting statistics"""
        return {
            "active_clients": len(self._minute_buckets),
            "requests_last_minute": sum(
                sum(count for ts, count in requests)
                for requests in self._minute_buckets.values()
            ),
            "requests_last_hour": sum(
                sum(count for ts, count in requests)
                for requests in self._hour_buckets.values()
            )
        }


# Global rate limiter instance
rate_limiter = RateLimiter(
    requests_per_minute=120,  # 2 requests/second per machine
    requests_per_hour=7200    # Average of 2 requests/second
)


async def rate_limit_middleware(request: Request, call_next):
    """
    Rate limiting middleware
    Apply to specific endpoints or globally
    """
    # Skip rate limiting for health checks
    if request.url.path in ["/health", "/api/health"]:
        return await call_next(request)
    
    # Get identifier (IP address or machine_id from header)
    identifier = request.headers.get("X-Machine-ID") or request.client.host
    
    # Check rate limit
    allowed, reason = rate_limiter.check_rate_limit(identifier)
    
    if not allowed:
        logger.warning(f"Rate limit exceeded for {identifier}: {reason}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=reason,
            headers={"Retry-After": "60"}
        )
    
    # Continue with request
    response = await call_next(request)
    
    # Add rate limit headers
    stats = rate_limiter.get_stats()
    response.headers["X-RateLimit-Limit"] = str(rate_limiter.requests_per_minute)
    response.headers["X-RateLimit-Remaining"] = str(
        rate_limiter.requests_per_minute - stats["requests_last_minute"]
    )
    
    return response
