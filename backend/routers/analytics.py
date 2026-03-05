"""
Analytics and Time-Series Data Endpoints
Uses InfluxDB when available, falls back to MongoDB
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from datetime import datetime, timezone, timedelta
import logging

from database import db_manager
from config import Config
from dependencies import get_optional_user, OptionalUser

router = APIRouter(prefix="/api/v1", tags=["analytics"])
logger = logging.getLogger("university_monitoring")


async def query_influxdb_time_series(
    machine_id: str,
    metric_fields: list[str],
    hours: int = 24
) -> list[dict]:
    """Query InfluxDB for time-series data"""
    if not db_manager.is_influxdb_connected:
        return None
    
    try:
        query_api = db_manager.influx_client.query_api()
        
        # Build field selection
        field_filters = ' or '.join([f'r["_field"] == "{field}"' for field in metric_fields])
        
        # Flux query
        flux_query = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
            |> range(start: -{hours}h)
            |> filter(fn: (r) => r["_measurement"] == "hardware_metrics")
            |> filter(fn: (r) => r["machine_id"] == "{machine_id}")
            |> filter(fn: (r) => {field_filters})
            |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
            |> yield(name: "mean")
        '''
        
        tables = await query_api.query(flux_query, org=Config.INFLUXDB_ORG)
        
        # Parse results into time-series format
        data_points = []
        for table in tables:
            for record in table.records:
                data_points.append({
                    "timestamp": record.get_time().isoformat(),
                    "field": record.get_field(),
                    "value": record.get_value()
                })
        
        # Group by timestamp
        grouped = {}
        for point in data_points:
            ts = point["timestamp"]
            if ts not in grouped:
                grouped[ts] = {"timestamp": ts}
            grouped[ts][point["field"]] = point["value"]
        
        return sorted(grouped.values(), key=lambda x: x["timestamp"])
        
    except Exception as e:
        logger.error(f"InfluxDB query failed: {e}")
        return None


async def query_mongodb_time_series(
    machine_id: str,
    hours: int = 24
) -> list[dict]:
    """Fallback to MongoDB for time-series data"""
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        cursor = db_manager.mongodb_db.hardware_monitor_history.find(
            {
                "machine_id": machine_id,
                "timestamp": {"$gte": since}
            },
            {"_id": 0}
        ).sort("timestamp", 1).limit(1440)  # Max ~1 per minute for 24h
        
        history = await cursor.to_list(length=1440)
        return history
        
    except Exception as e:
        logger.error(f"MongoDB query failed: {e}")
        return []


@router.get("/machines/{machine_id}/history/cpu")
async def get_machine_cpu_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get CPU usage history (uses InfluxDB if available)"""
    try:
        # Try InfluxDB first
        influx_data = await query_influxdb_time_series(
            machine_id,
            ["cpu_usage", "cpu_temp", "cpu_freq"],
            hours
        )
        
        if influx_data:
            logger.info(f"✅ Served CPU history from InfluxDB: {len(influx_data)} points")
            return {
                "machine_id": machine_id,
                "metric": "cpu",
                "hours": hours,
                "source": "influxdb",
                "data_points": len(influx_data),
                "history": influx_data
            }
        
        # Fallback to MongoDB
        logger.info("📊 Using MongoDB for CPU history (InfluxDB unavailable)")
        mongo_data = await query_mongodb_time_series(machine_id, hours)
        
        # Extract CPU-specific fields
        cpu_data = []
        for point in mongo_data:
            cpu_point = {
                "timestamp": point.get("timestamp"),
                "cpu_usage": point.get("cpu_usage_percent"),
                "cpu_temp": point.get("cpu_temperature_c"),
                "cpu_freq": point.get("cpu_frequency_mhz")
            }
            cpu_data.append(cpu_point)
        
        return {
            "machine_id": machine_id,
            "metric": "cpu",
            "hours": hours,
            "source": "mongodb",
            "data_points": len(cpu_data),
            "history": cpu_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching CPU history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/history/memory")
async def get_machine_memory_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get memory usage history (uses InfluxDB if available)"""
    try:
        # Try InfluxDB first
        influx_data = await query_influxdb_time_series(
            machine_id,
            ["mem_usage", "mem_used", "mem_free", "mem_available"],
            hours
        )
        
        if influx_data:
            logger.info(f"✅ Served memory history from InfluxDB: {len(influx_data)} points")
            return {
                "machine_id": machine_id,
                "metric": "memory",
                "hours": hours,
                "source": "influxdb",
                "data_points": len(influx_data),
                "history": influx_data
            }
        
        # Fallback to MongoDB
        logger.info("📊 Using MongoDB for memory history (InfluxDB unavailable)")
        mongo_data = await query_mongodb_time_series(machine_id, hours)
        
        # Extract memory-specific fields
        memory_data = []
        for point in mongo_data:
            memory_point = {
                "timestamp": point.get("timestamp"),
                "mem_usage": point.get("memory_usage_percent"),
                "mem_used": point.get("memory_used_gb"),
                "mem_free": point.get("memory_free_gb"),
                "mem_available": point.get("memory_available_gb")
            }
            memory_data.append(memory_point)
        
        return {
            "machine_id": machine_id,
            "metric": "memory",
            "hours": hours,
            "source": "mongodb",
            "data_points": len(memory_data),
            "history": memory_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching memory history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/history/disk")
async def get_machine_disk_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get disk usage history (uses InfluxDB if available)"""
    try:
        # Try InfluxDB first
        influx_data = await query_influxdb_time_series(
            machine_id,
            ["disk_usage", "disk_used", "disk_free", "disk_read", "disk_write"],
            hours
        )
        
        if influx_data:
            logger.info(f"✅ Served disk history from InfluxDB: {len(influx_data)} points")
            return {
                "machine_id": machine_id,
                "metric": "disk",
                "hours": hours,
                "source": "influxdb",
                "data_points": len(influx_data),
                "history": influx_data
            }
        
        # Fallback to MongoDB
        logger.info("📊 Using MongoDB for disk history (InfluxDB unavailable)")
        mongo_data = await query_mongodb_time_series(machine_id, hours)
        
        # Extract disk-specific fields
        disk_data = []
        for point in mongo_data:
            disk_point = {
                "timestamp": point.get("timestamp"),
                "disk_usage": point.get("disk_usage_percent"),
                "disk_used": point.get("disk_used_gb"),
                "disk_free": point.get("disk_free_gb"),
                "disk_read": point.get("disk_read_mb"),
                "disk_write": point.get("disk_write_mb")
            }
            disk_data.append(disk_point)
        
        return {
            "machine_id": machine_id,
            "metric": "disk",
            "hours": hours,
            "source": "mongodb",
            "data_points": len(disk_data),
            "history": disk_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching disk history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/history/network")
async def get_machine_network_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get network usage history (uses InfluxDB if available)"""
    try:
        # Try InfluxDB first
        influx_data = await query_influxdb_time_series(
            machine_id,
            ["net_upload", "net_download", "net_packets_sent", "net_packets_recv"],
            hours
        )
        
        if influx_data:
            logger.info(f"✅ Served network history from InfluxDB: {len(influx_data)} points")
            return {
                "machine_id": machine_id,
                "metric": "network",
                "hours": hours,
                "source": "influxdb",
                "data_points": len(influx_data),
                "history": influx_data
            }
        
        # Fallback to MongoDB
        logger.info("📊 Using MongoDB for network history (InfluxDB unavailable)")
        mongo_data = await query_mongodb_time_series(machine_id, hours)
        
        # Extract network-specific fields
        network_data = []
        for point in mongo_data:
            network_point = {
                "timestamp": point.get("timestamp"),
                "net_upload": point.get("network_upload_mbps"),
                "net_download": point.get("network_download_mbps"),
                "net_packets_sent": point.get("network_packets_sent_per_sec"),
                "net_packets_recv": point.get("network_packets_recv_per_sec")
            }
            network_data.append(network_point)
        
        return {
            "machine_id": machine_id,
            "metric": "network",
            "hours": hours,
            "source": "mongodb",
            "data_points": len(network_data),
            "history": network_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching network history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/history/temperature")
async def get_machine_temperature_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get temperature history (uses InfluxDB if available)"""
    try:
        # Try InfluxDB first
        influx_data = await query_influxdb_time_series(
            machine_id,
            ["cpu_temp", "gpu_temp"],
            hours
        )
        
        if influx_data:
            logger.info(f"✅ Served temperature history from InfluxDB: {len(influx_data)} points")
            return {
                "machine_id": machine_id,
                "metric": "temperature",
                "hours": hours,
                "source": "influxdb",
                "data_points": len(influx_data),
                "history": influx_data
            }
        
        # Fallback to MongoDB
        logger.info("📊 Using MongoDB for temperature history (InfluxDB unavailable)")
        mongo_data = await query_mongodb_time_series(machine_id, hours)
        
        # Extract temperature fields
        temp_data = []
        for point in mongo_data:
            temp_point = {
                "timestamp": point.get("timestamp"),
                "cpu_temp": point.get("cpu_temperature_c"),
                "gpu_temp": point.get("gpu_temperature_c")
            }
            temp_data.append(temp_point)
        
        return {
            "machine_id": machine_id,
            "metric": "temperature",
            "hours": hours,
            "source": "mongodb",
            "data_points": len(temp_data),
            "history": temp_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching temperature history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/trends")
async def get_system_trends(
    metric: str = Query("cpu_usage", description="Metric to analyze"),
    days: int = Query(7, ge=1, le=90),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get system-wide trends (uses InfluxDB for better performance)"""
    try:
        if not db_manager.is_influxdb_connected:
            # Fallback to MongoDB aggregation
            logger.info("📊 Using MongoDB for trends (InfluxDB unavailable)")
            since = datetime.now(timezone.utc) - timedelta(days=days)
            
            # Map frontend metric names to MongoDB field names
            metric_map = {
                "cpu_usage": "cpu_usage_percent",
                "memory_usage": "memory_usage_percent",
                "disk_usage": "disk_usage_percent"
            }
            
            field_name = metric_map.get(metric, "cpu_usage_percent")
            
            pipeline = [
                {"$match": {"timestamp": {"$gte": since}}},
                {
                    "$group": {
                        "_id": {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$timestamp"
                            }
                        },
                        "avg_value": {"$avg": f"${field_name}"},
                        "max_value": {"$max": f"${field_name}"},
                        "min_value": {"$min": f"${field_name}"}
                    }
                },
                {"$sort": {"_id": 1}}
            ]
            
            cursor = db_manager.mongodb_db.hardware_monitor_history.aggregate(pipeline)
            results = await cursor.to_list(length=None)
            
            trends = [{
                "date": r["_id"],
                "average": r["avg_value"],
                "maximum": r["max_value"],
                "minimum": r["min_value"]
            } for r in results]
            
            return {
                "metric": metric,
                "days": days,
                "source": "mongodb",
                "trends": trends
            }
        
        # Use InfluxDB for better performance
        logger.info("✅ Using InfluxDB for trends")
        query_api = db_manager.influx_client.query_api()
        
        # Map metric names to InfluxDB field names
        influx_field_map = {
            "cpu_usage": "cpu_usage",
            "memory_usage": "mem_usage",
            "disk_usage": "disk_usage"
        }
        
        field = influx_field_map.get(metric, "cpu_usage")
        
        flux_query = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
            |> range(start: -{days}d)
            |> filter(fn: (r) => r["_measurement"] == "hardware_metrics")
            |> filter(fn: (r) => r["_field"] == "{field}")
            |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
            |> yield(name: "daily_avg")
        '''
        
        tables = await query_api.query(flux_query, org=Config.INFLUXDB_ORG)
        
        trends = []
        for table in tables:
            for record in table.records:
                trends.append({
                    "date": record.get_time().strftime("%Y-%m-%d"),
                    "average": record.get_value()
                })
        
        return {
            "metric": metric,
            "days": days,
            "source": "influxdb",
            "trends": sorted(trends, key=lambda x: x["date"])
        }
        
    except Exception as e:
        logger.error(f"Error fetching trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/analytics/daily")
async def get_daily_averages(
    machine_id: str = Path(...),
    metric: str = Query("cpu_usage"),
    days: int = Query(7, ge=1, le=90),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get daily averages for a machine (uses InfluxDB if available)"""
    try:
        if not db_manager.is_influxdb_connected:
            # MongoDB fallback
            logger.info("📊 Using MongoDB for daily averages")
            since = datetime.now(timezone.utc) - timedelta(days=days)
            
            metric_map = {
                "cpu_usage": "cpu_usage_percent",
                "memory_usage": "memory_usage_percent",
                "disk_usage": "disk_usage_percent"
            }
            
            field_name = metric_map.get(metric, "cpu_usage_percent")
            
            pipeline = [
                {
                    "$match": {
                        "machine_id": machine_id,
                        "timestamp": {"$gte": since}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$timestamp"
                            }
                        },
                        "average": {"$avg": f"${field_name}"}
                    }
                },
                {"$sort": {"_id": 1}}
            ]
            
            cursor = db_manager.mongodb_db.hardware_monitor_history.aggregate(pipeline)
            results = await cursor.to_list(length=None)
            
            return {
                "machine_id": machine_id,
                "metric": metric,
                "days": days,
                "source": "mongodb",
                "averages": [{"date": r["_id"], "value": r["average"]} for r in results]
            }
        
        # InfluxDB query
        logger.info("✅ Using InfluxDB for daily averages")
        query_api = db_manager.influx_client.query_api()
        
        influx_field_map = {
            "cpu_usage": "cpu_usage",
            "memory_usage": "mem_usage",
            "disk_usage": "disk_usage"
        }
        
        field = influx_field_map.get(metric, "cpu_usage")
        
        flux_query = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
            |> range(start: -{days}d)
            |> filter(fn: (r) => r["_measurement"] == "hardware_metrics")
            |> filter(fn: (r) => r["machine_id"] == "{machine_id}")
            |> filter(fn: (r) => r["_field"] == "{field}")
            |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
            |> yield(name: "daily")
        '''
        
        tables = await query_api.query(flux_query, org=Config.INFLUXDB_ORG)
        
        averages = []
        for table in tables:
            for record in table.records:
                averages.append({
                    "date": record.get_time().strftime("%Y-%m-%d"),
                    "value": record.get_value()
                })
        
        return {
            "machine_id": machine_id,
            "metric": metric,
            "days": days,
            "source": "influxdb",
            "averages": sorted(averages, key=lambda x: x["date"])
        }
        
    except Exception as e:
        logger.error(f"Error fetching daily averages: {e}")
        raise HTTPException(status_code=500, detail=str(e))
