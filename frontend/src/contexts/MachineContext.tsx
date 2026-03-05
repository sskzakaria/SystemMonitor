/**
 * Machine Context
 * Manages machine data, specs, hardware, and related state
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { 
  MonitorData, 
  HeartbeatMetrics, 
  SpecsMetrics, 
  HardwareMetrics,
  TimelineEvent
} from '../types/monitor-schema'

export interface MachineContextState {
  // Machine data
  machines: MonitorData<HeartbeatMetrics>[]
  specsMap: Map<string, SpecsMetrics>
  hardwareMap: Map<string, HardwareMetrics>
  timelineEvents: TimelineEvent[]
  previousMachines: MonitorData<HeartbeatMetrics>[] | null
  
  // Loading states
  isLoading: boolean
  lastUpdated: Date
  backendAvailable: boolean
  
  // Actions
  setMachines: (machines: MonitorData<HeartbeatMetrics>[]) => void
  setSpecsMap: (specs: Map<string, SpecsMetrics>) => void
  setHardwareMap: (hardware: Map<string, HardwareMetrics>) => void
  setTimelineEvents: (events: TimelineEvent[]) => void
  setPreviousMachines: (machines: MonitorData<HeartbeatMetrics>[] | null) => void
  setIsLoading: (loading: boolean) => void
  setLastUpdated: (date: Date) => void
  setBackendAvailable: (available: boolean) => void
  
  // Computed values
  getMachineSpecs: (machineId: string) => SpecsMetrics | undefined
  getMachineHardware: (machineId: string) => HardwareMetrics | undefined
}

const MachineContext = createContext<MachineContextState | undefined>(undefined)

export function MachineProvider({ children }: { children: ReactNode }) {
  console.log('🔧 MachineProvider mounting')
  
  const [machines, setMachines] = useState<MonitorData<HeartbeatMetrics>[]>([])
  const [specsMap, setSpecsMap] = useState<Map<string, SpecsMetrics>>(new Map())
  const [hardwareMap, setHardwareMap] = useState<Map<string, HardwareMetrics>>(new Map())
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [previousMachines, setPreviousMachines] = useState<MonitorData<HeartbeatMetrics>[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [backendAvailable, setBackendAvailable] = useState(true)

  const getMachineSpecs = useCallback((machineId: string) => {
    return specsMap.get(machineId)
  }, [specsMap])

  const getMachineHardware = useCallback((machineId: string) => {
    return hardwareMap.get(machineId)
  }, [hardwareMap])

  const value: MachineContextState = {
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
    getMachineSpecs,
    getMachineHardware,
  }

  return (
    <MachineContext.Provider value={value}>
      {children}
    </MachineContext.Provider>
  )
}

export function useMachineContext() {
  const context = useContext(MachineContext)
  if (context === undefined) {
    throw new Error('useMachineContext must be used within a MachineProvider')
  }
  return context
}