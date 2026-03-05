/**
 * Hook to fetch machine historical data for real-time status charts
 * Pulls from /api/machines/{id}/history/* endpoints
 */

import { useState, useEffect } from 'react'
import { config } from '../config'
import { getApiBaseUrl } from '../lib/network-utils'

export interface HistoryDataPoint {
  timestamp: string
  cpu_usage_percent?: number
  memory_usage_percent?: number
  disk_usage_percent?: number
  bytes_sent?: number
  bytes_recv?: number
  cpu_temperature_c?: number
}

export interface MachineHistoryData {
  machine_id: string
  hardware?: HistoryDataPoint[]  // Backend returns hardware array
  network?: Array<{timestamp: string, bytes_sent: number, bytes_recv: number}>
  history?: HistoryDataPoint[]  // Fallback for old format
  period_hours: number
}

interface ChartDataPoint {
  time: string
  cpu: number
  memory: number
  disk: number
}

/**
 * Fetch 24-hour historical data for real-time status charts
 */
export function useMachineHistory(machineId: string, hours: number = 24) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        
        // ✅ FIX: Backend endpoint is /history not /history/all
        const response = await fetch(
          `${getApiBaseUrl()}/machines/${machineId}/history?hours=${hours}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
        
        if (!response.ok) {
          // 404 is expected if backend doesn't have history data yet
          if (response.status === 404) {
            console.log(`ℹ️  History endpoint not available for ${machineId} - will show current state only`)
            setHistory([])
            setError(null)
            return
          }
          throw new Error(`Failed to fetch machine history: ${response.status}`)
        }
        
        const data: MachineHistoryData = await response.json()
        
        console.log(`✅ Machine History Data (${machineId}):`, data)
        
        // Backend returns {hardware: [...], network: [...]}
        // We need to merge them by timestamp
        const hardwareData = data.hardware || []
        const networkData = data.network || []
        
        // If no data, return empty immediately
        if (hardwareData.length === 0) {
          console.log('⚠️ No historical data available - will show current state only')
          setChartData([])
          setError(null)
          setLoading(false)
          return
        }
        
        // Transform hardware data to chart format
        const transformed: ChartDataPoint[] = hardwareData.map((point) => {
          const timestamp = new Date(point.timestamp)
          return {
            time: timestamp.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            cpu: point.cpu_usage_percent || 0,
            memory: point.memory_usage_percent || 0,
            disk: point.disk_usage_percent || 0,
          }
        })
        
        // If we have data, use it; otherwise show current state only
        if (transformed.length > 0) {
          setChartData(transformed)
          console.log(`✅ Loaded ${transformed.length} historical data points`)
        } else {
          console.log('⚠️ No historical data available - will show current state only')
          setChartData([])
        }
        
        setError(null)
      } catch (err) {
        console.error('❌ Error fetching machine history:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        // Leave chartData empty on error
        setChartData([])
      } finally {
        setLoading(false)
      }
    }

    if (machineId) {
      fetchHistory()
      
      // Refresh every 5 minutes
      const interval = setInterval(fetchHistory, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [machineId, hours])

  return { chartData, loading, error }
}

/**
 * Fetch CPU history only
 */
export function useMachineCPUHistory(machineId: string, hours: number = 24) {
  const [history, setHistory] = useState<HistoryDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        
        const response = await fetch(
          `${getApiBaseUrl()}/machines/${machineId}/history/cpu?hours=${hours}`
        )
        
        if (!response.ok) {
          throw new Error('Failed to fetch CPU history')
        }
        
        const data: MachineHistoryData = await response.json()
        setHistory(data.history)
        setError(null)
      } catch (err) {
        console.error('Error fetching CPU history:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    if (machineId) {
      fetchHistory()
    }
  }, [machineId, hours])

  return { history, loading, error }
}

/**
 * Fetch memory history only
 */
export function useMachineMemoryHistory(machineId: string, hours: number = 24) {
  const [history, setHistory] = useState<HistoryDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        
        const response = await fetch(
          `${getApiBaseUrl()}/machines/${machineId}/history/memory?hours=${hours}`
        )
        
        if (!response.ok) {
          throw new Error('Failed to fetch memory history')
        }
        
        const data: MachineHistoryData = await response.json()
        setHistory(data.history)
        setError(null)
      } catch (err) {
        console.error('Error fetching memory history:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    if (machineId) {
      fetchHistory()
    }
  }, [machineId, hours])

  return { history, loading, error }
}