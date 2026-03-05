/**
 * Backend Adapter - Transforms backend API responses to frontend types
 * Updated: 2025-12-03 - Fixed convertTimestamp issue
 * Updated: 2025-12-09 - Added multi-partition disk support
 * Updated: 2025-12-10 - Added runtime validation, removed type casts
 * Updated: 2025-12-16 - Added defensive format conversion for specs
 */
import { Machine, BackendMachine, BackendMachineSpecs, BackendMachineHardware } from '../types/monitor-schema'
import { convertAndValidateTimestamp, convertTimestampToDate, isActuallyOnline, getRealMachineStatus } from './utils'
import { calculateWeightedDiskUsage, type DiskPartition } from './disk-utils'
import { validateResourceMetrics, sanitizeResourceMetrics, validateHardwareMetrics } from './validation'
import { normalizeSpecsResponse, normalizeHardwareResponse } from './backend-format-converter'
import { analyzeCPUAge } from './cpu-age-detector'

/**
 * Adapts a single machine from backend format to frontend MonitorData
 * 
 * Backend response structure (from main.py transform_to_frontend_format):
 * {
 *   machine_id, hostname, location, building, room,
 *   metrics: { cpu_usage, memory_usage, disk_usage, ... },
 *   resources: { cpu_usage, memory_usage, disk_usage, cpu_temperature, cpu_model },
 *   network: { ip_address, mac_address, upload_mbps, download_mbps, internet_accessible },
 *   status: { state, last_boot, uptime_seconds },
 *   user_activity: { current_username, current_account, last_login, session_duration_seconds },
 *   health_status, health_score, performance_grade, health_issues,
 *   last_heartbeat, timestamp, agent_version
 * }
 */
export function adaptMachineResponse(backendMachine: BackendMachine): Machine {
  // Extract machine metadata from backend
  const building = backendMachine.building || 'Unknown'
  const room = backendMachine.room || 'Unknown'
  const hostname = backendMachine.hostname || backendMachine.machine_id
  
  // ✅ FIX: Get last heartbeat timestamp for status validation
  const lastHeartbeat = backendMachine.last_heartbeat ? 
    new Date(backendMachine.last_heartbeat) : 
    new Date()
  
  // 🔍 DEBUG: Log the raw backend response
  console.log('🔍 Backend response for', backendMachine.machine_id, ':', {
    status: backendMachine.status,
    resources: backendMachine.resources,
    network: backendMachine.network,
    last_heartbeat: backendMachine.last_heartbeat,
    timestamp: backendMachine.timestamp
  })
  
  // Prepare resources object for validation
  const rawResources = {
    cpu_usage_percent: backendMachine.resources?.cpu_usage || backendMachine.metrics?.cpu_usage || 0,
    memory_usage_percent: backendMachine.resources?.memory_usage || backendMachine.metrics?.memory_usage || 0,
    disk_usage_percent: calculateDiskUsage(backendMachine),
    cpu_temp_celsius: backendMachine.resources?.cpu_temperature || backendMachine.metrics?.cpu_temperature || null,
    network_throughput_mbps: (backendMachine.network?.upload_mbps || 0) + (backendMachine.network?.download_mbps || 0)
  }
  
  // Validate and sanitize resources
  const validation = validateResourceMetrics(rawResources)
  if (!validation.valid) {
    console.error(`❌ Invalid resource metrics for ${backendMachine.machine_id}:`, validation.errors)
    Object.assign(rawResources, sanitizeResourceMetrics(rawResources))
  }
  if (validation.warnings.length > 0) {
    console.warn(`⚠️  Resource warnings for ${backendMachine.machine_id}:`, validation.warnings)
  }
  
  // ✅ FIX: Calculate real status based on last heartbeat
  const backendStatus = backendMachine.status?.state || 'offline'
  let realStatus = getRealMachineStatus(backendStatus, lastHeartbeat, 5)
  
  // ✅ FIX: Override status if user activity indicates active user
  // Check multiple possible fields for user activity
  const hasActiveUser = 
    backendMachine.user_activity?.current_username ||
    backendMachine.user_activity?.current_account ||
    backendMachine.user_activity?.active_user ||
    backendMachine.user_activity?.has_active_users ||
    (backendMachine.user_activity?.active_sessions && 
     Array.isArray(backendMachine.user_activity.active_sessions) && 
     backendMachine.user_activity.active_sessions.length > 0)
  
  // If machine is idle but has an active user, change status to "in-use"
  if (realStatus === 'idle' && hasActiveUser) {
    console.log('✅ Overriding status from "idle" to "in-use" - active user detected:', hasActiveUser)
    realStatus = 'in-use'
  }
  
  // 🔍 DEBUG: Log what status we're using
  console.log('🔍 Adapter setting status for', backendMachine.machine_id, ':', {
    backendStatus,
    realStatus,
    hasActiveUser,
    willSetTo: realStatus
  })
  
  return {
    machine: {
      machine_id: backendMachine.machine_id,
      hostname: hostname,
      building: building,
      room: room,
      location: backendMachine.location || `${building} - Room ${room}`,
      tags: backendMachine.tags || [],
      groups: backendMachine.groups || [],
      metadata: backendMachine.metadata || {}
    },
    timestamp: convertAndValidateTimestamp(backendMachine.timestamp || backendMachine.last_heartbeat),
    metrics: {
      // ✅ FIX: Use validated status instead of raw backend status
      status: {
        state: realStatus,
        uptime_seconds: backendMachine.status?.uptime_seconds || backendMachine.uptime_seconds || 0,
        last_boot: backendMachine.status?.last_boot || backendMachine.last_boot ? 
          new Date(backendMachine.status?.last_boot || backendMachine.last_boot) : new Date()
      },
      
      // Resources from backend.resources object (validated)
      resources: {
        ...rawResources,
        cpu_model: backendMachine.resources?.cpu_model || null,
        network_throughput_mbps: backendMachine.metrics?.network_usage || 
                                  (backendMachine.network?.upload_mbps || 0) + (backendMachine.network?.download_mbps || 0)
      },
      
      // Network from backend.network object
      network: {
        throughput_mbps: backendMachine.metrics?.network_usage || 
                         (backendMachine.network?.upload_mbps || 0) + (backendMachine.network?.download_mbps || 0),
        upload_mbps: backendMachine.network?.upload_mbps || 0,
        download_mbps: backendMachine.network?.download_mbps || 0,
        latency_ms: backendMachine.network?.latency_ms || 0,
        packet_loss_percent: backendMachine.network?.packet_loss_percent || 0,
        ip_address: backendMachine.network?.ip_address || 'Unknown',
        mac_address: backendMachine.network?.mac_address || 'Unknown',
        internet_accessible: backendMachine.network?.internet_accessible ?? true
      },
      
      // User Activity from backend.user_activity object
      user_activity: {
        current_username: backendMachine.user_activity?.current_username || 
                         backendMachine.user_activity?.current_account || 
                         null,
        active_users: (backendMachine.user_activity?.current_username || 
                      backendMachine.user_activity?.current_account) ? 1 : 0,
        login_location: building && room ? `${building}-${room}` : null,
        login_time: backendMachine.user_activity?.last_login ? 
          new Date(backendMachine.user_activity.last_login) : null,
        is_idle: backendMachine.status?.state === 'idle',
        last_activity: backendMachine.last_heartbeat ? 
          new Date(backendMachine.last_heartbeat) : null
      },
      
      // System info
      system: {
        uptime_seconds: backendMachine.status?.uptime_seconds || 0,
        boot_time: backendMachine.status?.last_boot ? 
          new Date(backendMachine.status.last_boot) : new Date(),
        last_heartbeat: backendMachine.last_heartbeat ? 
          new Date(backendMachine.last_heartbeat) : new Date()
      }
    },
    
    // Health from top-level backend fields
    health: {
      status: backendMachine.health_status || 'unknown',
      score: backendMachine.health_score || 0,
      issues: backendMachine.health_issues || [],
      performance_grade: backendMachine.performance_grade || 'F'
    }
  }
}

/**
 * Adapts array of machines from backend format
 */
export function adaptMachinesResponse(backendMachines: BackendMachine[]): Machine[] {
  return backendMachines.map(adaptMachineResponse)
}

/**
 * Adapts machine detail response (same as single machine)
 */
export function adaptMachineDetailResponse(backendMachine: BackendMachine): Machine {
  return adaptMachineResponse(backendMachine)
}

/**
 * Adapts specs response from backend
 * Backend structure (from adapt_specs_document):
 * {
 *   machine_id, hostname, building, room, timestamp,
 *   cpu_model, cpu_cores, cpu_threads, cpu_base_clock_ghz, cpu_architecture,
 *   memory_total_gb, memory_type, memory_speed_mhz,
 *   storage: [...], gpu: [...],
 *   os_name, os_version, os_build, os_architecture, os_install_date,
 *   boot_time, boot_time_epoch
 * }
 */
export function adaptSpecsResponse(backendSpecs: BackendMachineSpecs): SpecsMetrics {
  // ✅ normalizeSpecsResponse already returns nested SpecsMetrics format!
  const normalizedSpecs = normalizeSpecsResponse(backendSpecs)
  
  // ✅ If we got default specs (backend returned nothing), return as-is
  if (!normalizedSpecs.static_hardware) {
    return normalizedSpecs
  }
  
  // ✅ Enhance with CPU age detection if we have CPU model
  const cpuModel = normalizedSpecs.static_hardware?.cpu?.name || 'Unknown'
  if (cpuModel && cpuModel !== 'Unknown') {
    const cpuAge = analyzeCPUAge(cpuModel)
    if (cpuAge.releaseYear && !normalizedSpecs.static_hardware.cpu.release_year) {
      normalizedSpecs.static_hardware.cpu.release_year = cpuAge.releaseYear
    }
    if (cpuAge.generation && !normalizedSpecs.static_hardware.cpu.generation) {
      normalizedSpecs.static_hardware.cpu.generation = cpuAge.generation
    }
    if (cpuAge.manufacturer && !normalizedSpecs.static_hardware.cpu.manufacturer) {
      normalizedSpecs.static_hardware.cpu.manufacturer = cpuAge.manufacturer
    }
  }
  
  return normalizedSpecs
}

/**
 * Adapts hardware response from backend
 * Backend structure (from adapt_hardware_document):
 * {
 *   machine_id, hostname, building, room, timestamp,
 *   cpu_usage_percent, memory_usage_percent, disk_usage_percent,
 *   cpu_temperature_c, memory_used_gb, disk_used_gb,
 *   network_bytes_sent, network_bytes_recv
 * }
 */
export function adaptHardwareResponse(backendHardware: BackendMachineHardware): HardwareMetrics {
  const normalizedHardware = normalizeHardwareResponse(backendHardware)
  // Validate hardware metrics
  const validation = validateHardwareMetrics(normalizedHardware)
  
  if (!validation.valid) {
    console.error(`❌ Invalid hardware metrics for ${normalizedHardware.machine_id}:`, validation.errors)
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`⚠️  Hardware warnings for ${normalizedHardware.machine_id}:`, validation.warnings)
  }
  
  return {
    machine_id: normalizedHardware.machine_id,
    hostname: normalizedHardware.hostname,
    building: normalizedHardware.building,
    room: normalizedHardware.room,
    timestamp: convertTimestampToDate(normalizedHardware.timestamp),
    
    // CPU
    cpu_usage_percent: normalizedHardware.cpu_usage_percent || 0,
    cpu_temperature_c: normalizedHardware.cpu_temperature_c || null,
    
    // Memory
    memory_usage_percent: normalizedHardware.memory_usage_percent || 0,
    memory_used_gb: normalizedHardware.memory_used_gb || 0,
    memory_total_gb: normalizedHardware.memory_total_gb || normalizedHardware.memory_total || 0,
    
    // Disk
    disk_usage_percent: normalizedHardware.disk_usage_percent || 0,
    disk_used_gb: normalizedHardware.disk_used_gb || 0,
    disk_total_gb: normalizedHardware.disk_total_gb || normalizedHardware.disk_total || 0,
    
    // ✅ Extract partitions if available
    partitions: extractDiskPartitions(normalizedHardware),
    
    // Network
    network_bytes_sent: normalizedHardware.network_bytes_sent || 0,
    network_bytes_recv: normalizedHardware.network_bytes_recv || 0
  }
}

/**
 * Adapts events response from backend
 */
export function adaptEventsResponse(backendEvents: any[]): any[] {
  if (!backendEvents || !Array.isArray(backendEvents)) {
    return []
  }
  
  return backendEvents.map(event => ({
    ...event,
    timestamp: convertTimestampToDate(event.timestamp)
  }))
}

/**
 * Adapts fleet averages response
 */
export function adaptFleetAveragesResponse(backendData: any): any {
  return {
    ...backendData,
    timestamp: convertTimestampToDate(backendData.timestamp)
  }
}

/**
 * Adapts historical data response
 */
export function adaptHistoryResponse(backendHistory: any): any {
  if (Array.isArray(backendHistory)) {
    return backendHistory.map(item => ({
      ...item,
      timestamp: convertTimestampToDate(item.timestamp)
    }))
  }
  return backendHistory
}

/**
 * Adapts trends response
 */
export function adaptTrendsResponse(backendTrends: any): any {
  if (backendTrends.dataPoints) {
    backendTrends.dataPoints = backendTrends.dataPoints.map((point: any) => ({
      ...point,
      timestamp: convertTimestampToDate(point.timestamp)
    }))
  }
  return backendTrends
}

/**
 * Adapts alerts response
 */
export function adaptAlertsResponse(backendAlerts: any[]): any[] {
  return backendAlerts.map(alert => ({
    ...alert,
    timestamp: convertTimestampToDate(alert.timestamp),
    acknowledged_at: alert.acknowledged_at ? convertTimestampToDate(alert.acknowledged_at) : null
  }))
}

/**
 * Adapts notes response
 */
export function adaptNotesResponse(backendNotes: any[]): any[] {
  return backendNotes.map(note => ({
    ...note,
    created_at: convertTimestampToDate(note.created_at),
    updated_at: convertTimestampToDate(note.updated_at)
  }))
}

/**
 * Adapts login history response
 */
export function adaptLoginHistoryResponse(backendHistory: any): any[] {
  // Handle both array and non-array responses
  if (!backendHistory) {
    return []
  }
  
  // Check if response is an object with login_history_24h property
  if (backendHistory.login_history_24h && Array.isArray(backendHistory.login_history_24h)) {
    return backendHistory.login_history_24h.map((item: any) => ({
      ...item,
      login_time: convertTimestampToDate(item.login_time),
      logout_time: item.logout_time ? convertTimestampToDate(item.logout_time) : null
    }))
  }
  
  // Handle direct array response (legacy format)
  if (!Array.isArray(backendHistory)) {
    console.warn('Login history is not in expected format:', backendHistory)
    return []
  }
  
  return backendHistory.map(item => ({
    ...item,
    login_time: convertTimestampToDate(item.login_time),
    logout_time: item.logout_time ? convertTimestampToDate(item.logout_time) : null
  }))
}

/**
 * Adapts analytics response
 */
export function adaptAnalyticsResponse(backendAnalytics: any): any {
  if (Array.isArray(backendAnalytics)) {
    return backendAnalytics.map(item => ({
      ...item,
      timestamp: convertTimestampToDate(item.timestamp),
      date: item.date
    }))
  }
  
  if (backendAnalytics.dataPoints) {
    backendAnalytics.dataPoints = backendAnalytics.dataPoints.map((point: any) => ({
      ...point,
      timestamp: convertTimestampToDate(point.timestamp)
    }))
  }
  
  return backendAnalytics
}

/**
 * Adapts WebSocket messages
 */
export function adaptWebSocketMessage(message: any): any {
  if (message.type === 'machine_update' && message.data) {
    return {
      ...message,
      data: adaptMachineResponse(message.data)
    }
  }
  
  if (message.machine_id && message.status) {
    return adaptMachineResponse(message)
  }
  
  if (message.timestamp) {
    return {
      ...message,
      timestamp: convertTimestampToDate(message.timestamp)
    }
  }
  
  return message
}

/**
 * Adapts search results
 */
export function adaptSearchResults(backendResults: any): any {
  return {
    ...backendResults,
    results: backendResults.results ? adaptMachinesResponse(backendResults.results) : []
  }
}

// Export all adapters
export default {
  adaptMachineResponse,
  adaptMachinesResponse,
  adaptMachineDetailResponse,
  adaptSpecsResponse,
  adaptHardwareResponse,
  adaptEventsResponse,
  adaptFleetAveragesResponse,
  adaptHistoryResponse,
  adaptTrendsResponse,
  adaptAlertsResponse,
  adaptNotesResponse,
  adaptLoginHistoryResponse,
  adaptAnalyticsResponse,
  adaptWebSocketMessage,
  adaptSearchResults,
  extractDiskPartitions
}

/**
 * Extract disk partitions from backend data
 */
export function extractDiskPartitions(backendData: any): DiskPartition[] {
  // Check multiple possible locations for partition data
  const partitions = 
    backendData.partitions || 
    backendData.disk_partitions ||
    backendData.storage ||
    backendData.disks ||
    []
  
  if (!Array.isArray(partitions)) return []
  
  return partitions.map((p: any) => ({
    device: p.device || p.name || 'Unknown',
    mountpoint: p.mountpoint || p.mount_point || p.device || '',
    fstype: p.fstype || p.filesystem || p.type || 'Unknown',
    total_gb: p.total_gb || p.size_gb || 0,
    used_gb: p.used_gb || p.size_used_gb || 0,
    free_gb: p.free_gb || p.size_free_gb || (p.total_gb - p.used_gb) || 0,
    usage_percent: p.usage_percent || p.percent || 
      (p.total_gb > 0 ? (p.used_gb / p.total_gb) * 100 : 0)
  }))
}

/**
 * Calculate disk usage from partitions or fallback to single value
 */
function calculateDiskUsage(backendData: any): number {
  // Try to get partitions first
  const partitions = extractDiskPartitions(backendData)
  
  if (partitions.length > 0) {
    // Use weighted average across all partitions
    return calculateWeightedDiskUsage(partitions)
  }
  
  // Fallback to single disk_usage value
  return backendData.disk_usage || 
         backendData.disk_usage_percent ||
         backendData.metrics?.disk_usage ||
         backendData.resources?.disk_usage ||
         0
}