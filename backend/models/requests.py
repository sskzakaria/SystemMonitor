"""
Request models for API endpoints
Pydantic models for input validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# =============================================================================
# ALERT MANAGEMENT
# =============================================================================

class AcknowledgeAlertRequest(BaseModel):
    """Request model for acknowledging an alert"""
    note: Optional[str] = Field(None, max_length=500, description="Optional note about the acknowledgment")


# =============================================================================
# TIMELINE EVENTS
# =============================================================================

class CreateEventRequest(BaseModel):
    """Request model for creating a timeline event"""
    machine_id: str = Field(..., min_length=1, max_length=100)
    event_type: str = Field(..., min_length=1, max_length=50)
    message: str = Field(..., min_length=1, max_length=500)
    severity: str = Field("info", pattern="^(info|warning|error)$")
    details: Optional[dict] = Field(default_factory=dict)


# =============================================================================
# BULK OPERATIONS
# =============================================================================

class BulkMaintenanceRequest(BaseModel):
    """Request model for bulk maintenance operations"""
    machine_ids: List[str] = Field(..., min_length=1, description="List of machine IDs")
    reason: Optional[str] = Field(None, max_length=500)
    duration_hours: Optional[int] = Field(None, ge=1, le=168)
    notify_users: bool = Field(False)


class BulkTagsRequest(BaseModel):
    """Request model for bulk tag operations"""
    machine_ids: List[str] = Field(..., min_length=1)
    tags: List[str] = Field(..., min_length=1)


class BulkGroupRequest(BaseModel):
    """Request model for bulk group operations"""
    machine_ids: List[str] = Field(..., min_length=1)
    group_id: str = Field(..., min_length=1, max_length=100)


# =============================================================================
# TAG MANAGEMENT
# =============================================================================

class CreateTagRequest(BaseModel):
    """Request model for creating a tag"""
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    description: Optional[str] = Field(None, max_length=200)


# =============================================================================
# GROUP MANAGEMENT
# =============================================================================

class CreateGroupRequest(BaseModel):
    """Request model for creating a group"""
    group_id: str = Field(..., min_length=1, max_length=100)
    group_name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    machine_ids: List[str] = Field(default_factory=list)


class UpdateGroupRequest(BaseModel):
    """Request model for updating a group"""
    group_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    add_machines: Optional[List[str]] = Field(None)
    remove_machines: Optional[List[str]] = Field(None)


# =============================================================================
# MACHINE OPERATIONS
# =============================================================================

class MachineActionRequest(BaseModel):
    """Request for machine actions (restart, shutdown, etc.)"""
    action: str
    force: bool = False
    delay_seconds: int = 0


class UpdateTagsRequest(BaseModel):
    """Request to update machine tags"""
    tags: List[str]


class ScheduleMaintenanceRequest(BaseModel):
    """Request to schedule maintenance"""
    maintenance_type: str
    description: str
    scheduled_start: str
    scheduled_end: str
    technician: Optional[str] = None
    notify_users: bool = True


# =============================================================================
# NOTES MANAGEMENT
# =============================================================================

class CreateNoteRequest(BaseModel):
    """Request to create a note"""
    title: str
    content: str
    category: str = "general"
    priority: str = "medium"
    tags: List[str] = []


class UpdateNoteRequest(BaseModel):
    """Request to update a note"""
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None


# =============================================================================
# DATA INGESTION MODELS
# =============================================================================

class HeartbeatData(BaseModel):
    """Heartbeat data from monitoring agent"""
    machine_id: str
    hostname: str
    timestamp: datetime
    cpu_usage_percent: Optional[float] = None
    memory_usage_percent: Optional[float] = None
    disk_usage_percent: Optional[float] = None
    uptime_seconds: Optional[int] = None
    
    class Config:
        extra = "allow"


class HardwareData(BaseModel):
    """Hardware monitoring data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    cpu_usage_percent: Optional[float] = None
    memory_usage_percent: Optional[float] = None
    disk_usage_percent: Optional[float] = None
    
    class Config:
        extra = "allow"


class NetworkData(BaseModel):
    """Network monitoring data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    active_connections: Optional[int] = None
    
    class Config:
        extra = "allow"


class UserActivityData(BaseModel):
    """User activity data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    active_user: Optional[str] = None
    session_duration: Optional[int] = None
    
    class Config:
        extra = "allow"


class ApplicationData(BaseModel):
    """Application monitoring data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    installed_apps: Optional[List[Dict]] = None
    running_processes: Optional[List[Dict]] = None
    
    class Config:
        extra = "allow"


class ServicesData(BaseModel):
    """Services monitoring data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    total_services: Optional[int] = None
    running_services: Optional[int] = None
    
    class Config:
        extra = "allow"


class SpecsData(BaseModel):
    """Hardware specifications data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    cpu_model: Optional[str] = None
    total_memory_gb: Optional[float] = None
    os_version: Optional[str] = None
    
    class Config:
        extra = "allow"


class UpdateData(BaseModel):
    """System updates data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    pending_updates: Optional[int] = None
    
    class Config:
        extra = "allow"


class OverviewData(BaseModel):
    """System overview data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    system_status: Optional[str] = None
    
    class Config:
        extra = "allow"


class SecurityData(BaseModel):
    """Security monitoring data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    antivirus_status: Optional[str] = None
    firewall_enabled: Optional[bool] = None
    
    class Config:
        extra = "allow"


class PeripheralsData(BaseModel):
    """Peripherals data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    connected_devices: Optional[List[Dict]] = None
    
    class Config:
        extra = "allow"


class USBDevicesData(BaseModel):
    """USB devices data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    usb_devices: Optional[List[Dict]] = None
    
    class Config:
        extra = "allow"


class EventLogData(BaseModel):
    """Event log data"""
    machine_id: str
    hostname: str
    timestamp: datetime
    error_count: Optional[int] = None
    warning_count: Optional[int] = None
    
    class Config:
        extra = "allow"
