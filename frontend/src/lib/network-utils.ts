/**
 * Network Utilities - Auto-detect Backend URL
 * 
 * Automatically detects the appropriate backend URL based on how the app is accessed:
 * - localhost → http://localhost:8001
 * - LAN IP (e.g., 192.168.1.100) → http://192.168.1.100:8001
 * - Custom domain → uses VITE_API_URL from environment
 */

/**
 * Get the backend URL automatically
 * Detects localhost vs LAN access and adjusts accordingly
 */
export function getBackendUrl(): string {
  // 1. Environment variable takes highest priority
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // 2. Auto-detect based on current hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    const protocol = window.location.protocol
    
    // If accessing via LAN IP (not localhost), use that IP for backend
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
      // Check if it's an IP address (IPv4)
      const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
      if (ipPattern.test(hostname)) {
        console.log(`🌐 Detected LAN access: ${hostname}`)
        return `${protocol}//${hostname}:8001`
      }
      
      // Otherwise assume it's a domain name
      console.log(`🌐 Detected domain access: ${hostname}`)
      return `${protocol}//${hostname}:8001`
    }
  }
  
  // 3. Default to localhost
  console.log('🖥️  Using localhost backend')
  return 'http://localhost:8001'
}

/**
 * Get the WebSocket URL (derived from backend URL)
 */
export function getWebSocketUrl(): string {
  const backendUrl = getBackendUrl()
  return backendUrl
    .replace('http://', 'ws://')
    .replace('https://', 'wss://')
}

/**
 * Get the API base URL (with /api/v1 suffix)
 */
export function getApiBaseUrl(): string {
  return `${getBackendUrl()}/api/v1`
}

/**
 * Check if backend is reachable
 * Returns true if backend responds, false otherwise
 */
export async function checkBackendConnection(): Promise<{
  available: boolean
  url: string
  latency?: number
}> {
  const url = getBackendUrl()
  const startTime = Date.now()
  
  try {
    const response = await fetch(`${url}/api/v1/data/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    })
    
    const latency = Date.now() - startTime
    
    return {
      available: response.ok,
      url,
      latency
    }
  } catch (error) {
    // Silently handle backend unavailability in demo mode
    return {
      available: false,
      url
    }
  }
}

/**
 * Get network information for debugging
 */
export function getNetworkInfo(): {
  hostname: string
  protocol: string
  port: string
  detectedBackendUrl: string
  detectedWsUrl: string
  detectedApiUrl: string
} {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown'
  const port = typeof window !== 'undefined' ? window.location.port : 'unknown'
  
  return {
    hostname,
    protocol,
    port,
    detectedBackendUrl: getBackendUrl(),
    detectedWsUrl: getWebSocketUrl(),
    detectedApiUrl: getApiBaseUrl()
  }
}

/**
 * Log network configuration (for debugging)
 */
export function logNetworkConfig() {
  const info = getNetworkInfo()
  
  console.group('🌐 Network Configuration')
  console.log('Frontend Host:', info.hostname)
  console.log('Frontend Protocol:', info.protocol)
  console.log('Frontend Port:', info.port)
  console.log('Backend URL:', info.detectedBackendUrl)
  console.log('WebSocket URL:', info.detectedWsUrl)
  console.log('API URL:', info.detectedApiUrl)
  console.groupEnd()
}

// Auto-log in development mode
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  logNetworkConfig()
}