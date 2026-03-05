"""
Alerts management endpoints
Handles alert CRUD operations and acknowledgments
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from bson import ObjectId
from pymongo import DESCENDING
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from models.requests import AcknowledgeAlertRequest
from utils.helpers import clean_objectid
from utils.collections import ALERTS

router = APIRouter(prefix="/api/v1", tags=["alerts"])
logger = logging.getLogger(__name__)


@router.get("/alerts")
async def get_all_alerts(
    severity: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=1000),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get all alerts with filters"""
    try:
        query = {}
        if severity:
            query["severity"] = severity
        if acknowledged is not None:
            query["acknowledged"] = acknowledged
        
        cursor = db_manager.mongodb_db[ALERTS].find(query).sort("timestamp", DESCENDING).limit(limit)
        alerts = []
        async for doc in cursor:
            doc = clean_objectid(doc)
            alerts.append(doc)
        
        return {"alerts": alerts, "count": len(alerts)}
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/{alert_id}")
async def get_alert_details(
    alert_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get alert details"""
    try:
        alert = await db_manager.mongodb_db[ALERTS].find_one({"_id": ObjectId(alert_id)})
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return clean_objectid(alert)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching alert: {e}")
        raise HTTPException(status_code=400, detail="Invalid alert ID")


@router.post("/alerts")
async def create_alert(
    machine_id: str = Body(...),
    alert_type: str = Body(...),
    severity: str = Body(...),
    message: str = Body(...),
    details: dict = Body(default_factory=dict),
    user: OptionalUser = Depends(get_optional_user)
):
    """Create a new alert"""
    try:
        alert = {
            "machine_id": machine_id,
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
            "details": details,
            "timestamp": datetime.now(timezone.utc),
            "acknowledged": False,
            "acknowledged_by": None,
            "acknowledged_at": None,
            "created_by": user.username if user else "system"
        }
        result = await db_manager.mongodb_db[ALERTS].insert_one(alert)
        return {"alert_id": str(result.inserted_id), "status": "created"}
    except Exception as e:
        logger.error(f"Error creating alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/alerts/{alert_id}")
async def update_alert(
    alert_id: str = Path(...),
    severity: Optional[str] = Body(None),
    message: Optional[str] = Body(None),
    user: OptionalUser = Depends(get_optional_user)
):
    """Update alert"""
    try:
        update_data = {}
        if severity:
            update_data["severity"] = severity
        if message:
            update_data["message"] = message
        
        if update_data:
            result = await db_manager.mongodb_db[ALERTS].update_one(
                {"_id": ObjectId(alert_id)},
                {"$set": update_data}
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Alert not found")
        
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Delete alert"""
    try:
        result = await db_manager.mongodb_db[ALERTS].delete_one({"_id": ObjectId(alert_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str = Path(...),
    request: AcknowledgeAlertRequest = Body(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Acknowledge an alert"""
    try:
        result = await db_manager.mongodb_db[ALERTS].update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "acknowledged": True,
                    "acknowledged_by": user.username if user else "system",
                    "acknowledged_at": datetime.now(timezone.utc),
                    "acknowledgment_note": request.note
                }
            }
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"status": "acknowledged"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/alerts")
async def get_machine_alerts(
    machine_id: str = Path(...),
    limit: int = Query(50, ge=1, le=500),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get alerts for specific machine"""
    try:
        cursor = db_manager.mongodb_db[ALERTS].find(
            {"machine_id": machine_id}
        ).sort("timestamp", DESCENDING).limit(limit)
        
        alerts = []
        async for doc in cursor:
            alerts.append(clean_objectid(doc))
        
        return {"machine_id": machine_id, "alerts": alerts, "count": len(alerts)}
    except Exception as e:
        logger.error(f"Error fetching machine alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/active/count")
async def get_active_alerts_count(user: OptionalUser = Depends(get_optional_user)):
    """Get count of active (unacknowledged) alerts"""
    try:
        count = await db_manager.mongodb_db[ALERTS].count_documents({"acknowledged": False})
        return {"active_alerts": count}
    except Exception as e:
        logger.error(f"Error counting active alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))
