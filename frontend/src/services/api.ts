/**
 * API Service Layer - Updated for Backend v4.0 (No Authentication)
 * 
 * This service connects to the University Computer Monitoring System backend.
 * All responses are adapted from backend format to frontend MonitorData types.
 * Authentication has been disabled for development.
 */

import {
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
  adaptWebSocketMessage
} from '../lib/backend-adapter'

import { getApiBaseUrl, getWebSocketUrl } from '../lib/network-utils'

// ============================================================
// CONFIGURATION
// ============================================================

const API_CONFIG = {
  baseURL: getApiBaseUrl(),
  wsURL: getWebSocketUrl(),
  timeout: 5000 // Reduced timeout for faster failure detection
}

// Backend health check cache
let backendHealthy = true
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  const now = Date.now()
  
  // Return cached result if checked recently
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return backendHealthy
  }
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000) // Quick check
    
    const response = await fetch(`${API_CONFIG.baseURL.replace('/api/v1', '')}/api/v1/data/health`, {
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    backendHealthy = response.ok
    lastHealthCheck = now
    return backendHealthy
  } catch (error) {
    backendHealthy = false
    lastHealthCheck = now
    return false
  }
}

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
  }
}

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = API_CONFIG.timeout): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    // Network error - backend is offline
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Backend connection timeout')
    }
    throw new Error('Backend unavailable')
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  return response.json()
}

// ============================================================
// MACHINES API
// ============================================================

export async function getMachines(filters?: {
  building?: string
  room?: string
  status?: string
  limit?: number
}) {
  const params = new URLSearchParams()
  // Only add filters if they're not 'all' (which means no filter)
  if (filters?.building && filters.building !== 'all') params.append('building', filters.building)
  if (filters?.room && filters.room !== 'all') params.append('room', filters.room)
  if (filters?.status && filters.status !== 'all') params.append('status', filters.status)
  if (filters?.limit) params.append('limit', filters.limit.toString())
  
  // ✅ FIXED: Removed /api prefix (already in baseURL)
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines?${params}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  
  // ✅ CRITICAL FIX: Extract machines array from response
  // Backend returns: { machines: [...], total: 100, page: 1 }
  // Adapter expects: [...]
  const machines = data.machines || data || []
  
  return adaptMachinesResponse(machines)
}

export async function getMachine(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  return adaptMachineDetailResponse(data)
}

export async function getMachineSpecs(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/specs`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  return adaptSpecsResponse(data)
}

export async function getMachineHardware(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/hardware`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  return adaptHardwareResponse(data)
}

export async function getMachineHistory(machineId: string, params?: {
  timeWindow?: string
  metrics?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.timeWindow) searchParams.append('timeWindow', params.timeWindow)
  if (params?.metrics) searchParams.append('metrics', params.metrics)
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptHistoryResponse(data)
}

export async function getMachineTrends(machineId: string, params?: {
  hours?: number
  metric?: string
  aggregate?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.hours) searchParams.append('hours', params.hours.toString())
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.aggregate) searchParams.append('aggregate', params.aggregate)
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/hardware/trends?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptTrendsResponse(data)
}

export async function getMachineApplications(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/applications`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineSecurity(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/security`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineEvents(machineId: string, params?: {
  hours?: number
  level?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.hours) searchParams.append('hours', params.hours.toString())
  if (params?.level) searchParams.append('level', params.level)
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/events?${searchParams}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachinePeripherals(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/peripherals`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineSessions(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/sessions`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// NEW ENDPOINTS - Backend Transformation Layer
// ============================================================

export async function getMachineNetwork(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/network`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineServices(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/services`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineUpdates(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/updates`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineProcesses(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/processes`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getMachineLogs(machineId: string, params?: {
  log_type?: 'system' | 'security' | 'application' | 'critical'
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.log_type) searchParams.append('log_type', params.log_type)
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/logs?${searchParams}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineUserActivity(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/user-activity`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// HISTORICAL DATA API (InfluxDB)
// ============================================================

export async function getMachineCPUHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history/cpu?hours=${hours}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineMemoryHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history/memory?hours=${hours}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineDiskHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history/disk?hours=${hours}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineNetworkHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history/network?hours=${hours}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineTemperatureHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history/temperature?hours=${hours}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMachineAllHistory(machineId: string, hours = 24) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/history?hours=${hours}`,  // ✅ FIX: Use /history not /history/all
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

// ============================================================
// SOFTWARE API
// ============================================================

export async function getMachineSoftware(machineId: string) {
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/software`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

// ============================================================
// MACHINE ACTIONS API
// ============================================================

export async function performMachineAction(
  machineId: string,
  action: string,
  force = false,
  delaySeconds = 0
) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/actions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      action,
      force,
      delay_seconds: delaySeconds
    })
  })
  
  return handleResponse(response)
}

export async function updateMachineTags(machineId: string, tags: string[]) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/tags`, {
    method: 'POST', // Fixed: Changed from PUT to POST to match backend
    headers: getHeaders(),
    body: JSON.stringify({ tags })
  })
  
  return handleResponse(response)
}

export async function updateMachineGroups(machineId: string, groups: string[]) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/groups`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ groups })
  })
  
  return handleResponse(response)
}

export async function scheduleMaintenance(
  machineId: string,
  maintenanceData: {
    maintenance_type: string
    description: string
    scheduled_start: string
    scheduled_end: string
    technician: string
    notify_users?: boolean
  }
) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/maintenance`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(maintenanceData)
  })
  
  return handleResponse(response)
}

// ============================================================
// EVENTS API
// ============================================================

export async function getEvents(params?: {
  machine_id?: string
  severity?: string
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.machine_id) searchParams.append('machine_id', params.machine_id)
  if (params?.severity) searchParams.append('severity', params.severity)
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  if (params?.offset) searchParams.append('offset', params.offset.toString())
  
  // Backend endpoint: /api/events (monitoring router mounted at /api prefix)
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/events?${searchParams}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  // ✅ CRITICAL FIX: Extract events array from response
  // Backend returns: { events: [...] }
  // Adapter expects: [...]
  const events = data.events || data || []
  return adaptEventsResponse(events)
}

// ============================================================
// FLEET API
// ============================================================

export async function getFleetAverages(building?: string) {
  const params = new URLSearchParams()
  if (building) params.append('building', building)
  
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/fleet/averages?${params}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  return adaptFleetAveragesResponse(data)
}

// ============================================================
// NOTES API
// ============================================================

export async function getMachineNotes(machineId: string, params?: {
  category?: string
  priority?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.category) searchParams.append('category', params.category)
  if (params?.priority) searchParams.append('priority', params.priority)
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/notes?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptNotesResponse(data)
}

export async function createNote(machineId: string, noteData: {
  title: string
  content: string
  category?: string
  priority?: string
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(noteData)
  })
  
  return handleResponse(response)
}

export async function updateNote(machineId: string, noteId: string, noteData: {
  title?: string
  content?: string
  category?: string
  priority?: string
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/notes/${noteId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(noteData)
  })
  
  return handleResponse(response)
}

export async function deleteNote(machineId: string, noteId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/notes/${noteId}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function togglePinNote(machineId: string, noteId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/${machineId}/notes/${noteId}/pin`, {
    method: 'POST',
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// LOGIN HISTORY API
// ============================================================

export async function getLoginHistory(machineId: string, params?: {
  days?: number
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.days) searchParams.append('days', params.days.toString())
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/login-history?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptLoginHistoryResponse(data)
}

// ============================================================
// ALERTS API
// ============================================================

export async function getAlerts(params?: {
  severity?: string
  acknowledged?: boolean
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.severity) searchParams.append('severity', params.severity)
  if (params?.acknowledged !== undefined) searchParams.append('acknowledged', params.acknowledged.toString())
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/alerts?${searchParams}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  return adaptAlertsResponse(data)
}

export async function acknowledgeAlert(alertId: string, note: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ note })
  })
  
  return handleResponse(response)
}

export async function snoozeAlert(alertId: string, hours: number) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/alerts/${alertId}/snooze`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ hours })
  })
  
  return handleResponse(response)
}

// ============================================================
// ANALYTICS API
// ============================================================

export async function getAnalyticsOverview() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/overview`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getUsagePatterns(days = 7) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/usage-patterns?days=${days}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getBuildingAnalytics() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/buildings`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getPerformanceRankings(params?: {
  metric?: string
  limit?: number
  order?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  if (params?.order) searchParams.append('order', params.order)
  
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/performance-rankings?${searchParams}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getIssuesAnalytics(days = 7) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/issues?days=${days}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getSystemTrends(params?: {
  metric?: string
  days?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.days) searchParams.append('days', params.days.toString())
  
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/analytics/trends?${searchParams}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// HISTORICAL ANALYTICS API
// ============================================================

export async function getDailyAverages(machineId: string, params?: {
  metric?: string
  days?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.days) searchParams.append('days', params.days.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/analytics/daily?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptAnalyticsResponse(data)
}

export async function getWeeklyAverages(machineId: string, params?: {
  metric?: string
  weeks?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.weeks) searchParams.append('weeks', params.weeks.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/analytics/weekly?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptAnalyticsResponse(data)
}

export async function getMonthlyAverages(machineId: string, params?: {
  metric?: string
  months?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.months) searchParams.append('months', params.months.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/analytics/monthly?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptAnalyticsResponse(data)
}

export async function getPeriodComparison(machineId: string, params?: {
  metric?: string
  comparison?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.metric) searchParams.append('metric', params.metric)
  if (params?.comparison) searchParams.append('comparison', params.comparison)
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/analytics/comparison?${searchParams}`,
    { headers: getHeaders() }
  )
  
  return handleResponse(response)
}

export async function getMultiMetricAverages(machineId: string, params?: {
  metrics?: string
  period?: string
  days?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.metrics) searchParams.append('metrics', params.metrics)
  if (params?.period) searchParams.append('period', params.period)
  if (params?.days) searchParams.append('days', params.days.toString())
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/machines/${machineId}/analytics/multi-metric?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptAnalyticsResponse(data)
}

export async function getFleetAnalytics(params?: {
  metric?: string
  period?: string
  days?: number
  building?: string
}) {
  const searchParams = new URLSearchParams()
  // Backend only accepts 'period' parameter with values: 1h, 24h, 7d, 30d
  if (params?.period) searchParams.append('period', params.period)
  
  // ✅ CRITICAL FIX: Pass building filter to respect building-specific averages
  if (params?.building && params.building !== 'all') {
    searchParams.append('building', params.building)
  }
  
  const response = await fetchWithTimeout(
    `${API_CONFIG.baseURL}/analytics/fleet/averages?${searchParams}`,
    { headers: getHeaders() }
  )
  
  const data = await handleResponse(response)
  return adaptAnalyticsResponse(data)
}

// ============================================================
// SEARCH API
// ============================================================

export async function searchMachines(query: string, searchIn = 'all') {
  const params = new URLSearchParams()
  params.append('q', query)
  params.append('search_in', searchIn)
  
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/search?${params}`, {
    headers: getHeaders()
  })
  
  const data = await handleResponse(response)
  
  // Adapt results
  if (data.results) {
    data.results = adaptMachinesResponse(data.results)
  }
  
  return data
}

// ============================================================
// EXPORT API
// ============================================================

export async function exportMachinesCSV(params?: {
  machineIds?: string[]
  filters?: any
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/export/csv`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params || {})
  })
  
  if (!response.ok) {
    throw new Error('Export failed')
  }
  
  return response.blob()
}

// ============================================================
// BULK OPERATIONS API
// ============================================================

export async function bulkSetMaintenance(machineIds: string[], config: any) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/bulk-maintenance`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ machineIds, config })
  })
  
  return handleResponse(response)
}

export async function bulkAddTags(machineIds: string[], tags: string[]) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/bulk/tags`, { // Fixed: Changed from bulk-tag to bulk/tags
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ machineIds, tags })
  })
  
  return handleResponse(response)
}

export async function bulkAddToGroup(machineIds: string[], groupId: string, groupName: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/machines/bulk/groups`, { // Fixed: Changed from bulk-group to bulk/groups
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ machineIds, groupId, groupName })
  })
  
  return handleResponse(response)
}

// ============================================================
// TAGS & GROUPS API
// ============================================================

export async function getAllTags() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/tags`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getAllGroups() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/groups`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function createTag(data: { name: string; color?: string; description?: string }) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/tags`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  
  return handleResponse(response)
}

export async function updateTag(tagName: string, data: { color?: string; description?: string }) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/tags/${tagName}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  
  return handleResponse(response)
}

export async function deleteTag(tagName: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/tags/${tagName}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function createGroup(data: { 
  group_id: string; 
  group_name: string; 
  description?: string; 
  machine_ids?: string[] 
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/groups`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  
  return handleResponse(response)
}

export async function updateGroup(groupId: string, data: { 
  group_name?: string; 
  description?: string; 
  add_machines?: string[];
  remove_machines?: string[]
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/groups/${groupId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  
  return handleResponse(response)
}

export async function deleteGroup(groupId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/groups/${groupId}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// CONFIGURATION API
// ============================================================

export async function getInfluxConfig() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/influxdb`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function saveInfluxConfig(config: {
  enabled: boolean
  url: string
  token?: string
  org: string
  bucket: string
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/influxdb`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config)
  })
  
  return handleResponse(response)
}

export async function getGrafanaConfig() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/grafana`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function saveGrafanaConfig(config: {
  enabled: boolean
  url: string
  api_key?: string
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/grafana`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config)
  })
  
  return handleResponse(response)
}

export async function getWebhookConfig() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/webhooks`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function saveWebhookConfig(config: {
  slack: { enabled: boolean; url: string }
  discord: { enabled: boolean; url: string }
  teams: { enabled: boolean; url: string }
  custom: { enabled: boolean; url: string }
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/webhooks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config)
  })
  
  return handleResponse(response)
}

export async function getAlertConfig() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/alerts`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function saveAlertConfig(config: {
  critical_threshold: number
  warning_threshold: number
  email_notifications: boolean
  webhook_notifications: boolean
}) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/config/alerts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config)
  })
  
  return handleResponse(response)
}

// ============================================================
// DASHBOARD API
// ============================================================

export async function getDashboardOverview() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/dashboard/overview`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getBuildings() {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/buildings`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

export async function getBuildingStats(buildingCode: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/buildings/${buildingCode}/stats`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// USB MONITORING API
// ============================================================

/**
 * Get current USB snapshot for a machine
 */
export async function getUSBCurrent(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/usb/current/${machineId}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

/**
 * Get USB event history for a machine
 * @param machineId - Machine ID
 * @param options - Query options
 */
export async function getUSBHistory(
  machineId: string, 
  options?: {
    limit?: number
    skip?: number
    action?: 'connected' | 'disconnected'
  }
) {
  const params = new URLSearchParams()
  if (options?.limit) params.append('limit', options.limit.toString())
  if (options?.skip) params.append('skip', options.skip.toString())
  if (options?.action) params.append('action', options.action)
  
  const url = `${API_CONFIG.baseURL}/usb/history/${machineId}${params.toString() ? '?' + params.toString() : ''}`
  const response = await fetchWithTimeout(url, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

/**
 * Get USB audit registry for a machine (ever-seen devices from Windows registry)
 */
export async function getUSBAudit(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/usb/audit/${machineId}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

/**
 * Get USB statistics for a machine
 */
export async function getUSBStats(machineId: string) {
  const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/usb/stats/${machineId}`, {
    headers: getHeaders()
  })
  
  return handleResponse(response)
}

// ============================================================
// WEBSOCKET API
// ============================================================

let wsReconnectAttempts = 0
const MAX_WS_RECONNECT_ATTEMPTS = 10 // ✅ Increased from 5 to 10
const BASE_RECONNECT_DELAY = 1000 // 1 second
const MAX_RECONNECT_DELAY = 30000 // 30 seconds

// ✅ WebSocket connection status callbacks
type ConnectionStatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', details?: any) => void
let statusCallback: ConnectionStatusCallback | null = null

export function setWebSocketStatusCallback(callback: ConnectionStatusCallback) {
  statusCallback = callback
}

function notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', details?: any) {
  if (statusCallback) {
    statusCallback(status, details)
  }
}

// ✅ Calculate exponential backoff delay
function getReconnectDelay(attempt: number): number {
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY)
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000
  return delay + jitter
}

export function connectWebSocket(onMessage: (message: any) => void) {
  notifyStatus('connecting', { attempt: wsReconnectAttempts })
  
  const ws = new WebSocket(`${API_CONFIG.wsURL}/ws`) // Fixed: Changed from /ws/realtime to /ws to match backend
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected to backend')
    wsReconnectAttempts = 0 // Reset counter on successful connection
    notifyStatus('connected')
  }
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      // ✅ FIX: Don't adapt WebSocket messages - they're already optimized
      // The backend sends: {machine_id, status, resources: {cpu, mem, disk}}
      // The adapter was converting this to nested format and losing values
      // const adaptedMessage = adaptWebSocketMessage(message)
      onMessage(message) // Send raw message directly
    } catch (error) {
      console.error('WebSocket message parsing error:', error)
    }
  }
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket connection error:', error)
    notifyStatus('error', { error, attempt: wsReconnectAttempts })
  }
  
  ws.onclose = (event) => {
    console.log(`⚠️  WebSocket disconnected (code: ${event.code})`)
    notifyStatus('disconnected', { code: event.code, reason: event.reason })
    
    // Auto-reconnect with exponential backoff if connection was lost unexpectedly
    if (event.code !== 1000 && wsReconnectAttempts < MAX_WS_RECONNECT_ATTEMPTS) { // 1000 = normal closure
      wsReconnectAttempts++
      const delay = getReconnectDelay(wsReconnectAttempts - 1)
      
      console.log(`🔄 Attempting to reconnect (${wsReconnectAttempts}/${MAX_WS_RECONNECT_ATTEMPTS}) in ${(delay / 1000).toFixed(1)}s...`)
      
      setTimeout(() => connectWebSocket(onMessage), delay)
    } else if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
      console.warn('⚠️  Max WebSocket reconnection attempts reached. WebSocket disabled - using polling instead.')
      notifyStatus('error', { 
        reason: 'max_attempts_reached', 
        attempts: wsReconnectAttempts 
      })
    }
  }
  
  return ws
}

export function connectMachineWebSocket(machineId: string, onMessage: (message: any) => void) {
  const ws = new WebSocket(`${API_CONFIG.wsURL}/ws/machines/${machineId}`)
  
  ws.onopen = () => {
    console.log(`✅ WebSocket connected for machine: ${machineId}`)
  }
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      const adaptedMessage = adaptWebSocketMessage(message)
      onMessage(adaptedMessage)
    } catch (error) {
      console.error('WebSocket message parsing error:', error)
    }
  }
  
  ws.onerror = (error) => {
    console.error(`❌ WebSocket error for machine ${machineId}:`, error)
  }
  
  ws.onclose = (event) => {
    console.log(`⚠️  WebSocket disconnected for machine: ${machineId} (code: ${event.code})`)
  }
  
  return ws
}

// ============================================================
// EXPORT ALL (for compatibility)
// ============================================================

export default {
  // Machines
  getMachines,
  getMachine,
  getMachineSpecs,
  getMachineHardware,
  getMachineHistory,
  getMachineTrends,
  getMachineApplications,
  getMachineSecurity,
  getMachineEvents,
  getMachinePeripherals,
  getMachineSessions,
  getMachineNetwork,
  getMachineServices,
  getMachineUpdates,
  getMachineProcesses,
  getMachineLogs,
  getMachineUserActivity,
  
  // USB Monitoring
  getUSBCurrent,
  getUSBHistory,
  getUSBAudit,
  getUSBStats,
  
  // Actions
  performMachineAction,
  updateMachineTags,
  updateMachineGroups,
  scheduleMaintenance,
  
  // Events
  getEvents,
  
  // Fleet
  getFleetAverages,
  
  // Notes
  getMachineNotes,
  createNote,
  updateNote,
  deleteNote,
  togglePinNote,
  
  // Login History
  getLoginHistory,
  
  // Alerts
  getAlerts,
  acknowledgeAlert,
  snoozeAlert,
  
  // Analytics
  getAnalyticsOverview,
  getUsagePatterns,
  getBuildingAnalytics,
  getPerformanceRankings,
  getIssuesAnalytics,
  getSystemTrends,
  
  // Historical Analytics
  getDailyAverages,
  getWeeklyAverages,
  getMonthlyAverages,
  getPeriodComparison,
  getMultiMetricAverages,
  getFleetAnalytics,
  
  // Search
  searchMachines,
  
  // Export
  exportMachinesCSV,
  
  // Bulk
  bulkSetMaintenance,
  bulkAddTags,
  bulkAddToGroup,
  
  // Tags & Groups
  getAllTags,
  getAllGroups,
  createTag,
  updateTag,
  deleteTag,
  createGroup,
  updateGroup,
  deleteGroup,
  
  // Dashboard
  getDashboardOverview,
  getBuildings,
  getBuildingStats,
  
  // WebSocket
  connectWebSocket,
  connectMachineWebSocket
}