"""
test_data_transformer.py - Unit tests for DataTransformationService

Tests all 9 critical transformations with real agent data samples.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.utils.data_transformer import DataTransformationService


# ============================================================================
# SAMPLE AGENT DATA (from actual monitors)
# ============================================================================

SAMPLE_HEARTBEAT = {
    "status": {
        "status": "online",
        "has_active_user": True,
        "user_count": 2,
        "boot_time_epoch": 1709640000,
        "boot_time_iso": "2024-03-05T10:00:00+00:00",
        "uptime_seconds": 86400,
        "last_seen_epoch": 1709726400,
        "last_seen_iso": "2024-03-06T10:00:00+00:00"
    },
    "resources": {
        "cpu_usage_percent": 45.2,
        "cpu_usage_per_core": [42.0, 48.0, 44.0, 46.5],
        "cpu_core_count": 4,
        "cpu_thread_count": 8,
        "memory_total_gb": 16.0,
        "memory_used_gb": 8.5,
        "memory_available_gb": 7.5,
        "memory_usage_percent": 53.1,
        "disk_total_gb": 500.0,
        "disk_used_gb": 325.0,
        "disk_free_gb": 175.0,
        "disk_usage_percent": 65.0,
        "process_count": 145
    },
    "network": {
        "internet_accessible": True,
        "bytes_sent": 1234567890,
        "bytes_recv": 9876543210,
        "packets_sent": 12345,
        "packets_recv": 54321,
        "errors_in": 0,
        "errors_out": 0,
        "drops_in": 0,
        "drops_out": 0
    },
    "health_summary": {
        "system_health": "healthy",
        "health_score": 95,
        "issues": [],
        "alerts": []
    }
}

SAMPLE_USER_ACTIVITY = {
    "active_user": "jsmith",
    "active_sessions": [
        {
            "user": "jsmith",
            "terminal": "console",
            "host": "local",
            "started_epoch": 1709640000,
            "started_iso": "2024-03-05T10:00:00+00:00"
        }
    ],
    "login_history_24h": [
        {
            "user": "jsmith",
            "login_time_epoch": 1709640000,
            "login_time_iso": "2024-03-05T10:00:00+00:00",
            "duration_seconds": 86400
        }
    ],
    "user_summary": {
        "total_sessions": 1,
        "unique_users": 1,
        "current_user": "jsmith"
    }
}

SAMPLE_SPECS = {
    "cpu": {
        "model_name": "Intel Core i7-9700K",
        "physical_cores": 8,
        "logical_cores": 8,
        "frequency_max_mhz": 4900.0,
        "frequency_current_mhz": 3600.0,
        "architecture": "x86_64"
    },
    "memory": {
        "total_gb": 16.0,
        "modules": [
            {
                "capacity_gb": 8.0,
                "speed_mhz": 3200,
                "memory_type": "DDR4",
                "slot": "DIMM 1"
            },
            {
                "capacity_gb": 8.0,
                "speed_mhz": 3200,
                "memory_type": "DDR4",
                "slot": "DIMM 2"
            }
        ],
        "memory_type": "DDR4"
    },
    "storage": {
        "physical_disks": [
            {
                "model": "Samsung 970 EVO",
                "size_gb": 500.0,
                "media_type": "NVMe SSD"
            }
        ],
        "partitions": [
            {
                "device": "C:",
                "mountpoint": "C:",
                "fstype": "NTFS",
                "total_gb": 465.0,
                "used_gb": 302.5,
                "free_gb": 162.5,
                "used_pct": 65.0
            }
        ],
        "total_physical_gb": 500.0
    }
}

SAMPLE_NETWORK = {
    "primary_ip": "192.168.1.100",
    "gateway": "192.168.1.1",
    "dns_servers": ["8.8.8.8", "8.8.4.4"],
    "quality_score": 95,
    "online": True,
    "interfaces": [
        {
            "name": "Wi-Fi",
            "is_up": True,
            "speed_mbps": 300,
            "ipv4": [{"address": "192.168.1.100", "netmask": "255.255.255.0"}],
            "has_gateway": True,
            "gateway": "192.168.1.1"
        },
        {
            "name": "Ethernet",
            "is_up": False,
            "speed_mbps": 1000,
            "ipv4": []
        }
    ]
}

SAMPLE_SPECS_WITH_NETWORK = {
    "network": [
        {
            "name": "Wi-Fi",
            "mac_address": "AA:BB:CC:DD:EE:FF",
            "adapter": "Intel Wi-Fi 6 AX200"
        },
        {
            "name": "Ethernet",
            "mac_address": "11:22:33:44:55:66",
            "adapter": "Realtek PCIe GbE"
        }
    ]
}


# ============================================================================
# TESTS
# ============================================================================

class TestHeartbeatTransformation:
    """Test heartbeat data flattening."""
    
    def test_flatten_heartbeat_structure(self):
        """Test that nested heartbeat structure is flattened correctly."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_heartbeat(SAMPLE_HEARTBEAT)
        
        # Check resources flattened to top level
        assert result['cpu_usage_percent'] == 45.2
        assert result['memory_usage_percent'] == 53.1
        assert result['disk_usage_percent'] == 65.0
        assert result['process_count'] == 145
        
        # Check network flattened to top level
        assert result['internet_accessible'] is True
        assert result['bytes_sent'] == 1234567890
        
        # Check status flattened to top level
        assert result['status'] == 'online'
        assert result['uptime_seconds'] == 86400
        
        # Check health flattened to top level
        assert result['health_score'] == 95
        assert result['system_health'] == 'healthy'
    
    def test_heartbeat_handles_missing_sections(self):
        """Test graceful handling of missing nested sections."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        partial_data = {"status": {"status": "online"}}
        result = transformer.transform_heartbeat(partial_data)
        
        assert result['status'] == 'online'
        assert result['cpu_usage_percent'] is None
        assert result['health_score'] is None


class TestUserActivityTransformation:
    """Test user activity field renaming."""
    
    def test_rename_active_user_to_current_username(self):
        """Test active_user → current_username rename."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_user_activity(SAMPLE_USER_ACTIVITY)
        
        # Check field renamed
        assert result['current_username'] == 'jsmith'
        assert 'active_user' not in result
    
    def test_provide_both_login_history_formats(self):
        """Test that both login_history and login_history_24h are provided."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_user_activity(SAMPLE_USER_ACTIVITY)
        
        # Both should exist for compatibility
        assert 'login_history' in result
        assert 'login_history_24h' in result
        assert len(result['login_history']) == 1
        assert result['login_history'][0]['user'] == 'jsmith'
    
    def test_provide_sessions_alias(self):
        """Test that sessions alias is provided for active_sessions."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_user_activity(SAMPLE_USER_ACTIVITY)
        
        assert 'sessions' in result
        assert len(result['sessions']) == 1


class TestSpecsTransformation:
    """Test specs storage flattening and unit conversions."""
    
    def test_flatten_storage_partitions(self):
        """Test storage.partitions → storage array flatten."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_specs(SAMPLE_SPECS)
        
        # storage should now be an array
        assert isinstance(result['storage'], list)
        assert len(result['storage']) == 1
        assert result['storage'][0]['device'] == 'C:'
        
        # Full storage object should be preserved
        assert 'storage_detailed' in result
        assert result['storage_detailed']['total_physical_gb'] == 500.0
    
    def test_cpu_frequency_mhz_to_ghz_conversion(self):
        """Test MHz → GHz conversion for CPU frequencies."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_specs(SAMPLE_SPECS)
        
        # Check conversions
        assert result['cpu_base_clock_ghz'] == 3.6  # 3600 MHz → 3.6 GHz
        assert result['cpu_max_clock_ghz'] == 4.9   # 4900 MHz → 4.9 GHz
    
    def test_derive_memory_speed_from_first_module(self):
        """Test that memory_speed_mhz is derived from first module."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        result = transformer.transform_specs(SAMPLE_SPECS)
        
        assert result['memory_speed_mhz'] == 3200


class TestNetworkTransformation:
    """Test network data enrichment with MAC addresses."""
    
    @pytest.mark.asyncio
    async def test_merge_mac_addresses_from_specs(self):
        """Test that MAC addresses are merged from specs data."""
        db = MagicMock()
        db.specs = MagicMock()
        db.specs.find_one = AsyncMock(return_value=SAMPLE_SPECS_WITH_NETWORK)
        
        transformer = DataTransformationService(db)
        
        result = await transformer.transform_network(SAMPLE_NETWORK, 'test-machine-1')
        
        # Check MAC addresses were added
        wifi_iface = next(i for i in result['interfaces'] if i['name'] == 'Wi-Fi')
        eth_iface = next(i for i in result['interfaces'] if i['name'] == 'Ethernet')
        
        assert wifi_iface['mac_address'] == 'AA:BB:CC:DD:EE:FF'
        assert eth_iface['mac_address'] == '11:22:33:44:55:66'
    
    @pytest.mark.asyncio
    async def test_add_connection_type(self):
        """Test that connection_type is detected and added."""
        db = MagicMock()
        db.specs = MagicMock()
        db.specs.find_one = AsyncMock(return_value=None)
        
        transformer = DataTransformationService(db)
        
        result = await transformer.transform_network(SAMPLE_NETWORK, 'test-machine-1')
        
        wifi_iface = next(i for i in result['interfaces'] if i['name'] == 'Wi-Fi')
        eth_iface = next(i for i in result['interfaces'] if i['name'] == 'Ethernet')
        
        assert wifi_iface['connection_type'] == 'wireless'
        assert eth_iface['connection_type'] == 'wired'
    
    def test_detect_connection_type_wireless(self):
        """Test wireless detection."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        assert transformer._detect_connection_type('Wi-Fi') == 'wireless'
        assert transformer._detect_connection_type('Wireless Network') == 'wireless'
        assert transformer._detect_connection_type('WLAN') == 'wireless'
    
    def test_detect_connection_type_wired(self):
        """Test wired detection."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        assert transformer._detect_connection_type('Ethernet') == 'wired'
        assert transformer._detect_connection_type('Local Area Connection') == 'wired'
        assert transformer._detect_connection_type('LAN') == 'wired'
    
    def test_detect_connection_type_mobile(self):
        """Test mobile detection."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        assert transformer._detect_connection_type('Cellular') == 'mobile'
        assert transformer._detect_connection_type('Mobile Broadband') == 'mobile'
        assert transformer._detect_connection_type('5G Connection') == 'mobile'


class TestEventLogsTransformation:
    """Test event logs field mapping."""
    
    def test_map_event_log_fields(self):
        """Test that event log fields are mapped correctly."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        sample_logs = {
            'system_events': [{'event_id': 1000}],
            'security_events': [{'event_id': 4624}],
            'application_events': [{'event_id': 1001}],
            'critical_events': [{'event_id': 7000}]
        }
        
        result = transformer.transform_event_logs(sample_logs)
        
        assert 'system' in result
        assert 'security' in result
        assert 'application' in result
        assert 'critical' in result
        assert len(result['system']) == 1
        assert result['system'][0]['event_id'] == 1000


class TestApplicationTransformation:
    """Test application/process data field mapping."""
    
    def test_map_application_fields(self):
        """Test that application fields are mapped correctly."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        sample_app = {
            'process_summary': {'total_processes': 150},
            'top_by_cpu': [{'name': 'chrome.exe', 'cpu_percent': 25.0}],
            'top_by_memory': [{'name': 'chrome.exe', 'memory_mb': 512.0}],
            'application_categories': {'browsers': 5, 'system': 45}
        }
        
        result = transformer.transform_application(sample_app)
        
        assert 'summary' in result
        assert 'top_cpu' in result
        assert 'top_memory' in result
        assert 'categories' in result
        assert result['summary']['total_processes'] == 150


class TestMasterTransformation:
    """Test the master transformation method."""
    
    @pytest.mark.asyncio
    async def test_transform_all_monitors(self):
        """Test that all monitors are transformed correctly."""
        db = MagicMock()
        db.specs = MagicMock()
        db.specs.find_one = AsyncMock(return_value=SAMPLE_SPECS_WITH_NETWORK)
        
        transformer = DataTransformationService(db)
        
        raw_data = {
            'heartbeat': SAMPLE_HEARTBEAT,
            'user_activity': SAMPLE_USER_ACTIVITY,
            'specs': SAMPLE_SPECS,
            'network': SAMPLE_NETWORK
        }
        
        result = await transformer.transform_all_monitors('test-machine-1', raw_data)
        
        # Check all transformations applied
        assert 'heartbeat' in result
        assert 'user_activity' in result
        assert 'specs' in result
        assert 'network' in result
        
        # Spot check transformations
        assert result['heartbeat']['cpu_usage_percent'] == 45.2  # Flattened
        assert result['user_activity']['current_username'] == 'jsmith'  # Renamed
        assert isinstance(result['specs']['storage'], list)  # Flattened
        assert 'mac_address' in result['network']['interfaces'][0]  # Enriched


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestRealWorldScenarios:
    """Test with realistic scenarios."""
    
    def test_empty_data_handling(self):
        """Test graceful handling of empty/None data."""
        db = MagicMock()
        transformer = DataTransformationService(db)
        
        assert transformer.transform_heartbeat(None) == {}
        assert transformer.transform_heartbeat({}) == {}
        assert transformer.transform_user_activity(None) == {}
        assert transformer.transform_specs({}) == {}
    
    @pytest.mark.asyncio
    async def test_missing_specs_for_network(self):
        """Test network transformation when specs don't exist."""
        db = MagicMock()
        db.specs = MagicMock()
        db.specs.find_one = AsyncMock(return_value=None)
        
        transformer = DataTransformationService(db)
        
        result = await transformer.transform_network(SAMPLE_NETWORK, 'test-machine-1')
        
        # Should still work, just no MAC addresses
        assert 'interfaces' in result
        assert result['interfaces'][0].get('mac_address') is None
        assert result['interfaces'][0]['connection_type'] in ['wireless', 'wired', 'mobile']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
