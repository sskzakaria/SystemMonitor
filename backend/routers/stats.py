"""
Analytics and statistics endpoints
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from collections import defaultdict
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from utils.adapters import adapt_document
from utils.helpers import calculate_machine_status, calculate_health_score
import re

router = APIRouter(prefix="/api/v1", tags=["analytics"])
logger = logging.getLogger("university_monitoring")



def calculate_average_cpu_age(specs_docs: list) -> float:
    """
    Calculate average CPU age from CPU models
    
    Attempts to extract release year from CPU model names
    Returns: Average CPU age in years, or 4.5 as fallback
    """
    if not specs_docs:
        return 4.5
    
    current_year = datetime.now().year
    ages = []
    
    for spec in specs_docs:
        cpu_model = spec.get('cpu_model', '')
        if not cpu_model or cpu_model == 'Unknown':
            continue
        
        # Try to detect generation/year from model name
        release_year = detect_cpu_release_year(cpu_model)
        
        if release_year:
            age = current_year - release_year
            ages.append(age)
    
    if ages:
        return round(sum(ages) / len(ages), 1)
    else:
        return 4.5  # Default fallback


def detect_cpu_release_year(cpu_model: str) -> Optional[int]:
    """
    Detect CPU release year from model name
    
    Examples:
        "Intel Core i7-12700K" -> 12th gen -> 2021
        "Intel Core i5-10400" -> 10th gen -> 2020
        "AMD Ryzen 7 5800X" -> 5000 series -> 2020
        "AMD Ryzen 9 7950X" -> 7000 series -> 2022
    
    Returns: Estimated release year or None
    """
    cpu_model_lower = cpu_model.lower()
    
    # Intel Core generations (approximate years)
    intel_generations = {
        14: 2023, 13: 2022, 12: 2021, 11: 2020, 10: 2019,
        9: 2018, 8: 2017, 7: 2016, 6: 2015, 5: 2015,
        4: 2013, 3: 2012, 2: 2011,
    }
    
    # AMD Ryzen generations (approximate years)
    amd_generations = {
        9000: 2024, 8000: 2024, 7000: 2022, 6000: 2022,
        5000: 2020, 4000: 2020, 3000: 2019, 2000: 2018, 1000: 2017,
    }
    
    # Try Intel detection
    if 'intel' in cpu_model_lower:
        match = re.search(r'i[3579]-(\d{2,5})', cpu_model_lower)
        if match:
            model_number = match.group(1)
            gen = int(model_number[:2])  # First 2 digits = generation
            return intel_generations.get(gen)
    
    # Try AMD Ryzen detection
    if 'ryzen' in cpu_model_lower or 'amd' in cpu_model_lower:
        match = re.search(r'(\d{1})(\d{3})', cpu_model_lower)
        if match:
            series = int(match.group(1)) * 1000  # Convert 5 -> 5000
            return amd_generations.get(series)
    
    return None

@router.get("/stats/overview")
async def get_stats_overview(user: OptionalUser = Depends(get_optional_user)):
    """Get system-wide statistics overview with hardware averages"""
    
    # ========== Existing heartbeat logic (keep as-is) ==========
    cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
    
    total = 0
    online = 0
    idle = 0
    in_use = 0
    offline = 0
    
    cpu_total = 0
    memory_total = 0
    disk_total = 0
    health_total = 0
    
    async for doc in cursor:
        total += 1
        adapted = adapt_document(doc, "heartbeat")
        status = calculate_machine_status(adapted)
        
        if status == "in-use":
            in_use += 1
        elif status == "idle":
            idle += 1
        elif status == "offline":
            offline += 1
        
        if status != "offline":
            online += 1
            cpu_total += adapted.get("cpu_usage_percent", 0)
            memory_total += adapted.get("memory_usage_percent", 0)
            disk_total += adapted.get("disk_usage_percent", 0)
            health_total += adapted.get("health_score", calculate_health_score(adapted))
    
    # ========== NEW: Calculate hardware averages ==========
    specs_cursor = db_manager.mongodb_db.specs_monitor_latest.find({})
    specs_docs = await specs_cursor.to_list(length=None)
    
    # Calculate RAM and storage averages
    total_ram = sum(s.get('memory_total_gb', 0) for s in specs_docs)
    total_storage = sum(s.get('disk_total_gb', 0) for s in specs_docs)
    
    specs_count = len(specs_docs) if specs_docs else 1
    avg_ram_gb = round(total_ram / specs_count, 1) if specs_count > 0 else 16
    avg_storage_gb = round(total_storage / specs_count, 0) if specs_count > 0 else 512
    
    # Calculate CPU age
    avg_cpu_age = calculate_average_cpu_age(specs_docs)
    
    # ========== Return enhanced response ==========
    return {
        # Existing fields
        "total_machines": total,
        "online": online,
        "offline": offline,
        "in_use": in_use,
        "idle": idle,
        "avg_cpu_usage": cpu_total / online if online > 0 else 0,
        "avg_memory_usage": memory_total / online if online > 0 else 0,
        "avg_disk_usage": disk_total / online if online > 0 else 0,
        "avg_health_score": health_total / online if online > 0 else 0,
        
        "avg_ram_gb": avg_ram_gb,
        "avg_storage_gb": avg_storage_gb,
        "avg_cpu_age": avg_cpu_age,
    }


@router.get("/stats/by-building")
async def get_stats_by_building(user: OptionalUser = Depends(get_optional_user)):
    """Get statistics grouped by building"""
    cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
    
    buildings = defaultdict(lambda: {
        "total": 0, "online": 0, "offline": 0,
        "in_use": 0, "idle": 0
    })
    
    async for doc in cursor:
        adapted = adapt_document(doc, "heartbeat")
        building = adapted.get("building", "Unknown")
        status = calculate_machine_status(adapted)
        
        buildings[building]["total"] += 1
        if status == "offline":
            buildings[building]["offline"] += 1
        else:
            buildings[building]["online"] += 1
            if status == "in-use":
                buildings[building]["in_use"] += 1
            elif status == "idle":
                buildings[building]["idle"] += 1
    
    return {"buildings": dict(buildings)}


@router.get("/stats/by-room")
async def get_stats_by_room(
    building: Optional[str] = None,
    user: OptionalUser = Depends(get_optional_user)
):
    """Get statistics grouped by room"""
    query = {}
    if building:
        query["building"] = building
    
    cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find(query)
    
    rooms = defaultdict(lambda: {
        "building": "",
        "total": 0,
        "online": 0,
        "offline": 0,
        "in_use": 0,
        "idle": 0
    })
    
    async for doc in cursor:
        adapted = adapt_document(doc, "heartbeat")
        building = adapted.get("building", "Unknown")
        room = adapted.get("room", "Unknown")
        room_key = f"{building}-{room}"
        status = calculate_machine_status(adapted)
        
        rooms[room_key]["building"] = building
        rooms[room_key]["room"] = room
        rooms[room_key]["total"] += 1
        
        if status == "offline":
            rooms[room_key]["offline"] += 1
        else:
            rooms[room_key]["online"] += 1
            if status == "in-use":
                rooms[room_key]["in_use"] += 1
            elif status == "idle":
                rooms[room_key]["idle"] += 1
    
    return {"rooms": list(rooms.values())}


@router.get("/stats/by-status")
async def get_stats_by_status(user: OptionalUser = Depends(get_optional_user)):
    """Get machine counts by status"""
    cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
    
    statuses = {"online": 0, "offline": 0, "in-use": 0, "idle": 0}
    
    async for doc in cursor:
        adapted = adapt_document(doc, "heartbeat")
        status = calculate_machine_status(adapted)
        
        if status == "offline":
            statuses["offline"] += 1
        elif status == "in-use":
            statuses["online"] += 1
            statuses["in-use"] += 1
        elif status == "idle":
            statuses["online"] += 1
            statuses["idle"] += 1
    
    return statuses


@router.get("/stats/resource-usage")
async def get_resource_usage_stats(user: OptionalUser = Depends(get_optional_user)):
    """Get resource usage statistics"""
    cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find({})
    
    high_cpu = 0
    high_memory = 0
    high_disk = 0
    total_online = 0
    
    async for doc in cursor:
        adapted = adapt_document(doc, "heartbeat")
        if calculate_machine_status(adapted) != "offline":
            total_online += 1
            
            if adapted.get("cpu_usage_percent", 0) > 80:
                high_cpu += 1
            if adapted.get("memory_usage_percent", 0) > 80:
                high_memory += 1
            if adapted.get("disk_usage_percent", 0) > 80:
                high_disk += 1
    
    return {
        "high_cpu_usage": high_cpu,
        "high_memory_usage": high_memory,
        "high_disk_usage": high_disk,
        "total_online": total_online
    }


@router.get("/stats/alerts-summary")
async def get_alerts_summary(user: OptionalUser = Depends(get_optional_user)):
    """Get summary of alerts"""
    total = await db_manager.mongodb_db.alerts.count_documents({})
    active = await db_manager.mongodb_db.alerts.count_documents({"acknowledged": False})
    critical = await db_manager.mongodb_db.alerts.count_documents({"severity": "critical", "acknowledged": False})
    warning = await db_manager.mongodb_db.alerts.count_documents({"severity": "warning", "acknowledged": False})
    
    return {
        "total_alerts": total,
        "active_alerts": active,
        "critical_alerts": critical,
        "warning_alerts": warning
    }
