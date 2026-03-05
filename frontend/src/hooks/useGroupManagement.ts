/**
 * Group Management Hook
 * Provides functions for managing machine groups
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import * as api from '../services/api'

export interface MachineGroup {
  id: string
  group_id: string
  group_name: string
  description?: string
  machine_ids: string[]
  machine_count?: number
  created_by: string
  created_at: string
  updated_at: string
}

export function useGroupManagement() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Get all groups
   */
  const getAllGroups = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.getAllGroups()
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch groups'
      setError(message)
      toast.error('Failed to fetch groups', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Create a new group
   */
  const createGroup = useCallback(async (
    groupId: string,
    groupName: string,
    description?: string,
    machineIds?: string[]
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.createGroup({
        group_id: groupId,
        group_name: groupName,
        description,
        machine_ids: machineIds || []
      })
      toast.success('Group created', {
        description: `"${groupName}" is ready to use`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create group'
      setError(message)
      toast.error('Failed to create group', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Update a group
   */
  const updateGroup = useCallback(async (
    groupId: string,
    updates: {
      group_name?: string
      description?: string
      add_machines?: string[]
      remove_machines?: string[]
    }
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.updateGroup(groupId, updates)
      toast.success('Group updated', {
        description: 'Changes saved successfully'
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update group'
      setError(message)
      toast.error('Failed to update group', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Delete a group
   */
  const deleteGroup = useCallback(async (groupId: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.deleteGroup(groupId)
      toast.success('Group deleted', {
        description: `Removed from ${result.removed_from_machines} machines`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete group'
      setError(message)
      toast.error('Failed to delete group', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Add machines to a group (bulk)
   */
  const addMachinesToGroup = useCallback(async (
    machineIds: string[],
    groupId: string,
    groupName: string
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.bulkAddToGroup(machineIds, groupId, groupName)
      toast.success('Machines added to group', {
        description: `${result.machines_updated} of ${result.total_requested} machines updated`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add machines to group'
      setError(message)
      toast.error('Failed to add machines', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    getAllGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMachinesToGroup,
    isLoading,
    error,
  }
}