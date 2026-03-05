"""
USB Monitoring Router - v3.0 (Snapshot-Diff + Registry Audit)

Handles USB device monitoring data from agents using the snapshot-diff architecture:
- POST /api/computers/<id>/usb - Ingests snapshot, events, and audit data
- GET /api/usb/current/<computer_id> - Current USB snapshot
- GET /api/usb/history/<computer_id> - Connect/disconnect event history
- GET /api/usb/audit/<computer_id> - Registry audit (ever-seen devices)

Collections:
- usb_snapshots: One document per machine (upserted each cycle)
- usb_events: Append-only connect/disconnect event log
- usb_audit: Registry-based ever-seen device list (USBSTOR)
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo import UpdateOne
import logging

from database import db_manager

logger = logging.getLogger(__name__)
router = APIRouter()

# ============================================================================
# Pydantic Models
# ============================================================================

class USBDevice(BaseModel):
    """USB device in snapshot"""
    name: str
    device_id: str
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    status: Optional[str] = None
    vid: Optional[str] = None
    pid: Optional[str] = None
    vid_pid: Optional[str] = None
    pnp_class: Optional[str] = None
    service: Optional[str] = None
    is_root_hub: bool = False
    all_device_ids: Optional[List[str]] = None
    interface_count: Optional[int] = None  # Number of Windows interfaces for this physical device


class USBEvent(BaseModel):
    """USB connect/disconnect event"""
    timestamp: str
    action: str  # "connected" or "disconnected"
    device_id: Optional[str] = None
    name: Optional[str] = None
    vid: Optional[str] = None
    pid: Optional[str] = None
    vid_pid: Optional[str] = None
    source: str = "snapshot_diff"


class USBAuditEntry(BaseModel):
    """Registry audit entry (USBSTOR)"""
    device_class: Optional[str] = None
    instance: Optional[str] = None
    friendly_name: Optional[str] = None
    vendor: Optional[str] = None
    product: Optional[str] = None
    revision: Optional[str] = None
    serial: Optional[str] = None
    manufacturer: Optional[str] = None
    vid: Optional[str] = None
    pid: Optional[str] = None
    vid_pid: Optional[str] = None
    source: str = "registry_usbstor"


class USBIngestionPayload(BaseModel):
    """Payload from agent POST /api/computers/<id>/usb"""
    timestamp: str
    snapshot: List[USBDevice] = Field(default_factory=list)
    events: List[USBEvent] = Field(default_factory=list)
    audit: List[USBAuditEntry] = Field(default_factory=list)


# ============================================================================
# Ingestion Endpoint
# ============================================================================

@router.post("/computers/{computer_id}/usb")
async def ingest_usb_data(computer_id: str, payload: USBIngestionPayload):
    """
    Ingest USB monitoring data from agent.
    
    This endpoint receives:
    - snapshot: Current connected USB devices (deduplicated)
    - events: Connect/disconnect events since last cycle
    - audit: Registry-based ever-seen device list
    
    Data is stored in three collections:
    - usb_snapshots: One doc per machine (upserted)
    - usb_events: Append-only event log
    - usb_audit: Ever-seen device registry (upserted by computer_id + serial)
    """
    try:
        db = db_manager.db
        now = datetime.now(timezone.utc)
        
        # Parse timestamp from payload
        try:
            captured_at = datetime.fromisoformat(payload.timestamp.replace('Z', '+00:00'))
        except:
            captured_at = now
        
        # 1. Upsert snapshot (replace entire document for this machine)
        snapshot_devices = [dev.model_dump() for dev in payload.snapshot]
        db.usb_snapshots.update_one(
            {'computer_id': computer_id},
            {'$set': {
                'computer_id': computer_id,
                'captured_at': captured_at,
                'devices': snapshot_devices,
                'device_count': len(snapshot_devices),
                'updated_at': now
            }},
            upsert=True
        )
        
        # 2. Append events (bulk insert, skip if empty)
        if payload.events:
            event_docs = []
            for ev in payload.events:
                try:
                    occurred_at = datetime.fromisoformat(ev.timestamp.replace('Z', '+00:00'))
                except:
                    occurred_at = now
                
                event_docs.append({
                    'computer_id': computer_id,
                    'occurred_at': occurred_at,
                    'action': ev.action,
                    'device_id': ev.device_id,
                    'name': ev.name,
                    'vid': ev.vid,
                    'pid': ev.pid,
                    'vid_pid': ev.vid_pid,
                    'source': ev.source,
                    'created_at': now
                })
            
            db.usb_events.insert_many(event_docs)
            logger.info(f"Inserted {len(event_docs)} USB events for {computer_id}")
        
        # 3. Upsert audit entries (bulk, keyed on computer_id + serial)
        if payload.audit:
            ops = []
            for audit_entry in payload.audit:
                audit_dict = audit_entry.model_dump()
                serial = audit_dict.get('serial') or audit_dict.get('instance', 'unknown')
                
                ops.append(UpdateOne(
                    {'computer_id': computer_id, 'serial': serial},
                    {
                        '$set': {
                            'friendly_name': audit_dict.get('friendly_name'),
                            'vendor': audit_dict.get('vendor'),
                            'product': audit_dict.get('product'),
                            'vid': audit_dict.get('vid'),
                            'pid': audit_dict.get('pid'),
                            'vid_pid': audit_dict.get('vid_pid'),
                            'device_class': audit_dict.get('device_class'),
                            'revision': audit_dict.get('revision'),
                            'manufacturer': audit_dict.get('manufacturer'),
                            'source': audit_dict.get('source', 'registry_usbstor'),
                            'last_seen': now,
                        },
                        '$setOnInsert': {
                            'computer_id': computer_id,
                            'serial': serial,
                            'first_seen': now,
                        }
                    },
                    upsert=True
                ))
            
            if ops:
                db.usb_audit.bulk_write(ops)
                logger.info(f"Upserted {len(ops)} USB audit entries for {computer_id}")
        
        return {
            'ok': True,
            'computer_id': computer_id,
            'snapshot_count': len(snapshot_devices),
            'events_count': len(payload.events),
            'audit_count': len(payload.audit)
        }
        
    except Exception as e:
        logger.error(f"USB ingestion failed for {computer_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Read Endpoints
# ============================================================================

@router.get("/usb/current/{computer_id}")
async def get_usb_current(computer_id: str):
    """
    Get current USB snapshot for a machine.
    
    Returns the most recent snapshot with all connected devices.
    """
    try:
        db = db_manager.db
        doc = db.usb_snapshots.find_one(
            {'computer_id': computer_id},
            {'_id': 0}
        )
        
        if not doc:
            return {
                'computer_id': computer_id,
                'devices': [],
                'device_count': 0,
                'captured_at': None
            }
        
        return doc
        
    except Exception as e:
        logger.error(f"Failed to fetch USB snapshot for {computer_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usb/history/{computer_id}")
async def get_usb_history(
    computer_id: str,
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    action: Optional[str] = Query(None, regex="^(connected|disconnected)$")
):
    """
    Get USB event history for a machine.
    
    Returns connect/disconnect events in reverse chronological order.
    
    Query parameters:
    - limit: Max events to return (1-1000, default 100)
    - skip: Number of events to skip (for pagination)
    - action: Filter by action type ("connected" or "disconnected")
    """
    try:
        db = db_manager.db
        
        # Build query
        query: Dict[str, Any] = {'computer_id': computer_id}
        if action:
            query['action'] = action
        
        # Execute query
        events = list(db.usb_events.find(
            query,
            {'_id': 0}
        ).sort('occurred_at', -1).skip(skip).limit(limit))
        
        # Convert datetime objects to ISO strings
        for event in events:
            if 'occurred_at' in event and isinstance(event['occurred_at'], datetime):
                event['occurred_at'] = event['occurred_at'].isoformat()
            if 'created_at' in event and isinstance(event['created_at'], datetime):
                event['created_at'] = event['created_at'].isoformat()
        
        return {
            'computer_id': computer_id,
            'events': events,
            'count': len(events),
            'limit': limit,
            'skip': skip,
            'filter': {'action': action} if action else None
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch USB history for {computer_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usb/audit/{computer_id}")
async def get_usb_audit(computer_id: str):
    """
    Get USB audit registry for a machine.
    
    Returns all devices ever connected to this machine (from Windows registry USBSTOR).
    Sorted by last_seen descending.
    """
    try:
        db = db_manager.db
        
        devices = list(db.usb_audit.find(
            {'computer_id': computer_id},
            {'_id': 0}
        ).sort('last_seen', -1))
        
        # Convert datetime objects to ISO strings
        for device in devices:
            if 'first_seen' in device and isinstance(device['first_seen'], datetime):
                device['first_seen'] = device['first_seen'].isoformat()
            if 'last_seen' in device and isinstance(device['last_seen'], datetime):
                device['last_seen'] = device['last_seen'].isoformat()
        
        return {
            'computer_id': computer_id,
            'devices': devices,
            'count': len(devices)
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch USB audit for {computer_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Statistics Endpoint (Optional)
# ============================================================================

@router.get("/usb/stats/{computer_id}")
async def get_usb_stats(computer_id: str):
    """
    Get USB statistics for a machine.
    
    Returns summary statistics including device counts and recent activity.
    """
    try:
        db = db_manager.db
        
        # Current snapshot stats
        snapshot = db.usb_snapshots.find_one({'computer_id': computer_id})
        current_count = snapshot['device_count'] if snapshot else 0
        
        # Event counts (last 24 hours)
        one_day_ago = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        recent_connects = db.usb_events.count_documents({
            'computer_id': computer_id,
            'action': 'connected',
            'occurred_at': {'$gte': one_day_ago}
        })
        recent_disconnects = db.usb_events.count_documents({
            'computer_id': computer_id,
            'action': 'disconnected',
            'occurred_at': {'$gte': one_day_ago}
        })
        
        # Total audit count
        audit_count = db.usb_audit.count_documents({'computer_id': computer_id})
        
        return {
            'computer_id': computer_id,
            'current_devices': current_count,
            'recent_connects_24h': recent_connects,
            'recent_disconnects_24h': recent_disconnects,
            'total_ever_seen': audit_count,
            'last_updated': snapshot['captured_at'].isoformat() if snapshot and 'captured_at' in snapshot else None
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch USB stats for {computer_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
