"""
Enhanced Utilities combining best practices from both versions
Includes robust machine identification and location parsing
"""

import logging
import platform
from datetime import datetime
import socket
import subprocess
import random
import time

# Optional imports with fallbacks
try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure
    MONGODB_AVAILABLE = True
except ImportError:
    MongoClient = None
    ConnectionFailure = Exception
    MONGODB_AVAILABLE = False
    logging.warning("MongoDB not available - will use local storage only")

def get_machine_identifier():
    """
    Get unique machine identifier cross-platform with VM-friendly fallbacks
    Returns a stable identifier that persists across reboots
    """
    try:
        machine_id = None
        
        if platform.system() == "Windows":
            # Method 1: Try BIOS serial number
            try:
                command = ['powershell', '-Command', '(Get-WmiObject -Class Win32_BIOS).SerialNumber']
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    shell=True,
                    timeout=10
                )
                machine_id = result.stdout.strip()
                if machine_id and machine_id not in ["To be filled by O.E.M.", "Default string"] and len(machine_id) > 3:
                    logging.info(f"Using BIOS serial as machine ID: {machine_id}")
                    return machine_id
            except Exception as e:
                logging.debug(f"BIOS serial check failed: {e}")
            
            # Method 2: Try motherboard serial number
            try:
                command = ['powershell', '-Command', '(Get-WmiObject -Class Win32_BaseBoard).SerialNumber']
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    shell=True,
                    timeout=10
                )
                machine_id = result.stdout.strip()
                if machine_id and machine_id not in ["To be filled by O.E.M.", "Default string"] and len(machine_id) > 3:
                    logging.info(f"Using motherboard serial as machine ID: {machine_id}")
                    return machine_id
            except Exception as e:
                logging.debug(f"Motherboard serial check failed: {e}")
            
            # Method 3: Try computer system UUID
            try:
                command = ['powershell', '-Command', '(Get-WmiObject -Class Win32_ComputerSystemProduct).UUID']
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    shell=True,
                    timeout=10
                )
                machine_id = result.stdout.strip()
                if machine_id and len(machine_id) > 10:
                    logging.info(f"Using system UUID as machine ID: {machine_id}")
                    return machine_id
            except Exception as e:
                logging.debug(f"System UUID check failed: {e}")
        
        else:
            # For Linux/Unix systems
            try:
                with open('/etc/machine-id', 'r') as f:
                    machine_id = f.read().strip()
                    if machine_id and len(machine_id) > 10:
                        logging.info(f"Using /etc/machine-id: {machine_id}")
                        return machine_id
            except FileNotFoundError:
                pass
            
            # Try DMI product UUID on Linux
            try:
                with open('/sys/class/dmi/id/product_uuid', 'r') as f:
                    machine_id = f.read().strip()
                    if machine_id and len(machine_id) > 10:
                        logging.info(f"Using DMI UUID as machine ID: {machine_id}")
                        return machine_id
            except (FileNotFoundError, PermissionError):
                pass
        
        # Fallback: Use MAC address + hostname (stable across reboots)
        import uuid
        mac_address = hex(uuid.getnode())
        hostname = socket.gethostname()
        machine_id = f"{hostname}_{mac_address}"
        
        # Enhance if hostname is generic
        if hostname.lower() in ['localhost', 'computer', 'pc', 'desktop', 'workstation']:
            machine_id = f"{platform.system()}_{platform.machine()}_{mac_address}"
        
        logging.info(f"Using fallback machine identifier: {machine_id}")
        return machine_id
        
    except Exception as e:
        logging.warning(f"Could not get machine identifier: {e}")
        # Final emergency fallback
        import uuid
        fallback_id = f"vm_{socket.gethostname()}_{hex(uuid.getnode())}"
        logging.info(f"Using emergency fallback identifier: {fallback_id}")
        return fallback_id

def parse_machine_location(hostname: str = None):
    """
    Parse machine location from hostname following university naming convention.
    
    Expected formats:
    1. NNNN-BBBRRR where:
       - NNNN: 4-digit number (station/machine number)
       - BBB: 3+ letter building code
       - RRR: room number (can include letters)
       Example: 4299-TBT333 -> building: TBT, room: 333, station: 4299
    
    2. BBB-RRR-NN where:
       - BBB: 3+ letter building code
       - RRR: room number
       - NN: station number
       Example: TBT-333-01 -> building: TBT, room: 333, station: 1
    
    3. Simple formats: BBB-RRR
       Example: TBT-333 -> building: TBT, room: 333
    
    4. Complex formats: BBB-RRR-X-NN
       Example: LIB-200-LAB-05 -> building: LIB, room: 200, station: 5
    
    Args:
        hostname: Machine hostname. If None, uses current hostname.
        
    Returns:
        dict: Contains building, room, station, machine_type, and campus
    """
    if hostname is None:
        hostname = socket.gethostname()
    
    # Default values
    location_info = {
        'building': 'unknown',
        'room': 'unknown', 
        'station': None,
        'machine_type': 'classroom_computer',
        'campus': 'Main Campus'
    }
    
    try:
        # Clean hostname (remove domain suffix if present)
        clean_hostname = hostname.split('.')[0].upper()
        
        # Split by dashes
        parts = clean_hostname.split('-')
        
        if len(parts) >= 2:
            part1, part2 = parts[0], parts[1]
            
            # Check if first part is a 4-digit station number
            if part1.isdigit() and len(part1) == 4:
                # Format: NNNN-BBBRRR
                station = int(part1)
                building_room = part2
                
                # Find where letters end and numbers begin
                building_end = 0
                for i, char in enumerate(building_room):
                    if char.isdigit():
                        building_end = i
                        break
                
                if building_end > 0:
                    building = building_room[:building_end]
                    room = building_room[building_end:]
                    
                    location_info.update({
                        'building': building,
                        'room': room,
                        'station': station
                    })
                    
            elif not part1.isdigit():
                # Format: BBB-RRR or BBB-RRR-NN or BBB-RRR-X-NN
                building = part1
                
                # Extract room number
                room_part = part2
                # Remove any non-numeric suffix from room
                room = ''.join(filter(lambda x: x.isdigit(), room_part))
                if not room:
                    room = room_part  # Keep original if no digits found
                
                location_info.update({
                    'building': building,
                    'room': room
                })
                
                # Check for station number in remaining parts
                if len(parts) >= 3:
                    # Could be BBB-RRR-NN or BBB-RRR-LAB-NN
                    for part in parts[2:]:
                        if part.isdigit():
                            location_info['station'] = int(part)
                            break
            
            # Determine machine type based on building/room patterns
            building = location_info['building']
            room = location_info['room']
            
            if building != 'unknown':
                # Machine type inference based on building codes
                building_lower = building.lower()
                
                if any(lab_code in building_lower for lab_code in ['lab', 'comp', 'cs', 'it', 'science']):
                    location_info['machine_type'] = 'computer_lab'
                elif any(lib_code in building_lower for lib_code in ['lib', 'library']):
                    location_info['machine_type'] = 'library_computer'
                elif any(admin_code in building_lower for admin_code in ['adm', 'admin', 'off', 'office', 'staff']):
                    location_info['machine_type'] = 'office_computer'
                elif any(teach_code in building_lower for teach_code in ['tbt', 'teach', 'class', 'edu', 'academic']):
                    location_info['machine_type'] = 'classroom_computer'
                elif any(dorm_code in building_lower for dorm_code in ['dorm', 'residence', 'hall', 'housing']):
                    location_info['machine_type'] = 'student_computer'
                else:
                    # Try to infer from room number patterns
                    if room.isdigit():
                        room_num = int(room)
                        if 100 <= room_num <= 199:
                            location_info['machine_type'] = 'classroom_computer'
                        elif 200 <= room_num <= 299:
                            location_info['machine_type'] = 'computer_lab'
                        elif 300 <= room_num <= 399:
                            location_info['machine_type'] = 'office_computer'
                        else:
                            location_info['machine_type'] = 'general_computer'
        
        logging.info(f"Parsed location from hostname '{hostname}': {location_info}")
        
    except Exception as e:
        logging.warning(f"Could not parse location from hostname '{hostname}': {e}")
    
    return location_info

def run_powershell_command(command: str, timeout: int = 30):
    """
    Run PowerShell command (Windows only) with timeout
    
    Args:
        command: PowerShell command to execute
        timeout: Timeout in seconds
        
    Returns:
        dict: Contains stdout, stderr, and returncode
    """
    if platform.system() != "Windows":
        raise Exception("PowerShell commands only available on Windows")
        
    try:
        result = subprocess.run(
            ["powershell", "-Command", command],
            capture_output=True,
            text=True,
            shell=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
            timeout=timeout
        )
        
        return {
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "returncode": result.returncode,
            "success": result.returncode == 0
        }
        
    except subprocess.TimeoutExpired:
        raise Exception(f"Command timed out after {timeout} seconds")
    except Exception as e:
        raise Exception(f"Failed to execute command: {str(e)}")

def setup_logging(module_name: str, config=None):
    """
    Set up logging for the given module with improved formatting
    
    Args:
        module_name: Name of the module
        config: Configuration object (optional)
        
    Returns:
        logger: Configured logger instance
    """
    logger = logging.getLogger(module_name)
    
    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger
    
    # Set level from config or default to INFO
    log_level = logging.INFO
    if config and hasattr(config, 'LOG_LEVEL'):
        log_level = getattr(logging, config.LOG_LEVEL, logging.INFO)
    
    logger.setLevel(log_level)
    
    # Console handler with color support (if available)
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    
    # Enhanced formatter with more context
    formatter = logging.Formatter(
        '%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    ch.setFormatter(formatter)
    
    logger.addHandler(ch)
    
    return logger

def connect_to_mongodb(config=None):
    """
    Establish a connection to MongoDB with retry logic
    
    Args:
        config: Configuration object with MONGODB_URI
        
    Returns:
        MongoClient: Connected MongoDB client
        
    Raises:
        Exception: If MongoDB is not available or connection fails
    """
    if not MONGODB_AVAILABLE:
        raise Exception("MongoDB not available - pymongo not installed")
    
    if config is None:
        from AGENT.core.config import MonitorConfig
        config = MonitorConfig()
    
    max_retries = 3
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            client = MongoClient(
                config.MONGODB_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                socketTimeoutMS=10000
            )
            # Verify connection
            client.admin.command('ismaster')
            logging.info("Successfully connected to MongoDB")
            return client
            
        except ConnectionFailure as e:
            if attempt < max_retries - 1:
                logging.warning(f"MongoDB connection attempt {attempt + 1} failed, retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logging.error(f"Cannot connect to MongoDB after {max_retries} attempts: {e}")
                raise
        except Exception as e:
            logging.error(f"MongoDB connection error: {e}")
            raise

def store_data(module_name: str, data: dict, config=None):
    """
    Store data in MongoDB with configurable retention (legacy function)
    
    Note: New code should use BaseMonitor.store_monitor_data() instead
    This is kept for backward compatibility
    
    Args:
        module_name: Name of the monitor module
        data: Data to store
        config: Configuration object
    """
    if config is None:
        from AGENT.core.config import MonitorConfig
        config = MonitorConfig()
    
    try:
        client = connect_to_mongodb(config)
        
        # Use machine identifier for database name
        from AGENT.core.utils import get_machine_identifier
        db_name = f'{get_machine_identifier()}{config.DB_NAME_SUFFIX}'
        db = client[db_name]
        collection = db[module_name]
        
        # Set TTL index
        retention_seconds = getattr(config, 'RETENTION_HOURS', 48) * 3600
        collection.create_index("timestamp", expireAfterSeconds=retention_seconds)
        
        # Add timestamp if not present
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now()
        
        result = collection.insert_one(data)
        if not result.acknowledged:
            logging.warning(f"Data insertion for {module_name} not acknowledged")
            
    except Exception as e:
        logging.error(f"Data storage failed for {module_name}: {e}")
        raise
    finally:
        if 'client' in locals():
            client.close()

def get_timestamp():
    """
    Get current timestamp in a formatted string
    
    Returns:
        str: Formatted timestamp string
    """
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def get_system_info():
    """
    Get basic system information
    
    Returns:
        dict: System information
    """
    return {
        'platform': platform.system(),
        'platform_version': platform.version(),
        'platform_release': platform.release(),
        'architecture': platform.machine(),
        'processor': platform.processor(),
        'hostname': socket.gethostname(),
        'python_version': platform.python_version()
    }

def format_bytes(bytes_value: int, decimals: int = 2) -> str:
    """
    Format bytes to human-readable format
    
    Args:
        bytes_value: Number of bytes
        decimals: Number of decimal places
        
    Returns:
        str: Formatted string (e.g., "1.5 GB")
    """
    if bytes_value == 0:
        return "0 B"
    
    units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    unit_index = 0
    value = float(bytes_value)
    
    while value >= 1024 and unit_index < len(units) - 1:
        value /= 1024
        unit_index += 1
    
    return f"{value:.{decimals}f} {units[unit_index]}"

def format_duration(seconds: int) -> str:
    """
    Format duration in seconds to human-readable format
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        str: Formatted duration (e.g., "2 days, 3 hours, 45 minutes")
    """
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    
    intervals = [
        ('day', 86400),
        ('hour', 3600),
        ('minute', 60),
        ('second', 1)
    ]
    
    parts = []
    for name, count in intervals:
        value = seconds // count
        if value:
            seconds -= value * count
            plural = 's' if value != 1 else ''
            parts.append(f"{value} {name}{plural}")
    
    return ', '.join(parts[:3])  # Limit to 3 most significant units

# Export commonly used functions
__all__ = [
    'get_machine_identifier',
    'parse_machine_location',
    'run_powershell_command',
    'setup_logging',
    'connect_to_mongodb',
    'store_data',
    'get_timestamp',
    'get_system_info',
    'format_bytes',
    'format_duration',
    'MONGODB_AVAILABLE'
]
