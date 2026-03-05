"""
Optimized Ingestion Router - FIXED VERSION
Features:
- Throttled overview updates (no longer bloats history)
- Optimized database operations
- Health check endpoint
- Better error handling with metrics
- Async batch operations

FIXES:
✅ Overview only updates every 30 seconds (not every 5 seconds)
✅ Overview history only written on significant changes
✅ Parallel database writes for performance
✅ Better error tracking
✅ Health check endpoint added
"""
from fastapi import APIRouter, HTTPException, status, Request
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import logging
import asyncio

from database import db_manager, write_to_influxdb
from config import Config
from dependencies import get_optional_user, OptionalUser
from utils.collections import *
from utils.cpu_age_analyzer import analyze_cpu_age

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/data", tags=["ingestion"])

# Import WebSocket manager for real-time updates
try:
    from .websocket import broadcast_machine_update
    WEBSOCKET_ENABLED = True
except ImportError:
    WEBSOCKET_ENABLED = False
    logger.warning("⚠️ WebSocket module not found - real-time updates disabled")

# ============================================================================
# METRICS TRACKING
# ============================================================================
class IngestionMetrics:
    """Track ingestion statistics"""
    def __init__(self):
        self.influx_failure_count = 0
        self.total_requests = 0
        self.failed_requests = 0
        self.overview_updates_skipped = 0
        self.last_overview_update: Dict[str, datetime] = {}
    
    def reset_influx_failures(self):
        self.influx_failure_count = 0
    
    def increment_influx_failure(self):
        self.influx_failure_count += 1
        if self.influx_failure_count % 10 == 0:
            logger.error(f"⚠️ InfluxDB: {self.influx_failure_count} consecutive failures!")
    
    def should_update_overview(self, machine_id: str, threshold_seconds: int = 30) -> bool:
        """Only update overview if enough time has passed"""
        now = datetime.now(timezone.utc)
        last_update = self.last_overview_update.get(machine_id)
        
        if not last_update:
            self.last_overview_update[machine_id] = now
            return True
        
        if (now - last_update).total_seconds() >= threshold_seconds:
            self.last_overview_update[machine_id] = now
            return True
        
        self.overview_updates_skipped += 1
        return False

metrics = IngestionMetrics()


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
async def derive_overview(hardware: dict, heartbeat: dict | None, specs: dict | None):
    """
    Derive overview from hardware and heartbeat data
    
    ✅ OPTIMIZED: Now accepts specs as parameter (no extra DB query)
    """
    now = datetime.now(timezone.utc)

    cpu = hardware.get("cpu_usage_percent", 0)
    mem = hardware.get("memory_usage_percent", 0)
    disk = hardware.get("disk_usage_percent", 0)

    health_score = max(0, 100 - int((cpu + mem + disk) / 3))

    return {
        "machine_id": hardware["machine_id"],
        "hostname": hardware.get("hostname"),
        "building": hardware.get("building"),
        "room": hardware.get("room"),
        
        "cpu_model": specs.get("cpu_model") if specs else hardware.get("cpu_model", "Unknown"),
        
        "os_name": specs.get("os_name") if specs else hardware.get("os_name", "Unknown"),
        "os_version": specs.get("os_version") if specs else hardware.get("os_version", "Unknown"),
        
        "status": "online" if heartbeat else "unknown",
        "last_seen": (
            heartbeat.get("timestamp")
            if heartbeat
            else hardware.get("timestamp")
        ),
        "resources": {
            "cpu_usage_percent": cpu,
            "memory_usage_percent": mem,
            "disk_usage_percent": disk,
        },
        "health_summary": {
            "system_health": "healthy" if health_score > 70 else "warning",
            "health_score": health_score,
            "issues": [],
            "alerts": [],
        },
        "timestamp": now,
        "received_at": now,
    }


async def write_hardware_to_influx(doc: Dict[str, Any]):
    """
    Helper to write hardware data to InfluxDB with correct format
    
    ✅ IMPROVED: Better error tracking
    """
    try:
        # Extract tags (dimensions)
        tags = {
            'machine_id': str(doc.get('machine_id', 'unknown')),
            'hostname': str(doc.get('hostname', 'unknown'))
        }
        
        # Add optional tags if present
        if doc.get('building'):
            tags['building'] = str(doc['building'])
        if doc.get('room'):
            tags['room'] = str(doc['room'])
        
        # Extract fields (metrics) - only numeric values
        fields = {}
        numeric_fields = [
            'cpu_usage_percent', 'cpu_temperature_c',
            'memory_usage_percent', 'memory_used_gb', 'memory_free_gb', 'memory_available_gb',
            'disk_usage_percent', 'disk_used_gb', 'disk_free_gb',
            'disk_read_mb', 'disk_write_mb',
            'network_upload_mbps', 'network_download_mbps',
            'network_packets_sent_per_sec', 'network_packets_recv_per_sec',
            'gpu_usage_percent', 'gpu_temperature_c', 'gpu_memory_used_gb',
            'process_count', 'thread_count', 'uptime_hours'
        ]
        
        for field in numeric_fields:
            value = doc.get(field)
            if value is not None:
                try:
                    if isinstance(value, (int, float)):
                        fields[field] = value
                    else:
                        fields[field] = float(value)
                except (ValueError, TypeError):
                    logger.debug(f"Skipping non-numeric field {field}: {value}")
        
        # Only write if we have fields
        if fields:
            await write_to_influxdb(
                measurement='hardware_metrics',
                tags=tags,
                fields=fields,
                timestamp=doc.get('timestamp')
            )
            logger.debug(f"✓ Wrote {len(fields)} metrics to InfluxDB for {tags['machine_id']}")
            metrics.reset_influx_failures()
        else:
            logger.warning(f"No numeric fields to write to InfluxDB for {doc.get('machine_id')}")
            
    except Exception as e:
        logger.error(f"Error writing to InfluxDB: {e}")
        metrics.increment_influx_failure()


def has_significant_change(old_overview: dict, new_overview: dict, threshold: float = 5.0) -> bool:
    """
    Check if overview has changed significantly enough to write to history
    
    ✅ NEW: Prevents history bloat
    """
    if not old_overview:
        return True
    
    # Check resource changes
    old_resources = old_overview.get("resources", {})
    new_resources = new_overview.get("resources", {})
    
    for key in ['cpu_usage_percent', 'memory_usage_percent', 'disk_usage_percent']:
        old_val = old_resources.get(key, 0)
        new_val = new_resources.get(key, 0)
        
        if abs(new_val - old_val) >= threshold:
            return True
    
    # Check status change
    if old_overview.get("status") != new_overview.get("status"):
        return True
    
    # Check health score change
    old_health = old_overview.get("health_summary", {}).get("health_score", 0)
    new_health = new_overview.get("health_summary", {}).get("health_score", 0)
    
    if abs(new_health - old_health) >= threshold:
        return True
    
    return False


# ============================================================================
# DATA MODELS
# ============================================================================

class SpecsData(BaseModel):
    """Static machine specifications (sent once or on change)"""
    machine_id: str = Field(..., min_length=1, max_length=100)
    hostname: str = Field(..., min_length=1, max_length=255)
    
    # CPU specs
    cpu_model: str
    cpu_cores: int = Field(..., gt=0, le=256)
    cpu_frequency_mhz: Optional[float] = None
    
    # Memory specs
    memory_total_gb: float = Field(..., gt=0, le=2048)
    
    # Disk specs
    disk_total_gb: float = Field(..., gt=0, le=100000)
    
    # OS info
    os_type: str
    os_version: str
    
    # Partitions (static, don't change)
    partitions: List[Dict[str, Any]] = []
    
    # Optional metadata
    building: Optional[str] = None
    room: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    
    timestamp: Optional[datetime] = None
    
    # Nested data for backward compatibility
    system: Optional[Dict[str, Any]] = None
    cpu: Optional[Dict[str, Any]] = None
    memory: Optional[Dict[str, Any]] = None
    storage: Optional[Dict[str, Any]] = None
    network: Optional[Dict[str, Any]] = None
    os: Optional[Dict[str, Any]] = None
    
    class Config:
        extra = "allow"
    
    @validator('timestamp', always=True)
    def set_timestamp(cls, v):
        return v or datetime.now(timezone.utc)


class HardwareData(BaseModel):
    """Dynamic hardware metrics (sent every 5-30 seconds)"""
    machine_id: str = Field(..., min_length=1, max_length=100)
    hostname: str = Field(..., min_length=1, max_length=255)
    timestamp: Optional[datetime] = None
    
    # CPU metrics (fast - every 5s)
    cpu_usage_percent: Optional[float] = Field(None, ge=0, le=100)
    cpu_temperature_c: Optional[float] = Field(None, ge=-50, le=150)
    
    # Memory metrics (medium - every 30s)
    memory_usage_percent: Optional[float] = Field(None, ge=0, le=100)
    memory_used_gb: Optional[float] = Field(None, ge=0)
    memory_free_gb: Optional[float] = Field(None, ge=0)
    memory_available_gb: Optional[float] = Field(None, ge=0)
    
    # Disk metrics (slow - every 5min)
    disk_usage_percent: Optional[float] = Field(None, ge=0, le=100)
    disk_used_gb: Optional[float] = Field(None, ge=0)
    disk_free_gb: Optional[float] = Field(None, ge=0)
    disk_read_mb: Optional[float] = Field(None, ge=0)
    disk_write_mb: Optional[float] = Field(None, ge=0)
    
    # Network metrics (fast - every 5s, now as RATES not cumulative)
    network_upload_mbps: Optional[float] = Field(None, ge=0)
    network_download_mbps: Optional[float] = Field(None, ge=0)
    network_packets_sent_per_sec: Optional[float] = Field(None, ge=0)
    network_packets_recv_per_sec: Optional[float] = Field(None, ge=0)
    
    # GPU metrics (if available)
    gpu_usage_percent: Optional[float] = Field(None, ge=0, le=100)
    gpu_temperature_c: Optional[float] = Field(None, ge=-50, le=150)
    gpu_memory_used_gb: Optional[float] = Field(None, ge=0)
    
    # Process metrics
    process_count: Optional[int] = Field(None, ge=0)
    thread_count: Optional[int] = Field(None, ge=0)
    
    # System metrics
    uptime_hours: Optional[float] = Field(None, ge=0)
    
    # Location (optional)
    building: Optional[str] = None
    room: Optional[str] = None
    
    # Backward compatibility (deprecated, but kept for old agents)
    cpu_model: Optional[str] = None
    cpu_cores: Optional[int] = None
    memory_total_gb: Optional[float] = None
    disk_total_gb: Optional[float] = None
    partitions: Optional[List[Dict]] = None
    network_bytes_sent: Optional[int] = None
    network_bytes_recv: Optional[int] = None
    
    @validator('timestamp', always=True)
    def set_timestamp(cls, v):
        return v or datetime.now(timezone.utc)


class BatchHardwareData(BaseModel):
    """Batch ingestion for multiple machines"""
    data: List[HardwareData]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/health")
async def health_check():
    """
    ✅ NEW: Health check endpoint for monitoring
    """
    return {
        "status": "healthy",
        "connections": {
            "mongodb": db_manager.is_mongodb_connected,
            "influxdb": db_manager.is_influxdb_connected
        },
        "metrics": {
            "total_requests": metrics.total_requests,
            "failed_requests": metrics.failed_requests,
            "influx_failures": metrics.influx_failure_count,
            "overview_updates_skipped": metrics.overview_updates_skipped
        },
        "duplicates": {
            "total_machines": len(db_manager._duplicate_count),
            "total_duplicates": sum(db_manager._duplicate_count.values())
        }
    }


@router.post("/specs", status_code=status.HTTP_201_CREATED)
async def receive_specs(data: SpecsData):
    """
    Receive and store static machine specifications.
    Only sent once at startup or when specs change.
    
    ✅ NEW: Now calculates and stores CPU age information
    """
    try:
        metrics.total_requests += 1
        
        # Validate data consistency
        is_valid, errors = await db_manager.validate_data_consistency(data.dict())
        if not is_valid:
            logger.warning(f"Validation errors for {data.machine_id}: {errors}")
        
        # Prepare document
        doc = data.dict()
        doc['received_at'] = datetime.now(timezone.utc)
        doc['last_updated'] = datetime.now(timezone.utc)
        
        # ✅ NEW: Calculate CPU age information
        if data.cpu_model:
            cpu_age_info = analyze_cpu_age(data.cpu_model)
            cpu_age_dict = cpu_age_info.to_dict()
            
            # Add CPU age fields to document
            doc['cpu_age_years'] = cpu_age_dict['cpu_age_years']
            doc['cpu_generation'] = cpu_age_dict['cpu_generation']
            doc['cpu_release_year'] = cpu_age_dict['cpu_release_year']
            
            logger.info(f"✓ CPU age calculated for {data.machine_id}: {data.cpu_model} -> {cpu_age_dict['cpu_generation']} ({cpu_age_dict['cpu_age_years']} years old)")
        else:
            doc['cpu_age_years'] = None
            doc['cpu_generation'] = None
            doc['cpu_release_year'] = None
        
        result = await db_manager.db.specs_monitor_latest.update_one(
            {'machine_id': data.machine_id},
            {
                '$set': doc,
                '$setOnInsert': {'first_seen': datetime.now(timezone.utc)}
            },
            upsert=True
        )
        
        action = "updated" if result.modified_count > 0 else "inserted"
        logger.info(f"✓ Specs {action} for {data.machine_id}")
        
        return {
            "status": "success",
            "message": f"Specs {action} successfully",
            "machine_id": data.machine_id,
            "timestamp": data.timestamp,
            "cpu_age_info": {
                "cpu_age_years": doc.get('cpu_age_years'),
                "cpu_generation": doc.get('cpu_generation'),
                "cpu_release_year": doc.get('cpu_release_year')
            } if data.cpu_model else None
        }
        
    except Exception as e:
        metrics.failed_requests += 1
        logger.error(f"Error receiving specs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store specs: {str(e)}"
        )


@router.post("/hardware", status_code=status.HTTP_201_CREATED)
async def receive_hardware(data: HardwareData):
    """
    Receive dynamic hardware metrics.
    
    ✅ OPTIMIZED:
    - Parallel database operations
    - Throttled overview updates (30s instead of 5s)
    - History only on significant changes
    - Single specs query reused
    - ✅ NEW: Writes to InfluxDB for time-series analytics
    """
    try:
        metrics.total_requests += 1
        
        # Check for duplicates
        if db_manager.is_duplicate(data.machine_id, data.timestamp):
            return {
                "status": "duplicate",
                "message": "Duplicate data point ignored",
                "machine_id": data.machine_id
            }
        
        # Validate data consistency
        is_valid, errors = await db_manager.validate_data_consistency(data.dict())
        if not is_valid:
            logger.warning(f"Validation errors for {data.machine_id}: {errors}")
        
        # Prepare document
        doc = data.dict(exclude_none=True)
        doc['received_at'] = datetime.now(timezone.utc)
        
        # ✅ OPTIMIZATION: Fetch specs and heartbeat in parallel
        specs_task = db_manager.db.specs_monitor_latest.find_one(
            {'machine_id': data.machine_id},
            {'_id': 0, 'partitions': 0}
        )
        heartbeat_task = db_manager.db.heartbeat_monitor_latest.find_one(
            {"machine_id": data.machine_id},
            {"_id": 0}
        )
        
        specs, heartbeat = await asyncio.gather(specs_task, heartbeat_task)
        
        # Fill in missing fields from specs
        if specs:
            for key in ['cpu_model', 'cpu_cores', 'memory_total_gb', 'disk_total_gb', 
                       'building', 'room', 'os_type', 'os_version']:
                if key not in doc and key in specs:
                    doc[key] = specs[key]
        
        # ✅ NEW: Write to InfluxDB (parallel with MongoDB writes)
        influxdb_task = None
        if db_manager.is_influxdb_connected:
            # Prepare InfluxDB tags and fields
            tags = {
                "machine_id": data.machine_id,
                "hostname": data.hostname,
                "building": doc.get("building", "unknown"),
                "room": doc.get("room", "unknown")
            }
            
            # Prepare InfluxDB fields (only numeric values)
            fields = {}
            field_mapping = {
                "cpu_usage_percent": "cpu_usage",
                "cpu_temperature_c": "cpu_temp",
                "cpu_frequency_mhz": "cpu_freq",
                "memory_usage_percent": "mem_usage",
                "memory_used_gb": "mem_used",
                "memory_free_gb": "mem_free",
                "memory_available_gb": "mem_available",
                "disk_usage_percent": "disk_usage",
                "disk_used_gb": "disk_used",
                "disk_free_gb": "disk_free",
                "disk_read_mb": "disk_read",
                "disk_write_mb": "disk_write",
                "network_upload_mbps": "net_upload",
                "network_download_mbps": "net_download",
                "network_packets_sent_per_sec": "net_packets_sent",
                "network_packets_recv_per_sec": "net_packets_recv",
                "gpu_usage_percent": "gpu_usage",
                "gpu_temperature_c": "gpu_temp"
            }
            
            for mongo_field, influx_field in field_mapping.items():
                if mongo_field in doc and doc[mongo_field] is not None:
                    fields[influx_field] = doc[mongo_field]
            
            # Only write to InfluxDB if we have fields
            if fields:
                influxdb_task = write_to_influxdb(
                    measurement="hardware_metrics",
                    tags=tags,
                    fields=fields,
                    timestamp=doc.get("timestamp")
                )
        
        # ✅ OPTIMIZATION: Parallel database writes
        write_tasks = [
            # Update latest
            db_manager.db.hardware_monitor_latest.update_one(
                {'machine_id': data.machine_id},
                {'$set': doc},
                upsert=True
            ),
            # Insert history
            db_manager.db.hardware_monitor_history.insert_one(doc.copy())
        ]
        
        # Add InfluxDB task if it exists
        if influxdb_task:
            write_tasks.append(influxdb_task)
        
        # Execute writes in parallel
        results = await asyncio.gather(*write_tasks, return_exceptions=True)
        
        # Log InfluxDB write result
        if influxdb_task:
            influx_result = results[-1]
            if isinstance(influx_result, Exception):
                logger.warning(f"InfluxDB write failed: {influx_result}")
            elif influx_result:
                logger.debug(f"✅ Written to InfluxDB: {data.machine_id}")
        
        # ✅ OPTIMIZATION: Throttle overview updates (30 seconds)
        overview = None  # Initialize overview variable
        if metrics.should_update_overview(data.machine_id, threshold_seconds=30):
            # Get current overview for comparison
            old_overview = await db_manager.db.overview_monitor_latest.find_one(
                {"machine_id": data.machine_id},
                {"_id": 0}
            )
            
            # Derive new overview
            overview = await derive_overview(doc, heartbeat, specs)
            
            # Update latest (always)
            await db_manager.db.overview_monitor_latest.update_one(
                {"machine_id": data.machine_id},
                {"$set": overview},
                upsert=True
            )
            
            # ✅ OPTIMIZATION: Only write to history if significant change
            if has_significant_change(old_overview, overview, threshold=5.0):
                await db_manager.db.overview_monitor_history.insert_one(overview)
                logger.debug(f"✓ Overview history updated for {data.machine_id} (significant change)")
            else:
                logger.debug(f"⊘ Overview history skipped for {data.machine_id} (no significant change)")
        else:
            # ✅ FIX: Fetch existing overview if we're not updating it
            overview = await db_manager.db.overview_monitor_latest.find_one(
                {"machine_id": data.machine_id},
                {"_id": 0}
            )
        
        # ✅ Broadcast update to WebSocket clients (if enabled)
        if WEBSOCKET_ENABLED:
            try:
                # Prepare machine data for broadcast
                machine_update = {
                    "machine_id": data.machine_id,
                    "hostname": doc.get("hostname"),
                    "status": overview.get("status") if overview else "online",
                    "resources": {
                        "cpu_usage_percent": doc.get("cpu_usage_percent"),
                        "memory_usage_percent": doc.get("memory_usage_percent"),
                        "disk_usage_percent": doc.get("disk_usage_percent")
                    },
                    "timestamp": data.timestamp.isoformat() if data.timestamp else None
                }
                
                # 🔍 DEBUG: Log what we're broadcasting
                logger.info(f"📡 Broadcasting WebSocket update for {machine_update['machine_id']}: CPU={machine_update['resources']['cpu_usage_percent']}%, MEM={machine_update['resources']['memory_usage_percent']}%, status={machine_update['status']}")
                
                asyncio.create_task(broadcast_machine_update(machine_update))
            except Exception as ws_error:
                logger.error(f"WebSocket broadcast failed: {ws_error}")
        
        return {
            "status": "success",
            "message": "Data stored successfully",
            "machine_id": data.machine_id,
            "timestamp": data.timestamp
        }
        
    except Exception as e:
        metrics.failed_requests += 1
        logger.error(f"Error receiving hardware data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store hardware data: {str(e)}"
        )


@router.post("/hardware/batch", status_code=status.HTTP_201_CREATED)
async def receive_hardware_batch(batch: BatchHardwareData):
    """
    Receive multiple hardware data points in a single request.
    
    ✅ OPTIMIZED: Uses bulk operations
    """
    try:
        metrics.total_requests += len(batch.data)
        results = []
        
        # Prepare bulk operations
        bulk_latest = []
        bulk_history = []
        
        for data in batch.data:
            # Check for duplicates
            if db_manager.is_duplicate(data.machine_id, data.timestamp):
                results.append({
                    "machine_id": data.machine_id,
                    "status": "duplicate"
                })
                continue
            
            # Prepare document
            doc = data.dict(exclude_none=True)
            doc['received_at'] = datetime.now(timezone.utc)
            
            # Add to bulk operations
            from pymongo import UpdateOne
            bulk_latest.append(
                UpdateOne(
                    {'machine_id': data.machine_id},
                    {'$set': doc},
                    upsert=True
                )
            )
            bulk_history.append(doc.copy())
            
            # Write to InfluxDB (async)
            asyncio.create_task(write_hardware_to_influx(doc))
            
            results.append({
                "machine_id": data.machine_id,
                "status": "success"
            })
        
        # Execute bulk operations in parallel
        if bulk_latest:
            await asyncio.gather(
                db_manager.db.hardware_monitor_latest.bulk_write(bulk_latest),
                db_manager.db.hardware_monitor_history.insert_many(bulk_history),
                return_exceptions=True
            )
        
        return {
            "status": "success",
            "message": f"Processed {len(results)} data points",
            "results": results
        }
        
    except Exception as e:
        metrics.failed_requests += len(batch.data)
        logger.error(f"Error in batch ingestion: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch ingestion failed: {str(e)}"
        )


# ============================================================================
# BACKWARD COMPATIBILITY ENDPOINTS (unchanged)
# ============================================================================

@router.post("/applications")
async def receive_applications(data: Dict[str, Any]):
    """Receive application data (unchanged for backward compatibility)"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.applications_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.applications_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving applications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/services")
async def receive_services(data: Dict[str, Any]):
    """Receive services data (unchanged for backward compatibility)"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.services_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.services_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/network")
async def receive_network(data: Dict[str, Any]):
    """
    Receive network data - handles new format with InfluxDB time-series support.
    
    ✅ UPDATED: Supports new network_monitor.py format
    - Handles new format: ipv4[].address (not addresses[].type)
    - Extracts performance metrics to InfluxDB (latency, packet_loss, jitter, quality_score)
    - Stores full payload in MongoDB
    """
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        data['received_at'] = datetime.now(timezone.utc)

        # Flatten primary IP from interfaces
        # Handles both new format (ipv4[].address) and
        # old format (addresses[].type == IPv4) for compatibility
        if 'primary_ip' in data:
            # New network_monitor sends primary_ip at root level directly
            data['ip_address'] = data['primary_ip']
        else:
            # Fallback: extract from interfaces list
            interfaces = data.get('interfaces', [])
            for iface in interfaces:
                # New format
                ipv4_list = iface.get('ipv4', [])
                if ipv4_list:
                    ip = ipv4_list[0].get('address')
                    if ip and not ip.startswith('169.254.'):
                        data['ip_address'] = ip
                        break
                # Old format fallback
                for addr in iface.get('addresses', []):
                    if addr.get('type') == 'IPv4':
                        data['ip_address'] = addr.get('address')
                        break

        # Write to InfluxDB for latency/quality time-series
        if db_manager.is_influxdb_connected:
            perf = data.get('performance', {})
            conn = data.get('connectivity', {})
            fields = {}
            for key, val in {
                'latency_ms':         perf.get('avg_latency_ms'),
                'packet_loss_pct':    perf.get('packet_loss_percent'),
                'jitter_ms':          perf.get('jitter_ms'),
                'quality_score':      data.get('quality_score'),
                'gateway_latency_ms': conn.get('gateway_latency_ms'),
                'dns_latency_ms':     conn.get('dns_latency_ms'),
                'online':             1 if data.get('online') else 0,
            }.items():
                if val is not None:
                    fields[key] = val

            if fields:
                asyncio.create_task(write_to_influxdb(
                    measurement='network_metrics',
                    tags={
                        'machine_id': str(data.get('machine_id', 'unknown')),
                        'hostname':   str(data.get('hostname', 'unknown')),
                        'building':   str(data.get('building', 'unknown')),
                        'room':       str(data.get('room', 'unknown')),
                    },
                    fields=fields,
                    timestamp=data.get('timestamp')
                ))

        # Store full payload in MongoDB
        await db_manager.db.network_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        await db_manager.db.network_monitor_history.insert_one(data)
        
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error receiving network data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/heartbeat")
async def receive_heartbeat(data: Dict[str, Any]):
    """Receive heartbeat data (unchanged for backward compatibility)"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.heartbeat_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.heartbeat_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving heartbeat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/user-activity")
async def receive_user_activity(data: Dict[str, Any]):
    """Receive user activity data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        if 'active_user' not in data:
            active_sessions = data.get('active_sessions', [])
            if active_sessions and len(active_sessions) > 0:
                first_session = active_sessions[0]
                if isinstance(first_session, dict):
                    data['active_user'] = first_session.get('user')
            
            if 'active_user' not in data:
                user_summary = data.get('user_summary', {})
                if user_summary:
                    data['active_user'] = user_summary.get('current_user')
        
        if 'user_summary' not in data:
            active_sessions = data.get('active_sessions', [])
            users = set()
            for session in active_sessions:
                if isinstance(session, dict) and 'user' in session:
                    users.add(session['user'])
            
            data['user_summary'] = {
                'current_user': data.get('active_user'),
                'total_sessions': len(active_sessions),
                'unique_users': len(users),
                'user_list': list(users),
                'has_active_users': len(active_sessions) > 0
            }
        
        await db_manager.db.user_activity_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.user_activity_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving user activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/peripherals")
async def receive_peripherals(data: Dict[str, Any]):
    """Receive peripherals data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.peripherals_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.peripherals_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving peripherals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/usb-devices")
async def receive_usb_devices(data: Dict[str, Any]):
    """Receive USB devices data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.usb_devices_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.usb_devices_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving USB devices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/security-software")
async def receive_security_software(data: Dict[str, Any]):
    """Receive security software data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.security_software_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.security_software_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving security software: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event-logs")
async def receive_event_logs(data: Dict[str, Any]):
    """Receive event logs data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.event_log_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.event_log_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving event logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/overview")
async def receive_overview(data: Dict[str, Any]):
    """Receive overview data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.overview_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.overview_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update")
async def receive_update(data: Dict[str, Any]):
    """Receive Windows update data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.update_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.update_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving update data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/application")
async def receive_application(data: Dict[str, Any]):
    """Receive application monitoring data"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now(timezone.utc)
        
        data['received_at'] = datetime.now(timezone.utc)
        
        await db_manager.db.application_monitor_latest.update_one(
            {'machine_id': data.get('machine_id')},
            {'$set': data},
            upsert=True
        )
        
        await db_manager.db.application_monitor_history.insert_one(data)
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error receiving application data: {e}")
        raise HTTPException(status_code=500, detail=str(e))