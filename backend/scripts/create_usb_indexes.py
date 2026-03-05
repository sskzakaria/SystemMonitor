"""
USB Collections Index Setup Script

Creates MongoDB indexes for the USB monitoring collections:
- usb_snapshots: One document per machine
- usb_events: Append-only event log
- usb_audit: Ever-seen device registry

Run this once at startup or as a migration.
"""

from pymongo import MongoClient, ASCENDING, DESCENDING
from backend.config import settings
from backend.utils.logging_config import get_logger

logger = get_logger(__name__)


def create_usb_indexes(db):
    """Create indexes for USB monitoring collections"""
    
    try:
        # ========================================================================
        # usb_snapshots: One document per machine (unique on computer_id)
        # ========================================================================
        logger.info("Creating indexes for usb_snapshots...")
        db.usb_snapshots.create_index(
            [("computer_id", ASCENDING)],
            unique=True,
            name="idx_computer_id_unique"
        )
        db.usb_snapshots.create_index(
            [("captured_at", DESCENDING)],
            name="idx_captured_at"
        )
        logger.info("✓ usb_snapshots indexes created")
        
        # ========================================================================
        # usb_events: Queried by machine + time descending
        # ========================================================================
        logger.info("Creating indexes for usb_events...")
        db.usb_events.create_index(
            [("computer_id", ASCENDING), ("occurred_at", DESCENDING)],
            name="idx_computer_time"
        )
        db.usb_events.create_index(
            [("computer_id", ASCENDING), ("action", ASCENDING), ("occurred_at", DESCENDING)],
            name="idx_computer_action_time"
        )
        db.usb_events.create_index(
            [("occurred_at", DESCENDING)],
            name="idx_occurred_at"
        )
        # Index for device tracking
        db.usb_events.create_index(
            [("vid_pid", ASCENDING), ("occurred_at", DESCENDING)],
            name="idx_vidpid_time"
        )
        logger.info("✓ usb_events indexes created")
        
        # ========================================================================
        # usb_audit: Upsert key is (computer_id, serial)
        # ========================================================================
        logger.info("Creating indexes for usb_audit...")
        db.usb_audit.create_index(
            [("computer_id", ASCENDING), ("serial", ASCENDING)],
            unique=True,
            name="idx_computer_serial_unique"
        )
        db.usb_audit.create_index(
            [("last_seen", DESCENDING)],
            name="idx_last_seen"
        )
        db.usb_audit.create_index(
            [("vid_pid", ASCENDING)],
            name="idx_vidpid"
        )
        logger.info("✓ usb_audit indexes created")
        
        logger.info("All USB collection indexes created successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to create USB indexes: {e}")
        return False


if __name__ == "__main__":
    # Connect to MongoDB
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DATABASE]
    
    # Create indexes
    success = create_usb_indexes(db)
    
    if success:
        print("✓ USB indexes created successfully")
    else:
        print("✗ Failed to create USB indexes")
    
    client.close()
