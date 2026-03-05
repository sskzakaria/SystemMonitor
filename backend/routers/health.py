"""
Health check endpoints - Enhanced with detailed status
Provides system health, database connectivity, and statistics
"""
from datetime import datetime, timezone
from fastapi import APIRouter
import logging

from config import Config
from database import db_manager
from utils.collections import (
    HEARTBEAT_LATEST, HARDWARE_LATEST, NETWORK_LATEST,
    USER_ACTIVITY_LATEST, SPECS_LATEST, ALERTS
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Track startup time for uptime calculation
startup_time = datetime.now(timezone.utc)


@router.get("/health")
async def health_check_root():
    """
    Simple health check endpoint (for frontend/load balancer)
    Fast response with minimal checks
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": Config.APP_VERSION,
        "api_version": Config.API_VERSION,
        "service": Config.APP_NAME
    }


@router.get("/api/health")
async def health_check():
    """
    Enhanced health check with service status
    Returns MongoDB and InfluxDB connection status
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": Config.APP_VERSION,
        "api_version": Config.API_VERSION,
        "environment": Config.ENVIRONMENT,
        "services": {
            "mongodb": {
                "connected": db_manager.is_mongodb_connected,
                "status": "up" if db_manager.is_mongodb_connected else "down",
                "database": Config.MONGODB_DB_NAME
            },
            "influxdb": {
                "enabled": Config.INFLUXDB_ENABLED,
                "connected": db_manager.is_influxdb_connected,
                "status": "up" if db_manager.is_influxdb_connected else ("disabled" if not Config.INFLUXDB_ENABLED else "down")
            }
        },
        "retention_policies": {
            "heartbeat_days": Config.RETENTION_HEARTBEAT,
            "hardware_days": Config.RETENTION_HARDWARE,
            "network_days": Config.RETENTION_NETWORK,
            "user_activity_days": Config.RETENTION_USER_ACTIVITY
        },
        "uptime_seconds": int((datetime.now(timezone.utc) - startup_time).total_seconds())
    }
    
    # Overall status (degraded if MongoDB down, but not critical if InfluxDB down)
    if not db_manager.is_mongodb_connected:
        health_status["status"] = "unhealthy"
    elif Config.INFLUXDB_ENABLED and not db_manager.is_influxdb_connected:
        health_status["status"] = "degraded"
    
    return health_status


@router.get("/api/health/detailed")
async def detailed_health_check():
    """
    Detailed health check with statistics
    Includes collection counts and service details
    """
    # Get collection stats from MongoDB
    collections_status = {}
    if db_manager.is_mongodb_connected:
        try:
            collections = [
                HEARTBEAT_LATEST,
                HARDWARE_LATEST,
                NETWORK_LATEST,
                USER_ACTIVITY_LATEST,
                ALERTS
            ]
            
            for coll_name in collections:
                count = await db_manager.mongodb_db[coll_name].count_documents({})
                collections_status[coll_name] = {
                    "documents": count,
                    "status": "ok"
                }
        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            collections_status["error"] = str(e)
    
    return {
        "status": "healthy" if db_manager.is_mongodb_connected else "unhealthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": Config.APP_VERSION,
        "api_version": Config.API_VERSION,
        "environment": Config.ENVIRONMENT,
        "services": {
            "mongodb": {
                "connected": db_manager.is_mongodb_connected,
                "database": Config.MONGODB_DB_NAME,
                "uri": Config.MONGODB_URI.split('@')[1] if '@' in Config.MONGODB_URI else "localhost",  # Hide credentials
                "collections": collections_status
            },
            "influxdb": {
                "enabled": Config.INFLUXDB_ENABLED,
                "connected": db_manager.is_influxdb_connected,
                "url": Config.INFLUXDB_URL if Config.INFLUXDB_ENABLED else None,
                "bucket": Config.INFLUXDB_BUCKET if Config.INFLUXDB_ENABLED else None,
                "org": Config.INFLUXDB_ORG if Config.INFLUXDB_ENABLED else None
            }
        },
        "retention_policies": {
            "heartbeat_days": Config.RETENTION_HEARTBEAT,
            "hardware_days": Config.RETENTION_HARDWARE,
            "network_days": Config.RETENTION_NETWORK,
            "user_activity_days": Config.RETENTION_USER_ACTIVITY,
            "application_days": Config.RETENTION_APPLICATION,
            "services_days": Config.RETENTION_SERVICES,
            "specs_days": Config.RETENTION_SPECS,
            "update_days": Config.RETENTION_UPDATE
        },
        "thresholds": {
            "offline_threshold_seconds": Config.OFFLINE_THRESHOLD_SECONDS,
            "idle_threshold_seconds": Config.IDLE_ACTIVITY_THRESHOLD_SECONDS
        },
        "uptime_seconds": int((datetime.now(timezone.utc) - startup_time).total_seconds()),
        "features": {
            "influxdb_enabled": Config.INFLUXDB_ENABLED,
            "auth_enabled": Config.AUTH_ENABLED,
            "cors_origins": Config.CORS_ORIGINS
        }
    }


@router.get("/api/health/stats")
async def stats_check():
    """
    Quick statistics endpoint
    Returns counts without full health check
    """
    if not db_manager.is_mongodb_connected:
        return {
            "error": "MongoDB not connected",
            "status": "unavailable"
        }
    
    try:
        stats = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "machines": {
                "total": await db_manager.mongodb_db[HEARTBEAT_LATEST].count_documents({}),
                "with_hardware": await db_manager.mongodb_db[HARDWARE_LATEST].count_documents({}),
                "with_specs": await db_manager.mongodb_db[SPECS_LATEST].count_documents({})
            },
            "alerts": {
                "total": await db_manager.mongodb_db[ALERTS].count_documents({}),
                "unacknowledged": await db_manager.mongodb_db[ALERTS].count_documents({"acknowledged": False})
            }
        }
        
        return stats
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return {
            "error": str(e),
            "status": "error"
        }
