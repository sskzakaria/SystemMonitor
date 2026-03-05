import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { Server, Network, AlertTriangle } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { differenceInMinutes } from 'date-fns'

import { MachineProvider, useMachineContext } from './contexts/MachineContext'
import { FilterProvider, useFilterContext } from './contexts/FilterContext'
import { UIProvider, useUIContext } from './contexts/UIContext'
import { useDebounce } from './hooks/useDebounce'
import { usePagination } from './hooks/use-pagination'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { toast } from 'sonner'
import { getFleetAnalytics, getMachines, getMachineSpecs, getMachineHardware, getMachineSessions, connectWebSocket, getEvents, checkBackendHealth } from './services/api'

// Component imports
import { NavigationBar } from './components/NavigationBar'
import { OverviewStats } from './components/OverviewStats'
import { FilterControlsImproved } from './components/FilterControlsImproved'
import { AdvancedFiltersImproved } from './components/AdvancedFiltersImproved'
import { SavedFiltersManager } from './components/SavedFiltersManager'
import { FilterSidebar } from './components/FilterSidebar'
import { MachineCard } from './components/MachineCard'
import { MachineCardSkeleton } from './components/MachineCardSkeleton'
import { MachineDetailFullScreen } from './components/MachineDetailFullScreen'
import { MaintenanceModeDialog } from './components/MaintenanceModeDialog'
import { BulkTagDialog } from './components/BulkTagDialog'
import { BulkGroupDialog } from './components/BulkGroupDialog'
import { BulkActionsToolbar } from './components/BulkActionsToolbar'
import { EmptyState } from './components/EmptyState'
import { Pagination } from './components/Pagination'
import { ErrorBoundary } from './components/ErrorBoundary'
import { InteractiveAnalytics } from './components/InteractiveAnalytics'
import { ExportModal } from './components/ExportModal'

// Lazy-loaded view components (using named exports)
const SystemAnalytics = lazy(() => import('./components/SystemAnalytics').then(module => ({ default: module.SystemAnalytics })))
const TimelineView = lazy(() => import('./components/TimelineView').then(module => ({ default: module.TimelineView })))
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })))

function AppContent() {
  // Context hooks - replaces all useState declarations
  const {
    machines,
    specsMap,
    hardwareMap,
    timelineEvents,
    previousMachines,
    isLoading,
    lastUpdated,
    backendAvailable,
    setMachines,
    setSpecsMap,
    setHardwareMap,
    setTimelineEvents,
    setPreviousMachines,
    setIsLoading,
    setLastUpdated,
    setBackendAvailable,
  } = useMachineContext()

  const {
    basicFilters,
    advancedFilters,
    activePreset,
    savedFilters,
    setBasicFilters,
    setAdvancedFilters,
    setActivePreset,
    setSavedFilters,
  } = useFilterContext()

  const {
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
    setShowMaintenanceDialog,
    setShowTagDialog,
    setShowGroupDialog,
    setAutoRefreshEnabled,
    toggleMachineSelection,
    selectAllMachines,
    clearSelection,
  } = useUIContext()

  // Local state for export modal
  const [showExportModal, setShowExportModal] = useState(false)

  // ✅ DATA-DRIVEN: Load machines from backend API on mount
  useEffect(() => {
    const loadMachines = async () => {
      setIsLoading(true)
      try {
        // Check backend health first
        const isHealthy = await checkBackendHealth()
        
        if (!isHealthy) {
          // Backend is offline - set state and exit gracefully
          setBackendAvailable(false)
          setIsLoading(false)
          return
        }
        
        // Fetch real data from backend
        const backendMachines = await getMachines({
          limit: 300, // Load all machines
          status: 'all'
        })
        
        // Don't set state yet - wait until we've enriched with session data
        setBackendAvailable(true)
        
        // Fetch specs and hardware for all machines in parallel
        try {
          const specsPromises = backendMachines.map(machine => 
            getMachineSpecs(machine.machine.machine_id).catch(err => {
              console.warn(`Failed to load specs for ${machine.machine.machine_id}:`, err)
              return null
            })
          )
          const hardwarePromises = backendMachines.map(machine => 
            getMachineHardware(machine.machine.machine_id).catch(err => {
              console.warn(`Failed to load hardware for ${machine.machine.machine_id}:`, err)
              return null
            })
          )
          
          const [specsResults, hardwareResults] = await Promise.all([
            Promise.all(specsPromises),
            Promise.all(hardwarePromises)
          ])
          
          // Populate specs map
          const newSpecsMap = new Map<string, SpecsMetrics>()
          specsResults.forEach((specs, index) => {
            if (specs) {
              newSpecsMap.set(backendMachines[index].machine.machine_id, specs)
            }
          })
          setSpecsMap(newSpecsMap)
          
          // Populate hardware map
          const newHardwareMap = new Map<string, HardwareMetrics>()
          hardwareResults.forEach((hardware, index) => {
            if (hardware) {
              newHardwareMap.set(backendMachines[index].machine.machine_id, hardware)
            }
          })
          setHardwareMap(newHardwareMap)
          
          console.log(`✅ Loaded specs for ${newSpecsMap.size}/${backendMachines.length} machines`)
          console.log(`✅ Loaded hardware for ${newHardwareMap.size}/${backendMachines.length} machines`)
          
          // Fetch session data for each machine to get active user info
          try {
            const sessionPromises = backendMachines.map(m => 
              getMachineSessions(m.machine.machine_id).catch(() => null)
            )
            const sessionResults = await Promise.all(sessionPromises)
            
            // Update machine data with active user from sessions
            sessionResults.forEach((sessions, index) => {
              if (sessions && sessions.active_user) {
                const machine = backendMachines[index]
                if (machine.metrics?.user_activity) {
                  machine.metrics.user_activity.current_username = sessions.active_user
                  machine.metrics.user_activity.active_users = sessions.session_count || 1
                }
              }
            })
            
            console.log(`✅ Loaded session data for ${sessionResults.filter(s => s).length}/${backendMachines.length} machines`)
          } catch (error) {
            console.warn('Failed to load session data:', error)
          }
        } catch (error) {
          console.warn('Failed to load specs/hardware:', error)
        }
        
        // NOW set the machines state with enriched data (including session info)
        setMachines(backendMachines)
        setLastUpdated(new Date())
        
        // Fetch timeline events from backend
        try {
          const events = await getEvents({
            limit: 500
          })
          setTimelineEvents(events)
          console.log(`✅ Loaded ${events.length} timeline events`)
        } catch (error) {
          console.warn('Failed to load timeline events:', error)
        }
        
        console.log('✅ Initial load: Fetched machines from backend')
      } catch (error) {
        // Backend unavailable - keep empty state
        console.log('⚠️ Backend unavailable on initial load - starting in offline mode')
        setBackendAvailable(false)
      } finally {
        setIsLoading(false)
      }
    }

    loadMachines()
  }, [])

  // Track machine state changes and generate timeline events
  useEffect(() => {
    if (machines.length === 0) return
    // Update previous machines state for next comparison
    setPreviousMachines(machines)
  }, [machines])

  // ✅ WebSocket real-time updates
  useEffect(() => {
    if (machines.length === 0) return // Don't connect before initial load
    
    console.log('🔌 Connecting to WebSocket for real-time updates...')
    
    let wsConnected = false
    
    const ws = connectWebSocket((message) => {
      console.log('📨 WebSocket message received:', message.type)
      
      // Mark WebSocket as connected when receiving messages
      if (!wsConnected) {
        wsConnected = true
        console.log('✅ WebSocket connected and receiving updates')
      }
      
      if (message.type === 'machine_update' && message.data) {
        // ✅ Backend sends FLAT structure: {machine_id, status, resources: {cpu, mem, disk}}
        const update = message.data
        
        console.log('🔍 Full WebSocket message:', JSON.stringify(message, null, 2))
        
        const machineId = update.machine_id
        if (!machineId) {
          console.log('⚠️ WebSocket: No machine_id found in message, skipping')
          return
        }
        
        console.log(`✅ WebSocket update for ${machineId}: CPU=${update.resources?.cpu_usage_percent}%, MEM=${update.resources?.memory_usage_percent}%, status=${update.status}`)
        
        // Update machine in state
        setMachines(prev => {
          const index = prev.findIndex(m => m.machine.machine_id === machineId)
          
          if (index === -1) {
            console.log(`⚠️ WebSocket: Unknown machine ${machineId}, skipping`)
            return prev
          }
          
          const newMachines = [...prev]
          const existingMachine = newMachines[index]
          
          // ✅ Merge flat update into nested frontend structure
          // Create completely new object to ensure React detects change
          newMachines[index] = {
            machine: {
              ...existingMachine.machine,
              hostname: update.hostname || existingMachine.machine.hostname,
            },
            metrics: {
              status: {
                ...existingMachine.metrics.status,
                state: update.status || existingMachine.metrics.status.state
              },
              resources: {
                ...existingMachine.metrics.resources,
                cpu_usage_percent: update.resources?.cpu_usage_percent ?? existingMachine.metrics.resources.cpu_usage_percent,
                memory_usage_percent: update.resources?.memory_usage_percent ?? existingMachine.metrics.resources.memory_usage_percent,
                disk_usage_percent: update.resources?.disk_usage_percent ?? existingMachine.metrics.resources.disk_usage_percent,
              },
              network: existingMachine.metrics.network,
              user_activity: existingMachine.metrics.user_activity,
              system: {
                ...existingMachine.metrics.system,
                last_heartbeat: update.timestamp ? new Date(update.timestamp) : existingMachine.metrics.system.last_heartbeat
              }
            },
            timestamp: update.timestamp ? new Date(update.timestamp) : existingMachine.timestamp,
            health: existingMachine.health
          }
          
          // Update last updated timestamp
          setLastUpdated(new Date())
          
          console.log(`✅ Updated machine ${machineId} in state, triggering re-render`)
          return newMachines
        })
      }
    })
    
    // Handle WebSocket errors/disconnections
    if (ws) {
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        wsConnected = false
      }
      
      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected')
        wsConnected = false
      }
    }
    
    return () => {
      if (ws) {
        console.log('🔌 Disconnecting WebSocket')
        ws.close()
      }
    }
  }, [machines.length > 0]) // Reconnect when machines are loaded

  // Auto-refresh interval (ONLY when WebSocket is disconnected or as fallback)
  useEffect(() => {
    if (!autoRefreshEnabled) return

    const interval = setInterval(async () => {
      try {
        const refreshedMachines = await getMachines({
          limit: 300,
          status: 'all'
        })
        
        // Success - backend is available
        if (!backendAvailable) {
          setBackendAvailable(true)
          toast.success('Backend connection restored')
        }
        
        // Update machines with real backend data
        setMachines(refreshedMachines)
        setLastUpdated(new Date())
        
        console.log('✅ Auto-refresh: Updated machines from backend')
      } catch (error) {
        // Silently handle backend unavailability
        // Only show toast notification once when status changes
        if (backendAvailable) {
          setBackendAvailable(false)
          toast.warning('Backend offline - displaying cached data', {
            description: 'Will retry connection automatically'
          })
        }
        
        // Keep showing existing data (don't clear machines)
        // Just update the timestamp to show we attempted refresh
        setLastUpdated(new Date())
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [autoRefreshEnabled, backendAvailable])

  // Manual refresh
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      // ✅ DATA-DRIVEN: Fetch from backend, not mock data
      const refreshedMachines = await getMachines({
        limit: 300,
        status: 'all'
      })
      
      setMachines(refreshedMachines)
      setBackendAvailable(true)
      setLastUpdated(new Date())
      toast.success('Data refreshed successfully')
      
      // Also refresh timeline events
      try {
        const events = await getEvents({
          limit: 500
        })
        setTimelineEvents(events)
      } catch (error) {
        // Silently handle timeline events fetch failure in demo mode
      }
    } catch (error) {
      // Silently handle backend unavailability in demo mode
      setBackendAvailable(false)
      
      // In production, you would show a notification or log to monitoring
      // toast.info('Backend not available', {
      //   description: 'Make sure the backend server is running at http://localhost:8001'
      // })
    } finally {
      setIsLoading(false)
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onRefresh: handleRefresh,
    onSearch: () => {
      const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
      searchInput?.focus()
    },
    onEscape: () => {
      setSelectedMachine(null)
      clearSelection()
    }
  })

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const buildings = Array.from(new Set(machines.map(m => m.machine.building))).sort()
    const rooms = Array.from(new Set(
      machines
        .filter(m => basicFilters.building === 'all' || m.machine.building === basicFilters.building)
        .map(m => m.machine.room)
    )).sort()
    
    const tags = Array.from(new Set(machines.flatMap(m => m.machine.tags || []))).sort()
    // ✅ DATA-DRIVEN: Extract groups from backend data
    const groups = Array.from(new Set(machines.flatMap(m => m.machine.groups || []))).sort()
    const users = Array.from(new Set(
      machines
        .map(m => m.metrics.user_activity.current_username)
        .filter(Boolean)
    )).sort() as string[]

    return { buildings, rooms, tags, groups, users }
  }, [machines, basicFilters.building])

  // Quick Filter Presets
  const handleApplyPreset = (presetId: string) => {
    setActivePreset(activePreset === presetId ? null : presetId)
  }

  const handleClearPreset = () => {
    setActivePreset(null)
  }

  // Clear all filters
  const handleClearAllFilters = () => {
    setBasicFilters({
      building: 'all',
      room: 'all',
      status: 'all',
      healthStatus: 'all',
      cpuAge: 'all',
      tag: 'all',
      group: 'all',
      user: 'all',
      search: '',
      ipSearch: ''
    })
    setAdvancedFilters({
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
      // Recent Activity Filters
      lastHeartbeatWithinMin: 0,
      lastBootWithinHours: 0
    })
    setActivePreset(null)
  }

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0
    
    // Basic filters
    if (basicFilters.search) count++
    if (basicFilters.building !== 'all') count++
    if (basicFilters.room !== 'all') count++
    if (basicFilters.status !== 'all') count++
    if (basicFilters.healthStatus !== 'all') count++
    if (basicFilters.cpuAge !== 'all') count++
    if (basicFilters.tag !== 'all') count++
    if (basicFilters.group !== 'all') count++
    if (basicFilters.user !== 'all') count++
    if (basicFilters.ipSearch) count++
    
    // Advanced filters
    if (advancedFilters.cpuUsageMin > 0 || advancedFilters.cpuUsageMax < 100) count++
    if (advancedFilters.memoryUsageMin > 0 || advancedFilters.memoryUsageMax < 100) count++
    if (advancedFilters.diskUsageMin > 0 || advancedFilters.diskUsageMax < 100) count++
    if (advancedFilters.healthScoreMin > 0) count++
    if (advancedFilters.cpuCoresMin > 0) count++
    if (advancedFilters.ramGbMin > 0) count++
    if (advancedFilters.storageGbMin > 0) count++
    if (advancedFilters.cpuModel !== 'all') count++
    if (advancedFilters.osVersion !== 'all') count++
    if (advancedFilters.storageType !== 'all') count++
    if (advancedFilters.hardwareModel !== 'all') count++
    // Recent Activity Filters
    if (advancedFilters.lastHeartbeatWithinMin > 0) count++
    if (advancedFilters.lastBootWithinHours > 0) count++
    
    return count
  }, [basicFilters, advancedFilters])

  // Filter and sort machines
  const filteredMachines = useMemo(() => {
    let filtered = machines

    // Quick preset filters
    if (activePreset === 'high-cpu') {
      filtered = filtered.filter(m => m.metrics.resources.cpu_usage_percent > 80)
    } else if (activePreset === 'high-memory') {
      filtered = filtered.filter(m => m.metrics.resources.memory_usage_percent > 80)
    } else if (activePreset === 'high-disk') {
      filtered = filtered.filter(m => m.metrics.resources.disk_usage_percent > 80)
    } else if (activePreset === 'with-users') {
      filtered = filtered.filter(m => m.metrics.user_activity.current_username !== null)
    } else if (activePreset === 'idle') {
      filtered = filtered.filter(m => m.metrics.status.state === 'idle')
    } else if (activePreset === 'issues') {
      filtered = filtered.filter(m => m.health.status === 'warning' || m.health.status === 'critical')
    }

    // Search filter
    if (basicFilters.search) {
      const searchLower = basicFilters.search.toLowerCase()
      filtered = filtered.filter(m => 
        m.machine.hostname.toLowerCase().includes(searchLower) ||
        m.machine.machine_id.toLowerCase().includes(searchLower) ||
        m.machine.location.toLowerCase().includes(searchLower)
      )
    }

    // ✅ NEW: IP Address search filter
    if (basicFilters.ipSearch) {
      const ipSearchLower = basicFilters.ipSearch.toLowerCase()
      filtered = filtered.filter(m => 
        m.metrics.network?.ip_address?.toLowerCase().includes(ipSearchLower)
      )
    }

    // Building filter
    if (basicFilters.building !== 'all') {
      filtered = filtered.filter(m => m.machine.building === basicFilters.building)
    }

    // Room filter
    if (basicFilters.room !== 'all') {
      filtered = filtered.filter(m => m.machine.room === basicFilters.room)
    }

    // Status filter
    if (basicFilters.status !== 'all') {
      filtered = filtered.filter(m => m.metrics.status.state === basicFilters.status)
    }

    // Health Status filter
    if (basicFilters.healthStatus !== 'all') {
      filtered = filtered.filter(m => m.health.status === basicFilters.healthStatus)
    }

    // Tag filter
    if (basicFilters.tag !== 'all') {
      filtered = filtered.filter(m => m.machine.tags?.includes(basicFilters.tag))
    }

    // User filter
    if (basicFilters.user !== 'all') {
      filtered = filtered.filter(m => m.metrics.user_activity.current_username === basicFilters.user)
    }

    // Advanced filters - CPU usage
    filtered = filtered.filter(m =>
      m.metrics.resources.cpu_usage_percent >= advancedFilters.cpuUsageMin &&
      m.metrics.resources.cpu_usage_percent <= advancedFilters.cpuUsageMax
    )

    // Memory usage
    filtered = filtered.filter(m =>
      m.metrics.resources.memory_usage_percent >= advancedFilters.memoryUsageMin &&
      m.metrics.resources.memory_usage_percent <= advancedFilters.memoryUsageMax
    )

    // Disk usage
    filtered = filtered.filter(m =>
      m.metrics.resources.disk_usage_percent >= advancedFilters.diskUsageMin &&
      m.metrics.resources.disk_usage_percent <= advancedFilters.diskUsageMax
    )

    // Health score
    if (advancedFilters.healthScoreMin > 0) {
      filtered = filtered.filter(m => m.health.score >= advancedFilters.healthScoreMin)
    }

    // CPU cores
    if (advancedFilters.cpuCoresMin > 0) {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        return specs && specs.static_hardware.cpu.cores >= advancedFilters.cpuCoresMin
      })
    }

    // RAM
    if (advancedFilters.ramGbMin > 0) {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        return specs && specs.static_hardware.memory.total_gb >= advancedFilters.ramGbMin
      })
    }

    // CPU Model
    if (advancedFilters.cpuModel !== 'all') {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        return specs && specs.static_hardware.cpu.name === advancedFilters.cpuModel
      })
    }

    // OS Version
    if (advancedFilters.osVersion !== 'all') {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        return specs && specs.static_system.os.version === advancedFilters.osVersion
      })
    }

    // Storage Type
    if (advancedFilters.storageType !== 'all') {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        return specs && specs.static_hardware.storage.some(s => s.media_type === advancedFilters.storageType)
      })
    }

    // Hardware Model (check full "manufacturer model" string)
    if (advancedFilters.hardwareModel !== 'all') {
      filtered = filtered.filter(m => {
        const specs = specsMap.get(m.machine.machine_id)
        if (!specs) return false
        const manufacturer = specs.static_system.hardware.manufacturer
        const model = specs.static_system.hardware.model
        const fullModel = manufacturer && model ? `${manufacturer} ${model}` : null
        return fullModel === advancedFilters.hardwareModel
      })
    }

    // Recent Activity Filters
    const now = new Date()

    // Last Heartbeat Within (Minutes)
    if (advancedFilters.lastHeartbeatWithinMin > 0) {
      filtered = filtered.filter(m => {
        const lastHeartbeat = new Date(m.metrics.system.last_heartbeat)
        const minutesAgo = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60)
        return minutesAgo <= advancedFilters.lastHeartbeatWithinMin
      })
    }

    // Last Boot Within (Hours)
    if (advancedFilters.lastBootWithinHours > 0) {
      filtered = filtered.filter(m => {
        const bootTime = new Date(m.metrics.system.boot_time)
        const hoursAgo = (now.getTime() - bootTime.getTime()) / (1000 * 60 * 60)
        return hoursAgo <= advancedFilters.lastBootWithinHours
      })
    }

    return filtered
  }, [machines, specsMap, basicFilters, advancedFilters, activePreset])

  // Critical alerts count
  const criticalAlertsCount = useMemo(() => {
    return machines.filter(m => m.health.status === 'critical').length
  }, [machines])

  // CSV Export - Open export modal
  const handleExportCSV = () => {
    setShowExportModal(true)
  }

  // Handle drill-down from interactive analytics
  const handleAnalyticsDrillDown = (filter: { building?: string; status?: string; metric?: string }) => {
    if (filter.building) {
      setBasicFilters({ ...basicFilters, building: filter.building })
    }
    if (filter.status) {
      setBasicFilters({ ...basicFilters, status: filter.status })
    }
    if (filter.metric) {
      // Set filter based on metric
      if (filter.metric === 'cpu') {
        setAdvancedFilters({ ...advancedFilters, minCpu: 80 })
      } else if (filter.metric === 'memory') {
        setAdvancedFilters({ ...advancedFilters, minMemory: 80 })
      } else if (filter.metric === 'disk') {
        setAdvancedFilters({ ...advancedFilters, minDisk: 80 })
      }
    }
    // Switch to dashboard view to show filtered results
    setCurrentView('dashboard')
  }

  // Machine selection
  const handleSelectMachine = (machineId: string) => {
    toggleMachineSelection(machineId)
  }

  const handleSelectAll = () => {
    selectAllMachines(filteredMachines.map(m => m.machine.machine_id))
  }

  const handleClearSelection = () => {
    clearSelection()
  }

  // Individual bulk action handlers
  const handleExportSelected = () => {
    const toastId = toast.loading('Preparing export...')
    
    try {
      const selectedData = machines.filter(m => selectedMachines.has(m.machine.machine_id))
      
      const headers = ['Machine ID', 'Hostname', 'Status', 'Building', 'Room', 'CPU %', 'Memory %', 'Disk %', 'Active User']
      const rows = selectedData.map(m => [
        m.machine.machine_id,
        m.machine.hostname,
        m.metrics.status.state,
        m.machine.building,
        m.machine.room,
        m.metrics.resources.cpu_usage_percent,
        m.metrics.resources.memory_usage_percent,
        m.metrics.resources.disk_usage_percent,
        m.metrics.user_activity.current_username || 'None'
      ])

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selected-machines-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      
      toast.success('Export complete!', {
        id: toastId,
        description: `Successfully exported ${selectedMachines.size} selected machines to CSV`
      })
    } catch (error) {
      toast.error('Export failed', {
        id: toastId,
        description: 'Please try again or contact support'
      })
    }
  }

  const handleTagSelected = () => {
    setShowTagDialog(true)
  }

  const handleGroupSelected = () => {
    setShowGroupDialog(true)
  }

  const handleMaintenanceMode = () => {
    setShowMaintenanceDialog(true)
  }

  const handleConfirmMaintenance = (config: any) => {
    toast.success(`Maintenance mode ${config.enabled ? 'enabled' : 'disabled'}`, {
      description: `Applied to ${selectedMachines.size} machines`
    })
    setShowMaintenanceDialog(false)
    setSelectedMachines(new Set())
  }

  const handleConfirmTag = (tags: string[]) => {
    toast.success(`Tags ${tags.join(', ')} added to ${selectedMachines.size} machines`)
    setShowTagDialog(false)
    setSelectedMachines(new Set())
  }

  const handleConfirmGroup = (group: string) => {
    toast.success(`Machines added to group "${group}"`)
    setShowGroupDialog(false)
    setSelectedMachines(new Set())
  }

  // Bulk actions (old handler - deprecated)
  const handleBulkAction = (action: string) => {
    console.log(`Performing bulk action: ${action} on ${selectedMachines.size} machines`)
    toast.success(`${action} action queued for ${selectedMachines.size} machines`)
    // In a real app, this would call the backend API
    setSelectedMachines(new Set())
  }

  // Saved filters
  const handleSaveFilter = (name: string) => {
    const newFilter: SavedFilter = {
      id: `filter-${Date.now()}`,
      name,
      description: `${activeFiltersCount} active filters`,
      basicFilters,
      advancedFilters,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setSavedFilters([...savedFilters, newFilter])
    toast.success(`Filter "${name}" saved`)
  }

  const handleLoadFilter = (filter: SavedFilter) => {
    setBasicFilters(filter.basicFilters)
    setAdvancedFilters(filter.advancedFilters)
    toast.success(`Filter "${filter.name}" loaded`)
  }

  const handleDeleteFilter = (filterId: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== filterId))
    toast.success('Filter deleted')
  }

  // Pagination
  const pagination = usePagination(filteredMachines, 50)
  
  // Reset pagination when filters change
  useEffect(() => {
    pagination.reset()
  }, [filteredMachines.length])

  // ✅ Check if data is stale (>10 minutes old)
  const isDataStale = useMemo(() => {
    if (!lastUpdated || !backendAvailable) return false
    return differenceInMinutes(new Date(), lastUpdated) > 10
  }, [lastUpdated, backendAvailable])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Maintenance Mode Dialog */}
      <MaintenanceModeDialog 
        open={showMaintenanceDialog}
        onOpenChange={setShowMaintenanceDialog}
        machineIds={Array.from(selectedMachines)}
        onConfirm={handleConfirmMaintenance}
      />

      {/* Bulk Tag Dialog */}
      <BulkTagDialog
        open={showTagDialog}
        onOpenChange={setShowTagDialog}
        machineIds={Array.from(selectedMachines)}
        allTags={filterOptions.tags}
        onComplete={handleRefresh}
      />

      {/* Bulk Group Dialog */}
      <BulkGroupDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        machineIds={Array.from(selectedMachines)}
        allGroups={filterOptions.groups}
        onComplete={handleRefresh}
      />

      {/* Export Modal */}
      <ExportModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        buildings={filterOptions.buildings}
        totalMachines={machines.length}
      />

      {/* Machine Detail Full Screen - Overlay when a machine is selected */}
      {selectedMachine && (() => {
        const machine = machines.find(m => m.machine.machine_id === selectedMachine)
        
        if (!machine) return null
        
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <MachineDetailFullScreen
              machine={machine}
              specs={specsMap.get(machine.machine.machine_id)}
              hardware={hardwareMap.get(machine.machine.machine_id)}
              onBack={() => setSelectedMachine(null)}
              recentEvents={timelineEvents}
              allTags={filterOptions.tags}
              onTagsUpdated={async (machineId, tags) => {
                // Update the local machines array with new tags
                setMachines(prevMachines => 
                  prevMachines.map(m => 
                    m.machine.machine_id === machineId
                      ? { ...m, machine: { ...m.machine, tags } }
                      : m
                  )
                )
              }}
            />
          </div>
        )
      })()}

      {/* Main Dashboard - Keep mounted, hide when machine detail is showing */}
      <div className={selectedMachine ? 'hidden' : 'block'}>
        {/* Backend Offline Banner */}
        {!backendAvailable && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
            <div className="max-w-[1800px] mx-auto flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-amber-900">
                  <span className="font-medium">Backend Offline:</span> Unable to connect to the monitoring backend at <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">http://localhost:8001</code>. 
                  Please start the backend server to view real-time machine data.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                Retry Connection
              </Button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <NavigationBar
          currentView={currentView}
          onViewChange={setCurrentView}
          onRefresh={handleRefresh}
          onExportCSV={handleExportCSV}
          autoRefreshEnabled={autoRefreshEnabled}
          onToggleAutoRefresh={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
          lastUpdated={lastUpdated}
          criticalAlertsCount={criticalAlertsCount}
          isRefreshing={isLoading}
          backendAvailable={backendAvailable}
        />

        {/* Main Content */}
        <main className="max-w-[1800px] mx-auto px-6 py-4">
          {currentView === 'dashboard' && (
            <>
              {/* Overview Stats */}
              <OverviewStats 
                machines={machines}
                building={basicFilters.building} // ✅ Pass building filter for historical averages
                onFilterChange={(filter) => {
                  // Handle different filter types from OverviewStats cards
                  if (filter.type === 'health') {
                    // Filter by health status (healthy, warning, critical)
                    setBasicFilters(prev => ({
                      ...prev,
                      healthStatus: filter.value
                    }));
                    
                    if (filter.value === 'healthy') {
                      toast.success('Showing healthy machines');
                    } else if (filter.value === 'warning') {
                      toast.success('Showing machines with warnings');
                    } else if (filter.value === 'critical') {
                      toast.success('Showing critical machines');
                    }
                  } else if (filter.type === 'status') {
                    // Filter by machine status (online, idle, in-use, active users, etc.)
                    if (filter.value === 'in-use') {
                      setBasicFilters(prev => ({
                        ...prev,
                        status: 'in-use'
                      }));
                      toast.success('Showing machines with active users');
                    } else {
                      setBasicFilters(prev => ({
                        ...prev,
                        status: filter.value === 'all' ? 'all' : filter.value
                      }));
                    }
                  } else if (filter.type === 'resource') {
                    // Filter by resource usage (CPU, Memory, Disk - show high usage machines)
                    if (filter.value === 'cpu') {
                      setAdvancedFilters(prev => ({
                        ...prev,
                        cpuUsageMin: 50,
                        cpuUsageMax: 100
                      }));
                      toast.success('Showing machines with CPU usage ≥ 50%');
                    } else if (filter.value === 'memory') {
                      setAdvancedFilters(prev => ({
                        ...prev,
                        memoryUsageMin: 50,
                        memoryUsageMax: 100
                      }));
                      toast.success('Showing machines with memory usage ≥ 50%');
                    } else if (filter.value === 'disk') {
                      setAdvancedFilters(prev => ({
                        ...prev,
                        diskUsageMin: 50,
                        diskUsageMax: 100
                      }));
                      toast.success('Showing machines with disk usage ≥ 50%');
                    }
                  }
                  
                  // Scroll to machine list
                  setTimeout(() => {
                    document.getElementById('machine-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
              />

              {/* Filter Controls */}
              <div className="mt-4 space-y-2.5">
                {/* Stale Data Warning Banner */}
                {isDataStale && backendAvailable && machines.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-yellow-900">
                            Data may be stale
                          </p>
                          <p className="text-xs text-yellow-700">
                            Last updated over 10 minutes ago. Consider refreshing for the latest information.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="border-yellow-300 text-yellow-900 hover:bg-yellow-100 flex-shrink-0"
                      >
                        Refresh Now
                      </Button>
                    </div>
                  </div>
                )}

                {/* Basic Filters */}
                <FilterControlsImproved
                  filters={basicFilters}
                  onFiltersChange={setBasicFilters}
                  buildings={filterOptions.buildings}
                  rooms={filterOptions.rooms}
                  tags={filterOptions.tags}
                  groups={filterOptions.groups}
                  users={filterOptions.users}
                />

                {/* Advanced Filters */}
                <AdvancedFiltersImproved
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                  machineSpecs={specsMap}
                  machines={machines}
                  machineHardware={hardwareMap}
                />

                {/* Saved Filters */}
                <SavedFiltersManager
                  savedFilters={savedFilters}
                  onSaveFilter={handleSaveFilter}
                  onLoadFilter={handleLoadFilter}
                  onDeleteFilter={handleDeleteFilter}
                  activeFiltersCount={activeFiltersCount}
                />
              </div>

              {/* Filters and Grid */}
              <div className="mt-4 flex gap-4">
                {/* Filter Sidebar - Quick Presets */}
                <FilterSidebar
                  machines={machines}
                  activePreset={activePreset}
                  onApplyPreset={handleApplyPreset}
                  onClearAllFilters={handleClearAllFilters}
                  activeFiltersCount={activeFiltersCount}
                />

                {/* Machine Grid */}
                <div className="flex-1 min-w-0" id="machine-list">
                  {/* Results Counter Banner */}
                  {!isLoading && (
                    <div className="mb-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {/* Main Count */}
                          <div className="flex items-center gap-3 mb-2">
                            <Server className="h-5 w-5 text-indigo-600" />
                            <span className="text-lg font-semibold text-gray-900">
                              Showing {filteredMachines.length} of {machines.length} machines
                            </span>
                            {filteredMachines.length !== machines.length && (
                              <span className="text-sm text-gray-600">
                                ({((filteredMachines.length / machines.length) * 100).toFixed(0)}% of total)
                              </span>
                            )}
                          </div>
                          
                          {/* Visual Health Breakdown */}
                          {filteredMachines.length > 0 && (() => {
                            const healthyCount = filteredMachines.filter(m => m.health?.status === 'healthy').length
                            const warningCount = filteredMachines.filter(m => m.health?.status === 'warning').length
                            const criticalCount = filteredMachines.filter(m => m.health?.status === 'critical').length
                            const healthyPct = (healthyCount / filteredMachines.length) * 100
                            const warningPct = (warningCount / filteredMachines.length) * 100
                            const criticalPct = (criticalCount / filteredMachines.length) * 100
                            
                            return (
                              <div className="space-y-2">
                                {/* Visual Progress Bar */}
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                                  {healthyCount > 0 && (
                                    <div 
                                      className="bg-green-500 transition-all duration-500" 
                                      style={{ width: `${healthyPct}%` }}
                                      title={`${healthyCount} healthy (${healthyPct.toFixed(1)}%)`}
                                    />
                                  )}
                                  {warningCount > 0 && (
                                    <div 
                                      className="bg-yellow-500 transition-all duration-500" 
                                      style={{ width: `${warningPct}%` }}
                                      title={`${warningCount} warning (${warningPct.toFixed(1)}%)`}
                                    />
                                  )}
                                  {criticalCount > 0 && (
                                    <div 
                                      className="bg-red-500 transition-all duration-500" 
                                      style={{ width: `${criticalPct}%` }}
                                      title={`${criticalCount} critical (${criticalPct.toFixed(1)}%)`}
                                    />
                                  )}
                                </div>
                                
                                {/* Health Status Labels */}
                                <div className="flex items-center gap-4 text-xs">
                                  {healthyCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-green-700">
                                      <span className="h-2 w-2 rounded-full bg-green-500" />
                                      {healthyCount} Healthy ({healthyPct.toFixed(0)}%)
                                    </span>
                                  )}
                                  {warningCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-yellow-700">
                                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                                      {warningCount} Warning ({warningPct.toFixed(0)}%)
                                    </span>
                                  )}
                                  {criticalCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-red-700">
                                      <span className="h-2 w-2 rounded-full bg-red-500" />
                                      {criticalCount} Critical ({criticalPct.toFixed(0)}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                        {activeFiltersCount > 0 && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-indigo-600 text-white hover:bg-indigo-700">
                              {activeFiltersCount} {activeFiltersCount === 1 ? 'filter' : 'filters'} active
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearAllFilters}
                              className="text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100"
                            >
                              Clear All
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bulk Actions Toolbar */}
                  {selectedMachines.size > 0 && (
                    <BulkActionsToolbar
                      selectedCount={selectedMachines.size}
                      visibleCount={filteredMachines.filter(m => selectedMachines.has(m.machine.machine_id)).length}
                      onClearSelection={handleClearSelection}
                      onExportSelected={handleExportSelected}
                      onTagSelected={handleTagSelected}
                      onGroupSelected={handleGroupSelected}
                      onMaintenanceMode={handleMaintenanceMode}
                    />
                  )}

                  {/* Machine Cards Grid */}
                  {isLoading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <MachineCardSkeleton key={i} />
                      ))}
                    </div>
                  ) : pagination.paginatedData.length === 0 ? (
                    // ✅ Contextual empty state based on active filters
                    basicFilters.ipSearch ? (
                      <EmptyState
                        icon={Network}
                        title={`No machines found with IP "${basicFilters.ipSearch}"`}
                        description={`No machines match this IP address. Try searching for a subnet (e.g., "192.168.1") or verify the IP address is correct.`}
                        actionLabel="Clear IP Filter"
                        onAction={() => setBasicFilters(prev => ({ ...prev, ipSearch: '' }))}
                        secondaryActionLabel="Clear All Filters"
                        onSecondaryAction={handleClearAllFilters}
                      />
                    ) : (
                      <EmptyState
                        title="No machines found"
                        description="Try adjusting your filters or search query"
                        actionLabel="Clear All Filters"
                        onAction={handleClearAllFilters}
                      />
                    )
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {pagination.paginatedData.map(machine => (
                        <MachineCard
                          key={machine.machine.machine_id}
                          machine={machine}
                          selected={selectedMachines.has(machine.machine.machine_id)}
                          onSelect={() => handleSelectMachine(machine.machine.machine_id)}
                          onClick={() => setSelectedMachine(machine.machine.machine_id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <Pagination
                      currentPage={pagination.currentPage}
                      totalPages={pagination.totalPages}
                      onPageChange={pagination.handlePageChange}
                      startIndex={pagination.startIndex}
                      endIndex={pagination.endIndex}
                      totalItems={pagination.totalItems}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {currentView === 'analytics' && (
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-sm font-medium text-gray-700">Loading analytics...</p>
                </div>
              </div>
            }>
              <SystemAnalytics
                machines={machines}
                specsMap={specsMap}
                hardwareMap={hardwareMap}
              />
            </Suspense>
          )}

          {currentView === 'timeline' && (
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-sm font-medium text-gray-700">Loading timeline...</p>
                  <p className="text-xs text-gray-500">Fetching system events</p>
                </div>
              </div>
            }>
              <TimelineView events={timelineEvents} />
            </Suspense>
          )}

          {currentView === 'settings' && (
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-sm font-medium text-gray-700">Loading settings...</p>
                </div>
              </div>
            }>
              <SettingsPanel />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  )
}

function App() {
  console.log('🚀 App component rendering - about to wrap with providers')
  return (
    <ErrorBoundary>
      <MachineProvider>
        <FilterProvider>
          <UIProvider>
            <AppContent />
          </UIProvider>
        </FilterProvider>
      </MachineProvider>
    </ErrorBoundary>
  )
}

export default App