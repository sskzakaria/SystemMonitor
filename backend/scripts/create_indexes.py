"""
Database Indexes Creation Script
Creates all necessary indexes for optimal query performance

Usage:
    python scripts/create_indexes.py

Features:
- Creates indexes for all collections
- Handles existing indexes gracefully
- Provides detailed progress output
- Validates index creation
- Shows index statistics
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, TEXT
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class IndexCreator:
    """Creates and manages database indexes"""
    
    def __init__(self, mongodb_uri: str, database_name: str):
        self.mongodb_uri = mongodb_uri
        self.database_name = database_name
        self.client = None
        self.db = None
        self.created_count = 0
        self.existing_count = 0
        self.failed_count = 0
    
    async def connect(self):
        """Connect to MongoDB"""
        logger.info("=" * 80)
        logger.info("🔌 Connecting to MongoDB...")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client[self.database_name]
        
        # Test connection
        await self.client.admin.command('ping')
        logger.info("✅ Connected to MongoDB")
        logger.info(f"📊 Database: {self.database_name}")
        logger.info("=" * 80)
    
    async def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            logger.info("✅ Disconnected from MongoDB")
    
    async def create_index(self, collection_name: str, index_spec, unique=False, 
                          name=None, sparse=False, background=True):
        """Create a single index"""
        try:
            collection = self.db[collection_name]
            
            # Check if index already exists
            existing_indexes = await collection.index_information()
            
            if name and name in existing_indexes:
                logger.info(f"  ⏭️  Index '{name}' already exists")
                self.existing_count += 1
                return
            
            # Create index
            index_name = await collection.create_index(
                index_spec,
                unique=unique,
                name=name,
                sparse=sparse,
                background=background
            )
            
            logger.info(f"  ✅ Created index: {index_name}")
            self.created_count += 1
            
        except Exception as e:
            logger.error(f"  ❌ Failed to create index: {e}")
            self.failed_count += 1
    
    async def create_all_indexes(self):
        """Create all indexes for the monitoring system"""
        
        logger.info("\n" + "=" * 80)
        logger.info("🏗️  CREATING DATABASE INDEXES")
        logger.info("=" * 80 + "\n")
        
        # =====================================================================
        # CRITICAL INDEXES (Performance Essential)
        # =====================================================================
        
        logger.info("📌 CRITICAL INDEXES - Heartbeat Monitoring")
        logger.info("-" * 80)
        
        # Heartbeat Latest
        await self.create_index(
            "heartbeat_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        await self.create_index(
            "heartbeat_monitor_latest",
            [("timestamp", DESCENDING)],
            name="timestamp_desc"
        )
        await self.create_index(
            "heartbeat_monitor_latest",
            [("building", ASCENDING), ("room", ASCENDING)],
            name="building_room"
        )
        await self.create_index(
            "heartbeat_monitor_latest",
            [("status", ASCENDING)],
            name="status"
        )
        
        # Heartbeat Historical
        await self.create_index(
            "heartbeat_monitor_historical",
            [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_timestamp"
        )
        await self.create_index(
            "heartbeat_monitor_historical",
            [("timestamp", DESCENDING)],
            name="timestamp_desc"
        )
        
        logger.info("\n📌 CRITICAL INDEXES - Hardware Monitoring")
        logger.info("-" * 80)
        
        # Hardware Latest
        await self.create_index(
            "hardware_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        await self.create_index(
            "hardware_monitor_latest",
            [("cpu_usage_percent", DESCENDING)],
            name="cpu_usage_desc"
        )
        await self.create_index(
            "hardware_monitor_latest",
            [("memory_usage_percent", DESCENDING)],
            name="memory_usage_desc"
        )
        await self.create_index(
            "hardware_monitor_latest",
            [("disk_usage_percent", DESCENDING)],
            name="disk_usage_desc"
        )
        
        # Hardware Historical
        await self.create_index(
            "hardware_monitor_historical",
            [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_timestamp"
        )
        
        logger.info("\n📌 CRITICAL INDEXES - Events & Timeline")
        logger.info("-" * 80)
        
        # Events
        await self.create_index(
            "events",
            [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_timestamp"
        )
        await self.create_index(
            "events",
            [("event_type", ASCENDING), ("timestamp", DESCENDING)],
            name="type_timestamp"
        )
        await self.create_index(
            "events",
            [("timestamp", DESCENDING)],
            name="timestamp_desc"
        )
        await self.create_index(
            "events",
            [("severity", ASCENDING)],
            name="severity"
        )
        
        logger.info("\n📌 CRITICAL INDEXES - Alerts")
        logger.info("-" * 80)
        
        # Alerts
        await self.create_index(
            "alerts",
            [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_timestamp"
        )
        await self.create_index(
            "alerts",
            [("severity", ASCENDING), ("status", ASCENDING)],
            name="severity_status"
        )
        await self.create_index(
            "alerts",
            [("status", ASCENDING), ("timestamp", DESCENDING)],
            name="status_timestamp"
        )
        await self.create_index(
            "alerts",
            [("acknowledged", ASCENDING), ("timestamp", DESCENDING)],
            name="acknowledged_timestamp"
        )
        await self.create_index(
            "alerts",
            [("alert_type", ASCENDING)],
            name="alert_type"
        )
        
        logger.info("\n📌 CRITICAL INDEXES - User Sessions")
        logger.info("-" * 80)
        
        # User Sessions
        await self.create_index(
            "user_sessions",
            [("machine_id", ASCENDING), ("start_time", DESCENDING)],
            name="machine_start_time"
        )
        await self.create_index(
            "user_sessions",
            [("active_user", ASCENDING)],
            name="active_user"
        )
        await self.create_index(
            "user_sessions",
            [("active", ASCENDING), ("machine_id", ASCENDING)],
            name="active_machine"
        )
        await self.create_index(
            "user_sessions",
            [("start_time", DESCENDING)],
            name="start_time_desc"
        )
        
        # =====================================================================
        # PERFORMANCE INDEXES (Recommended)
        # =====================================================================
        
        logger.info("\n📊 PERFORMANCE INDEXES - Organization")
        logger.info("-" * 80)
        
        # Tags and Groups on machines
        await self.create_index(
            "heartbeat_monitor_latest",
            [("tags", ASCENDING)],
            name="tags"
        )
        await self.create_index(
            "heartbeat_monitor_latest",
            [("groups", ASCENDING)],
            name="groups"
        )
        
        # Tag Definitions
        await self.create_index(
            "tag_definitions",
            [("name", ASCENDING)],
            unique=True,
            name="name_unique"
        )
        
        # Machine Groups
        await self.create_index(
            "machine_groups",
            [("group_id", ASCENDING)],
            unique=True,
            name="group_id_unique"
        )
        await self.create_index(
            "machine_groups",
            [("group_name", ASCENDING)],
            name="group_name"
        )
        
        logger.info("\n📊 PERFORMANCE INDEXES - Network Monitoring")
        logger.info("-" * 80)
        
        # Network Latest
        await self.create_index(
            "network_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        
        # Network Historical
        await self.create_index(
            "network_monitor_historical",
            [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_timestamp"
        )
        
        logger.info("\n📊 PERFORMANCE INDEXES - Applications & Services")
        logger.info("-" * 80)
        
        # Application Monitor
        await self.create_index(
            "application_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        
        # Services Monitor
        await self.create_index(
            "services_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        
        # Specs Monitor
        await self.create_index(
            "specs_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        
        logger.info("\n📊 PERFORMANCE INDEXES - System Updates & Security")
        logger.info("-" * 80)
        
        # Update Monitor
        await self.create_index(
            "update_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        await self.create_index(
            "update_monitor_latest",
            [("pending_updates", DESCENDING)],
            name="pending_updates_desc"
        )
        
        # Security Monitor
        await self.create_index(
            "security_monitor_latest",
            [("machine_id", ASCENDING)],
            unique=True,
            name="machine_id_unique"
        )
        
        # =====================================================================
        # COMPOUND INDEXES (Advanced Queries)
        # =====================================================================
        
        logger.info("\n🔍 COMPOUND INDEXES - Complex Queries")
        logger.info("-" * 80)
        
        # Status + Location (Dashboard filters)
        await self.create_index(
            "heartbeat_monitor_latest",
            [("status", ASCENDING), ("building", ASCENDING)],
            name="status_building"
        )
        
        # Alerts by status + severity (Alert dashboard)
        await self.create_index(
            "alerts",
            [("status", ASCENDING), ("severity", DESCENDING), ("timestamp", DESCENDING)],
            name="status_severity_timestamp"
        )
        
        # Active sessions by machine
        await self.create_index(
            "user_sessions",
            [("active", ASCENDING), ("machine_id", ASCENDING), ("start_time", DESCENDING)],
            name="active_machine_time"
        )
        
        # Events by machine and type
        await self.create_index(
            "events",
            [("machine_id", ASCENDING), ("event_type", ASCENDING), ("timestamp", DESCENDING)],
            name="machine_type_timestamp"
        )
        
        # =====================================================================
        # TEXT INDEXES (Search Functionality)
        # =====================================================================
        
        logger.info("\n🔎 TEXT INDEXES - Search")
        logger.info("-" * 80)
        
        # Machine search
        await self.create_index(
            "heartbeat_monitor_latest",
            [
                ("machine_id", TEXT),
                ("hostname", TEXT),
                ("building", TEXT),
                ("room", TEXT)
            ],
            name="machine_search_text"
        )
        
        # Notes search
        await self.create_index(
            "machine_notes",
            [("note_text", TEXT), ("category", TEXT)],
            name="notes_search_text"
        )
        
        # =====================================================================
        # MAINTENANCE & ADMIN INDEXES
        # =====================================================================
        
        logger.info("\n🔧 MAINTENANCE INDEXES")
        logger.info("-" * 80)
        
        # Machine Notes
        await self.create_index(
            "machine_notes",
            [("machine_id", ASCENDING), ("created_at", DESCENDING)],
            name="machine_created"
        )
        await self.create_index(
            "machine_notes",
            [("category", ASCENDING)],
            name="category"
        )
        await self.create_index(
            "machine_notes",
            [("priority", ASCENDING)],
            name="priority"
        )
        
        # Machine Actions
        await self.create_index(
            "machine_actions",
            [("machine_id", ASCENDING), ("status", ASCENDING)],
            name="machine_status"
        )
        await self.create_index(
            "machine_actions",
            [("action_type", ASCENDING)],
            name="action_type"
        )
        await self.create_index(
            "machine_actions",
            [("requested_at", DESCENDING)],
            name="requested_at_desc"
        )
        
        # System Config
        await self.create_index(
            "system_config",
            [("config_type", ASCENDING)],
            unique=True,
            name="config_type_unique"
        )
        
        # =====================================================================
        # SPARSE INDEXES (Optional Fields)
        # =====================================================================
        
        logger.info("\n🎯 SPARSE INDEXES - Optional Fields")
        logger.info("-" * 80)
        
        # Maintenance mode (only indexed when set)
        await self.create_index(
            "heartbeat_monitor_latest",
            [("maintenance_mode", ASCENDING)],
            sparse=True,
            name="maintenance_mode_sparse"
        )
        
        # Active user (only when user is logged in)
        await self.create_index(
            "heartbeat_monitor_latest",
            [("active_user", ASCENDING)],
            sparse=True,
            name="active_user_sparse"
        )
    
    async def show_statistics(self):
        """Show index statistics"""
        logger.info("\n" + "=" * 80)
        logger.info("📊 INDEX STATISTICS")
        logger.info("=" * 80)
        
        # Get all collections
        collections = await self.db.list_collection_names()
        
        total_indexes = 0
        
        for collection_name in sorted(collections):
            collection = self.db[collection_name]
            indexes = await collection.index_information()
            index_count = len(indexes)
            total_indexes += index_count
            
            if index_count > 1:  # More than just _id index
                logger.info(f"\n📁 {collection_name}")
                for index_name, index_info in indexes.items():
                    if index_name != "_id_":
                        keys = index_info.get('key', [])
                        unique = " [UNIQUE]" if index_info.get('unique') else ""
                        sparse = " [SPARSE]" if index_info.get('sparse') else ""
                        text = " [TEXT]" if any(k[1] == 'text' for k in keys) else ""
                        logger.info(f"  ✓ {index_name}{unique}{sparse}{text}")
        
        logger.info("\n" + "=" * 80)
        logger.info(f"📊 Total Collections: {len(collections)}")
        logger.info(f"📊 Total Indexes: {total_indexes}")
        logger.info(f"✅ Created: {self.created_count}")
        logger.info(f"⏭️  Already Existed: {self.existing_count}")
        logger.info(f"❌ Failed: {self.failed_count}")
        logger.info("=" * 80)
    
    async def validate_indexes(self):
        """Validate that critical indexes exist"""
        logger.info("\n" + "=" * 80)
        logger.info("🔍 VALIDATING CRITICAL INDEXES")
        logger.info("=" * 80 + "\n")
        
        critical_indexes = [
            ("heartbeat_monitor_latest", "machine_id_unique"),
            ("hardware_monitor_latest", "machine_id_unique"),
            ("events", "machine_timestamp"),
            ("alerts", "severity_status"),
            ("user_sessions", "machine_start_time"),
        ]
        
        all_valid = True
        
        for collection_name, index_name in critical_indexes:
            try:
                collection = self.db[collection_name]
                indexes = await collection.index_information()
                
                if index_name in indexes:
                    logger.info(f"✅ {collection_name}.{index_name}")
                else:
                    logger.error(f"❌ {collection_name}.{index_name} - MISSING!")
                    all_valid = False
            except Exception as e:
                logger.error(f"❌ {collection_name}.{index_name} - ERROR: {e}")
                all_valid = False
        
        logger.info("\n" + "=" * 80)
        if all_valid:
            logger.info("✅ ALL CRITICAL INDEXES VALID")
        else:
            logger.error("❌ SOME CRITICAL INDEXES MISSING!")
        logger.info("=" * 80)
        
        return all_valid


async def main():
    """Main execution"""
    
    # Configuration
    MONGODB_URI = "mongodb://localhost:27017"
    DATABASE_NAME = "university_monitoring"
    
    # Allow override from environment
    import os
    MONGODB_URI = os.getenv("MONGODB_URI", MONGODB_URI)
    DATABASE_NAME = os.getenv("MONGODB_DB_NAME", DATABASE_NAME)
    
    logger.info("\n" + "=" * 80)
    logger.info("🏗️  DATABASE INDEX CREATION SCRIPT")
    logger.info("=" * 80)
    logger.info(f"📍 MongoDB URI: {MONGODB_URI}")
    logger.info(f"📊 Database: {DATABASE_NAME}")
    logger.info(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 80)
    
    creator = IndexCreator(MONGODB_URI, DATABASE_NAME)
    
    try:
        # Connect
        await creator.connect()
        
        # Create indexes
        await creator.create_all_indexes()
        
        # Show statistics
        await creator.show_statistics()
        
        # Validate
        valid = await creator.validate_indexes()
        
        # Summary
        logger.info("\n" + "=" * 80)
        logger.info("✅ INDEX CREATION COMPLETE")
        logger.info("=" * 80)
        logger.info(f"⏰ Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"📊 New Indexes Created: {creator.created_count}")
        logger.info(f"📊 Indexes Already Existed: {creator.existing_count}")
        logger.info(f"📊 Failed: {creator.failed_count}")
        logger.info("=" * 80)
        
        if valid and creator.failed_count == 0:
            logger.info("🎉 SUCCESS - All indexes created and validated!")
            return 0
        else:
            logger.error("⚠️  WARNING - Some issues detected. Review output above.")
            return 1
        
    except Exception as e:
        logger.error(f"\n❌ FATAL ERROR: {e}", exc_info=True)
        return 1
    
    finally:
        await creator.disconnect()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
