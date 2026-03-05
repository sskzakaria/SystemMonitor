import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { MachineStatus } from '../types/monitor-schema'
import { 
  formatRelativeTimeWithTimezone, 
  formatExactTimestampWithTimezone,
  getUserTimezone 
} from './timezone-utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format duration in seconds to human-readable string
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m`
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  } else {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
}

// Get status color based on machine status
export function getStatusColor(status: MachineStatus): string {
  switch (status) {
    case 'active':
    case 'online':
      return 'text-green-600'
    case 'idle':
      return 'text-yellow-600'
    case 'offline':
      return 'text-gray-600'
    case 'maintenance':
      return 'text-blue-600'
    case 'error':
      return 'text-red-600'
    default:
      return 'text-gray-600'
  }
}

// Get progress bar color based on percentage and type
export function getProgressBarColor(
  percentage: number,
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'default' = 'default'
): string {
  // Critical threshold (red)
  if (percentage >= 90) {
    return 'bg-red-500'
  }
  // Warning threshold (yellow)
  if (percentage >= 75) {
    return 'bg-yellow-500'
  }
  // Normal threshold (green)
  return 'bg-green-500'
}

// Calculate health score based on metrics
export function calculateHealthScore(metrics: {
  cpu_usage_percent: number
  memory_usage_percent: number
  disk_usage_percent: number
  cpu_temp_celsius?: number
  status?: MachineStatus
}): {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  issues: string[]
  performance_grade: string
} {
  let score = 100
  const issues: string[] = []

  // CPU Usage Impact (max -30 points)
  if (metrics.cpu_usage_percent > 90) {
    score -= 30
    issues.push('CPU usage critically high (>90%)')
  } else if (metrics.cpu_usage_percent > 75) {
    score -= 15
    issues.push('CPU usage high (>75%)')
  } else if (metrics.cpu_usage_percent > 60) {
    score -= 5
  }

  // Memory Usage Impact (max -30 points)
  if (metrics.memory_usage_percent > 90) {
    score -= 30
    issues.push('Memory usage critically high (>90%)')
  } else if (metrics.memory_usage_percent > 75) {
    score -= 15
    issues.push('Memory usage high (>75%)')
  } else if (metrics.memory_usage_percent > 60) {
    score -= 5
  }

  // Disk Usage Impact (max -20 points)
  if (metrics.disk_usage_percent > 90) {
    score -= 20
    issues.push('Disk usage critically high (>90%)')
  } else if (metrics.disk_usage_percent > 80) {
    score -= 10
    issues.push('Disk usage high (>80%)')
  } else if (metrics.disk_usage_percent > 70) {
    score -= 5
  }

  // CPU Temperature Impact (max -20 points)
  if (metrics.cpu_temp_celsius) {
    if (metrics.cpu_temp_celsius > 85) {
      score -= 20
      issues.push('CPU temperature critically high (>85°C)')
    } else if (metrics.cpu_temp_celsius > 75) {
      score -= 10
      issues.push('CPU temperature high (>75°C)')
    } else if (metrics.cpu_temp_celsius > 65) {
      score -= 5
    }
  }

  // Status Impact
  if (metrics.status === 'offline') {
    score = 0
    issues.push('Machine is offline')
  } else if (metrics.status === 'error') {
    score -= 40
    issues.push('Machine has errors')
  }

  // Ensure score is between 0-100
  score = Math.max(0, Math.min(100, score))

  // Determine status
  let status: 'healthy' | 'warning' | 'critical'
  if (score >= 80) {
    status = 'healthy'
  } else if (score >= 60) {
    status = 'warning'
  } else {
    status = 'critical'
  }

  return {
    score,
    status,
    issues,
    performance_grade: getPerformanceGrade(score)
  }
}

// Get performance grade based on score
export function getPerformanceGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function formatNetworkSpeed(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} Gbps`
  }
  return `${mbps.toFixed(1)} Mbps`
}

// Format numbers with commas for readability
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

// Format large numbers with K, M, B suffixes
export function formatCompactNumber(num: number): string {
  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  })
  return formatter.format(num)
}

// Format bytes to human-readable size
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  if (i === 0) {
    return `${bytes} ${sizes[i]}`
  }
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// Format percentage with one decimal place
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// Format relative time (e.g., "5 minutes ago", "Just now")
export function formatRelativeTime(date: Date): string {
  // Use timezone-aware formatting
  return formatRelativeTimeWithTimezone(date)
}

// Get exact timestamp for tooltips
export function formatExactTimestamp(date: Date): string {
  // Use timezone-aware formatting
  return formatExactTimestampWithTimezone(date)
}

/**
 * Determine if a machine is actually online based on last heartbeat
 * Considers a machine offline if heartbeat is older than 5 minutes
 */
export function isActuallyOnline(lastHeartbeat: Date, thresholdMinutes: number = 5): boolean {
  const now = new Date()
  const diffMs = now.getTime() - lastHeartbeat.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  
  // 🔍 DEBUG: Log heartbeat validation
  console.log('🔍 isActuallyOnline check:', {
    lastHeartbeat: lastHeartbeat.toISOString(),
    now: now.toISOString(),
    diffMinutes: diffMinutes.toFixed(2),
    thresholdMinutes,
    isOnline: diffMinutes <= thresholdMinutes
  })
  
  return diffMinutes <= thresholdMinutes
}

/**
 * Get the real machine status considering last heartbeat
 * Overrides backend status if heartbeat is stale
 */
export function getRealMachineStatus(
  backendStatus: string, 
  lastHeartbeat: Date,
  thresholdMinutes: number = 5
): string {
  const isOnline = isActuallyOnline(lastHeartbeat, thresholdMinutes)
  
  // If backend says online/active/idle but heartbeat is stale, mark as offline
  if (!isOnline && (backendStatus === 'active' || backendStatus === 'idle' || backendStatus === 'online')) {
    console.log('⚠️ getRealMachineStatus: Marking as offline (stale heartbeat)', { backendStatus, isOnline })
    return 'offline'
  }
  
  // If backend says offline but heartbeat is recent, trust the recent heartbeat
  if (isOnline && backendStatus === 'offline') {
    console.log('✅ getRealMachineStatus: Overriding offline -> active (recent heartbeat)')
    return 'active' // Default to active if recently heard from
  }
  
  console.log('✅ getRealMachineStatus: Using backend status', { backendStatus, isOnline })
  return backendStatus
}

/**
 * Convert and validate timestamp from backend
 * Handles various formats: Date, string, number, null/undefined
 */
export function convertAndValidateTimestamp(timestamp: any): Date {
  if (!timestamp) {
    return new Date()
  }
  
  if (timestamp instanceof Date) {
    return timestamp
  }
  
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      return date
    }
  }
  
  console.warn('Invalid timestamp, using current time:', timestamp)
  return new Date()
}

/**
 * Convert timestamp to Date object
 * Alias for convertAndValidateTimestamp for backwards compatibility
 */
export function convertTimestampToDate(timestamp: any): Date {
  return convertAndValidateTimestamp(timestamp)
}