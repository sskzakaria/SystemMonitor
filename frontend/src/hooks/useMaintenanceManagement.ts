/**
 * Maintenance Management Hook
 * Provides functions for managing maintenance schedules
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import * as api from '../services/api'

export function useMaintenanceManagement() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Schedule maintenance for a machine
   */
  const scheduleMaintenance = useCallback(async (
    machineId: string,
    data: {
      maintenance_type: string
      description: string
      scheduled_start: string
      scheduled_end: string
      technician?: string
      notify_users?: boolean
    }
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.scheduleMaintenance(machineId, data)
      toast.success('Maintenance scheduled', {
        description: `Scheduled from ${new Date(result.scheduled_start).toLocaleString()}`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule maintenance'
      setError(message)
      
      // Check if it's a network error (backend not available)
      const isNetworkError = message.includes('Failed to fetch') || message.includes('fetch')
      
      if (isNetworkError) {
        // Backend not available - use mock mode
        toast.warning('Backend not available - using local mode', {
          description: 'Maintenance scheduled locally only (not persisted to backend)'
        })
        // Return a mock successful response
        return {
          success: true,
          machine_id: machineId,
          maintenance_type: data.maintenance_type,
          scheduled_start: data.scheduled_start,
          scheduled_end: data.scheduled_end,
          description: data.description,
          technician: data.technician || 'admin@university.edu',
          notify_users: data.notify_users || false
        }
      } else {
        // Other error - show error toast
        toast.error('Failed to schedule maintenance', {
          description: message
        })
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Bulk set maintenance mode on multiple machines
   */
  const bulkSetMaintenance = useCallback(async (
    machineIds: string[],
    reason: string,
    durationHours: number = 2,
    notifyUsers: boolean = true
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.bulkSetMaintenance(machineIds, reason, durationHours, notifyUsers)
      toast.success('Maintenance mode enabled', {
        description: `${result.machines_updated} machines set to maintenance mode`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set maintenance mode'
      setError(message)
      
      // Check if it's a network error (backend not available)
      const isNetworkError = message.includes('Failed to fetch') || message.includes('fetch')
      
      if (isNetworkError) {
        // Backend not available - use mock mode
        toast.warning('Backend not available - using local mode', {
          description: 'Maintenance mode set locally only (not persisted to backend)'
        })
        // Return a mock successful response
        return {
          success: true,
          total_requested: machineIds.length,
          machines_updated: machineIds.length,
          failed_updates: 0,
          reason: reason,
          duration_hours: durationHours
        }
      } else {
        // Other error - show error toast
        toast.error('Failed to set maintenance mode', {
          description: message
        })
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    scheduleMaintenance,
    bulkSetMaintenance,
    isLoading,
    error,
  }
}