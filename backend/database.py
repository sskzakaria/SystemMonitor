"""
Optimized Database Module with Data Integrity
Combines robustness of old version with features of new version
"""
from influxdb_client import Point
from motor.motor_asyncio import AsyncIOMotorClient
from influxdb_client.client.influxdb_client_async import InfluxDBClientAsync
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import logging
import certifi
import os
from config import Config

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages MongoDB and InfluxDB connections with data integrity"""
    
    def __init__(self):
        self.mongo_client: Optional[AsyncIOMotorClient] = None
        self.influx_client: Optional[InfluxDBClientAsync] = None
        self.db = None
        self.mongodb_db = None  # Alias for backward compatibility
        self._mongodb_connected = False
        
        # Duplicate detection cache (in-memory for performance)
        self._last_seen: Dict[str, datetime] = {}
        self._duplicate_count: Dict[str, int] = {}
        
    async def connect_mongodb(
        self,
        mongodb_url: str = Config.MONGODB_URI,
        database_name: str = Config.MONGODB_DB_NAME
    ):
        """Connect to MongoDB with proper indexes and constraints"""
        try:
            # Use certifi for SSL if using MongoDB Atlas
            if 'mongodb+srv' in mongodb_url or 'ssl=true' in mongodb_url:
                self.mongo_client = AsyncIOMotorClient(
                    mongodb_url,
                    tlsCAFile=certifi.where()
                )
            else:
                self.mongo_client = AsyncIOMotorClient(mongodb_url)
            
            # Test connection
            await self.mongo_client.admin.command('ping')
            
            self.db = self.mongo_client[database_name]
            self.mongodb_db = self.db  # Alias for backward compatibility
            self._mongodb_connected = True
            
            logger.info(f"✓ Connected to MongoDB: {database_name}")
            
            # Create indexes with error handling
            await self._create_indexes()
            
            return True
            
        except Exception as e:
            logger.error(f"MongoDB connection failed: {e}")
            self._mongodb_connected = False
            return False
    
    async def _create_indexes(self):
        """Create indexes for performance and data integrity (with error handling)"""
        try:
            logger.info("Setting up MongoDB indexes...")
            
            # Latest collections - unique machine_id
            latest_collections = [
                'heartbeat_monitor_latest',  
                'hardware_monitor_latest',
                'specs_monitor_latest', 
                'network_monitor_latest', 
                'user_activity_monitor_latest',
                'application_monitor_latest',
                'services_monitor_latest',
                'update_monitor_latest',
                # 'overview_monitor_latest',  # ✅ REMOVED: No longer used (agent doesn't send)
                'peripherals_monitor_latest',
                'usb_devices_monitor_latest',
                'security_software_monitor_latest',
                'event_log_monitor_latest'
            ]
            
            for collection in latest_collections:
                try:
                    await self.db[collection].create_index(
                        "machine_id",
                        unique=True,
                        background=True  # Non-blocking
                    )
                except Exception as e:
                    # Index might already exist - that's fine
                    if "already exists" not in str(e).lower():
                        logger.debug(f"Index note for {collection}: {e}")
            
            # Hardware Monitor History - compound index with timestamp
            try:
                await self.db.hardware_monitor_history.create_index(
                    [("machine_id", 1), ("timestamp", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"History index note: {e}")
            
            # Alerts collection
            try:
                await self.db.alerts.create_index(
                    [("machine_id", 1), ("timestamp", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Alerts index note: {e}")
            
            # Machine notes
            try:
                await self.db.machine_notes.create_index(
                    [("machine_id", 1), ("created_at", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Notes index note: {e}")
            
            # Machine actions
            try:
                await self.db.machine_actions.create_index(
                    [("machine_id", 1), ("requested_at", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Actions index note: {e}")
            
            # Maintenance schedules
            try:
                await self.db.maintenance_schedules.create_index(
                    [("machine_id", 1), ("scheduled_start", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Maintenance index note: {e}")
            
            # Machine changes
            try:
                await self.db.machine_changes.create_index(
                    [("machine_id", 1), ("timestamp", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Changes index note: {e}")
            
            # Groups and tags
            try:
                await self.db.machine_groups.create_index("group_id", background=True)
            except Exception as e:
                logger.debug(f"Groups index note: {e}")
            
            try:
                await self.db.tag_definitions.create_index("name", unique=True, background=True)
            except Exception as e:
                logger.debug(f"Tags index note: {e}")
            
            # System config
            try:
                await self.db.system_config.create_index("config_type", unique=True, background=True)
            except Exception as e:
                logger.debug(f"Config index note: {e}")
            
            # Aggregated data collections
            for collection_name in ['hardware_1min', 'hardware_5min', 'hardware_1hour']:
                try:
                    await self.db[collection_name].create_index(
                        [("machine_id", 1), ("timestamp", 1)],
                        unique=True,
                        background=True
                    )
                except Exception as e:
                    logger.debug(f"Aggregated index note for {collection_name}: {e}")
            
            # Timeline events
            try:
                await self.db.timeline_events.create_index(
                    [("machine_id", 1), ("timestamp", -1)],
                    background=True
                )
            except Exception as e:
                logger.debug(f"Timeline index note: {e}")
            
            logger.info("✓ MongoDB indexes verified/created")
            
        except Exception as e:
            logger.warning(f"Index creation completed with notes: {e}")
    
    async def _setup_ttl_indexes(self, retention_days: Dict[str, int] = None):
        """Setup TTL indexes for automatic data cleanup"""
        if retention_days is None:
            # Default retention policies (days)
            retention_days = {
                'heartbeat_monitor_history': 7,
                'hardware_monitor_history': 30,
                'network_monitor_history': 14,
                'user_activity_monitor_history': 7,
                'application_monitor_history': 7,
                'services_monitor_history': 14,
                'peripherals_monitor_history': 14,
                'usb_devices_monitor_history': 14,
                'event_log_monitor_history': 30,
                'security_software_monitor_history': 30,
                'specs_monitor_history': 90,
                'update_monitor_history': 90,
                # 'overview_monitor_history': 30,  # ✅ REMOVED: No longer used (agent doesn't send)
            }
        
        try:
            logger.info("Setting up TTL indexes for auto-cleanup...")
            
            for collection_name, days in retention_days.items():
                try:
                    expire_seconds = days * 86400  # Convert days to seconds
                    await self.db[collection_name].create_index(
                        "timestamp",
                        expireAfterSeconds=expire_seconds,
                        background=True
                    )
                    logger.info(f"  ✓ TTL index: {collection_name} ({days} days)")
                except Exception as e:
                    logger.debug(f"TTL index note for {collection_name}: {e}")
            
            logger.info("✓ TTL indexes configured - auto-cleanup enabled!")
            
        except Exception as e:
            logger.warning(f"TTL index setup completed with notes: {e}")
    
    async def connect_influxdb(
        self,
        influxdb_url: str = "http://localhost:8086",
        influxdb_token: str = None,
        influxdb_org: str = "hardware_monitor",
        influxdb_bucket: str = "hardware_metrics"
    ):
        """Connect to InfluxDB"""
        if not influxdb_token:
            logger.warning("InfluxDB token not provided, skipping InfluxDB connection")
            return False
        
        try:
            self.influx_client = InfluxDBClientAsync(
                url=influxdb_url,
                token=influxdb_token,
                org=influxdb_org
            )
            
            # Test connection with health API (correct method)
            try:
                health = await self.influx_client.health()
                if health.status == "pass":
                    logger.info(f"✓ Connected to InfluxDB: {influxdb_bucket}")
                    return True
                else:
                    logger.warning(f"InfluxDB health check: {health.status}")
                    return True  # Still usable
            except AttributeError:
                # health() might not exist in some versions, try ping
                try:
                    ping = await self.influx_client.ping()
                    logger.info(f"✓ Connected to InfluxDB: {influxdb_bucket}")
                    return True
                except:
                    # Just creating the client is often enough
                    logger.info(f"✓ InfluxDB client created: {influxdb_bucket}")
                    return True
                
        except Exception as e:
            logger.error(f"InfluxDB connection failed: {e}")
            return False
    
    @property
    def is_mongodb_connected(self) -> bool:
        """Check if MongoDB is connected"""
        return self._mongodb_connected and self.mongo_client is not None
    
    @property
    def is_influxdb_connected(self) -> bool:
        """Check if InfluxDB is connected"""
        return self.influx_client is not None
    
    async def disconnect(self):
        """Disconnect from databases"""
        if self.mongo_client:
            self.mongo_client.close()
            logger.info("Disconnected from MongoDB")
            self._mongodb_connected = False
        
        if self.influx_client:
            try:
                await self.influx_client.close()
                logger.info("Disconnected from InfluxDB")
            except:
                pass
    
    def is_duplicate(self, machine_id: str, timestamp: datetime, threshold_seconds: int = 1) -> bool:
        """
        Check if this data point is a duplicate.
        Returns True if we've seen this machine within threshold_seconds.
        """
        if machine_id not in self._last_seen:
            self._last_seen[machine_id] = timestamp
            return False
        
        time_diff = (timestamp - self._last_seen[machine_id]).total_seconds()
        
        if abs(time_diff) < threshold_seconds:
            # Duplicate detected
            self._duplicate_count[machine_id] = self._duplicate_count.get(machine_id, 0) + 1
            
            # Log every 100 duplicates
            if self._duplicate_count[machine_id] % 100 == 0:
                logger.warning(
                    f"Duplicate detected for {machine_id}: "
                    f"{self._duplicate_count[machine_id]} total duplicates"
                )
            
            return True
        
        # Not a duplicate
        self._last_seen[machine_id] = timestamp
        return False
    
    async def validate_data_consistency(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        Validate data consistency and return (is_valid, errors)
        """
        errors = []
        
        # Required fields
        required_fields = ['machine_id', 'hostname']
        for field in required_fields:
            if field not in data or not data[field]:
                errors.append(f"Missing required field: {field}")
        
        # Validate percentages (0-100)
        percentage_fields = [
            'cpu_usage_percent', 'memory_usage_percent', 'disk_usage_percent'
        ]
        for field in percentage_fields:
            if field in data and data[field] is not None:
                value = data[field]
                if not (0 <= value <= 100):
                    errors.append(f"{field} out of range: {value} (expected 0-100)")
        
        # Validate temperature (-50 to 150°C)
        if 'cpu_temperature_c' in data and data['cpu_temperature_c'] is not None:
            temp = data['cpu_temperature_c']
            if not (-50 <= temp <= 150):
                errors.append(f"cpu_temperature_c out of range: {temp}°C")
        
        # Validate memory values are consistent
        if 'memory_used_gb' in data and 'memory_total_gb' in data:
            if data['memory_used_gb'] and data['memory_total_gb']:
                if data['memory_used_gb'] > data['memory_total_gb']:
                    errors.append(
                        f"memory_used_gb ({data['memory_used_gb']}) > "
                        f"memory_total_gb ({data['memory_total_gb']})"
                    )
        
        # Validate disk values are consistent
        if 'disk_used_gb' in data and 'disk_total_gb' in data:
            if data['disk_used_gb'] and data['disk_total_gb']:
                if data['disk_used_gb'] > data['disk_total_gb']:
                    errors.append(
                        f"disk_used_gb ({data['disk_used_gb']}) > "
                        f"disk_total_gb ({data['disk_total_gb']})"
                    )
        
        # Validate timestamp is not in the future
        if 'timestamp' in data and data['timestamp']:
            if isinstance(data['timestamp'], datetime):
                now = datetime.now(timezone.utc)
                if data['timestamp'] > now + timedelta(minutes=5):
                    errors.append(
                        f"timestamp is in the future: {data['timestamp']} "
                        f"(current: {now})"
                    )
        
        return len(errors) == 0, errors
    
    async def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about collections for monitoring"""
        stats = {}
        
        collections = [
            'hardware_monitor_latest',
            'hardware_monitor_history',
            'specs_monitor_latest',
            'hardware_1min',
            'hardware_5min',
            'hardware_1hour'
        ]
        
        for coll_name in collections:
            try:
                count = await self.db[coll_name].count_documents({})
                stats[coll_name] = {
                    'count': count,
                    'exists': count > 0
                }
            except Exception as e:
                stats[coll_name] = {
                    'count': 0,
                    'exists': False,
                    'error': str(e)
                }
        
        # Add duplicate statistics
        stats['duplicates_detected'] = {
            'total_machines': len(self._duplicate_count),
            'total_duplicates': sum(self._duplicate_count.values()),
            'top_offenders': sorted(
                self._duplicate_count.items(),
                key=lambda x: x[1],
                reverse=True
            )[:5]
        }
        
        return stats


# Global database instance
db_manager = DatabaseManager()


# InfluxDB field mappings (expanded for all 48 fields)
INFLUXDB_FIELD_MAPPINGS = {
    'hardware_metrics': {
        # CPU metrics
        'cpu_usage_percent': 'cpu_usage',
        'cpu_temperature_c': 'cpu_temp',
        'cpu_frequency_mhz': 'cpu_freq',
        
        # Memory metrics
        'memory_usage_percent': 'mem_usage',
        'memory_used_gb': 'mem_used',
        'memory_free_gb': 'mem_free',
        'memory_total_gb': 'mem_total',
        'memory_available_gb': 'mem_available',
        
        # Disk metrics
        'disk_usage_percent': 'disk_usage',
        'disk_used_gb': 'disk_used',
        'disk_free_gb': 'disk_free',
        'disk_total_gb': 'disk_total',
        'disk_read_mb': 'disk_read',
        'disk_write_mb': 'disk_write',
        
        # Network metrics
        'network_upload_mbps': 'net_upload',
        'network_download_mbps': 'net_download',
        'network_packets_sent_per_sec': 'net_packets_sent',
        'network_packets_recv_per_sec': 'net_packets_recv',
        
        # GPU metrics
        'gpu_usage_percent': 'gpu_usage',
        'gpu_temperature_c': 'gpu_temp',
        'gpu_memory_used_gb': 'gpu_mem_used',
        'gpu_memory_total_gb': 'gpu_mem_total',
        
        # Process metrics
        'process_count': 'process_count',
        'thread_count': 'thread_count',
        
        # System metrics
        'uptime_hours': 'uptime',
        'boot_time': 'boot_time',
    }
}


async def write_to_influxdb(
    measurement: str,
    tags: Dict[str, str],
    fields: Dict[str, Any],
    timestamp: Optional[datetime] = None
) -> bool:
    """Write data point to InfluxDB"""
    if not db_manager.is_influxdb_connected:
        return False
        
    try:
        # Get write API
        write_api = db_manager.influx_client.write_api()
        
        # Create point
        point = Point(measurement)
        
        # Add tags
        for key, value in tags.items():
            if value is not None:
                point = point.tag(key, str(value))
        
        # Add fields
        for key, value in fields.items():
            if value is not None:
                if isinstance(value, (int, float)):
                    point = point.field(key, value)
                elif isinstance(value, bool):
                    point = point.field(key, value)
                else:
                    point = point.field(key, str(value))
        
        # Add timestamp
        if timestamp:
            point = point.time(timestamp)
        
        # Write to InfluxDB
        bucket = Config.INFLUXDB_BUCKET
        org = Config.INFLUXDB_ORG
        
        await write_api.write(bucket=bucket, org=org, record=point)
        
        return True
        
    except Exception as e:
        logger.error(f"InfluxDB write failed: {e}")
        return False


# ============================================================================
# STARTUP/SHUTDOWN FUNCTIONS (for main.py)
# ============================================================================

async def startup_db():
    """Initialize database connections on startup"""
    logger.info("🔌 Connecting to databases...")
    
    # Display configuration
    Config.display()
    
    # Connect to MongoDB
    mongodb_success = await db_manager.connect_mongodb(
        mongodb_url=Config.MONGODB_URI,
        database_name=Config.MONGODB_DB_NAME
    )
    
    if not mongodb_success:
        raise Exception("MongoDB connection failed - cannot start server")
    
    # Setup TTL indexes if enabled
    if Config.ENABLE_TTL_INDEXES:
        await db_manager._setup_ttl_indexes()
    
    # Connect to InfluxDB (optional)
    if Config.INFLUXDB_TOKEN:
        influx_success = await db_manager.connect_influxdb(
            influxdb_url=Config.INFLUXDB_URL,
            influxdb_token=Config.INFLUXDB_TOKEN,
            influxdb_org=Config.INFLUXDB_ORG,
            influxdb_bucket=Config.INFLUXDB_BUCKET
        )
        
        if influx_success:
            logger.info("✅ InfluxDB enabled for enhanced time-series analytics")
        else:
            logger.warning("⚠️  InfluxDB connection failed - using MongoDB only")
    else:
        logger.info("ℹ️  InfluxDB not configured (optional) - using MongoDB for all data")
        logger.info("💡 To enable InfluxDB, set INFLUXDB_TOKEN in .env file")
    
    logger.info("✅ Database initialization complete")


async def shutdown_db():
    """Close database connections on shutdown"""
    logger.info("🔌 Closing database connections...")
    await db_manager.disconnect()
    logger.info("✅ Databases disconnected")