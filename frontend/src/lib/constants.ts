/**
 * Application Constants
 * Central location for all constant values used throughout the application
 */

/**
 * WebSocket Configuration
 */
export const WEBSOCKET_CONFIG = {
  RECONNECT_INTERVAL: 5000,           // 5 seconds
  MAX_RECONNECT_ATTEMPTS: 10,         // Maximum reconnection attempts
  BACKOFF_MULTIPLIER: 1.5,            // Exponential backoff multiplier
  MAX_BACKOFF_DELAY: 30000,           // 30 seconds maximum backoff
  HEARTBEAT_INTERVAL: 30000,          // 30 seconds
  CONNECTION_TIMEOUT: 10000,          // 10 seconds
} as const

/**
 * API Configuration
 */
export const API_CONFIG = {
  REQUEST_TIMEOUT: 30000,             // 30 seconds
  RETRY_ATTEMPTS: 3,                  // Number of retries for failed requests
  RETRY_DELAY: 1000,                  // 1 second between retries
  CACHE_TTL: 60000,                   // 1 minute cache TTL
  DEBOUNCE_DELAY: 300,                // 300ms for search/filter debounce
} as const

/**
 * Pagination Configuration
 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 24,
  PAGE_SIZE_OPTIONS: [12, 24, 48, 96],
  MAX_PAGE_SIZE: 100,
} as const

/**
 * Refresh Intervals
 */
export const REFRESH_INTERVALS = {
  DASHBOARD: 30000,                   // 30 seconds
  MACHINE_DETAIL: 10000,              // 10 seconds
  ANALYTICS: 60000,                   // 1 minute
  TIMELINE: 15000,                    // 15 seconds
  HISTORY_CHART: 300000,              // 5 minutes
} as const

/**
 * Chart Configuration
 */
export const CHART_CONFIG = {
  DEFAULT_HISTORY_HOURS: 24,
  MAX_DATA_POINTS: 100,
  ANIMATION_DURATION: 300,
  GRID_COLOR: '#f0f0f0',
  TOOLTIP_ANIMATION: 150,
} as const

/**
 * Threshold Values
 */
export const THRESHOLDS = {
  CPU_WARNING: 70,                    // 70%
  CPU_CRITICAL: 90,                   // 90%
  MEMORY_WARNING: 80,                 // 80%
  MEMORY_CRITICAL: 95,                // 95%
  DISK_WARNING: 80,                   // 80%
  DISK_CRITICAL: 90,                  // 90%
  TEMPERATURE_WARNING: 75,            // 75°C
  TEMPERATURE_CRITICAL: 85,           // 85°C
  HEALTH_SCORE_WARNING: 70,           // Score below 70
  HEALTH_SCORE_CRITICAL: 50,          // Score below 50
} as const

/**
 * Machine Status States
 */
export const MACHINE_STATES = {
  ONLINE: 'online',
  IDLE: 'idle',
  OFFLINE: 'offline',
  IN_USE: 'in-use',
  MAINTENANCE: 'maintenance',
  ERROR: 'error',
} as const

/**
 * Health Status States
 */
export const HEALTH_STATES = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const

/**
 * Alert Severity Levels
 */
export const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const

/**
 * Timeline Event Types
 */
export const EVENT_TYPES = {
  STATUS_CHANGE: 'status_change',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  HARDWARE_EVENT: 'hardware_event',
  MAINTENANCE: 'maintenance',
  ALERT: 'alert',
  SYSTEM_EVENT: 'system_event',
} as const

/**
 * Storage Types
 */
export const STORAGE_TYPES = {
  SSD: 'SSD',
  HDD: 'HDD',
  NVME: 'NVMe',
} as const

/**
 * Filter Default Values
 */
export const FILTER_DEFAULTS = {
  BUILDING: 'all',
  ROOM: 'all',
  STATUS: 'all',
  HEALTH_STATUS: 'all',
  CPU_AGE: 'all',
  TAG: 'all',
  GROUP: 'all',
  USER: 'all',
  SEARCH: '',
} as const

/**
 * Advanced Filter Default Values
 */
export const ADVANCED_FILTER_DEFAULTS = {
  CPU_USAGE_MIN: 0,
  CPU_USAGE_MAX: 100,
  MEMORY_USAGE_MIN: 0,
  MEMORY_USAGE_MAX: 100,
  DISK_USAGE_MIN: 0,
  DISK_USAGE_MAX: 100,
  HEALTH_SCORE_MIN: 0,
  CPU_CORES_MIN: 0,
  RAM_GB_MIN: 0,
  STORAGE_GB_MIN: 0,
  CPU_MODEL: 'all',
  OS_VERSION: 'all',
  STORAGE_TYPE: 'all',
  HARDWARE_MODEL: 'all',
  LAST_HEARTBEAT_WITHIN_MIN: 0,
  LAST_BOOT_WITHIN_HOURS: 0,
} as const

/**
 * Status Display Text
 */
export const STATUS_TEXT: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  offline: 'Offline',
  'in-use': 'In Use',
  maintenance: 'Maintenance',
  error: 'Error',
}

/**
 * Health Status Display Text
 */
export const HEALTH_TEXT: Record<string, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
}

/**
 * Performance Grade Thresholds
 */
export const PERFORMANCE_GRADES = {
  A: { min: 90, max: 100 },
  B: { min: 80, max: 89 },
  C: { min: 70, max: 79 },
  D: { min: 60, max: 69 },
  F: { min: 0, max: 59 },
} as const

/**
 * Color Palette (matches design system)
 */
export const COLORS = {
  // Status Colors
  STATUS_ONLINE: '#22c55e',
  STATUS_IDLE: '#fbbf24',
  STATUS_OFFLINE: '#94a3b8',
  STATUS_IN_USE: '#3b82f6',
  STATUS_MAINTENANCE: '#a855f7',
  STATUS_ERROR: '#ef4444',
  
  // Health Colors
  HEALTH_HEALTHY: '#22c55e',
  HEALTH_WARNING: '#f59e0b',
  HEALTH_CRITICAL: '#ef4444',
  
  // Chart Colors
  CHART_CPU: '#3b82f6',
  CHART_MEMORY: '#8b5cf6',
  CHART_DISK: '#ec4899',
  CHART_NETWORK: '#10b981',
  CHART_TEMPERATURE: '#f59e0b',
  
  // UI Colors
  BACKGROUND: '#ffffff',
  BACKGROUND_SECONDARY: '#f8fafc',
  BORDER: '#e2e8f0',
  TEXT_PRIMARY: '#1e293b',
  TEXT_SECONDARY: '#64748b',
  TEXT_MUTED: '#94a3b8',
} as const

/**
 * CPU Generation Mapping
 */
export const CPU_GENERATIONS: Record<string, number> = {
  'Intel Core i3-10': 10,
  'Intel Core i5-10': 10,
  'Intel Core i7-10': 10,
  'Intel Core i3-11': 11,
  'Intel Core i5-11': 11,
  'Intel Core i7-11': 11,
  'Intel Core i3-12': 12,
  'Intel Core i5-12': 12,
  'Intel Core i7-12': 12,
  'Intel Core i3-13': 13,
  'Intel Core i5-13': 13,
  'Intel Core i7-13': 13,
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format uptime to human-readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) {
    return `${days}d ${hours}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

/**
 * Get status color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case MACHINE_STATES.ONLINE:
      return COLORS.STATUS_ONLINE
    case MACHINE_STATES.IDLE:
      return COLORS.STATUS_IDLE
    case MACHINE_STATES.OFFLINE:
      return COLORS.STATUS_OFFLINE
    case MACHINE_STATES.IN_USE:
      return COLORS.STATUS_IN_USE
    case MACHINE_STATES.MAINTENANCE:
      return COLORS.STATUS_MAINTENANCE
    case MACHINE_STATES.ERROR:
      return COLORS.STATUS_ERROR
    default:
      return COLORS.STATUS_OFFLINE
  }
}

/**
 * Get health color
 */
export function getHealthColor(health: string): string {
  switch (health) {
    case HEALTH_STATES.HEALTHY:
      return COLORS.HEALTH_HEALTHY
    case HEALTH_STATES.WARNING:
      return COLORS.HEALTH_WARNING
    case HEALTH_STATES.CRITICAL:
      return COLORS.HEALTH_CRITICAL
    default:
      return COLORS.TEXT_MUTED
  }
}

/**
 * Get status text
 */
export function getStatusText(status: string): string {
  return STATUS_TEXT[status] || status
}

/**
 * Get health text
 */
export function getHealthText(health: string): string {
  return HEALTH_TEXT[health] || health
}

/**
 * Calculate health score based on metrics
 */
export function calculateHealthScore(metrics: {
  cpu_usage_percent: number
  memory_usage_percent: number
  disk_usage_percent: number
  cpu_temperature_c: number | null
}): number {
  let score = 100
  
  // CPU usage penalty
  if (metrics.cpu_usage_percent > THRESHOLDS.CPU_CRITICAL) {
    score -= 30
  } else if (metrics.cpu_usage_percent > THRESHOLDS.CPU_WARNING) {
    score -= 15
  }
  
  // Memory usage penalty
  if (metrics.memory_usage_percent > THRESHOLDS.MEMORY_CRITICAL) {
    score -= 25
  } else if (metrics.memory_usage_percent > THRESHOLDS.MEMORY_WARNING) {
    score -= 10
  }
  
  // Disk usage penalty
  if (metrics.disk_usage_percent > THRESHOLDS.DISK_CRITICAL) {
    score -= 20
  } else if (metrics.disk_usage_percent > THRESHOLDS.DISK_WARNING) {
    score -= 10
  }
  
  // Temperature penalty
  if (metrics.cpu_temperature_c !== null) {
    if (metrics.cpu_temperature_c > THRESHOLDS.TEMPERATURE_CRITICAL) {
      score -= 25
    } else if (metrics.cpu_temperature_c > THRESHOLDS.TEMPERATURE_WARNING) {
      score -= 10
    }
  }
  
  return Math.max(0, Math.min(100, score))
}

/**
 * Get performance grade from score
 */
export function getPerformanceGrade(score: number): string {
  if (score >= PERFORMANCE_GRADES.A.min) return 'A'
  if (score >= PERFORMANCE_GRADES.B.min) return 'B'
  if (score >= PERFORMANCE_GRADES.C.min) return 'C'
  if (score >= PERFORMANCE_GRADES.D.min) return 'D'
  return 'F'
}

/**
 * Local Storage Keys
 */
export const STORAGE_KEYS = {
  SAVED_FILTERS: 'ucms_saved_filters',
  ACTIVE_PRESET: 'ucms_active_preset',
  THEME_PREFERENCE: 'ucms_theme',
  DASHBOARD_LAYOUT: 'ucms_dashboard_layout',
  USER_PREFERENCES: 'ucms_user_preferences',
} as const
