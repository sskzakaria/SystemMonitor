# Quick Reference Guide

**One-page reference for the University Computer Monitoring System API**

---

## 🚀 Quick Start (30 seconds)

```bash
# 1. Create indexes
cd backend
python scripts/create_indexes.py

# 2. Start server
python main.py

# 3. Test
curl http://localhost:8001/health
```

---

## 🌐 Base URLs

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:8001` |
| Production | `https://api.university.edu` |

---

## 📋 Common Endpoints

### System Status
```bash
GET  /                          # System info
GET  /health                    # Simple health check
GET  /api/health                # Detailed health
GET  /docs                      # Interactive API docs
```

### Machines
```bash
GET    /api/v1/machines                      # List all
GET    /api/v1/machines/{id}                 # Get details
GET    /api/v1/machines/{id}/history         # Historical data
POST   /api/v1/machines/{id}/restart         # Restart
PUT    /api/v1/machines/{id}/tags            # Update tags
```

### Analytics
```bash
GET  /api/v1/analytics/overview              # System overview
GET  /api/v1/analytics/trends                # Usage trends
GET  /api/v1/stats                           # Global stats
```

### Alerts
```bash
GET    /api/v1/alerts                        # List all
GET    /api/v1/alerts/{id}                   # Get details
POST   /api/v1/alerts/{id}/acknowledge       # Acknowledge
GET    /api/v1/alerts/active                 # Active only
GET    /api/v1/alerts/critical               # Critical only
```

### Events
```bash
GET    /api/v1/events/recent                 # Recent events
GET    /api/v1/events/machine/{id}           # Machine events
POST   /api/v1/events                        # Create event
```

### Admin
```bash
GET    /api/v1/admin/config                  # Get config
PUT    /api/v1/admin/config                  # Update config
GET    /api/v1/admin/search/machines?q=lab   # Search
POST   /api/v1/admin/bulk/restart            # Bulk restart
POST   /api/v1/admin/bulk/maintenance        # Bulk maintenance
```

---

## 🔍 Query Parameters

### Pagination
```bash
?limit=100       # Max results (1-1000)
?offset=0        # Skip N results
```

### Filtering
```bash
?status=active              # Filter by status
?building=Engineering       # Filter by building
?severity=critical          # Filter by severity
?tags=Production           # Filter by tag
```

### Time Ranges
```bash
?start_time=2026-03-01T00:00:00Z
?end_time=2026-03-04T23:59:59Z
?hours=24                   # Last N hours
?days=7                     # Last N days
```

---

## 📤 Request Examples

### Get Machines with Filters
```bash
curl "http://localhost:8001/api/v1/machines?status=active&building=Engineering&limit=50"
```

### Restart Machine
```bash
curl -X POST http://localhost:8001/api/v1/machines/LAB-PC-042/restart \
  -H "Content-Type: application/json" \
  -d '{
    "action": "restart",
    "force": false,
    "delay_seconds": 60
  }'
```

### Create Alert
```bash
curl -X POST http://localhost:8001/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "LAB-PC-042",
    "severity": "warning",
    "message": "High CPU usage"
  }'
```

### Acknowledge Alert
```bash
curl -X POST http://localhost:8001/api/v1/alerts/ALERT_ID/acknowledge \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Investigating the issue"
  }'
```

### Bulk Restart
```bash
curl -X POST http://localhost:8001/api/v1/admin/bulk/restart \
  -H "Content-Type: application/json" \
  -d '{
    "machine_ids": ["LAB-PC-001", "LAB-PC-002"],
    "reason": "Security updates",
    "notify_users": true
  }'
```

### Create Tag
```bash
curl -X POST http://localhost:8001/api/v1/tags \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical",
    "color": "#EF4444",
    "description": "Critical systems"
  }'
```

### Create Group
```bash
curl -X POST http://localhost:8001/api/v1/groups \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "lab-301",
    "group_name": "Engineering Lab 301",
    "machine_ids": ["LAB-PC-001", "LAB-PC-002"]
  }'
```

---

## 📊 Response Formats

### Success Response
```json
{
  "status": "success",
  "data": {...},
  "timestamp": "2026-03-04T15:30:00Z"
}
```

### Error Response
```json
{
  "error": "Not Found",
  "message": "Machine LAB-PC-999 not found",
  "timestamp": "2026-03-04T15:30:00Z"
}
```

### List Response
```json
{
  "items": [...],
  "total": 300,
  "limit": 100,
  "offset": 0,
  "has_more": true
}
```

---

## 🗄️ Database Indexes

### Run Index Script
```bash
cd backend
python scripts/create_indexes.py
```

### Verify Indexes
```javascript
// MongoDB shell
use university_monitoring
db.heartbeat_monitor_latest.getIndexes()
```

### Check Index Usage
```javascript
db.heartbeat_monitor_latest
  .find({building: "Engineering"})
  .explain("executionStats")
```

---

## 📬 Postman Collection

### Import
1. Open Postman
2. Click "Import"
3. Select `/backend/docs/postman_collection.json`

### Variables
```
base_url        = http://localhost:8001
machine_id      = LAB-PC-042
group_id        = engineering-lab-301
tag_name        = Production
```

### Run Collection
1. Right-click collection
2. "Run collection"
3. View results

---

## 🔌 WebSocket

### Connect
```javascript
const ws = new WebSocket('ws://localhost:8001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

### Message Types
- `machine_update` - Machine metrics changed
- `alert_created` - New alert
- `session_started` - User logged in
- `session_ended` - User logged out
- `status_changed` - Machine status changed

---

## ⚡ Performance Tips

### Use Pagination
```bash
# Don't fetch all 300 machines at once
?limit=50&offset=0

# Fetch next page
?limit=50&offset=50
```

### Use Specific Queries
```bash
# Bad (slow)
GET /api/v1/machines

# Good (fast)
GET /api/v1/machines?building=Engineering&room=301
```

### Use Indexes
```bash
# Queries on indexed fields are 100-1000x faster
GET /api/v1/machines?status=active          # Uses status index
GET /api/v1/alerts?severity=critical        # Uses severity index
```

### Cache Static Data
```javascript
// Cache tags/groups/config in your app
const tags = await fetch('/api/v1/tags').then(r => r.json());
// Refresh every 5 minutes, not every request
```

---

## 🐛 Debugging

### Check Server Logs
```bash
# In main.py output
✅ GET /api/v1/machines → 200 (45.23ms)
⚠️  GET /api/v1/machines/UNKNOWN → 404 (12.34ms)
🐌 SLOW REQUEST: GET /api/v1/analytics → 200 (1234.56ms)
```

### Check Response Headers
```bash
curl -I http://localhost:8001/api/v1/machines
# Look for:
# X-Process-Time: 45.23ms
# Content-Encoding: gzip
```

### Use explain() for Slow Queries
```javascript
db.collection.find({...}).explain("executionStats")
// Check:
// - executionTimeMillis (should be < 100ms)
// - totalDocsExamined (should be close to nReturned)
// - indexName (should not be null)
```

---

## 📊 HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid input) |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Server Error |
| 503 | Service Unavailable (database down) |

---

## 🔐 Authentication (Future)

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

# Use token
curl -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:8001/api/v1/admin/config
```

---

## 📁 File Locations

```
backend/
├── docs/
│   ├── API_DOCUMENTATION.md        # Full API reference
│   ├── postman_collection.json     # Postman import file
│   ├── README.md                   # Detailed guide
│   └── QUICK_REFERENCE.md          # This file
├── scripts/
│   └── create_indexes.py           # Index creation script
└── main.py                         # Start server
```

---

## 🎯 Common Tasks

### Monitor All Machines
```bash
# Get overview
curl http://localhost:8001/api/v1/analytics/overview

# Get active machines
curl http://localhost:8001/api/v1/machines?status=active

# Get alerts
curl http://localhost:8001/api/v1/alerts/active
```

### Find Problematic Machines
```bash
# High CPU
curl http://localhost:8001/api/v1/machines?cpu_usage_min=80

# Low disk space
curl http://localhost:8001/api/v1/machines?disk_usage_min=90

# Offline
curl http://localhost:8001/api/v1/machines?status=offline
```

### Manage Maintenance
```bash
# Set maintenance mode
POST /api/v1/admin/bulk/maintenance

# Schedule maintenance
POST /api/v1/machines/{id}/maintenance

# Get upcoming maintenance
GET /api/v1/maintenance/upcoming
```

### Search and Filter
```bash
# Search machines
GET /api/v1/admin/search/machines?q=engineering

# Filter by tags
GET /api/v1/machines?tags=Production,Critical

# Filter by building
GET /api/v1/machines?building=Engineering&room=301
```

---

## 💡 Tips & Tricks

### Test API Quickly
```bash
# Use httpie (better than curl)
pip install httpie
http GET localhost:8001/api/v1/machines
```

### Watch Real-time Updates
```bash
# Use websocat for WebSocket testing
websocat ws://localhost:8001/ws
```

### Format JSON Output
```bash
# Use jq
curl http://localhost:8001/api/v1/machines | jq '.'

# Pretty print
curl http://localhost:8001/api/v1/machines | jq '.machines[] | {id: .machine_id, status: .status}'
```

### Monitor Database Size
```javascript
// MongoDB shell
db.stats(1024*1024)  // Size in MB
db.heartbeat_monitor_latest.stats(1024*1024)
```

---

## 🆘 Troubleshooting

### Server Won't Start
```bash
# Check port availability
lsof -i :8001

# Use different port
PORT=8002 python main.py
```

### Database Connection Failed
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Check connection
mongosh
```

### Indexes Not Working
```bash
# Verify indexes exist
mongosh
use university_monitoring
db.heartbeat_monitor_latest.getIndexes()

# Rebuild indexes
python scripts/create_indexes.py
```

### Slow Queries
```bash
# Enable profiling in MongoDB
db.setProfilingLevel(2)

# View slow queries
db.system.profile.find({millis: {$gt: 100}}).sort({ts: -1}).limit(10)

# Check if indexes are used
db.collection.find({...}).explain("executionStats")
```

---

## 📞 Support

- **API Docs:** http://localhost:8001/docs
- **Full Documentation:** `/backend/docs/API_DOCUMENTATION.md`
- **Postman Collection:** `/backend/docs/postman_collection.json`
- **Index Script:** `/backend/scripts/create_indexes.py`

---

**Version:** 4.0.0  
**Last Updated:** March 4, 2026
