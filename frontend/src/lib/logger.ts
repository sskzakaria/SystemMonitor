/**
 * Production-Ready Logger
 * 
 * Provides environment-aware logging:
 * - Development: All logging enabled
 * - Production: Only errors and warnings
 * 
 * Usage:
 *   import { logger } from './lib/logger'
 *   logger.log('Debug info')      // DEV only
 *   logger.info('Information')    // DEV only
 *   logger.warn('Warning')        // Always shown
 *   logger.error('Error')         // Always shown
 */

const isDevelopment = import.meta.env.DEV
const isTest = import.meta.env.MODE === 'test'

// Color coding for console messages (DEV only)
const colors = {
  success: '#10b981', // green
  info: '#3b82f6',    // blue
  warn: '#f59e0b',    // amber
  error: '#ef4444',   // red
  debug: '#8b5cf6',   // purple
}

/**
 * Format log messages with emoji and color
 */
function formatMessage(level: string, emoji: string, ...args: any[]) {
  if (!isDevelopment) return args
  
  const timestamp = new Date().toLocaleTimeString()
  return [
    `%c${emoji} [${timestamp}] ${level}`,
    `color: ${colors[level as keyof typeof colors] || colors.info}; font-weight: bold`,
    ...args
  ]
}

/**
 * Logger interface
 */
export const logger = {
  /**
   * Debug logging - DEV ONLY
   * Use for detailed debugging information
   */
  log(...args: any[]) {
    if (isDevelopment || isTest) {
      console.log(...formatMessage('debug', '🔍', ...args))
    }
  },

  /**
   * Info logging - DEV ONLY
   * Use for general information
   */
  info(...args: any[]) {
    if (isDevelopment || isTest) {
      console.info(...formatMessage('info', 'ℹ️', ...args))
    }
  },

  /**
   * Success logging - DEV ONLY
   * Use for successful operations
   */
  success(...args: any[]) {
    if (isDevelopment || isTest) {
      console.log(...formatMessage('success', '✅', ...args))
    }
  },

  /**
   * Warning logging - ALWAYS SHOWN
   * Use for non-critical issues that should be investigated
   */
  warn(...args: any[]) {
    if (isDevelopment) {
      console.warn(...formatMessage('warn', '⚠️', ...args))
    } else {
      console.warn(...args)
    }
  },

  /**
   * Error logging - ALWAYS SHOWN
   * Use for errors and exceptions
   */
  error(...args: any[]) {
    if (isDevelopment) {
      console.error(...formatMessage('error', '❌', ...args))
    } else {
      console.error(...args)
    }
  },

  /**
   * Group logging - DEV ONLY
   * Use to group related log messages
   */
  group(label: string) {
    if (isDevelopment || isTest) {
      console.group(label)
    }
  },

  /**
   * End group logging - DEV ONLY
   */
  groupEnd() {
    if (isDevelopment || isTest) {
      console.groupEnd()
    }
  },

  /**
   * Table logging - DEV ONLY
   * Use to display tabular data
   */
  table(data: any) {
    if (isDevelopment || isTest) {
      console.table(data)
    }
  },

  /**
   * Performance timing - DEV ONLY
   */
  time(label: string) {
    if (isDevelopment || isTest) {
      console.time(label)
    }
  },

  /**
   * End performance timing - DEV ONLY
   */
  timeEnd(label: string) {
    if (isDevelopment || isTest) {
      console.timeEnd(label)
    }
  },
}

/**
 * Conditional logger that only logs in development
 * 
 * Usage:
 *   devLog('This only shows in development')
 */
export const devLog = (...args: any[]) => {
  if (isDevelopment || isTest) {
    console.log(...args)
  }
}

/**
 * Production-safe logger that sends errors to monitoring service
 * (Placeholder for Sentry, LogRocket, etc.)
 */
export const productionError = (error: Error, context?: Record<string, any>) => {
  // Always log to console
  console.error('Production Error:', error, context)
  
  // TODO: Send to monitoring service in production
  if (!isDevelopment) {
    // Example: Sentry.captureException(error, { extra: context })
  }
}

export default logger
