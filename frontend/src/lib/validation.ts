/**
 * Data Validation Utilities
 * 
 * Runtime validation functions to ensure data integrity
 * and catch issues early before they cause UI errors
 */

import {
  MonitorData,
  HeartbeatMetrics,
  SpecsMetrics,
  HardwareMetrics,
  MachineInfo,
  HealthInfo,
  ResourceMetrics,
  NetworkMetrics,
  UserActivity,
  SystemInfo,
  StatusInfo,
} from '../types/monitor-schema'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate percentage value (0-100)
 */
export function validatePercentage(
  value: number,
  fieldName: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  if (typeof value !== 'number' || isNaN(value)) {
    errors.push(`${fieldName} must be a number (got ${typeof value})`)
  } else if (value < 0) {
    errors.push(`${fieldName} cannot be negative (got ${value})`)
  } else if (value > 100) {
    errors.push(`${fieldName} cannot exceed 100% (got ${value})`)
  } else if (value > 90) {
    warnings.push(`${fieldName} is critically high (${value}%)`)
  }
  
  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate temperature (reasonable range for computer hardware)
 */
export function validateTemperature(
  value: number | null,
  fieldName: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  if (value === null) {
    return { valid: true, errors, warnings }
  }
  
  if (typeof value !== 'number' || isNaN(value)) {
    errors.push(`${fieldName} must be a number or null`)
  } else if (value < -50 || value > 150) {
    errors.push(`${fieldName} out of reasonable range (${value}°C)`)
  } else if (value > 85) {
    warnings.push(`${fieldName} is very high (${value}°C) - possible hardware issue`)
  }
  
  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate HardwareMetrics object
 */
export function validateHardwareMetrics(hardware: any): ValidationResult {
  const allErrors: string[] = []
  const allWarnings: string[] = []
  
  if (!hardware || typeof hardware !== 'object') {
    return { valid: false, errors: ['HardwareMetrics must be an object'], warnings: [] }
  }
  
  // Check required fields exist
  if (!hardware.machine_id) {
    allErrors.push('machine_id is required')
  }
  if (!hardware.timestamp) {
    allErrors.push('timestamp is required')
  }
  
  // Validate percentages
  if (hardware.cpu_usage_percent !== undefined) {
    const cpu = validatePercentage(hardware.cpu_usage_percent, 'CPU usage')
    allErrors.push(...cpu.errors)
    allWarnings.push(...cpu.warnings)
  }
  
  if (hardware.memory_usage_percent !== undefined) {
    const mem = validatePercentage(hardware.memory_usage_percent, 'Memory usage')
    allErrors.push(...mem.errors)
    allWarnings.push(...mem.warnings)
  }
  
  if (hardware.disk_usage_percent !== undefined) {
    const disk = validatePercentage(hardware.disk_usage_percent, 'Disk usage')
    allErrors.push(...disk.errors)
    allWarnings.push(...disk.warnings)
  }
  
  // Validate temperature
  if (hardware.cpu_temperature_c !== undefined) {
    const temp = validateTemperature(hardware.cpu_temperature_c, 'CPU temperature')
    allErrors.push(...temp.errors)
    allWarnings.push(...temp.warnings)
  }
  
  if (hardware.gpu_temperature_c !== undefined) {
    const temp = validateTemperature(hardware.gpu_temperature_c, 'GPU temperature')
    allErrors.push(...temp.errors)
    allWarnings.push(...temp.warnings)
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  }
}

/**
 * Clamp number to range (helper function)
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Sanitize resource metrics - clamp values to valid ranges
 */
export function sanitizeResourceMetrics(metrics: any): any {
  return {
    ...metrics,
    cpu_usage_percent: clamp(metrics.cpu_usage_percent ?? 0, 0, 100),
    memory_usage_percent: clamp(metrics.memory_usage_percent ?? 0, 0, 100),
    disk_usage_percent: clamp(metrics.disk_usage_percent ?? 0, 0, 100),
    cpu_temperature_c: metrics.cpu_temperature_c !== null
      ? clamp(metrics.cpu_temperature_c, -50, 150)
      : null
  }
}

/**
 * Validate MachineInfo structure
 */
export function validateMachineInfo(machine: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!machine || typeof machine !== 'object') {
    errors.push('Machine info must be an object')
    return { valid: false, errors, warnings }
  }

  // Required fields
  if (!machine.machine_id || typeof machine.machine_id !== 'string') {
    errors.push('machine_id is required and must be a string')
  }
  
  if (!machine.hostname || typeof machine.hostname !== 'string') {
    errors.push('hostname is required and must be a string')
  }
  
  if (!machine.building || typeof machine.building !== 'string') {
    errors.push('building is required and must be a string')
  }
  
  if (!machine.room || typeof machine.room !== 'string') {
    errors.push('room is required and must be a string')
  }
  
  if (!machine.location || typeof machine.location !== 'string') {
    errors.push('location is required and must be a string')
  }

  // Format validation
  if (machine.machine_id && !/^[A-Z]{3}\d{3}-\d{2}$/.test(machine.machine_id)) {
    warnings.push(`machine_id format unusual: ${machine.machine_id}`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate ResourceMetrics structure
 */
export function validateResourceMetrics(resources: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!resources || typeof resources !== 'object') {
    errors.push('Resources must be an object')
    return { valid: false, errors, warnings }
  }

  // CPU usage
  if (typeof resources.cpu_usage_percent !== 'number') {
    errors.push('cpu_usage_percent must be a number')
  } else if (resources.cpu_usage_percent < 0 || resources.cpu_usage_percent > 100) {
    errors.push('cpu_usage_percent must be between 0 and 100')
  }

  // Memory usage
  if (typeof resources.memory_usage_percent !== 'number') {
    errors.push('memory_usage_percent must be a number')
  } else if (resources.memory_usage_percent < 0 || resources.memory_usage_percent > 100) {
    errors.push('memory_usage_percent must be between 0 and 100')
  }

  // Disk usage
  if (typeof resources.disk_usage_percent !== 'number') {
    errors.push('disk_usage_percent must be a number')
  } else if (resources.disk_usage_percent < 0 || resources.disk_usage_percent > 100) {
    errors.push('disk_usage_percent must be between 0 and 100')
  }

  // CPU temperature (can be null)
  if (resources.cpu_temp_celsius !== null && typeof resources.cpu_temp_celsius !== 'number') {
    errors.push('cpu_temp_celsius must be a number or null')
  }

  // Network throughput
  if (typeof resources.network_throughput_mbps !== 'number') {
    errors.push('network_throughput_mbps must be a number')
  } else if (resources.network_throughput_mbps < 0) {
    errors.push('network_throughput_mbps must be non-negative')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate HealthInfo structure
 */
export function validateHealthInfo(health: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!health || typeof health !== 'object') {
    errors.push('Health info must be an object')
    return { valid: false, errors, warnings }
  }

  // Status
  const validStatuses = ['healthy', 'warning', 'critical']
  if (!validStatuses.includes(health.status)) {
    errors.push(`health.status must be one of: ${validStatuses.join(', ')}`)
  }

  // Score
  if (typeof health.score !== 'number') {
    errors.push('health.score must be a number')
  } else if (health.score < 0 || health.score > 100) {
    errors.push('health.score must be between 0 and 100')
  }

  // Issues array
  if (!Array.isArray(health.issues)) {
    errors.push('health.issues must be an array')
  }

  // Performance grade
  if (typeof health.performance_grade !== 'string') {
    errors.push('health.performance_grade must be a string')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate HeartbeatMetrics structure
 */
export function validateHeartbeatMetrics(metrics: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!metrics || typeof metrics !== 'object') {
    errors.push('Metrics must be an object')
    return { valid: false, errors, warnings }
  }

  // Validate nested objects
  if (!metrics.status) {
    errors.push('metrics.status is required')
  } else {
    const validStatuses = ['online', 'idle', 'offline', 'maintenance', 'error']
    if (!validStatuses.includes(metrics.status.state)) {
      errors.push(`status.state must be one of: ${validStatuses.join(', ')}`)
    }
  }

  if (!metrics.resources) {
    errors.push('metrics.resources is required')
  } else {
    const resourceValidation = validateResourceMetrics(metrics.resources)
    errors.push(...resourceValidation.errors)
    warnings.push(...resourceValidation.warnings)
  }

  if (!metrics.network) {
    errors.push('metrics.network is required')
  }

  if (!metrics.user_activity) {
    errors.push('metrics.user_activity is required')
  }

  if (!metrics.system) {
    errors.push('metrics.system is required')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate complete MonitorData structure
 */
export function validateMonitorData(data: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data || typeof data !== 'object') {
    errors.push('Monitor data must be an object')
    return { valid: false, errors, warnings }
  }

  // Validate machine info
  if (!data.machine) {
    errors.push('machine field is required')
  } else {
    const machineValidation = validateMachineInfo(data.machine)
    errors.push(...machineValidation.errors.map(e => `machine.${e}`))
    warnings.push(...machineValidation.warnings.map(w => `machine.${w}`))
  }

  // Validate metrics
  if (!data.metrics) {
    errors.push('metrics field is required')
  } else {
    const metricsValidation = validateHeartbeatMetrics(data.metrics)
    errors.push(...metricsValidation.errors)
    warnings.push(...metricsValidation.warnings)
  }

  // Validate health
  if (!data.health) {
    errors.push('health field is required')
  } else {
    const healthValidation = validateHealthInfo(data.health)
    errors.push(...healthValidation.errors)
    warnings.push(...healthValidation.warnings)
  }

  // Validate timestamp
  if (!data.timestamp) {
    errors.push('timestamp is required')
  } else if (!(data.timestamp instanceof Date) && typeof data.timestamp !== 'string') {
    errors.push('timestamp must be a Date object or ISO string')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate SpecsMetrics structure
 */
export function validateSpecsMetrics(specs: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!specs || typeof specs !== 'object') {
    errors.push('Specs must be an object')
    return { valid: false, errors, warnings }
  }

  // Validate static_hardware
  if (!specs.static_hardware) {
    errors.push('static_hardware is required')
  } else {
    if (!specs.static_hardware.cpu) {
      errors.push('static_hardware.cpu is required')
    }
    if (!specs.static_hardware.memory) {
      errors.push('static_hardware.memory is required')
    }
    if (!specs.static_hardware.storage || !Array.isArray(specs.static_hardware.storage)) {
      errors.push('static_hardware.storage must be an array')
    }
    if (!specs.static_hardware.gpu) {
      errors.push('static_hardware.gpu is required')
    }
  }

  // Validate static_system
  if (!specs.static_system) {
    errors.push('static_system is required')
  } else {
    if (!specs.static_system.os) {
      errors.push('static_system.os is required')
    }
    if (!specs.static_system.hardware) {
      errors.push('static_system.hardware is required')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate batch of MonitorData
 */
export function validateMonitorDataBatch(dataArray: any[]): {
  valid: boolean
  totalErrors: number
  totalWarnings: number
  invalidIndices: number[]
  results: ValidationResult[]
} {
  if (!Array.isArray(dataArray)) {
    return {
      valid: false,
      totalErrors: 1,
      totalWarnings: 0,
      invalidIndices: [],
      results: [{ valid: false, errors: ['Input must be an array'], warnings: [] }]
    }
  }

  const results = dataArray.map((data, index) => validateMonitorData(data))
  const invalidIndices = results
    .map((result, index) => result.valid ? -1 : index)
    .filter(index => index >= 0)

  const totalErrors = results.reduce((sum, result) => sum + result.errors.length, 0)
  const totalWarnings = results.reduce((sum, result) => sum + result.warnings.length, 0)

  return {
    valid: invalidIndices.length === 0,
    totalErrors,
    totalWarnings,
    invalidIndices,
    results
  }
}

/**
 * Log validation results to console
 */
export function logValidationResults(
  label: string,
  result: ValidationResult
): void {
  if (result.valid && result.warnings.length === 0) {
    console.log(`✅ ${label}: Valid`)
    return
  }

  if (result.errors.length > 0) {
    console.error(`❌ ${label}: Validation failed`)
    result.errors.forEach(error => console.error(`  - ${error}`))
  }

  if (result.warnings.length > 0) {
    console.warn(`⚠️  ${label}: Warnings`)
    result.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
}

/**
 * Assert data is valid (throws if not)
 * Use in development mode to catch issues early
 */
export function assertValidMonitorData(data: any, label: string = 'MonitorData'): asserts data is MonitorData<HeartbeatMetrics> {
  const result = validateMonitorData(data)
  
  if (!result.valid) {
    const errorMessage = `Invalid ${label}:\n${result.errors.join('\n')}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  if (result.warnings.length > 0) {
    console.warn(`${label} has warnings:`, result.warnings)
  }
}

/**
 * Sanitize data - attempt to fix common issues
 */
export function sanitizeMonitorData(data: any): MonitorData<HeartbeatMetrics> | null {
  try {
    // Clone to avoid mutation
    const sanitized = JSON.parse(JSON.stringify(data))

    // Fix common issues
    if (typeof sanitized.timestamp === 'string') {
      sanitized.timestamp = new Date(sanitized.timestamp)
    }

    // Clamp percentages to 0-100
    if (sanitized.metrics?.resources) {
      const res = sanitized.metrics.resources
      res.cpu_usage_percent = Math.max(0, Math.min(100, res.cpu_usage_percent || 0))
      res.memory_usage_percent = Math.max(0, Math.min(100, res.memory_usage_percent || 0))
      res.disk_usage_percent = Math.max(0, Math.min(100, res.disk_usage_percent || 0))
    }

    // Ensure health score is in range
    if (sanitized.health?.score) {
      sanitized.health.score = Math.max(0, Math.min(100, sanitized.health.score))
    }

    // Validate sanitized data
    const result = validateMonitorData(sanitized)
    if (!result.valid) {
      console.error('Could not sanitize data:', result.errors)
      return null
    }

    return sanitized
  } catch (error) {
    console.error('Error sanitizing data:', error)
    return null
  }
}

/**
 * Development mode validator
 * Only runs validation in development to avoid performance overhead in production
 */
export function devValidateMonitorData(data: any, label?: string): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const result = validateMonitorData(data)
    if (!result.valid || result.warnings.length > 0) {
      logValidationResults(label || 'MonitorData', result)
    }
    return result.valid
  }
  return true
}