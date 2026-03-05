# Backend - University Computer Monitoring System

FastAPI backend server with 16 routers and 122+ API endpoints.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Start server
python main.py
```

Server runs at: **http://0.0.0.0:8001**

## Verify Before Starting

```bash
# Check all imports are working
python verify-imports.py

# Should show: ✓ ALL CHECKS PASSED
```

## API Documentation

Once running, visit:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc
- **Health Check**: http://localhost:8001/api/health

## Configuration

Edit `config.py` or create `.env`:

```bash
# MongoDB
MONGO_URI=mongodb://localhost:27017
DATABASE_NAME=computer_monitoring

# InfluxDB 
INFLUXDB_ENABLED=true
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=your-org
INFLUXDB_BUCKET=computer_metrics

# Grafana
GRAFANA_ENABLED = True
GRAFANA_URL= "http://localhost:3000"
GRAFANA_USER = "admin"
GRAFANA_PASSWORD = "admin123"
GRAFANA_DATASOURCE_UID = "your_uid"

# Server
HOST=0.0.0.0
PORT=8001
DEBUG=true
```

