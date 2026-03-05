/**
 * Filter Context
 * Manages filter state and saved filters
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { FilterState, AdvancedFilterState, SavedFilter } from '../types/monitor-schema'

export interface FilterContextState {
  // Filter states
  basicFilters: FilterState
  advancedFilters: AdvancedFilterState
  activePreset: string | null
  savedFilters: SavedFilter[]
  
  // Actions
  setBasicFilters: (filters: FilterState) => void
  setAdvancedFilters: (filters: AdvancedFilterState) => void
  setActivePreset: (preset: string | null) => void
  setSavedFilters: (filters: SavedFilter[]) => void
  updateBasicFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  updateAdvancedFilter: <K extends keyof AdvancedFilterState>(key: K, value: AdvancedFilterState[K]) => void
  resetFilters: () => void
  resetAdvancedFilters: () => void
}

const defaultBasicFilters: FilterState = {
  building: 'all',
  room: 'all',
  status: 'all',
  healthStatus: 'all',
  cpuAge: 'all',
  tag: 'all',
  group: 'all',
  user: 'all',
  search: '',
  ipSearch: '' // ✅ NEW: IP address search
}

const defaultAdvancedFilters: AdvancedFilterState = {
  cpuUsageMin: 0,
  cpuUsageMax: 100,
  memoryUsageMin: 0,
  memoryUsageMax: 100,
  diskUsageMin: 0,
  diskUsageMax: 100,
  healthScoreMin: 0,
  cpuCoresMin: 0,
  ramGbMin: 0,
  storageGbMin: 0,
  cpuModel: 'all',
  osVersion: 'all',
  storageType: 'all',
  hardwareModel: 'all',
  lastHeartbeatWithinMin: 0,
  lastBootWithinHours: 0
}

const FilterContext = createContext<FilterContextState | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [basicFilters, setBasicFilters] = useState<FilterState>(defaultBasicFilters)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(defaultAdvancedFilters)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])

  const updateBasicFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setBasicFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateAdvancedFilter = useCallback(<K extends keyof AdvancedFilterState>(key: K, value: AdvancedFilterState[K]) => {
    setAdvancedFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setBasicFilters(defaultBasicFilters)
    setActivePreset(null)
  }, [])

  const resetAdvancedFilters = useCallback(() => {
    setAdvancedFilters(defaultAdvancedFilters)
  }, [])

  const value: FilterContextState = {
    basicFilters,
    advancedFilters,
    activePreset,
    savedFilters,
    setBasicFilters,
    setAdvancedFilters,
    setActivePreset,
    setSavedFilters,
    updateBasicFilter,
    updateAdvancedFilter,
    resetFilters,
    resetAdvancedFilters,
  }

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilterContext() {
  const context = useContext(FilterContext)
  if (context === undefined) {
    throw new Error('useFilterContext must be used within a FilterProvider')
  }
  return context
}