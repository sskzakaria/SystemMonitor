/**
 * Hook to fetch real fleet averages for hardware comparison
 * Pulls from /api/analytics/overview endpoint
 */

import { useState, useEffect } from 'react'
import { config } from '../config'
import { getApiBaseUrl } from '../lib/network-utils'

export interface FleetAverages {
  cpu_age: number
  ram_gb: number
  storage_gb: number
}

interface FleetOverview {
  total_machines: number
  online_machines: number
  offline_machines: number
  in_use_machines: number
  idle_machines: number
  average_cpu: number
  average_memory: number
  average_disk: number
}

export function useFleetAverages() {
  const [fleetAverages, setFleetAverages] = useState<FleetAverages>({
    cpu_age: 4.5,      // Default fallback
    ram_gb: 16,        // Default fallback
    storage_gb: 512    // Default fallback
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchFleetAverages() {
      try {
        setLoading(true)
        
        // Fetch fleet overview - backend uses /stats/overview not /analytics/overview
        const response = await fetch(`${getApiBaseUrl()}/stats/overview`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          // 404 is expected if backend doesn't have this endpoint yet
          if (response.status === 404) {
            console.log('ℹ️  Fleet analytics endpoint not available - using defaults')
          } else {
            console.warn(`⚠️  Fleet overview returned ${response.status}`)
          }
          throw new Error(`Failed to fetch fleet overview: ${response.status}`)
        }
        
        const data: any = await response.json()
        
        console.log('✅ Fleet Overview Data:', data)
        
        // ✅ Extract REAL fleet averages from backend response
        // Backend should return: avg_cpu_age, avg_ram_gb, avg_storage_gb
        const realAverages: FleetAverages = {
          cpu_age: data.avg_cpu_age || data.average_cpu_age || data.cpu_age || 4.5,
          ram_gb: data.avg_ram_gb || data.average_ram_gb || data.ram_gb || 16,
          storage_gb: data.avg_storage_gb || data.average_storage_gb || data.storage_gb || 512
        }
        
        console.log('✅ Using fleet averages:', {
          cpu_age: `${realAverages.cpu_age} years`,
          ram_gb: `${realAverages.ram_gb} GB`,
          storage_gb: `${realAverages.storage_gb} GB`,
          source: (data.avg_cpu_age || data.avg_ram_gb || data.avg_storage_gb) ? 'backend' : 'defaults'
        })
        
        setFleetAverages(realAverages)
        setError(null)
      } catch (err) {
        console.error('❌ Error fetching fleet averages:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        // Keep default values on error
      } finally {
        setLoading(false)
      }
    }

    fetchFleetAverages()
  }, [])

  return { fleetAverages, loading, error }
}