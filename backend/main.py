"""
University Computer Monitoring System - Backend Server
Main FastAPI application entry point

Features:
- 16 routers with 122+ API endpoints
- Real-time WebSocket updates
- MongoDB + InfluxDB support
- Compression middleware
- Request logging with timing
- Enhanced error handling
- Health checks with diagnostics
"""

import logging
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# Import database manager and startup/shutdown handlers
from database import startup_db, shutdown_db, db_manager
from config import Config

# Import all routers
from routers import (
    machines,
    events,
    ingestion_optimized,
    websocket,
    analytics,
    analytics_extended,  # ✅ Extended analytics endpoints
    stats,
    tags,
    sessions,
    notes,
    monitoring,
    maintenance,
    health,
    groups,
    timeline,
    alerts,
    admin,
    usb,
    config,  # ✅ Configuration management router
    export   # ✅ Export endpoints for CSV/JSON reports
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Constants
API_VERSION = "4.0.0"
TOTAL_ROUTERS = 19  # Updated to include Export and Analytics Extended routers
TOTAL_ENDPOINTS = 134  # Updated to include Export + Analytics Extended endpoints


# =============================================================================
# CUSTOM MIDDLEWARE
# =============================================================================

class RequestLoggingMiddleware:
    """Log all requests with timing and status"""
    
    def __init__(self, app):
        self.app = app
        self.slow_requests = []
        self.max_slow_requests = 50
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        request = Request(scope, receive)
        start_time = time.time()
        
        # Skip health checks from logging
        if request.url.path in ["/health", "/api/health", "/api/v1/data/health"]:
            await self.app(scope, receive, send)
            return
        
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                process_time = (time.time() - start_time) * 1000  # ms
                
                # Add timing header
                headers = list(message.get("headers", []))
                headers.append((b"x-process-time", f"{process_time:.2f}ms".encode()))
                message["headers"] = headers
                
                # Log request
                status_code = message["status"]
                method = request.method
                path = request.url.path
                
                # Color code by status
                if status_code < 300:
                    emoji = "✅"
                    level = logging.INFO
                elif status_code < 400:
                    emoji = "↪️"
                    level = logging.INFO
                elif status_code < 500:
                    emoji = "⚠️"
                    level = logging.WARNING
                else:
                    emoji = "❌"
                    level = logging.ERROR
                
                logger.log(
                    level,
                    f"{emoji} {method} {path} → {status_code} ({process_time:.2f}ms)"
                )
                
                # Track slow requests (> 1 second)
                if process_time > 1000:
                    self.slow_requests.append({
                        'timestamp': datetime.now(timezone.utc),
                        'method': method,
                        'path': path,
                        'duration_ms': process_time,
                        'status_code': status_code
                    })
                    
                    # Keep only last N slow requests
                    if len(self.slow_requests) > self.max_slow_requests:
                        self.slow_requests.pop(0)
                    
                    logger.warning(
                        f"🐌 SLOW REQUEST: {method} {path} took {process_time:.2f}ms"
                    )
            
            await send(message)
        
        await self.app(scope, receive, send_wrapper)


# =============================================================================
# LIFESPAN CONTEXT MANAGER
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan handler for startup and shutdown events
    """
    # STARTUP
    logger.info("=" * 80)
    logger.info("🚀 UNIVERSITY COMPUTER MONITORING SYSTEM - BACKEND v4.0")
    logger.info("=" * 80)
    logger.info(f"📦 Version: {API_VERSION}")
    logger.info(f"🔌 Routers: {TOTAL_ROUTERS}")
    logger.info(f"🌐 Endpoints: {TOTAL_ENDPOINTS}+")
    logger.info("=" * 80)
    
    try:
        await startup_db()
        logger.info("✅ Database connections initialized")
        
        # Log database status
        if db_manager.is_mongodb_connected:
            logger.info("✅ MongoDB: Connected")
        else:
            logger.error("❌ MongoDB: Disconnected")
        
        if db_manager.is_influxdb_connected:
            logger.info("✅ InfluxDB: Connected")
        else:
            logger.warning("⚠️  InfluxDB: Not configured (optional)")
        
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise
    
    logger.info("=" * 80)
    logger.info("🌐 API Server ready at http://localhost:8001")
    logger.info("📡 WebSocket ready at ws://localhost:8001/ws")
    logger.info("📊 Health check: http://localhost:8001/health")
    logger.info("📚 API Docs: http://localhost:8001/docs")
    logger.info("=" * 80)
    
    yield  # Server is running
    
    # SHUTDOWN
    logger.info("=" * 80)
    logger.info("🛑 Shutting down...")
    await shutdown_db()
    logger.info("✅ Shutdown complete")
    logger.info("=" * 80)


# =============================================================================
# FASTAPI APPLICATION
# =============================================================================

app = FastAPI(
    title="University Computer Monitoring System",
    description="Real-time monitoring and management for 300+ campus computers",
    version=API_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)


# =============================================================================
# MIDDLEWARE (Order matters!)
# =============================================================================

# 1. CORS (first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Compression (after CORS)
app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,  # Only compress > 1KB
    compresslevel=6     # Balance speed/compression
)

# 3. Request logging (after compression)
app.add_middleware(RequestLoggingMiddleware)


# =============================================================================
# ROUTERS
# =============================================================================

# Data ingestion
app.include_router(ingestion_optimized.router)

# Core machine management
app.include_router(machines.router)
app.include_router(monitoring.router)

# Events and alerts
app.include_router(events.router)
app.include_router(timeline.router)
app.include_router(alerts.router)

# Analytics and statistics
app.include_router(analytics.router)
app.include_router(analytics_extended.router)  # ✅ Extended analytics endpoints
app.include_router(stats.router)

# Organization and metadata
app.include_router(tags.router)
app.include_router(groups.router)
app.include_router(notes.router)

# User sessions
app.include_router(sessions.router)

# Maintenance and operations
app.include_router(maintenance.router)
app.include_router(health.router)

# USB monitoring
app.include_router(usb.router)

# Admin operations
app.include_router(admin.router)

# Configuration management
app.include_router(config.router)

# ✅ Export functionality (CSV/JSON downloads)
app.include_router(export.router)

# Real-time WebSocket
app.include_router(websocket.router)

logger.info(f"✅ {TOTAL_ROUTERS} routers registered with {TOTAL_ENDPOINTS}+ endpoints")


# =============================================================================
# ROOT ENDPOINTS
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "service": "University Computer Monitoring System",
        "version": API_VERSION,
        "status": "operational",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "routers": TOTAL_ROUTERS,
        "endpoints": f"{TOTAL_ENDPOINTS}+",
        "features": {
            "real_time_monitoring": True,
            "websocket_updates": True,
            "bulk_operations": True,
            "analytics": True,
            "alerts": True,
            "maintenance_tracking": True,
            "compression": True,
            "request_logging": True
        },
        "databases": {
            "mongodb": db_manager.is_mongodb_connected if hasattr(db_manager, 'is_mongodb_connected') else False,
            "influxdb": db_manager.is_influxdb_connected if hasattr(db_manager, 'is_influxdb_connected') else False
        },
        "api_docs": {
            "swagger": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json"
        },
        "key_endpoints": {
            "health": "/health",
            "machines": "/api/v1/machines",
            "events": "/api/v1/events",
            "alerts": "/api/v1/alerts",
            "analytics": "/api/v1/analytics/overview",
            "websocket": "/ws"
        }
    }


@app.get("/health")
async def health_check_simple():
    """Simple health check for load balancers"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/health")
async def health_check_detailed():
    """Detailed health check with diagnostics"""
    try:
        # Check MongoDB
        mongodb_status = "unknown"
        if hasattr(db_manager, 'mongodb_client') and db_manager.mongodb_client:
            try:
                await db_manager.mongodb_client.admin.command('ping')
                mongodb_status = "connected"
            except:
                mongodb_status = "error"
        elif hasattr(db_manager, 'is_mongodb_connected'):
            mongodb_status = "connected" if db_manager.is_mongodb_connected else "disconnected"
        
        # Check InfluxDB
        influxdb_status = "unknown"
        if hasattr(db_manager, 'influxdb_client') and db_manager.influxdb_client:
            try:
                ready = await db_manager.influxdb_client.ready()
                influxdb_status = "connected" if ready else "error"
            except:
                influxdb_status = "error"
        elif hasattr(db_manager, 'is_influxdb_connected'):
            influxdb_status = "connected" if db_manager.is_influxdb_connected else "not configured"
        
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": API_VERSION,
            "uptime": "running",
            "databases": {
                "mongodb": mongodb_status,
                "influxdb": influxdb_status
            },
            "routers": TOTAL_ROUTERS,
            "endpoints": f"{TOTAL_ENDPOINTS}+",
            "features": {
                "compression": "enabled",
                "request_logging": "enabled",
                "websocket": "enabled",
                "analytics": "enabled"
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )


# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": f"The endpoint {request.url.path} does not exist",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "available_docs": "/docs"
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    """Custom 500 handler"""
    logger.error(f"Internal error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


# =============================================================================
# RUN SERVER
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    reload = os.getenv("RELOAD", "true").lower() == "true"
    
    logger.info("=" * 80)
    logger.info("🚀 Starting server...")
    logger.info(f"📍 Host: {host}")
    logger.info(f"🔌 Port: {port}")
    logger.info(f"🔄 Reload: {reload}")
    logger.info("=" * 80)
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )