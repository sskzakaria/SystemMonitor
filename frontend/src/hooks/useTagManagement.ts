/**
 * Tag Management Hook
 * Provides functions for managing machine tags
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import * as api from '../services/api'

export function useTagManagement() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Update tags for a machine
   */
  const updateMachineTags = useCallback(async (machineId: string, tags: string[]) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.updateMachineTags(machineId, tags)
      toast.success('Tags updated successfully', {
        description: `${tags.length} tags applied to machine`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update tags'
      setError(message)
      
      // Check if it's a network error (backend not available)
      const isNetworkError = message.includes('Failed to fetch') || message.includes('fetch')
      
      if (isNetworkError) {
        // Backend not available - use mock mode
        toast.warning('Backend not available - using local mode', {
          description: 'Tags saved locally only (not persisted to backend)'
        })
        // Return a mock successful response
        return {
          success: true,
          machine_id: machineId,
          tags: tags
        }
      } else {
        // Other error - show error toast
        toast.error('Failed to update tags', {
          description: message
        })
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Get all available tags
   */
  const getAllTags = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.getAllTags()
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tags'
      setError(message)
      toast.error('Failed to fetch tags', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Create a new tag
   */
  const createTag = useCallback(async (name: string, color?: string, description?: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.createTag({ name, color, description })
      toast.success('Tag created', {
        description: `"${name}" is now available`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create tag'
      setError(message)
      toast.error('Failed to create tag', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Delete a tag
   */
  const deleteTag = useCallback(async (tagName: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.deleteTag(tagName)
      toast.success('Tag deleted', {
        description: `Removed from ${result.removed_from_machines} machines`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete tag'
      setError(message)
      toast.error('Failed to delete tag', {
        description: message
      })
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Bulk add tags to multiple machines
   */
  const bulkAddTags = useCallback(async (machineIds: string[], tags: string[]) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await api.bulkAddTags(machineIds, tags)
      toast.success('Tags applied', {
        description: `Updated ${result.machines_updated} of ${result.total_requested} machines`
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply tags'
      setError(message)
      
      // Check if it's a network error (backend not available)
      const isNetworkError = message.includes('Failed to fetch') || message.includes('fetch')
      
      if (isNetworkError) {
        // Backend not available - use mock mode
        toast.warning('Backend not available - using local mode', {
          description: 'Tags applied locally only (not persisted to backend)'
        })
        // Return a mock successful response
        return {
          success: true,
          total_requested: machineIds.length,
          machines_updated: machineIds.length,
          failed_updates: 0,
          tags_applied: tags
        }
      } else {
        // Other error - show error toast
        toast.error('Failed to apply tags', {
          description: message
        })
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    updateMachineTags,
    getAllTags,
    createTag,
    deleteTag,
    bulkAddTags,
    isLoading,
    error,
  }
}