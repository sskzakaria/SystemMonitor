import { useState, useEffect, useCallback } from 'react'
import { getMachineApplications, getMachineSoftware, getMachineSecurity, getMachineEvents, getMachinePeripherals } from '../services/api'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Monitor, X, RefreshCw, MapPin, AlertTriangle, Activity, Power, Clock } from 'lucide-react'
import { generateHardwareComparison, FleetAverages, analyzeCPUAge } from '../lib/hardware-comparison'
import { useEscapeKey, useScrollLock, useFocusTrap } from '../hooks/accessibility-hooks'
import { getStatusColor } from '../lib/utils'
import { formatTimeWithTimezone } from '../lib/timezone-utils'
import { OverviewTab } from './OverviewTab'
import { PerformanceTab } from './PerformanceTab'
import { HardwareTab } from './HardwareTab'
import { ProcessManagementTab } from './ProcessManagementTab'
import { SecurityTab } from './SecurityTab'
import { LogsTab } from './LogsTab'
import { DevicesTab } from './DevicesTab'
import { DiagnosticsTab } from './DiagnosticsTab'
import { SoftwareInventoryTab } from './SoftwareInventoryTab'
import type { MonitorData, HeartbeatMetrics, SpecsMetrics, HardwareMetrics } from '../types/monitor-schema'

interface ComputerDetailProps {
  machine: MonitorData<HeartbeatMetrics>
  specs: SpecsMetrics | undefined
  hardware: HardwareMetrics | undefined
  onClose: () => void
}

export function ComputerDetail({ machine, specs, hardware, onClose }: ComputerDetailProps) {
  const { machine: info, metrics, health } = machine
  const { status, resources, user_activity, system } = metrics

  // State for API-fetched data
  const [processes, setProcesses] = useState<any[]>([])
  const [processesExtended, setProcessesExtended] = useState<any[]>([])
  const [software, setSoftware] = useState<any[]>([])
  const [securityData, setSecurityData] = useState<any>(null)
  const [securityEvents, setSecurityEvents] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch real data from backend
  const fetchMachineData = useCallback(async (showToast = false) => {
    setIsLoadingData(true)
    try {
      // Fetch all data in parallel for better performance
      const [appsResponse, softwareResponse, securityResponse, eventsResponse, peripheralsResponse] = await Promise.allSettled([
        getMachineApplications(info.machine_id),
        getMachineSoftware(info.machine_id),
        getMachineSecurity(info.machine_id),
        getMachineEvents(info.machine_id, { hours: 24 }),
        getMachinePeripherals(info.machine_id)
      ])

      // Handle processes/applications
      if (appsResponse.status === 'fulfilled') {
        setProcesses(appsResponse.value.processes || [])
        setProcessesExtended(appsResponse.value.processes || [])
      }

      // Handle software inventory - ✅ DATABASE-DRIVEN
      if (softwareResponse.status === 'fulfilled') {
        setSoftware(softwareResponse.value?.installed_software || softwareResponse.value?.software || [])
      } else {
        setSoftware([]) // Empty state - shows "No software data available" message
      }

      // Handle security
      if (securityResponse.status === 'fulfilled') {
        setSecurityData(securityResponse.value)
      }

      // Handle events/logs - ✅ DATABASE-DRIVEN
      if (eventsResponse.status === 'fulfilled') {
        setLogs(eventsResponse.value.events || [])
        setSecurityEvents(eventsResponse.value.events?.filter((e: any) => e.level === 'security') || [])
      } else {
        setLogs([]) // Empty state - shows "No logs available" message
        setSecurityEvents([])
      }

      // Handle peripherals/devices - ✅ DATABASE-DRIVEN
      if (peripheralsResponse.status === 'fulfilled') {
        setDevices(peripheralsResponse.value.devices || [])
      } else {
        setDevices([]) // Empty state - shows "No devices detected" message
      }

      setLastRefresh(new Date())
      if (showToast) {
        toast.success('Data refreshed successfully')
      }
    } catch (error) {
      console.error('Failed to fetch machine detail data:', error)
      if (showToast) {
        toast.info('Backend not available', {
          description: 'Some data may not be available. Start the backend server to see all details.'
        })
      }
      // Graceful degradation - leave arrays empty
    } finally {
      setIsLoadingData(false)
    }
  }, [info.machine_id])

  useEffect(() => {
    fetchMachineData(false)
  }, [fetchMachineData])

  const handleRefresh = () => {
    fetchMachineData(true)
  }

  // These would normally come from the backend or additional machine data
  const [tags] = useState<string[]>([])
  const [groups] = useState<string[]>([])
  const [notes] = useState<string>('')

  // Generate hardware comparison
  const fleetAverages: FleetAverages = {
    cpu_age: 4.5,
    ram_gb: 16,
    storage_gb: 512
  }

  // Extract hardware specs for display
  const cpuModel = metrics.resources.cpu_model || specs?.static_hardware?.cpu?.name || 'Unknown'
  const cpuCores = specs?.static_hardware?.cpu?.physical_cores || null
  const cpuThreads = specs?.static_hardware?.cpu?.logical_cores || null
  const cpuAge = specs?.static_hardware?.cpu?.release_year 
    ? new Date().getFullYear() - specs.static_hardware.cpu.release_year 
    : null
  const ramGB = hardware?.memory_total_gb || specs?.static_hardware?.memory?.total_gb || null
  const ramType = specs?.static_hardware?.memory?.type || null
  const ramSpeed = specs?.static_hardware?.memory?.speed_mhz || null
  const storageGB = hardware?.disk_total_gb || specs?.static_hardware?.storage?.[0]?.size_gb || null
  const storageType = specs?.static_hardware?.storage?.[0]?.media_type || null
  const storageInterface = specs?.static_hardware?.storage?.[0]?.interface || null

  const hardwareComparison = generateHardwareComparison(
    info.machine_id,
    cpuModel,
    cpuAge,
    ramGB,
    ramType,
    ramSpeed,
    storageGB,
    storageType,
    storageInterface,
    fleetAverages
  )

  useEscapeKey(onClose)
  useScrollLock(true)
  const containerRef = useFocusTrap(true)

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-backdrop-fade-in"
      onClick={onClose}
    >
      <Card 
        className="w-full max-w-7xl h-[90vh] flex flex-col animate-modal-enter shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Header with Gradient */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 flex-shrink-0 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-white" />
              </div>
              {info.hostname}
            </CardTitle>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              {info.location}
              <span className="text-xs ml-2">
                • Last updated: {formatTimeWithTimezone(lastRefresh)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoadingData}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Badge className={`${getStatusColor(status.state)} border-none shadow-sm`}>
              {status.state}
            </Badge>
            <Badge variant="outline" className={`
              shadow-sm
              ${health.performance_grade === 'A' ? 'border-green-500 text-green-700 bg-green-50' :
                health.performance_grade === 'B' ? 'border-blue-500 text-blue-700 bg-blue-50' :
                health.performance_grade === 'C' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' :
                health.performance_grade === 'D' ? 'border-orange-500 text-orange-700 bg-orange-50' :
                'border-red-500 text-red-700 bg-red-50'}
            `}>
              Grade {health.performance_grade}
            </Badge>
            <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/50">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        {/* Critical Alert Banner - Modern Design */}
        {health.status === 'critical' && health.issues.length > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200 p-4 flex-shrink-0">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-red-900 mb-1.5 text-lg">Critical Issues Detected</h4>
                <ul className="text-sm text-red-800 space-y-1">
                  {health.issues.map((issue, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-600" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Warning Alert Banner - Modern Design */}
        {health.status === 'warning' && health.issues.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-100 border-b border-yellow-200 p-4 flex-shrink-0">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 mb-2 text-lg">System Warnings</h4>
                <div className="flex flex-wrap gap-2">
                  {health.issues.map((issue, idx) => (
                    <Badge key={idx} className="border-yellow-500 text-yellow-800 bg-yellow-50 shadow-sm">
                      {issue}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <Tabs defaultValue="overview" className="p-6">
            <TabsList className="grid grid-cols-5 lg:grid-cols-10 w-full mb-6 h-auto gap-1 bg-gray-100/50 p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow">Overview</TabsTrigger>
              <TabsTrigger value="performance" className="data-[state=active]:bg-white data-[state=active]:shadow">Performance</TabsTrigger>
              <TabsTrigger value="hardware" className="data-[state=active]:bg-white data-[state=active]:shadow">Hardware</TabsTrigger>
              <TabsTrigger value="processes" className="data-[state=active]:bg-white data-[state=active]:shadow">Processes</TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-white data-[state=active]:shadow">Security</TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-white data-[state=active]:shadow">Logs</TabsTrigger>
              <TabsTrigger value="devices" className="data-[state=active]:bg-white data-[state=active]:shadow">Devices</TabsTrigger>
              <TabsTrigger value="software_inventory" className="data-[state=active]:bg-white data-[state=active]:shadow">Software</TabsTrigger>
              <TabsTrigger value="diagnostics" className="data-[state=active]:bg-white data-[state=active]:shadow">Diagnostics</TabsTrigger>
              <TabsTrigger value="manage" className="data-[state=active]:bg-white data-[state=active]:shadow">Manage</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <OverviewTab
                machineId={info.machine_id}
                metrics={metrics}
                health={health}
              />
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance">
              <PerformanceTab
                metrics={metrics}
                machineId={info.machine_id}
              />
            </TabsContent>

            {/* Hardware Tab */}
            <TabsContent value="hardware">
              <HardwareTab
                specs={specs}
                hardware={hardware}
                comparison={hardwareComparison}
              />
            </TabsContent>

            {/* Processes Tab - Combined with Process Management */}
            <TabsContent value="processes">
              <ProcessManagementTab
                machineId={info.machine_id}
                processes={processesExtended}
              />
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security">
              <SecurityTab
                machineId={info.machine_id}
                hostname={info.hostname}
                metrics={metrics}
              />
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs">
              <LogsTab
                machineId={info.machine_id}
                hostname={info.hostname}
              />
            </TabsContent>

            {/* Devices Tab */}
            <TabsContent value="devices">
              <DevicesTab
                machineId={info.machine_id}
              />
            </TabsContent>

            {/* Manage Tab - Tags, Groups, and Notes */}
            <TabsContent value="manage" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Machine Management</CardTitle>
                  <p className="text-sm text-muted-foreground">Manage tags, groups, and notes in the Settings panel</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Current Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {tags.length > 0 ? (
                          tags.map((tag, idx) => (
                            <Badge key={idx} variant="secondary">{tag}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No tags assigned</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Current Groups</h3>
                      <div className="flex flex-wrap gap-2">
                        {groups.length > 0 ? (
                          groups.map((group, idx) => (
                            <Badge key={idx} variant="outline">{group}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No groups assigned</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Notes</h3>
                      <div className="rounded-md border p-3 bg-gray-50 text-sm text-muted-foreground min-h-[100px]">
                        {notes || "No notes available"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Reboot Machine
                    </Button>
                    <Button variant="outline" className="gap-2">
                      <Power className="h-4 w-4" />
                      Shutdown
                    </Button>
                    <Button variant="outline" className="gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Report Issue
                    </Button>
                    <Button variant="outline" className="gap-2">
                      <Clock className="h-4 w-4" />
                      Schedule Maintenance
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Diagnostics Tab */}
            <TabsContent value="diagnostics">
              <DiagnosticsTab
                machineId={info.machine_id}
                metrics={metrics}
                health={health}
              />
            </TabsContent>

            {/* Process Management Tab */}
            <TabsContent value="process_management">
              <ProcessManagementTab
                machineId={info.machine_id}
                processes={processesExtended}
              />
            </TabsContent>

            {/* Software Inventory Tab */}
            <TabsContent value="software_inventory">
              <SoftwareInventoryTab
                machineId={info.machine_id}
                software={software}
              />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </Card>
    </div>
  )
}