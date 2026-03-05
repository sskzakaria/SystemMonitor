"""
Configuration Management
Loads environment variables with sensible defaults
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration from environment variables"""
    
    # ========================================
    # Application Settings
    # ========================================
    APP_NAME = "University Computer Monitoring System"
    APP_VERSION = "4.0.0"
    API_VERSION = "v1"
    ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    
    # ========================================
    # MongoDB Configuration
    # ========================================
    MONGODB_URI = os.getenv(
        'MONGO_URI',  # Changed from MONGODB_URL to match agent config
        os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
    )
    
    MONGODB_DB_NAME = os.getenv(
        'DATABASE_NAME',  # Changed from MONGODB_DATABASE to match agent config
        os.getenv('MONGODB_DATABASE', 'university_monitoring')
    )
    
    # ========================================
    # InfluxDB Configuration (Optional)
    # ========================================
    INFLUXDB_ENABLED = os.getenv('INFLUXDB_ENABLED', 'true').lower() == 'true'
    INFLUXDB_URL = os.getenv(
        'INFLUXDB_URL',
        'http://localhost:8086'
    )
    
    INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', '')
    
    INFLUXDB_ORG = os.getenv(
        'INFLUXDB_ORG',
        'university'
    )
    
    INFLUXDB_BUCKET = os.getenv(
        'INFLUXDB_BUCKET',
        'monitoring'
    )
    
    # ========================================
    # Server Configuration
    # ========================================
    SERVER_HOST = os.getenv('HOST', '0.0.0.0')
    SERVER_PORT = int(os.getenv('PORT', '8001'))
    
    # ========================================
    # WebSocket Configuration
    # ========================================
    WEBSOCKET_ENABLED = os.getenv('WEBSOCKET_ENABLED', 'true').lower() == 'true'
    
    # ========================================
    # Data Retention Policies (days)
    # ========================================
    RETENTION_HEARTBEAT = int(os.getenv('RETENTION_HEARTBEAT', '7'))
    RETENTION_HARDWARE = int(os.getenv('RETENTION_HARDWARE', '30'))
    RETENTION_NETWORK = int(os.getenv('RETENTION_NETWORK', '14'))
    RETENTION_USER_ACTIVITY = int(os.getenv('RETENTION_USER_ACTIVITY', '7'))
    RETENTION_SPECS = int(os.getenv('RETENTION_SPECS', '90'))
    RETENTION_APPLICATION = int(os.getenv('RETENTION_APPLICATION', '7'))
    RETENTION_SERVICES = int(os.getenv('RETENTION_SERVICES', '7'))
    RETENTION_UPDATE = int(os.getenv('RETENTION_UPDATE', '30'))
    RETENTION_OVERVIEW = int(os.getenv('RETENTION_OVERVIEW', '30'))
    RETENTION_SECURITY = int(os.getenv('RETENTION_SECURITY', '30'))
    RETENTION_PERIPHERALS = int(os.getenv('RETENTION_PERIPHERALS', '30'))
    RETENTION_USB_DEVICES = int(os.getenv('RETENTION_USB_DEVICES', '30'))
    RETENTION_EVENT_LOGS = int(os.getenv('RETENTION_EVENT_LOGS', '30'))
    
    # ========================================
    # Feature Flags
    # ========================================
    ENABLE_TTL_INDEXES = os.getenv('ENABLE_TTL_INDEXES', 'true').lower() == 'true'
    ENABLE_DUPLICATE_DETECTION = os.getenv('ENABLE_DUPLICATE_DETECTION', 'true').lower() == 'true'
    ENABLE_DATA_VALIDATION = os.getenv('ENABLE_DATA_VALIDATION', 'true').lower() == 'true'
    
    # ========================================
    # Performance Tuning
    # ========================================
    DUPLICATE_THRESHOLD_SECONDS = int(os.getenv('DUPLICATE_THRESHOLD_SECONDS', '1'))
    MAX_BATCH_SIZE = int(os.getenv('MAX_BATCH_SIZE', '100'))
    
    # ========================================
    # Machine Status Thresholds
    # ========================================
    OFFLINE_THRESHOLD_SECONDS = int(os.getenv('OFFLINE_THRESHOLD_SECONDS', '300'))  # 5 minutes
    IDLE_ACTIVITY_THRESHOLD_SECONDS = int(os.getenv('IDLE_ACTIVITY_THRESHOLD_SECONDS', '1800'))  # 30 minutes
    
    # ========================================
    # Authentication (Optional)
    # ========================================
    AUTH_ENABLED = os.getenv('AUTH_ENABLED', 'false').lower() == 'true'
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_MINUTES = int(os.getenv('JWT_EXPIRATION_MINUTES', '60'))
    
    # ========================================
    # CORS Configuration
    # ========================================
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',') if os.getenv('CORS_ORIGINS') else ['*']
    
    @classmethod
    def validate(cls):
        """Validate critical configuration"""
        errors = []
        
        if not cls.MONGODB_URI:
            errors.append("MONGODB_URL is required")
        
        if not cls.MONGODB_DB_NAME:
            errors.append("MONGODB_DATABASE is required")
        
        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")
        
        return True
    
    @classmethod
    def display(cls):
        """Display current configuration (safe - hides tokens)"""
        print("=" * 80)
        print("🔧 CONFIGURATION")
        print("=" * 80)
        print(f"MongoDB URI:       {cls._mask_uri(cls.MONGODB_URI)}")
        print(f"MongoDB Database:  {cls.MONGODB_DB_NAME}")
        print(f"InfluxDB URL:      {cls.INFLUXDB_URL if cls.INFLUXDB_TOKEN else 'Not configured'}")
        print(f"InfluxDB Org:      {cls.INFLUXDB_ORG if cls.INFLUXDB_TOKEN else 'N/A'}")
        print(f"InfluxDB Bucket:   {cls.INFLUXDB_BUCKET if cls.INFLUXDB_TOKEN else 'N/A'}")
        print(f"Server Host:       {cls.SERVER_HOST}")
        print(f"Server Port:       {cls.SERVER_PORT}")
        print(f"WebSocket:         {'Enabled' if cls.WEBSOCKET_ENABLED else 'Disabled'}")
        print(f"TTL Indexes:       {'Enabled' if cls.ENABLE_TTL_INDEXES else 'Disabled'}")
        print(f"Duplicate Detection: {'Enabled' if cls.ENABLE_DUPLICATE_DETECTION else 'Disabled'}")
        print(f"Data Validation:   {'Enabled' if cls.ENABLE_DATA_VALIDATION else 'Disabled'}")
        print("=" * 80)
    
    @staticmethod
    def _mask_uri(uri: str) -> str:
        """Mask passwords in MongoDB URI"""
        if '@' in uri and '://' in uri:
            # Format: mongodb://user:password@host/db
            parts = uri.split('://')
            if len(parts) == 2:
                protocol = parts[0]
                rest = parts[1]
                if '@' in rest:
                    auth_host = rest.split('@')
                    if len(auth_host) == 2:
                        auth = auth_host[0]
                        if ':' in auth:
                            user = auth.split(':')[0]
                            return f"{protocol}://{user}:***@{auth_host[1]}"
        return uri


# Validate configuration on import
try:
    Config.validate()
except ValueError as e:
    print(f"⚠️  Configuration Error: {e}")
    print("Please check your .env file or environment variables")