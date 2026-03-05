"""
data_transformer.py - Agent Data Transformation Service

Transforms agent monitor data to match frontend expectations.
All 9 critical field mappings from the verification audit.

Author: Backend Team
Date: 2026-03-05
"""

from typing import Any, Dict, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class DataTransformationService:
    """
    Transforms raw agent data into frontend-compatible format.
    
    Handles:
    - Field renaming
    - Structure flattening
    - Unit conversions
    - Data enrichment (merging specs with network, etc.)
    """
    
    def __init__(self, db):
        """
        Initialize with database connection for cross-collection lookups.
        
        Args:
            db: MongoDB database instance
        """
        self.db = db
    
    # =========================================================================
    # 1. HEARTBEAT - Flatten nested structure
    # =========================================================================
    
    def transform_heartbeat(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flatten nested heartbeat structure to match frontend expectations.
        
        Agent sends:
            {status: {...}, resources: {...}, network: {...}, health_summary: {...}}
        
        Frontend expects:
            Flat structure with direct field access
        
        Args:
            agent_data: Raw heartbeat data from agent
            
        Returns:
            Flattened heartbeat data
        """
        if not agent_data:
            return {}
        
        try:
            resources = agent_data.get('resources', {})
            network = agent_data.get('network', {})
            status = agent_data.get('status', {})
            health = agent_data.get('health_summary', {})
            
            return {
                # Flatten resources to top level
                'cpu_usage_percent': resources.get('cpu_usage_percent'),
                'cpu_usage_per_core': resources.get('cpu_usage_per_core', []),
                'cpu_core_count': resources.get('cpu_core_count'),
                'cpu_thread_count': resources.get('cpu_thread_count'),
                
                'memory_usage_percent': resources.get('memory_usage_percent'),
                'memory_used_gb': resources.get('memory_used_gb'),
                'memory_available_gb': resources.get('memory_available_gb'),
                'memory_total_gb': resources.get('memory_total_gb'),
                
                'disk_usage_percent': resources.get('disk_usage_percent'),
                'disk_used_gb': resources.get('disk_used_gb'),
                'disk_free_gb': resources.get('disk_free_gb'),
                'disk_total_gb': resources.get('disk_total_gb'),
                
                'process_count': resources.get('process_count'),
                
                # Flatten network to top level
                'internet_accessible': network.get('internet_accessible'),
                'bytes_sent': network.get('bytes_sent'),
                'bytes_recv': network.get('bytes_recv'),
                'packets_sent': network.get('packets_sent'),
                'packets_recv': network.get('packets_recv'),
                'errors_in': network.get('errors_in'),
                'errors_out': network.get('errors_out'),
                'drops_in': network.get('drops_in'),
                'drops_out': network.get('drops_out'),
                
                # Flatten status to top level
                'status': status.get('status', 'online'),
                'has_active_user': status.get('has_active_user'),
                'user_count': status.get('user_count'),
                'uptime_seconds': status.get('uptime_seconds'),
                'boot_time': status.get('boot_time_iso'),
                'boot_time_epoch': status.get('boot_time_epoch'),
                'last_seen': status.get('last_seen_iso'),
                'last_seen_epoch': status.get('last_seen_epoch'),
                
                # Flatten health_summary to top level
                'health_score': health.get('health_score'),
                'system_health': health.get('system_health'),
                'health_issues': health.get('issues', []),
                'health_alerts': health.get('alerts', []),
                
                # Keep timestamp
                'timestamp': agent_data.get('timestamp'),
            }
        except Exception as e:
            logger.error(f"Error transforming heartbeat data: {e}")
            return agent_data  # Return original on error
    
    # =========================================================================
    # 2. USER ACTIVITY - Rename fields
    # =========================================================================
    
    def transform_user_activity(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Rename user activity fields to match frontend expectations.
        
        Changes:
        - active_user → current_username
        - login_history_24h → login_history (if needed)
        
        Args:
            agent_data: Raw user activity data from agent
            
        Returns:
            Transformed user activity data
        """
        if not agent_data:
            return {}
        
        try:
            return {
                # RENAME: active_user → current_username
                'current_username': agent_data.get('active_user'),
                
                # Keep these as-is
                'active_sessions': agent_data.get('active_sessions', []),
                'user_summary': agent_data.get('user_summary', {}),
                'uptime': agent_data.get('uptime', {}),
                
                # RENAME: login_history_24h → login_history
                # Frontend checks both, so provide both for compatibility
                'login_history_24h': agent_data.get('login_history_24h', []),
                'login_history': agent_data.get('login_history_24h', []),
                'sessions': agent_data.get('active_sessions', []),  # Also provide as 'sessions'
                
                # Keep timestamp
                'timestamp': agent_data.get('timestamp'),
            }
        except Exception as e:
            logger.error(f"Error transforming user activity data: {e}")
            return agent_data
    
    # =========================================================================
    # 3. SPECS - Flatten storage & convert units
    # =========================================================================
    
    def transform_specs(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform specs data: flatten storage array and convert CPU units.
        
        Changes:
        - storage.partitions → storage (array)
        - cpu.frequency_*_mhz → cpu_*_clock_ghz (MHz → GHz conversion)
        - memory.modules[0].speed_mhz → memory_speed_mhz (top level)
        
        Args:
            agent_data: Raw specs data from agent
            
        Returns:
            Transformed specs data
        """
        if not agent_data:
            return {}
        
        try:
            transformed = dict(agent_data)  # Start with copy
            
            # FLATTEN: storage.partitions → storage (array)
            if 'storage' in agent_data and isinstance(agent_data['storage'], dict):
                transformed['storage'] = agent_data['storage'].get('partitions', [])
                transformed['storage_detailed'] = agent_data['storage']  # Keep full object
            
            # CONVERT: CPU frequency MHz → GHz
            if 'cpu' in agent_data and isinstance(agent_data['cpu'], dict):
                cpu = agent_data['cpu']
                
                # frequency_current_mhz → cpu_base_clock_ghz
                if cpu.get('frequency_current_mhz'):
                    transformed['cpu_base_clock_ghz'] = round(
                        cpu['frequency_current_mhz'] / 1000, 2
                    )
                
                # frequency_max_mhz → cpu_max_clock_ghz
                if cpu.get('frequency_max_mhz'):
                    transformed['cpu_max_clock_ghz'] = round(
                        cpu['frequency_max_mhz'] / 1000, 2
                    )
            
            # DERIVE: memory_speed_mhz from first module
            if 'memory' in agent_data and isinstance(agent_data['memory'], dict):
                modules = agent_data['memory'].get('modules', [])
                if modules and len(modules) > 0:
                    first_module = modules[0]
                    if first_module.get('speed_mhz'):
                        transformed['memory_speed_mhz'] = first_module['speed_mhz']
            
            return transformed
            
        except Exception as e:
            logger.error(f"Error transforming specs data: {e}")
            return agent_data
    
    # =========================================================================
    # 4. NETWORK - Merge MAC addresses & add missing fields
    # =========================================================================
    
    async def transform_network(
        self, 
        agent_data: Dict[str, Any], 
        machine_id: str
    ) -> Dict[str, Any]:
        """
        Enrich network data with MAC addresses from specs and add missing fields.
        
        Changes:
        - Merge MAC addresses from specs_monitor
        - Add connection_type (wired/wireless/mobile)
        - Add signal_strength placeholder
        
        Args:
            agent_data: Raw network data from agent
            machine_id: Machine identifier for specs lookup
            
        Returns:
            Enriched network data
        """
        if not agent_data:
            return {}
        
        try:
            # Fetch specs data to get MAC addresses (static hardware info)
            specs_data = await self._get_specs_for_machine(machine_id)
            
            transformed = dict(agent_data)
            
            # Enrich interfaces with MAC addresses and connection type
            if 'interfaces' in agent_data:
                enriched_interfaces = []
                
                for net_iface in agent_data['interfaces']:
                    iface = dict(net_iface)  # Copy interface
                    
                    # Find matching interface in specs by name
                    if specs_data and 'network' in specs_data:
                        spec_iface = next(
                            (s for s in specs_data['network'] 
                             if s.get('name') == iface.get('name')),
                            None
                        )
                        if spec_iface:
                            iface['mac_address'] = spec_iface.get('mac_address')
                    
                    # Add connection_type if not present
                    if 'connection_type' not in iface:
                        iface['connection_type'] = self._detect_connection_type(
                            iface.get('name', '')
                        )
                    
                    # Ensure signal_strength field exists (agent may send it for WiFi)
                    if 'signal_strength' not in iface:
                        iface['signal_strength'] = None
                    
                    enriched_interfaces.append(iface)
                
                transformed['interfaces'] = enriched_interfaces
            
            return transformed
            
        except Exception as e:
            logger.error(f"Error transforming network data for {machine_id}: {e}")
            return agent_data
    
    def _detect_connection_type(self, interface_name: str) -> str:
        """
        Detect connection type from interface name.
        
        Args:
            interface_name: Network interface name
            
        Returns:
            'wireless', 'wired', 'mobile', or 'unknown'
        """
        name_lower = interface_name.lower()
        
        if any(kw in name_lower for kw in ['wi-fi', 'wireless', 'wlan', '802.11']):
            return 'wireless'
        elif any(kw in name_lower for kw in ['ethernet', 'local area', 'eth', 'lan']):
            return 'wired'
        elif any(kw in name_lower for kw in ['cellular', 'mobile', 'lte', '5g', '4g']):
            return 'mobile'
        
        return 'unknown'
    
    async def _get_specs_for_machine(self, machine_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch specs data for a machine from MongoDB.
        
        Args:
            machine_id: Machine identifier
            
        Returns:
            Specs data or None if not found
        """
        try:
            specs = await self.db.specs.find_one(
                {'machine_id': machine_id},
                sort=[('timestamp', -1)]  # Get latest
            )
            return specs
        except Exception as e:
            logger.error(f"Error fetching specs for {machine_id}: {e}")
            return None
    
    # =========================================================================
    # 5-9. OTHER MONITORS - Pass through or minor transforms
    # =========================================================================
    
    def transform_hardware(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Hardware data is already perfect - pass through."""
        return agent_data
    
    def transform_security(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Security data is already perfect - pass through."""
        return agent_data
    
    def transform_usb(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """USB data is already perfect - pass through."""
        return agent_data
    
    def transform_event_logs(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Event logs - minor field rename.
        
        Frontend expects:
        - system: system_events
        - security: security_events
        - application: application_events
        """
        if not agent_data:
            return {}
        
        return {
            'system': agent_data.get('system_events', []),
            'security': agent_data.get('security_events', []),
            'application': agent_data.get('application_events', []),
            'critical': agent_data.get('critical_events', []),
            'summary': agent_data.get('summary', {}),
            'timestamp': agent_data.get('timestamp'),
        }
    
    def transform_peripherals(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Peripherals data is already perfect - pass through."""
        return agent_data
    
    def transform_services(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Services data - pass through."""
        return agent_data
    
    def transform_update(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update data - pass through."""
        return agent_data
    
    def transform_application(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Application/process data - minor field rename.
        
        Frontend expects at /processes:
        - summary: process_summary
        - top_cpu: top_by_cpu
        - top_memory: top_by_memory
        - categories: application_categories
        """
        if not agent_data:
            return {}
        
        return {
            'summary': agent_data.get('process_summary', {}),
            'top_cpu': agent_data.get('top_by_cpu', []),
            'top_memory': agent_data.get('top_by_memory', []),
            'categories': agent_data.get('application_categories', {}),
            'timestamp': agent_data.get('timestamp'),
        }
    
    # =========================================================================
    # MASTER TRANSFORMATION METHOD
    # =========================================================================
    
    async def transform_all_monitors(
        self, 
        machine_id: str,
        raw_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply all transformations to machine monitor data.
        
        Args:
            machine_id: Machine identifier
            raw_data: Dictionary of raw monitor data from agent
            
        Returns:
            Transformed data ready for frontend consumption
        """
        transformed = {}
        
        # Transform each monitor type
        if 'heartbeat' in raw_data:
            transformed['heartbeat'] = self.transform_heartbeat(raw_data['heartbeat'])
        
        if 'user_activity' in raw_data:
            transformed['user_activity'] = self.transform_user_activity(
                raw_data['user_activity']
            )
        
        if 'specs' in raw_data:
            transformed['specs'] = self.transform_specs(raw_data['specs'])
        
        if 'network' in raw_data:
            transformed['network'] = await self.transform_network(
                raw_data['network'], machine_id
            )
        
        if 'hardware' in raw_data:
            transformed['hardware'] = self.transform_hardware(raw_data['hardware'])
        
        if 'security' in raw_data:
            transformed['security'] = self.transform_security(raw_data['security'])
        
        if 'usb' in raw_data:
            transformed['usb'] = self.transform_usb(raw_data['usb'])
        
        if 'event_logs' in raw_data:
            transformed['logs'] = self.transform_event_logs(raw_data['event_logs'])
        
        if 'peripherals' in raw_data:
            transformed['peripherals'] = self.transform_peripherals(
                raw_data['peripherals']
            )
        
        if 'services' in raw_data:
            transformed['services'] = self.transform_services(raw_data['services'])
        
        if 'update' in raw_data:
            transformed['update'] = self.transform_update(raw_data['update'])
        
        if 'application' in raw_data:
            transformed['processes'] = self.transform_application(
                raw_data['application']
            )
        
        return transformed


# Singleton instance (will be initialized with DB in main.py)
_transformer_instance: Optional[DataTransformationService] = None


def get_transformer() -> DataTransformationService:
    """Get the global transformer instance."""
    if _transformer_instance is None:
        raise RuntimeError(
            "DataTransformationService not initialized. "
            "Call init_transformer(db) first."
        )
    return _transformer_instance


def init_transformer(db):
    """
    Initialize the global transformer instance.
    
    Args:
        db: MongoDB database instance
    """
    global _transformer_instance
    _transformer_instance = DataTransformationService(db)
    logger.info("DataTransformationService initialized")
