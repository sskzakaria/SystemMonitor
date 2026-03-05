# University Computer Monitoring System - API Documentation

**Version:** 4.0.0  
**Base URL:** `http://localhost:8001`  
**Total Endpoints:** 122+  
**Total Routers:** 16

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Handling](#error-handling)
5. [API Endpoints](#api-endpoints)
   - [Machines](#machines-10-endpoints)
   - [Events](#events-4-endpoints)
   - [Timeline](#timeline-5-endpoints)
   - [Alerts](#alerts-9-endpoints)
   - [Analytics](#analytics-8-endpoints)
   - [Statistics](#statistics-6-endpoints)
   - [Tags](#tags-7-endpoints)
   - [Groups](#groups-6-endpoints)
   - [Notes](#notes-5-endpoints)
   - [Sessions](#sessions-3-endpoints)
   - [Monitoring](#monitoring-21-endpoints)
   - [Maintenance](#maintenance-8-endpoints)
   - [Health](#health-4-endpoints)
   - [Admin](#admin-23-endpoints)
   - [Ingestion](#ingestion-2-endpoints)
   - [WebSocket](#websocket-1-endpoint)

---

## 🌐 Overview

The University Computer Monitoring System provides real-time monitoring and management for 300+ campus computers across multiple buildings and labs.

### Key Features

- ✅ Real-time hardware monitoring (CPU, RAM, Disk)
- ✅ User session tracking
- ✅ Alert management and notifications
- ✅ Bulk operations (restart, maintenance, tags)
- ✅ Analytics and reporting
- ✅ WebSocket real-time updates
- ✅ Historical data with InfluxDB
- ✅ Tag and group organization

### Technology Stack

- **API Framework:** FastAPI 0.104+
- **Database:** MongoDB 6.0+
- **Time Series DB:** InfluxDB 2.7+ (optional)
- **Real-time:** WebSocket
- **Compression:** GZip

---

## 🔐 Authentication

**Current Status:** ⚠️ Not Implemented

All endpoints currently use `OptionalUser` dependency (no authentication required). When authentication is implemented:

```bash
# Login
POST /api/v1/auth/login
{
  "username": "admin",
  "password": "password"
}

# Response
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer"
}

# Use token in requests
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:8001/api/v1/machines
```

---

## ⚡ Rate Limiting

**Current Status:** Not implemented

Recommended limits for production:
- Public endpoints: 100 requests/minute
- Authenticated: 1000 requests/minute
- Admin: 5000 requests/minute

---

## ❌ Error Handling

All API errors return JSON with consistent structure:

### Error Response Format

```json
{
  "error": "Error Type",
  "message": "Human-readable description",
  "timestamp": "2026-03-04T15:30:00Z",
  "path": "/api/v1/machines/INVALID"
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid input data |
| 404 | Not Found | Resource doesn't exist |
| 422 | Validation Error | Pydantic validation failed |
| 500 | Server Error | Internal server error |
| 503 | Service Unavailable | Database connection failed |

### Example Error Responses

**404 Not Found:**
```json
{
  "error": "Not Found",
  "message": "Machine LAB-PC-999 not found",
  "timestamp": "2026-03-04T15:30:00Z"
}
```

**422 Validation Error:**
```json
{
  "detail": [
    {
      "loc": ["body", "machine_id"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## 📡 API Endpoints

---

## Machines (10 endpoints)

Manage and monitor individual machines.

### 1. List All Machines

Get a list of all monitored machines.

**Endpoint:** `GET /api/v1/machines`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| status | string | No | - | Filter by status: active, idle, offline |
| building | string | No | - | Filter by building name |
| room | string | No | - | Filter by room number |
| tags | string | No | - | Filter by tag (comma-separated) |
| limit | integer | No | 100 | Max results (1-1000) |
| offset | integer | No | 0 | Pagination offset |

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/machines?status=active&building=Engineering&limit=50"
```

**Example Response:**
```json
{
  "machines": [
    {
      "machine_id": "LAB-PC-042",
      "hostname": "LAB-DESKTOP-042",
      "status": "active",
      "building": "Engineering Building",
      "room": "301",
      "cpu_usage": 45.2,
      "memory_usage": 62.8,
      "disk_usage": 55.1,
      "active_user": "student123",
      "last_seen": "2026-03-04T15:30:00Z",
      "tags": ["Lab A", "Windows 11"],
      "groups": ["engineering-lab-301"]
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### 2. Get Machine Details

Get detailed information about a specific machine.

**Endpoint:** `GET /api/v1/machines/{machine_id}`

**Path Parameters:**
- `machine_id` (string, required) - Machine identifier

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/machines/LAB-PC-042"
```

**Example Response:**
```json
{
  "machine_id": "LAB-PC-042",
  "hostname": "LAB-DESKTOP-042",
  "status": "active",
  "location": {
    "building": "Engineering Building",
    "room": "301",
    "floor": 3
  },
  "hardware": {
    "cpu_model": "Intel Core i7-12700",
    "cpu_cores": 12,
    "total_memory_gb": 32,
    "total_disk_gb": 512,
    "os": "Windows 11 Pro"
  },
  "current_metrics": {
    "cpu_usage": 45.2,
    "memory_usage": 62.8,
    "disk_usage": 55.1,
    "temperature": 52.0,
    "uptime_hours": 168
  },
  "session": {
    "active_user": "student123",
    "login_time": "2026-03-04T10:00:00Z",
    "session_duration_minutes": 330
  },
  "tags": ["Lab A", "Windows 11", "Production"],
  "groups": ["engineering-lab-301"],
  "maintenance_mode": false,
  "last_seen": "2026-03-04T15:30:00Z",
  "created_at": "2025-09-01T00:00:00Z"
}
```

---

### 3. Get Machine History

Get historical data for a specific machine.

**Endpoint:** `GET /api/v1/machines/{machine_id}/history`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| start_time | datetime | No | 24h ago | Start of time range |
| end_time | datetime | No | now | End of time range |
| metric | string | No | all | Specific metric: cpu, memory, disk |
| interval | string | No | 5m | Data aggregation interval |

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/machines/LAB-PC-042/history?metric=cpu&interval=15m"
```

**Example Response:**
```json
{
  "machine_id": "LAB-PC-042",
  "metric": "cpu",
  "interval": "15m",
  "data_points": [
    {
      "timestamp": "2026-03-04T14:00:00Z",
      "value": 45.2,
      "min": 42.1,
      "max": 48.3,
      "avg": 45.2
    },
    {
      "timestamp": "2026-03-04T14:15:00Z",
      "value": 52.1,
      "min": 48.5,
      "max": 55.7,
      "avg": 52.1
    }
  ],
  "total_points": 96,
  "start_time": "2026-03-03T15:30:00Z",
  "end_time": "2026-03-04T15:30:00Z"
}
```

---

### 4. Restart Machine

Request a machine restart.

**Endpoint:** `POST /api/v1/machines/{machine_id}/restart`

**Request Body:**
```json
{
  "action": "restart",
  "force": false,
  "delay_seconds": 60
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:8001/api/v1/machines/LAB-PC-042/restart" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "restart",
    "force": false,
    "delay_seconds": 60
  }'
```

**Example Response:**
```json
{
  "status": "pending",
  "action_id": "65f8a3b2c1d4e5f6a7b8c9d0",
  "machine_id": "LAB-PC-042",
  "action": "restart",
  "scheduled_time": "2026-03-04T15:31:00Z",
  "message": "Restart scheduled in 60 seconds"
}
```

---

### 5. Update Machine Tags

Update tags for a machine.

**Endpoint:** `PUT /api/v1/machines/{machine_id}/tags`

**Request Body:**
```json
{
  "tags": ["Lab A", "Windows 11", "Production", "Critical"]
}
```

**Example Response:**
```json
{
  "status": "updated",
  "machine_id": "LAB-PC-042",
  "tags": ["Lab A", "Windows 11", "Production", "Critical"]
}
```

---

### 6. Add Machine Note

Add a note to a machine.

**Endpoint:** `POST /api/v1/machines/{machine_id}/notes`

**Request Body:**
```json
{
  "title": "RAM Upgrade Needed",
  "content": "Machine experiencing memory issues. Recommend upgrading from 16GB to 32GB.",
  "category": "hardware",
  "priority": "high",
  "tags": ["upgrade", "memory"]
}
```

**Example Response:**
```json
{
  "note_id": "65f8a3b2c1d4e5f6a7b8c9d0",
  "status": "created",
  "created_at": "2026-03-04T15:30:00Z"
}
```

---

### 7. Schedule Maintenance

Schedule maintenance for a machine.

**Endpoint:** `POST /api/v1/machines/{machine_id}/maintenance`

**Request Body:**
```json
{
  "maintenance_type": "hardware_upgrade",
  "description": "RAM upgrade from 16GB to 32GB",
  "scheduled_start": "2026-03-05T18:00:00Z",
  "scheduled_end": "2026-03-05T19:00:00Z",
  "technician": "John Smith",
  "notify_users": true
}
```

**Example Response:**
```json
{
  "maintenance_id": "65f8a3b2c1d4e5f6a7b8c9d0",
  "status": "scheduled",
  "machine_id": "LAB-PC-042",
  "scheduled_start": "2026-03-05T18:00:00Z",
  "scheduled_end": "2026-03-05T19:00:00Z"
}
```

---

### 8. Get Machine Alerts

Get all alerts for a specific machine.

**Endpoint:** `GET /api/v1/machines/{machine_id}/alerts`

**Query Parameters:**
- `severity` (string) - Filter by severity: info, warning, critical
- `status` (string) - Filter by status: active, acknowledged, resolved

**Example Response:**
```json
{
  "alerts": [
    {
      "alert_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "severity": "warning",
      "alert_type": "high_cpu",
      "message": "CPU usage above 80% for 5 minutes",
      "value": 85.2,
      "threshold": 80,
      "status": "active",
      "acknowledged": false,
      "created_at": "2026-03-04T15:25:00Z"
    }
  ],
  "total": 1
}
```

---

### 9. Get Machine Sessions

Get user session history for a machine.

**Endpoint:** `GET /api/v1/machines/{machine_id}/sessions`

**Query Parameters:**
- `active` (boolean) - Filter active sessions only
- `limit` (integer) - Max results (default: 50)

**Example Response:**
```json
{
  "sessions": [
    {
      "session_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "username": "student123",
      "login_time": "2026-03-04T10:00:00Z",
      "logout_time": null,
      "duration_minutes": 330,
      "active": true
    }
  ],
  "total": 1
}
```

---

### 10. Get Machine Events

Get timeline events for a machine.

**Endpoint:** `GET /api/v1/machines/{machine_id}/events`

**Query Parameters:**
- `event_type` (string) - Filter by type
- `limit` (integer) - Max results

**Example Response:**
```json
{
  "events": [
    {
      "event_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "event_type": "user_login",
      "message": "User student123 logged in",
      "severity": "info",
      "timestamp": "2026-03-04T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

## Events (4 endpoints)

Timeline events and system logs.

### 1. Get Recent Events

**Endpoint:** `GET /api/v1/events/recent`

**Query Parameters:**
- `limit` (integer) - Max events (default: 100)
- `event_type` (string) - Filter by type

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/events/recent?limit=50"
```

**Example Response:**
```json
{
  "events": [
    {
      "event_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "event_type": "high_cpu_alert",
      "message": "CPU usage exceeded 80%",
      "severity": "warning",
      "timestamp": "2026-03-04T15:30:00Z",
      "details": {
        "cpu_usage": 85.2,
        "threshold": 80
      }
    }
  ],
  "total": 1,
  "limit": 50
}
```

---

### 2. Get Events by Machine

**Endpoint:** `GET /api/v1/events/machine/{machine_id}`

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/events/machine/LAB-PC-042"
```

---

### 3. Get Events by Type

**Endpoint:** `GET /api/v1/events/type/{event_type}`

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/events/type/user_login"
```

---

### 4. Create Event

**Endpoint:** `POST /api/v1/events`

**Request Body:**
```json
{
  "machine_id": "LAB-PC-042",
  "event_type": "manual_note",
  "message": "Technician performed maintenance",
  "severity": "info",
  "details": {
    "technician": "John Smith",
    "task": "RAM upgrade"
  }
}
```

---

## Timeline (5 endpoints)

Machine timeline and event history.

### 1. Get Machine Timeline

**Endpoint:** `GET /api/v1/timeline/{machine_id}`

**Query Parameters:**
- `start_date` (datetime)
- `end_date` (datetime)
- `event_types` (string) - Comma-separated

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/timeline/LAB-PC-042?start_date=2026-03-01"
```

**Example Response:**
```json
{
  "machine_id": "LAB-PC-042",
  "timeline": [
    {
      "timestamp": "2026-03-04T10:00:00Z",
      "event_type": "user_login",
      "description": "student123 logged in",
      "severity": "info"
    },
    {
      "timestamp": "2026-03-04T15:25:00Z",
      "event_type": "high_cpu_alert",
      "description": "CPU usage: 85.2%",
      "severity": "warning"
    }
  ],
  "total_events": 2,
  "start_date": "2026-03-01T00:00:00Z",
  "end_date": "2026-03-04T15:30:00Z"
}
```

---

### 2-5. Other Timeline Endpoints

- `GET /api/v1/timeline/recent` - Recent timeline across all machines
- `GET /api/v1/timeline/events/critical` - Critical events only
- `POST /api/v1/timeline/event` - Create timeline event
- `GET /api/v1/timeline/export` - Export timeline data

---

## Alerts (9 endpoints)

Alert management and notifications.

### 1. Get All Alerts

**Endpoint:** `GET /api/v1/alerts`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| severity | string | Filter: info, warning, critical |
| status | string | Filter: active, acknowledged, resolved |
| machine_id | string | Filter by machine |
| limit | integer | Max results (default: 100) |

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/alerts?severity=critical&status=active"
```

**Example Response:**
```json
{
  "alerts": [
    {
      "alert_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "alert_type": "high_cpu",
      "severity": "critical",
      "message": "CPU usage above 90%",
      "value": 92.5,
      "threshold": 90,
      "status": "active",
      "acknowledged": false,
      "created_at": "2026-03-04T15:30:00Z",
      "updated_at": "2026-03-04T15:30:00Z"
    }
  ],
  "total": 1,
  "active_count": 1,
  "critical_count": 1
}
```

---

### 2. Get Alert Details

**Endpoint:** `GET /api/v1/alerts/{alert_id}`

---

### 3. Acknowledge Alert

**Endpoint:** `POST /api/v1/alerts/{alert_id}/acknowledge`

**Request Body:**
```json
{
  "note": "Investigating high CPU usage - likely Windows Update"
}
```

**Example Response:**
```json
{
  "status": "acknowledged",
  "alert_id": "65f8a3b2c1d4e5f6a7b8c9d0",
  "acknowledged_at": "2026-03-04T15:35:00Z",
  "acknowledged_by": "admin"
}
```

---

### 4. Resolve Alert

**Endpoint:** `POST /api/v1/alerts/{alert_id}/resolve`

---

### 5. Get Alert Statistics

**Endpoint:** `GET /api/v1/alerts/stats`

**Example Response:**
```json
{
  "total_alerts": 150,
  "active": 12,
  "acknowledged": 8,
  "resolved": 130,
  "by_severity": {
    "info": 80,
    "warning": 50,
    "critical": 20
  },
  "by_type": {
    "high_cpu": 45,
    "high_memory": 38,
    "disk_space": 25,
    "offline": 42
  }
}
```

---

### 6-9. Other Alert Endpoints

- `GET /api/v1/alerts/active` - Active alerts only
- `GET /api/v1/alerts/critical` - Critical alerts only
- `DELETE /api/v1/alerts/{alert_id}` - Delete alert
- `POST /api/v1/alerts/bulk/acknowledge` - Bulk acknowledge

---

## Analytics (8 endpoints)

Analytics, trends, and reporting.

### 1. System Overview

**Endpoint:** `GET /api/v1/analytics/overview`

**Example Response:**
```json
{
  "total_machines": 300,
  "status_distribution": {
    "active": 245,
    "idle": 42,
    "offline": 13
  },
  "average_metrics": {
    "cpu_usage": 42.5,
    "memory_usage": 58.3,
    "disk_usage": 65.2
  },
  "alerts": {
    "active": 12,
    "critical": 3
  },
  "top_buildings": [
    {"building": "Engineering", "count": 120},
    {"building": "Library", "count": 80},
    {"building": "Student Center", "count": 60}
  ]
}
```

---

### 2. Resource Usage Trends

**Endpoint:** `GET /api/v1/analytics/trends`

**Query Parameters:**
- `metric` (string) - cpu, memory, disk
- `days` (integer) - Number of days (default: 7)

**Example Request:**
```bash
curl "http://localhost:8001/api/v1/analytics/trends?metric=cpu&days=7"
```

---

### 3. Building Statistics

**Endpoint:** `GET /api/v1/analytics/buildings`

---

### 4. Top Users

**Endpoint:** `GET /api/v1/analytics/top-users`

---

### 5. Machine Health Score

**Endpoint:** `GET /api/v1/analytics/health-scores`

---

### 6-8. Other Analytics Endpoints

- `GET /api/v1/analytics/utilization` - Resource utilization report
- `GET /api/v1/analytics/predictions` - Predictive analytics
- `GET /api/v1/analytics/export` - Export analytics data

---

## Statistics (6 endpoints)

Real-time statistics and counters.

### 1. Global Statistics

**Endpoint:** `GET /api/v1/stats`

**Example Response:**
```json
{
  "machines": {
    "total": 300,
    "online": 287,
    "offline": 13,
    "in_use": 245,
    "idle": 42
  },
  "resources": {
    "avg_cpu": 42.5,
    "avg_memory": 58.3,
    "avg_disk": 65.2
  },
  "alerts": {
    "total": 150,
    "active": 12,
    "critical": 3
  },
  "sessions": {
    "active": 245,
    "total_today": 312
  },
  "timestamp": "2026-03-04T15:30:00Z"
}
```

---

### 2-6. Other Statistics Endpoints

- `GET /api/v1/stats/machines` - Machine-specific stats
- `GET /api/v1/stats/resources` - Resource statistics
- `GET /api/v1/stats/alerts` - Alert statistics
- `GET /api/v1/stats/sessions` - Session statistics
- `GET /api/v1/stats/daily` - Daily statistics

---

## Tags (7 endpoints)

Tag management for machine organization.

### 1. List All Tags

**Endpoint:** `GET /api/v1/tags`

**Example Response:**
```json
{
  "tags": [
    {
      "name": "Production",
      "count": 180,
      "color": "#22C55E",
      "description": "Production machines"
    },
    {
      "name": "Lab A",
      "count": 50,
      "color": "#3B82F6",
      "description": "Engineering Lab A"
    }
  ],
  "total": 2
}
```

---

### 2. Create Tag

**Endpoint:** `POST /api/v1/tags`

**Request Body:**
```json
{
  "name": "Critical Infrastructure",
  "color": "#EF4444",
  "description": "Mission-critical systems"
}
```

---

### 3. Update Tag

**Endpoint:** `PUT /api/v1/tags/{tag_name}`

---

### 4. Delete Tag

**Endpoint:** `DELETE /api/v1/tags/{tag_name}`

---

### 5-7. Machine Tag Operations

- `GET /api/v1/tags/{tag_name}/machines` - Get machines with tag
- `POST /api/v1/tags/bulk` - Bulk tag operations
- `GET /api/v1/tags/stats` - Tag statistics

---

## Groups (6 endpoints)

Group management for organizing machines.

### 1. List All Groups

**Endpoint:** `GET /api/v1/groups`

**Example Response:**
```json
{
  "groups": [
    {
      "group_id": "engineering-lab-301",
      "group_name": "Engineering Lab 301",
      "description": "Computers in Engineering Building Room 301",
      "machine_count": 25,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

### 2. Create Group

**Endpoint:** `POST /api/v1/groups`

**Request Body:**
```json
{
  "group_id": "library-computers",
  "group_name": "Library Public Computers",
  "description": "All publicly accessible library machines",
  "machine_ids": ["LIB-PC-001", "LIB-PC-002"]
}
```

---

### 3. Get Group Details

**Endpoint:** `GET /api/v1/groups/{group_id}`

---

### 4. Update Group

**Endpoint:** `PUT /api/v1/groups/{group_id}`

---

### 5. Delete Group

**Endpoint:** `DELETE /api/v1/groups/{group_id}`

---

### 6. Get Group Machines

**Endpoint:** `GET /api/v1/groups/{group_id}/machines`

---

## Notes (5 endpoints)

Note management for machines.

### 1. Get Machine Notes

**Endpoint:** `GET /api/v1/notes/machine/{machine_id}`

---

### 2. Create Note

**Endpoint:** `POST /api/v1/notes/machine/{machine_id}`

---

### 3. Update Note

**Endpoint:** `PUT /api/v1/notes/{note_id}`

---

### 4. Delete Note

**Endpoint:** `DELETE /api/v1/notes/{note_id}`

---

### 5. Search Notes

**Endpoint:** `GET /api/v1/notes/search`

---

## Sessions (3 endpoints)

User session tracking.

### 1. Get Active Sessions

**Endpoint:** `GET /api/v1/sessions/active`

**Example Response:**
```json
{
  "sessions": [
    {
      "session_id": "65f8a3b2c1d4e5f6a7b8c9d0",
      "machine_id": "LAB-PC-042",
      "username": "student123",
      "login_time": "2026-03-04T10:00:00Z",
      "duration_minutes": 330,
      "active": true
    }
  ],
  "total": 245
}
```

---

### 2. Get Session History

**Endpoint:** `GET /api/v1/sessions/history`

---

### 3. Get User Sessions

**Endpoint:** `GET /api/v1/sessions/user/{username}`

---

## Monitoring (21 endpoints)

Detailed monitoring data access.

All monitoring endpoints follow pattern:
`GET /api/v1/data/{monitor_type}/latest`
`GET /api/v1/data/{monitor_type}/historical`

### Monitor Types:

1. `heartbeat` - Machine heartbeat
2. `hardware` - CPU, RAM, Disk
3. `network` - Network metrics
4. `user_activity` - User sessions
5. `application` - Installed apps
6. `services` - Windows services
7. `specs` - Hardware specs
8. `update` - Windows updates
9. `overview` - System overview
10. `security` - Security status
11. `peripherals` - Connected devices
12. `usb_devices` - USB devices
13. `event_log` - Event logs

**Example:**
```bash
# Latest hardware data for all machines
GET /api/v1/data/hardware/latest

# Historical CPU data for specific machine
GET /api/v1/data/hardware/historical?machine_id=LAB-PC-042&start_time=2026-03-03
```

---

## Maintenance (8 endpoints)

Maintenance scheduling and tracking.

### 1. Schedule Maintenance

**Endpoint:** `POST /api/v1/maintenance/schedule`

---

### 2. Get Maintenance Schedule

**Endpoint:** `GET /api/v1/maintenance/schedule`

---

### 3. Update Maintenance

**Endpoint:** `PUT /api/v1/maintenance/{maintenance_id}`

---

### 4. Cancel Maintenance

**Endpoint:** `DELETE /api/v1/maintenance/{maintenance_id}`

---

### 5-8. Other Maintenance Endpoints

- `GET /api/v1/maintenance/upcoming` - Upcoming maintenance
- `GET /api/v1/maintenance/history` - Maintenance history
- `POST /api/v1/maintenance/complete` - Mark complete
- `GET /api/v1/maintenance/stats` - Maintenance statistics

---

## Health (4 endpoints)

System health checks.

### 1. Simple Health Check

**Endpoint:** `GET /health`

**Example Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-04T15:30:00Z"
}
```

---

### 2. Detailed Health Check

**Endpoint:** `GET /api/health`

**Example Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-04T15:30:00Z",
  "databases": {
    "mongodb": "connected",
    "influxdb": "connected"
  },
  "routers": 16,
  "endpoints": "122+"
}
```

---

### 3. Database Health

**Endpoint:** `GET /api/v1/data/health`

---

### 4. Component Health

**Endpoint:** `GET /api/v1/health/components`

---

## Admin (23 endpoints)

Administrative operations and configuration.

### 1. Get System Configuration

**Endpoint:** `GET /api/v1/admin/config`

**Example Response:**
```json
{
  "offline_threshold_seconds": 300,
  "idle_threshold_seconds": 1800,
  "alert_thresholds": {
    "cpu_warning": 80,
    "cpu_critical": 90,
    "memory_warning": 80,
    "memory_critical": 90
  }
}
```

---

### 2. Update Configuration

**Endpoint:** `PUT /api/v1/admin/config`

**Request Body:**
```json
{
  "alert_thresholds": {
    "cpu_warning": 75,
    "cpu_critical": 85
  }
}
```

---

### 3. Search Machines

**Endpoint:** `GET /api/v1/admin/search/machines?q=lab`

---

### 4. List Locations

**Endpoint:** `GET /api/v1/admin/locations`

---

### 5. Bulk Restart

**Endpoint:** `POST /api/v1/admin/bulk/restart`

**Request Body:**
```json
{
  "machine_ids": ["LAB-PC-001", "LAB-PC-002"],
  "reason": "Security updates",
  "notify_users": true
}
```

---

### 6. Bulk Maintenance Mode

**Endpoint:** `POST /api/v1/admin/bulk/maintenance`

---

### 7-23. Other Admin Endpoints

See full list in admin router documentation.

---

## Ingestion (2 endpoints)

Data ingestion for monitoring agents.

### 1. Ingest Data (Single Monitor)

**Endpoint:** `POST /api/v1/ingest/{monitor_type}`

**Example:**
```bash
POST /api/v1/ingest/hardware
{
  "machine_id": "LAB-PC-042",
  "hostname": "LAB-DESKTOP-042",
  "timestamp": "2026-03-04T15:30:00Z",
  "cpu_usage_percent": 45.2,
  "memory_usage_percent": 62.8,
  "disk_usage_percent": 55.1
}
```

---

### 2. Bulk Ingest (All Monitors)

**Endpoint:** `POST /api/v1/ingest/bulk`

**Request Body:**
```json
{
  "machine_id": "LAB-PC-042",
  "timestamp": "2026-03-04T15:30:00Z",
  "monitors": {
    "heartbeat": {...},
    "hardware": {...},
    "network": {...}
  }
}
```

---

## WebSocket (1 endpoint)

Real-time updates via WebSocket.

### WebSocket Connection

**Endpoint:** `ws://localhost:8001/ws`

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:8001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

**Message Format:**
```json
{
  "type": "machine_update",
  "machine_id": "LAB-PC-042",
  "data": {
    "cpu_usage": 45.2,
    "status": "active"
  },
  "timestamp": "2026-03-04T15:30:00Z"
}
```

**Update Types:**
- `machine_update` - Machine metrics changed
- `alert_created` - New alert
- `session_started` - User logged in
- `session_ended` - User logged out
- `status_changed` - Machine status changed

---

## 📊 Response Headers

All responses include these headers:

```
Content-Type: application/json
Content-Encoding: gzip
X-Process-Time: 45.23ms
Access-Control-Allow-Origin: *
```

---

## 🔄 Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `limit` - Max results per page (default: 100, max: 1000)
- `offset` - Skip N results (default: 0)

**Response:**
```json
{
  "data": [...],
  "total": 500,
  "limit": 100,
  "offset": 0,
  "has_more": true
}
```

---

## 📅 Date/Time Format

All timestamps use ISO 8601 format in UTC:

```
2026-03-04T15:30:00Z
```

**Parsing:**
```javascript
// JavaScript
new Date('2026-03-04T15:30:00Z')

// Python
from datetime import datetime
datetime.fromisoformat('2026-03-04T15:30:00Z')
```

---

## 🚀 Quick Start

### 1. Start Server
```bash
cd backend
python main.py
```

### 2. Test Connection
```bash
curl http://localhost:8001/health
```

### 3. Get System Overview
```bash
curl http://localhost:8001/api/v1/analytics/overview
```

### 4. View API Docs
Open browser: `http://localhost:8001/docs`

---

## 📚 Additional Resources

- **Interactive API Docs:** http://localhost:8001/docs
- **ReDoc:** http://localhost:8001/redoc
- **OpenAPI JSON:** http://localhost:8001/openapi.json
- **Postman Collection:** Import `postman_collection.json`

---

## 📧 Support

For questions or issues, contact your system administrator.

**Version:** 4.0.0  
**Last Updated:** March 4, 2026
