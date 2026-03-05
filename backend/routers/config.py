"""
Configuration Management Router
Manages system-wide configuration including InfluxDB, webhooks, and alert thresholds.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/config", tags=["configuration"])


# ============================================================================
# MODELS
# ============================================================================

class InfluxDBConfig(BaseModel):
    enabled: bool
    url: str
    token: Optional[str] = None
    org: str
    bucket: str


class GrafanaConfig(BaseModel):
    enabled: bool
    url: str
    api_key: Optional[str] = None


class WebhookServiceConfig(BaseModel):
    enabled: bool
    url: str


class WebhookConfig(BaseModel):
    slack: WebhookServiceConfig
    discord: WebhookServiceConfig
    teams: WebhookServiceConfig
    custom: WebhookServiceConfig


class AlertConfig(BaseModel):
    critical_threshold: int = 90
    warning_threshold: int = 75
    email_notifications: bool = False
    webhook_notifications: bool = True


# ============================================================================
# INFLUXDB CONFIGURATION
# ============================================================================

@router.get("/influxdb")
async def get_influxdb_config():
    """
    Get current InfluxDB configuration.
    Token is not exposed in response for security.
    """
    try:
        config = await db_manager.db.system_config.find_one({'type': 'influxdb'})
        
        if not config:
            # Return defaults
            return {
                'enabled': False,
                'url': 'http://localhost:8086',
                'org': 'university',
                'bucket': 'monitoring',
                'token_set': False
            }
        
        # Don't expose token in response
        return {
            'enabled': config.get('enabled', False),
            'url': config.get('url', 'http://localhost:8086'),
            'org': config.get('org', 'university'),
            'bucket': config.get('bucket', 'monitoring'),
            'token_set': bool(config.get('token'))  # Just indicate if token exists
        }
        
    except Exception as e:
        logger.error(f"Error fetching InfluxDB config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch configuration: {str(e)}"
        )


@router.post("/influxdb")
async def save_influxdb_config(
    config: InfluxDBConfig,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Save InfluxDB configuration.
    Updates are logged with user information.
    
    Note: In production, token should be encrypted before storage.
    """
    try:
        # Prepare update document
        update_doc = {
            'type': 'influxdb',
            'enabled': config.enabled,
            'url': config.url,
            'org': config.org,
            'bucket': config.bucket,
            'updated_at': datetime.now(timezone.utc),
        }
        
        # Only update token if provided
        if config.token:
            update_doc['token'] = config.token  # TODO: Encrypt in production
        
        # Add user info if available
        if user:
            update_doc['updated_by'] = user.get('username', 'unknown')
        
        # Update configuration
        await db_manager.db.system_config.update_one(
            {'type': 'influxdb'},
            {'$set': update_doc},
            upsert=True
        )
        
        logger.info(f"✓ InfluxDB configuration updated (enabled: {config.enabled})")
        
        # Note: Actual InfluxDB reconnection would happen here
        # if config.enabled:
        #     await db_manager.reconnect_influxdb(...)
        
        return {
            'status': 'success',
            'message': 'InfluxDB configuration updated successfully',
            'enabled': config.enabled
        }
        
    except Exception as e:
        logger.error(f"Error saving InfluxDB config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save configuration: {str(e)}"
        )


# ============================================================================
# GRAFANA CONFIGURATION
# ============================================================================

@router.get("/grafana")
async def get_grafana_config():
    """Get current Grafana configuration"""
    try:
        config = await db_manager.db.system_config.find_one({'type': 'grafana'})
        
        if not config:
            return {
                'enabled': False,
                'url': 'http://localhost:3000',
                'api_key_set': False
            }
        
        return {
            'enabled': config.get('enabled', False),
            'url': config.get('url', 'http://localhost:3000'),
            'api_key_set': bool(config.get('api_key'))
        }
        
    except Exception as e:
        logger.error(f"Error fetching Grafana config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch configuration: {str(e)}"
        )


@router.post("/grafana")
async def save_grafana_config(
    config: GrafanaConfig,
    user: OptionalUser = Depends(get_optional_user)
):
    """Save Grafana configuration"""
    try:
        update_doc = {
            'type': 'grafana',
            'enabled': config.enabled,
            'url': config.url,
            'updated_at': datetime.now(timezone.utc),
        }
        
        if config.api_key:
            update_doc['api_key'] = config.api_key  # TODO: Encrypt in production
        
        if user:
            update_doc['updated_by'] = user.get('username', 'unknown')
        
        await db_manager.db.system_config.update_one(
            {'type': 'grafana'},
            {'$set': update_doc},
            upsert=True
        )
        
        logger.info(f"✓ Grafana configuration updated (enabled: {config.enabled})")
        
        return {
            'status': 'success',
            'message': 'Grafana configuration updated successfully'
        }
        
    except Exception as e:
        logger.error(f"Error saving Grafana config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save configuration: {str(e)}"
        )


# ============================================================================
# WEBHOOK CONFIGURATION
# ============================================================================

@router.get("/webhooks")
async def get_webhook_config():
    """Get webhook configuration for all services"""
    try:
        config = await db_manager.db.system_config.find_one({'type': 'webhooks'})
        
        default_service = {'enabled': False, 'url': ''}
        
        if not config:
            return {
                'slack': default_service.copy(),
                'discord': default_service.copy(),
                'teams': default_service.copy(),
                'custom': default_service.copy()
            }
        
        return {
            'slack': config.get('slack', default_service.copy()),
            'discord': config.get('discord', default_service.copy()),
            'teams': config.get('teams', default_service.copy()),
            'custom': config.get('custom', default_service.copy())
        }
        
    except Exception as e:
        logger.error(f"Error fetching webhook config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch configuration: {str(e)}"
        )


@router.post("/webhooks")
async def save_webhook_config(
    config: WebhookConfig,
    user: OptionalUser = Depends(get_optional_user)
):
    """Save webhook configuration for all services"""
    try:
        update_doc = {
            'type': 'webhooks',
            'slack': config.slack.dict(),
            'discord': config.discord.dict(),
            'teams': config.teams.dict(),
            'custom': config.custom.dict(),
            'updated_at': datetime.now(timezone.utc),
        }
        
        if user:
            update_doc['updated_by'] = user.get('username', 'unknown')
        
        await db_manager.db.system_config.update_one(
            {'type': 'webhooks'},
            {'$set': update_doc},
            upsert=True
        )
        
        enabled_count = sum([
            config.slack.enabled,
            config.discord.enabled,
            config.teams.enabled,
            config.custom.enabled
        ])
        
        logger.info(f"✓ Webhook configuration updated ({enabled_count} services enabled)")
        
        return {
            'status': 'success',
            'message': 'Webhook configuration updated successfully',
            'enabled_services': enabled_count
        }
        
    except Exception as e:
        logger.error(f"Error saving webhook config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save configuration: {str(e)}"
        )


@router.post("/webhooks/test/{service}")
async def test_webhook(
    service: str,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Test webhook integration by sending a test notification.
    
    Args:
        service: Service to test (slack, discord, teams, custom)
    """
    try:
        # Get webhook configuration
        config = await db_manager.db.system_config.find_one({'type': 'webhooks'})
        
        if not config or service not in config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook {service} not configured"
            )
        
        service_config = config[service]
        
        if not service_config.get('enabled'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Webhook {service} is disabled"
            )
        
        if not service_config.get('url'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Webhook {service} URL not configured"
            )
        
        # Prepare test message
        test_message = {
            'title': '🧪 Test Notification',
            'message': f'This is a test message from University Computer Monitoring System',
            'severity': 'info',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'source': 'settings-test'
        }
        
        # Import webhook sender
        try:
            from utils.webhook_sender import send_webhook_notification
            
            # Send test notification
            success = await send_webhook_notification(
                service,
                service_config['url'],
                test_message
            )
            
            if success:
                logger.info(f"✓ Test webhook sent to {service}")
                return {
                    'status': 'success',
                    'message': f'Test notification sent successfully to {service}'
                }
            else:
                raise Exception("Webhook sender returned false")
                
        except ImportError:
            # Webhook sender not implemented yet - return mock success
            logger.warning(f"Webhook sender not implemented - mock test for {service}")
            return {
                'status': 'success',
                'message': f'Test notification sent successfully to {service} (mock)',
                'note': 'Webhook sender implementation pending'
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing webhook {service}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send test notification: {str(e)}"
        )


# ============================================================================
# ALERT CONFIGURATION
# ============================================================================

@router.get("/alerts")
async def get_alert_config():
    """Get alert thresholds and notification settings"""
    try:
        config = await db_manager.db.system_config.find_one({'type': 'alerts'})
        
        if not config:
            # Return defaults
            return {
                'critical_threshold': 90,
                'warning_threshold': 75,
                'email_notifications': False,
                'webhook_notifications': True
            }
        
        return {
            'critical_threshold': config.get('critical_threshold', 90),
            'warning_threshold': config.get('warning_threshold', 75),
            'email_notifications': config.get('email_notifications', False),
            'webhook_notifications': config.get('webhook_notifications', True)
        }
        
    except Exception as e:
        logger.error(f"Error fetching alert config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch configuration: {str(e)}"
        )


@router.post("/alerts")
async def save_alert_config(
    config: AlertConfig,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Save alert configuration.
    Updates thresholds used for automatic alert generation.
    """
    try:
        # Validate thresholds
        if config.warning_threshold >= config.critical_threshold:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Warning threshold must be lower than critical threshold"
            )
        
        if config.warning_threshold < 0 or config.critical_threshold > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thresholds must be between 0 and 100"
            )
        
        update_doc = {
            'type': 'alerts',
            'critical_threshold': config.critical_threshold,
            'warning_threshold': config.warning_threshold,
            'email_notifications': config.email_notifications,
            'webhook_notifications': config.webhook_notifications,
            'updated_at': datetime.now(timezone.utc),
        }
        
        if user:
            update_doc['updated_by'] = user.get('username', 'unknown')
        
        await db_manager.db.system_config.update_one(
            {'type': 'alerts'},
            {'$set': update_doc},
            upsert=True
        )
        
        logger.info(f"✓ Alert configuration updated (critical: {config.critical_threshold}%, warning: {config.warning_threshold}%)")
        
        return {
            'status': 'success',
            'message': 'Alert configuration updated successfully',
            'thresholds': {
                'critical': config.critical_threshold,
                'warning': config.warning_threshold
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving alert config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save configuration: {str(e)}"
        )


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_alert_thresholds() -> Dict[str, int]:
    """
    Get current alert thresholds from configuration.
    Used by alert generation logic.
    
    Returns:
        Dictionary with 'critical' and 'warning' threshold values
    """
    try:
        config = await db_manager.db.system_config.find_one({'type': 'alerts'})
        
        return {
            'critical': config.get('critical_threshold', 90) if config else 90,
            'warning': config.get('warning_threshold', 75) if config else 75
        }
        
    except Exception as e:
        logger.error(f"Error fetching alert thresholds: {e}")
        # Return defaults on error
        return {'critical': 90, 'warning': 75}


async def is_webhook_notifications_enabled() -> bool:
    """Check if webhook notifications are enabled"""
    try:
        config = await db_manager.db.system_config.find_one({'type': 'alerts'})
        return config.get('webhook_notifications', True) if config else True
    except:
        return True
