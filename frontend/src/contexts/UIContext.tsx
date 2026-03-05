/**
 * UI Context
 * Manages UI state like dialogs, selections, and view mode
 */

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

type ViewType = 'dashboard' | 'analytics' | 'timeline' | 'settings'

// ✅ LocalStorage keys
const STORAGE_KEYS = {
  SELECTED_MACHINES: 'ucms_selected_machines',
  AUTO_REFRESH: 'ucms_auto_refresh'
}

// ✅ Helper functions for localStorage
function loadSelectedMachines(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_MACHINES)
    if (stored) {
      const array = JSON.parse(stored)
      return new Set(array)
    }
  } catch (error) {
    console.warn('Failed to load selected machines from localStorage:', error)
  }
  return new Set()
}

function saveSelectedMachines(machines: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_MACHINES, JSON.stringify(Array.from(machines)))
  } catch (error) {
    console.warn('Failed to save selected machines to localStorage:', error)
  }
}

function loadAutoRefresh(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  } catch (error) {
    console.warn('Failed to load auto-refresh setting from localStorage:', error)
    return true
  }
}

function saveAutoRefresh(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, String(enabled))
  } catch (error) {
    console.warn('Failed to save auto-refresh setting to localStorage:', error)
  }
}

export interface UIContextState {
  // View state
  currentView: ViewType
  
  // Selection state
  selectedMachine: string | null
  selectedMachines: Set<string>
  
  // Dialog states
  showMaintenanceDialog: boolean
  showTagDialog: boolean
  showGroupDialog: boolean
  
  // Settings
  autoRefreshEnabled: boolean
  
  // Actions
  setCurrentView: (view: ViewType) => void
  setSelectedMachine: (machineId: string | null) => void
  setSelectedMachines: (machines: Set<string>) => void
  toggleMachineSelection: (machineId: string) => void
  selectAllMachines: (machineIds: string[]) => void
  clearSelection: () => void
  setShowMaintenanceDialog: (show: boolean) => void
  setShowTagDialog: (show: boolean) => void
  setShowGroupDialog: (show: boolean) => void
  setAutoRefreshEnabled: (enabled: boolean) => void
}

const UIContext = createContext<UIContextState | undefined>(undefined)

export function UIProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard')
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)
  const [selectedMachines, setSelectedMachines] = useState<Set<string>>(loadSelectedMachines())
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(loadAutoRefresh())

  const toggleMachineSelection = useCallback((machineId: string) => {
    setSelectedMachines(prev => {
      const newSet = new Set(prev)
      if (newSet.has(machineId)) {
        newSet.delete(machineId)
      } else {
        newSet.add(machineId)
      }
      return newSet
    })
  }, [])

  const selectAllMachines = useCallback((machineIds: string[]) => {
    setSelectedMachines(new Set(machineIds))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedMachines(new Set())
  }, [])

  const value: UIContextState = {
    currentView,
    selectedMachine,
    selectedMachines,
    showMaintenanceDialog,
    showTagDialog,
    showGroupDialog,
    autoRefreshEnabled,
    setCurrentView,
    setSelectedMachine,
    setSelectedMachines,
    toggleMachineSelection,
    selectAllMachines,
    clearSelection,
    setShowMaintenanceDialog,
    setShowTagDialog,
    setShowGroupDialog,
    setAutoRefreshEnabled,
  }

  useEffect(() => {
    saveSelectedMachines(selectedMachines)
  }, [selectedMachines])

  useEffect(() => {
    saveAutoRefresh(autoRefreshEnabled)
  }, [autoRefreshEnabled])

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  )
}

export function useUIContext() {
  const context = useContext(UIContext)
  if (context === undefined) {
    throw new Error('useUIContext must be used within a UIProvider')
  }
  return context
}