/**
 * Timezone Utilities - Dynamic Timezone Handling
 * 
 * Automatically detects and uses the user's browser timezone
 * instead of hardcoding to GMT/UTC
 */

/**
 * Get the user's current timezone
 * @returns IANA timezone string (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Get timezone offset in hours
 * @returns Offset in hours (e.g., -5 for EST, +1 for CET)
 */
export function getTimezoneOffset(): number {
  const offsetMinutes = new Date().getTimezoneOffset()
  return -offsetMinutes / 60 // Negative because getTimezoneOffset returns opposite sign
}

/**
 * Get timezone abbreviation (e.g., "EST", "PST", "GMT")
 */
export function getTimezoneAbbreviation(): string {
  const dateStr = new Date().toLocaleTimeString('en-US', { 
    timeZoneName: 'short' 
  })
  const match = dateStr.match(/\b([A-Z]{2,5})\b$/)
  return match ? match[1] : 'Local'
}

/**
 * Format date with user's timezone
 */
export function formatDateWithTimezone(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: getUserTimezone(),
    ...options
  }
  
  return dateObj.toLocaleString(undefined, defaultOptions)
}

/**
 * Format time only with user's timezone
 */
export function formatTimeWithTimezone(
  date: Date | string | number,
  includeSeconds: boolean = false
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  
  return dateObj.toLocaleTimeString(undefined, {
    timeZone: getUserTimezone(),
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds && { second: '2-digit' }),
    hour12: true
  })
}

/**
 * Format date only with user's timezone
 */
export function formatDateOnlyWithTimezone(
  date: Date | string | number | null | undefined,
  format: 'short' | 'medium' | 'long' | 'full' = 'medium'
): string {
  if (!date) return 'N/A'
  
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  
  // Check if date is valid
  if (isNaN(dateObj.getTime())) return 'N/A'
  
  const formatOptions: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  }
  
  return dateObj.toLocaleDateString(undefined, {
    timeZone: getUserTimezone(),
    ...formatOptions[format]
  })
}

/**
 * Format relative time with timezone awareness
 * Shows "X minutes ago" or exact timestamp for older dates
 */
export function formatRelativeTimeWithTimezone(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffSeconds < 10) {
    return 'Just now'
  } else if (diffSeconds < 60) {
    return `${diffSeconds}s ago`
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays === 1) {
    return `Yesterday at ${formatTimeWithTimezone(dateObj)}`
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return formatDateOnlyWithTimezone(dateObj, 'medium')
  }
}

/**
 * Format exact timestamp for tooltips/detailed views
 */
export function formatExactTimestampWithTimezone(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  
  return dateObj.toLocaleString(undefined, {
    timeZone: getUserTimezone(),
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })
}

/**
 * Format for chart labels (adaptive based on time range)
 */
export function formatChartTimeLabel(
  date: Date | string | number,
  range: '1h' | '6h' | '24h' | '7d' | '30d'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  
  if (range === '1h' || range === '6h' || range === '24h') {
    // Show time only for short ranges
    return formatTimeWithTimezone(dateObj, false)
  } else {
    // Show date + time for longer ranges
    return dateObj.toLocaleString(undefined, {
      timeZone: getUserTimezone(),
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }
}

/**
 * Check if a timestamp indicates the machine is offline
 * Returns true if last heartbeat is older than threshold
 */
export function isOfflineByTimestamp(
  lastHeartbeat: Date | string | number,
  thresholdMinutes: number = 5
): boolean {
  const dateObj = typeof lastHeartbeat === 'string' || typeof lastHeartbeat === 'number' 
    ? new Date(lastHeartbeat) 
    : lastHeartbeat
  
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  
  return diffMinutes > thresholdMinutes
}

/**
 * Calculate time gap for showing offline periods
 * Returns the duration in a human-readable format
 */
export function calculateTimeGap(
  startTime: Date | string | number,
  endTime: Date | string | number
): {
  duration: string
  durationMs: number
  isSignificant: boolean // True if gap is > 5 minutes
} {
  const start = typeof startTime === 'string' || typeof startTime === 'number' 
    ? new Date(startTime) 
    : startTime
  const end = typeof endTime === 'string' || typeof endTime === 'number' 
    ? new Date(endTime) 
    : endTime
  
  const diffMs = end.getTime() - start.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  let duration: string
  if (diffMinutes < 1) {
    duration = 'less than 1 minute'
  } else if (diffMinutes < 60) {
    duration = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`
  } else if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60
    duration = remainingMinutes > 0 
      ? `${diffHours}h ${remainingMinutes}m` 
      : `${diffHours} hour${diffHours !== 1 ? 's' : ''}`
  } else {
    const remainingHours = diffHours % 24
    duration = remainingHours > 0 
      ? `${diffDays}d ${remainingHours}h` 
      : `${diffDays} day${diffDays !== 1 ? 's' : ''}`
  }
  
  return {
    duration,
    durationMs: diffMs,
    isSignificant: diffMinutes >= 5
  }
}

/**
 * Format uptime duration
 */
export function formatUptimeDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  
  return parts.join(' ')
}

/**
 * Get timezone display info for UI
 */
export function getTimezoneDisplayInfo(): {
  timezone: string
  abbreviation: string
  offset: string
  fullDisplay: string
} {
  const timezone = getUserTimezone()
  const abbreviation = getTimezoneAbbreviation()
  const offsetHours = getTimezoneOffset()
  const offsetSign = offsetHours >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetHours)
  const offset = `UTC${offsetSign}${offsetAbs}`
  
  return {
    timezone,
    abbreviation,
    offset,
    fullDisplay: `${abbreviation} (${offset})`
  }
}

// Re-export all functions for easy debugging
export const timezoneUtils = {
  getUserTimezone,
  getTimezoneOffset,
  getTimezoneAbbreviation,
  formatDateWithTimezone,
  formatTimeWithTimezone,
  formatDateOnlyWithTimezone,
  formatRelativeTimeWithTimezone,
  formatExactTimestampWithTimezone,
  formatChartTimeLabel,
  isOfflineByTimestamp,
  calculateTimeGap,
  formatUptimeDuration,
  getTimezoneDisplayInfo
}