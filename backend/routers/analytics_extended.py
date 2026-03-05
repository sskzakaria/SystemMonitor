"""
Extended Analytics Endpoints - Fleet-wide analytics
These endpoints complement analytics.py with overview and aggregated data
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timezone, timedelta
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser

router = APIRouter(prefix="/api/v1", tags=["analytics"])
logger = logging.getLogger("university_monitoring")


@router.get("/analytics/overview")
async def get_analytics_overview(
    user: OptionalUser = Depends(get_optional_user)
):
    """Get fleet-wide analytics overview"""
    try:
        # Get latest heartbeat data for all machines
        cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
        machines = await cursor.to_list(length=None)
        
        total_machines = len(machines)
        if total_machines == 0:
            return {
                "total_machines": 0,
                "avg_cpu_usage": 0,
                "avg_memory_usage": 0,
                "avg_disk_usage": 0,
                "health_distribution": {
                    "healthy": 0,
                    "warning": 0,
                    "critical": 0,
                    "offline": 0
                },
                "active_users": 0,
                "total_uptime_hours": 0
            }
        
        # Calculate averages and distributions
        total_cpu = sum(m.get("metrics", {}).get("resources", {}).get("cpu_usage_percent", 0) for m in machines)
        total_memory = sum(m.get("metrics", {}).get("resources", {}).get("memory_usage_percent", 0) for m in machines)
        total_disk = sum(m.get("metrics", {}).get("resources", {}).get("disk_usage_percent", 0) for m in machines)
        
        health_counts = {
            "healthy": sum(1 for m in machines if m.get("health", {}).get("status") == "healthy"),
            "warning": sum(1 for m in machines if m.get("health", {}).get("status") == "warning"),
            "critical": sum(1 for m in machines if m.get("health", {}).get("status") == "critical"),
            "offline": sum(1 for m in machines if m.get("metrics", {}).get("status", {}).get("state") == "offline")
        }
        
        active_users = sum(1 for m in machines if m.get("metrics", {}).get("user_activity", {}).get("current_username"))
        total_uptime = sum(m.get("metrics", {}).get("system", {}).get("uptime_seconds", 0) for m in machines)
        
        return {
            "total_machines": total_machines,
            "avg_cpu_usage": round(total_cpu / total_machines, 1),
            "avg_memory_usage": round(total_memory / total_machines, 1),
            "avg_disk_usage": round(total_disk / total_machines, 1),
            "health_distribution": health_counts,
            "active_users": active_users,
            "total_uptime_hours": round(total_uptime / 3600, 1)
        }
        
    except Exception as e:
        logger.error(f"Error fetching analytics overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/usage-patterns")
async def get_usage_patterns(
    days: int = Query(7, ge=1, le=90),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get usage patterns over time"""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Aggregate hourly usage from history
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%d-%H",
                            "date": "$timestamp"
                        }
                    },
                    "avg_cpu": {"$avg": "$cpu_usage_percent"},
                    "avg_memory": {"$avg": "$memory_usage_percent"},
                    "machine_count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        cursor = db_manager.mongodb_db.hardware_monitor_history.aggregate(pipeline)
        results = await cursor.to_list(length=None)
        
        patterns = []
        for r in results:
            hour_str = r["_id"]
            # Parse "2026-03-04-14" format
            parts = hour_str.split("-")
            if len(parts) == 4:
                timestamp = f"{parts[0]}-{parts[1]}-{parts[2]}T{parts[3]}:00:00Z"
            else:
                timestamp = hour_str
            
            patterns.append({
                "timestamp": timestamp,
                "avg_cpu": round(r["avg_cpu"], 1),
                "avg_memory": round(r["avg_memory"], 1),
                "machine_count": r["machine_count"]
            })
        
        return {
            "days": days,
            "patterns": patterns,
            "total_datapoints": len(patterns)
        }
        
    except Exception as e:
        logger.error(f"Error fetching usage patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/buildings")
async def get_building_analytics(
    user: OptionalUser = Depends(get_optional_user)
):
    """Get per-building analytics breakdown"""
    try:
        # Get latest heartbeat data
        cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
        machines = await cursor.to_list(length=None)
        
        # Group by building
        buildings = {}
        for m in machines:
            building = m.get("machine", {}).get("building", "Unknown")
            if building not in buildings:
                buildings[building] = {
                    "building": building,
                    "machine_count": 0,
                    "total_cpu": 0,
                    "total_memory": 0,
                    "total_disk": 0,
                    "healthy": 0,
                    "warning": 0,
                    "critical": 0,
                    "offline": 0
                }
            
            buildings[building]["machine_count"] += 1
            buildings[building]["total_cpu"] += m.get("metrics", {}).get("resources", {}).get("cpu_usage_percent", 0)
            buildings[building]["total_memory"] += m.get("metrics", {}).get("resources", {}).get("memory_usage_percent", 0)
            buildings[building]["total_disk"] += m.get("metrics", {}).get("resources", {}).get("disk_usage_percent", 0)
            
            health = m.get("health", {}).get("status", "offline")
            if health == "healthy":
                buildings[building]["healthy"] += 1
            elif health == "warning":
                buildings[building]["warning"] += 1
            elif health == "critical":
                buildings[building]["critical"] += 1
            else:
                buildings[building]["offline"] += 1
        
        # Calculate averages
        for building_data in buildings.values():
            count = building_data["machine_count"]
            if count > 0:
                building_data["avg_cpu"] = round(building_data["total_cpu"] / count, 1)
                building_data["avg_memory"] = round(building_data["total_memory"] / count, 1)
                building_data["avg_disk"] = round(building_data["total_disk"] / count, 1)
            else:
                building_data["avg_cpu"] = 0
                building_data["avg_memory"] = 0
                building_data["avg_disk"] = 0
            
            # Remove totals from response
            del building_data["total_cpu"]
            del building_data["total_memory"]
            del building_data["total_disk"]
        
        return {
            "buildings": list(buildings.values()),
            "total_buildings": len(buildings)
        }
        
    except Exception as e:
        logger.error(f"Error fetching building analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
