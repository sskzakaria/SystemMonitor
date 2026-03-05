/**
 * Application Configuration
 * Central place for all configuration values
 */

import { getBackendUrl, getWebSocketUrl } from './lib/network-utils'
import { PAGINATION_CONFIG, REFRESH_INTERVALS } from './lib/constants'

export const config = {
  /**
   * Backend API URL
   * Automatically detects:
   * - localhost → http://localhost:8001
   * - LAN IP → http://192.168.x.x:8001
   * - Can be overridden with VITE_API_URL environment variable
   */
  apiUrl: getBackendUrl(),
  
  /**
   * WebSocket URL (derived from API URL)
   * Automatically converts http → ws, https → wss
   */
  get wsUrl() {
    return getWebSocketUrl()
  },
  
  /**
   * Application name
   */
  appName: 'University Computer Monitoring System',
  
  /**
   * Default pagination limit
   */
  defaultPageSize: PAGINATION_CONFIG.DEFAULT_PAGE_SIZE,
  
  /**
   * Auto-refresh interval (in milliseconds)
   */
  refreshInterval: REFRESH_INTERVALS.DASHBOARD,
} as const

// Log configuration in development
if (import.meta.env?.DEV) {
  console.log('🔧 App Configuration:', {
    apiUrl: config.apiUrl,
    wsUrl: config.wsUrl,
    environment: import.meta.env?.MODE || 'unknown'
  })
}