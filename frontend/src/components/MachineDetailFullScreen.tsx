import { useMachineHistory } from '../hooks/useMachineHistory'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { formatTimeWithTimezone } from '../lib/timezone-utils'
import { 
  ArrowLeft, Monitor, MapPin, Activity, Cpu, MemoryStick, HardDrive, 
  Thermometer, Network, WifiOff, Bell, Info, Clock, Users, Wrench, 
  FileText, Tag, Download, Copy, ListTree, CheckCircle2, AlertOctagon, X 
} from 'lucide-react'
import { TimelineEvent } from '../types/timeline'
import { MaintenanceScheduleDialog, MaintenanceSchedule } from './MaintenanceScheduleDialog'
import { AddNoteDialog, MachineNote } from './AddNoteDialog'
import { TagManagementDialog } from './TagManagementDialog'
import { AlertDetailsDialog } from './AlertDetailsDialog'
import { ComputerDetail } from './ComputerDetail'
import { HardwareComparisonCard } from './HardwareComparisonCard'
import { HistoricalChart } from './HistoricalChart'
import { DiskPartitionsDisplay } from './DiskPartitionsDisplay'
import { useMaintenanceManagement } from '../hooks/useMaintenanceManagement'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import type { MonitorData, HeartbeatMetrics, SpecsMetrics, HardwareMetrics } from '../types/api'
import { extractDiskPartitions } from '../lib/backend-adapter'
import { getDiskSummary } from '../lib/disk-utils'
import { generateHardwareComparison, analyzeCPUAge } from '../lib/hardware-comparison'

interface MachineDetailFullScreenProps {
  machine: MonitorData<HeartbeatMetrics>
  specs?: SpecsMetrics
  hardware?: HardwareMetrics
  onBack: () => void
  recentEvents: TimelineEvent[]
  allTags?: string[]
  onTagsUpdated?: (machineId: string, tags: string[]) => void
}

export function MachineDetailFullScreen({ machine, specs, hardware, onBack, recentEvents, allTags, onTagsUpdated }: MachineDetailFullScreenProps) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [showAlertDialog, setShowAlertDialog] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [notes, setNotes] = useState<Array<MachineNote & { id: string; timestamp: Date; author: string }>>([])
  
  // Maintenance management hook
  const { scheduleMaintenanceWindow, isLoading: isSchedulingMaintenance } = useMaintenanceManagement()

  const { machine: info, metrics, health, timestamp } = machine

  // ✅ Fetch real 24-hour historical data
  const { chartData: historicalChartData, loading: loadingHistory } = useMachineHistory(info.machine_id, 24)

  // Generate hardware comparison
  const hardwareComparison = useMemo(() => {
    // ✅ Get specs data - backend sends it flat, not nested under static_hardware
    const cpu_data = specs?.cpu || (specs as any)?.system
    const memory_data = specs?.memory
    const storage_data = specs?.storage
    
    // ✅ CPU Model - try multiple sources
    const cpuModel = (specs as any)?.cpu_model || 
                     cpu_data?.model_name || 
                     cpu_data?.processor ||
                     metrics.resources.cpu_model || 
                     null
    
    // ✅ CPU Age - use analyzeCPUAge to detect from model name
    const cpuAgeInfo = cpuModel ? analyzeCPUAge(cpuModel) : null
    const cpuAgeYears = cpuAgeInfo?.age || null
    
    // ✅ RAM - backend sends it flat
    const ramGB = (specs as any)?.memory_total_gb || 
                  memory_data?.total_gb || 
                  hardware?.memory_total_gb || 
                  null
                  
    const ramType = (specs as any)?.memory_type ||  // ✅ Your backend has this!
                    memory_data?.memory_type || 
                    null
                    
    // ✅ Extract RAM speed from memory_details or manufacturer string
    let ramSpeed = memory_data?.memory_details?.[0]?.speed_mhz || 
                   (specs as any)?.memory?.memory_details?.[0]?.speed_mhz ||
                   null
    
    // If no speed_mhz field, try to extract from manufacturer string (e.g., "UD5-6000 6000")
    if (!ramSpeed && memory_data?.memory_details?.[0]?.manufacturer) {
      const manufacturer = memory_data.memory_details[0].manufacturer
      const speedMatch = manufacturer.match(/(\d{4,5})\s*(?:MHz)?$/i) // Match 4-5 digits at the end
      if (speedMatch) {
        ramSpeed = parseInt(speedMatch[1], 10)
      }
    }
    
    // ✅ Also try extracting from the specs directly if available
    if (!ramSpeed && (specs as any)?.memory?.memory_details) {
      const firstModule = (specs as any).memory.memory_details[0]
      if (firstModule?.manufacturer) {
        const speedMatch = firstModule.manufacturer.match(/(\d{4,5})\s*(?:MHz)?$/i)
        if (speedMatch) {
          ramSpeed = parseInt(speedMatch[1], 10)
        }
      }
    }
    
    // ✅ Storage
    const storageGB = (specs as any)?.disk_total_gb || 
                      storage_data?.total_storage_gb || 
                      hardware?.disk_total_gb || 
                      null
                      
    // ✅ IMPROVED: Better storage type detection
    let storageType = 'Unknown'
    let storageInterface = 'Unknown'
    
    // Try to detect from disk information
    const disks = storage_data?.disks || (specs as any)?.storage?.disks || (specs as any)?.partitions || []
    
    if (disks && disks.length > 0) {
      const primaryDisk = disks[0]
      
      // Check filesystem and disk properties to guess type
      const fstype = primaryDisk.fstype || primaryDisk.filesystem || ''
      const device = primaryDisk.device || ''
      const opts = primaryDisk.opts || ''
      
      // Heuristics for storage type detection:
      // 1. NVMe drives usually have "NVMe" in device name or are very fast
      // 2. SSDs usually have faster access and are "fixed" drives with NTFS
      // 3. HDDs are typically slower, might have "removable" or lower capacity per partition
      
      if (device.toLowerCase().includes('nvme') || fstype.includes('nvme')) {
        storageType = 'NVMe'
        storageInterface = 'PCIe'
      } else if (opts && opts.includes('removable')) {
        // Removable drives - likely USB/external
        storageType = 'External'
        storageInterface = 'USB'
      } else if (fstype === 'NTFS' && opts && opts.includes('fixed')) {
        // Fixed NTFS drives - could be SSD or HDD
        // If total storage is > 2TB, more likely to be HDD
        // If total storage is < 512GB, more likely to be SSD
        const totalGB = (specs as any)?.disk_total_gb || storage_data?.total_storage_gb || 0
        if (totalGB > 2000) {
          storageType = 'HDD'  // Large capacity = likely HDD
          storageInterface = 'SATA'
        } else if (totalGB < 512) {
          storageType = 'SSD'  // Smaller capacity = likely SSD
          storageInterface = 'SATA'
        } else {
          // Medium size - assume SSD (more common now)
          storageType = 'SSD'
          storageInterface = 'SATA'
        }
      } else {
        // Default assumption for modern systems
        storageType = 'SSD'
        storageInterface = 'SATA'
      }
    }

    return generateHardwareComparison(
      info.machine_id,
      cpuModel,
      cpuAgeYears,
      ramGB,
      ramType,
      ramSpeed,
      storageGB,
      storageType,
      storageInterface,
      // Default fleet averages (TODO: fetch real fleet data from backend)
      {
        cpu_age: 4,      // Average CPU age of 4 years
        ram_gb: 16,      // Average RAM of 16GB
        storage_gb: 512  // Average storage of 512GB
      }
    )
  }, [specs, hardware, metrics.resources.cpu_model, info.machine_id])

  // ✅ Extract disk partitions from hardware/specs
  const diskPartitions = useMemo(() => {
    // Try to extract from hardware data first, then specs
    const partitions = extractDiskPartitions(hardware || specs || {})
    return partitions
  }, [hardware, specs])

  // Helper to format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  // ✅ Use real historical data or fallback to current value
  const chartData = useMemo(() => {
    // If we have historical data, use it
    if (historicalChartData && historicalChartData.length > 0) {
      return historicalChartData
    }
    
    // Fallback: show single current data point if machine is online
    if (metrics.status.state === 'offline') {
      return [] // No data for offline machines
    }
    
    const now = Date.now()
    return [{
      time: formatTimeWithTimezone(now),
      cpu: metrics.resources.cpu_usage_percent || 0,
      memory: metrics.resources.memory_usage_percent || 0,
      disk: metrics.resources.disk_usage_percent || 0,
    }]
  }, [historicalChartData, metrics.status.state, metrics.resources])

  // ✅ Get the most recent values from historical data (graph is source of truth)
  const currentMetrics = useMemo(() => {
    if (chartData && chartData.length > 0) {
      const latest = chartData[chartData.length - 1]
      return {
        cpu: latest.cpu_usage || latest.cpu || metrics.resources.cpu_usage_percent || 0,
        memory: latest.memory_usage || latest.memory || metrics.resources.memory_usage_percent || 0,
        disk: latest.disk_usage || latest.disk || metrics.resources.disk_usage_percent || 0,
      }
    }
    // Fallback to real-time metrics if no historical data
    return {
      cpu: metrics.resources.cpu_usage_percent || 0,
      memory: metrics.resources.memory_usage_percent || 0,
      disk: metrics.resources.disk_usage_percent || 0,
    }
  }, [chartData, metrics.resources])

  // Generate recommendations based on health issues
  const recommendations = useMemo(() => {
    const recs: Array<{ severity: 'high' | 'medium' | 'low'; message: string }> = []

    if (currentMetrics.cpu > 85) {
      recs.push({ severity: 'high', message: 'High CPU usage detected. Check running processes.' })
    } else if (currentMetrics.cpu > 70) {
      recs.push({ severity: 'medium', message: 'CPU usage elevated. Monitor for performance issues.' })
    }

    if (currentMetrics.memory > 90) {
      recs.push({ severity: 'high', message: 'Critical memory usage. Close unnecessary applications.' })
    } else if (currentMetrics.memory > 80) {
      recs.push({ severity: 'medium', message: 'High memory usage. Consider RAM upgrade if persistent.' })
    }

    if (currentMetrics.disk > 90) {
      recs.push({ severity: 'high', message: 'Disk space critically low. Clean up files immediately.' })
    } else if (currentMetrics.disk > 80) {
      recs.push({ severity: 'medium', message: 'Disk space running low. Schedule cleanup.' })
    }

    if (metrics.resources.cpu_temperature_c && metrics.resources.cpu_temperature_c > 80) {
      recs.push({ severity: 'high', message: `CPU temperature high (${metrics.resources.cpu_temperature_c}°C). Check cooling system.` })
    }

    if (metrics.status.state === 'offline') {
      recs.push({ severity: 'high', message: 'Machine is offline. Check power and network connection.' })
    }

    if (health.status === 'critical') {
      recs.push({ severity: 'high', message: 'Critical health status. Immediate attention required.' })
    } else if (health.status === 'warning') {
      recs.push({ severity: 'medium', message: 'Health warnings detected. Review issues below.' })
    }

    if (recs.length === 0) {
      recs.push({ severity: 'low', message: 'All systems operating normally. No action required.' })
    }

    return recs
  }, [currentMetrics, metrics, health])

  // Critical issues detection
  const criticalIssues: string[] = []
  if (currentMetrics.disk > 95) {
    criticalIssues.push(`Disk usage critical: ${currentMetrics.disk.toFixed(0)}%`)
  }
  if (currentMetrics.memory > 95) {
    criticalIssues.push(`Memory usage critical: ${currentMetrics.memory.toFixed(0)}%`)
  }
  if (currentMetrics.cpu > 95) {
    criticalIssues.push(`CPU usage critical: ${currentMetrics.cpu.toFixed(0)}%`)
  }
  if (metrics.resources.cpu_temperature_c && metrics.resources.cpu_temperature_c > 85) {
    criticalIssues.push(`CPU temperature critical: ${metrics.resources.cpu_temperature_c}°C`)
  }

  // Filter recent events for this machine
  const machineEvents = useMemo(() => {
    return recentEvents
      .filter(event => event.machineId === info.machine_id)
      .slice(0, 5)
  }, [recentEvents, info.machine_id])

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(info.machine_id)
    toast.success('Machine ID copied to clipboard')
  }

  const handleExportReport = () => {
    toast.info('Exporting machine report...', {
      description: 'This will connect to backend export endpoint'
    })
  }

  const getStatusColor = (status: string) => {
    const colors = {
      online: 'bg-green-100 text-green-800',
      idle: 'bg-blue-100 text-blue-800',
      'in-use': 'bg-purple-100 text-purple-800',
      offline: 'bg-red-100 text-red-800',
      error: 'bg-red-100 text-red-800',
      maintenance: 'bg-yellow-100 text-yellow-800'
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getHealthColor = (status: string) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      critical: 'bg-red-100 text-red-800'
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getProgressColor = (value: number) => {
    if (value > 90) return 'bg-red-500'
    if (value > 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getTemperatureColor = (temp: number | null) => {
    if (!temp) return 'text-gray-500'
    if (temp > 80) return 'text-red-600'
    if (temp > 70) return 'text-yellow-600'
    return 'text-green-600'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={onBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
              
              <div className="h-8 w-px bg-gray-200" />
              
              <div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-gray-500" />
                  <h1 className="text-xl font-semibold text-gray-900">
                    {info.hostname}
                  </h1>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <MapPin className="w-3 h-3" />
                  <span>{info.machine_id}</span>
                  <span>•</span>
                  <span>
                    {info.building && info.building !== 'Unknown' ? info.building : 'N/A'} - Room {info.room && info.room !== 'Unknown' ? info.room : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isMaintenanceMode && (
                <Badge className="bg-orange-100 text-orange-800">
                  Maintenance Mode
                </Badge>
              )}
              <Badge className={getStatusColor(metrics.status.state)}>
                {typeof metrics.status === 'object' ? metrics.status.state : metrics.status}
              </Badge>
              <Badge className={getHealthColor(health.status)}>
                Health: {health.score}%
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Critical Issues Banner */}
        {criticalIssues.length > 0 && (
          <div className="p-4 bg-red-50 border-2 border-red-500 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertOctagon className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Immediate Attention Required</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-700 mt-2">
                  {criticalIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Real-time Metrics */}
          <div className="lg:col-span-2 space-y-6">
            {/* Real-Time Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Real-Time Status
                </CardTitle>
                <CardDescription>Current system metrics and 24-hour trends</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* CPU */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">CPU Usage</span>
                    </div>
                    <span className="font-semibold">{currentMetrics.cpu.toFixed(1)}%</span>
                  </div>
                  <div className="relative">
                    <Progress value={currentMetrics.cpu} className="h-2 mb-2" />
                    <div 
                      className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(currentMetrics.cpu)}`}
                      style={{ width: `${currentMetrics.cpu}%` }}
                    />
                  </div>
                  <div className="w-full mt-2" style={{ height: '64px' }}>
                    <ResponsiveContainer width="100%" height={64}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                                  <p className="text-xs text-gray-500 mb-1">{payload[0].payload.time}</p>
                                  <p className="text-sm font-semibold text-blue-600">
                                    CPU: {Number(payload[0].value).toFixed(1)}%
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                          cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="cpu" 
                          stroke="#3b82f6" 
                          fill="url(#cpuGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Memory */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MemoryStick className="w-4 h-4 text-purple-500" />
                      <span className="font-medium">Memory Usage</span>
                    </div>
                    <span className="font-semibold">{currentMetrics.memory.toFixed(1)}%</span>
                  </div>
                  <div className="relative">
                    <Progress value={currentMetrics.memory} className="h-2 mb-2" />
                    <div 
                      className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(currentMetrics.memory)}`}
                      style={{ width: `${currentMetrics.memory}%` }}
                    />
                  </div>
                  <div className="w-full mt-2" style={{ height: '64px' }}>
                    <ResponsiveContainer width="100%" height={64}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                                  <p className="text-xs text-gray-500 mb-1">{payload[0].payload.time}</p>
                                  <p className="text-sm font-semibold text-purple-600">
                                    Memory: {Number(payload[0].value).toFixed(1)}%
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                          cursor={{ stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '3 3' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="memory" 
                          stroke="#8b5cf6" 
                          fill="url(#memoryGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Disk */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-green-500" />
                      <span className="font-medium">Disk Usage</span>
                    </div>
                    <span className="font-semibold">{currentMetrics.disk.toFixed(1)}%</span>
                  </div>
                  <div className="relative">
                    <Progress value={currentMetrics.disk} className="h-2 mb-2" />
                    <div 
                      className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(currentMetrics.disk)}`}
                      style={{ width: `${currentMetrics.disk}%` }}
                    />
                  </div>
                  <div className="w-full mt-2" style={{ height: '64px' }}>
                    <ResponsiveContainer width="100%" height={64}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="diskGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
                                  <p className="text-xs text-gray-500 mb-1">{payload[0].payload.time}</p>
                                  <p className="text-sm font-semibold text-green-600">
                                    Disk: {Number(payload[0].value).toFixed(1)}%
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                          cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '3 3' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="disk" 
                          stroke="#10b981" 
                          fill="url(#diskGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Temperature & Network Grid */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium">CPU Temperature</span>
                    </div>
                    <div className={`text-2xl font-semibold ${getTemperatureColor(metrics.resources.cpu_temperature_c)}`}>
                      {metrics.resources.cpu_temperature_c ? `${metrics.resources.cpu_temperature_c}°C` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="w-4 h-4 text-cyan-500" />
                      <span className="text-sm font-medium">Network</span>
                    </div>
                    <div className="text-2xl font-semibold">
                      {metrics.network.network_usage_mbps?.toFixed(1) || '0.0'} Mbps
                    </div>
                    {!metrics.network.internet_accessible && (
                      <Badge variant="destructive" className="mt-1">
                        <WifiOff className="w-3 h-3 mr-1" />
                        No Internet
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Historical Performance Chart */}
            <HistoricalChart machineId={info.machine_id} />

            {/* Disk Partitions */}
            {diskPartitions.length > 0 && (
              <DiskPartitionsDisplay 
                partitions={diskPartitions} 
                showSummary={true}
                compact={false}
              />
            )}

            {/* Hardware Comparison */}
            {hardwareComparison && (
              <HardwareComparisonCard hardwareComparison={hardwareComparison} />
            )}

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 w-5 text-orange-600" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <div
                      key={index}
                      className={`
                        p-3 rounded-lg border-l-4 flex items-start gap-3
                        ${rec.severity === 'high' ? 'bg-red-50 border-red-500' : ''}
                        ${rec.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' : ''}
                        ${rec.severity === 'low' ? 'bg-green-50 border-green-500' : ''}
                      `}
                    >
                      <div className={`
                        mt-0.5 h-5 w-5 rounded-full flex items-center justify-center
                        ${rec.severity === 'high' ? 'bg-red-100' : ''}
                        ${rec.severity === 'medium' ? 'bg-yellow-100' : ''}
                        ${rec.severity === 'low' ? 'bg-green-100' : ''}
                      `}>
                        {rec.severity === 'low' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        ) : (
                          <span className={`
                            text-xs font-bold
                            ${rec.severity === 'high' ? 'text-red-600' : ''}
                            ${rec.severity === 'medium' ? 'text-yellow-600' : ''}
                          `}>
                            !
                          </span>
                        )}
                      </div>
                      <p className="text-sm flex-1">{rec.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {machineEvents.length > 0 ? (
                  <div className="space-y-3">
                    {machineEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className={`
                          mt-1 h-2 w-2 rounded-full
                          ${event.severity === 'success' ? 'bg-green-500' : ''}
                          ${event.severity === 'info' ? 'bg-blue-500' : ''}
                          ${event.severity === 'warning' ? 'bg-yellow-500' : ''}
                          ${event.severity === 'critical' ? 'bg-red-500' : ''}
                        `} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Clock className="w-4 h-4 text-gray-500 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">System Uptime</div>
                      <div className="text-xs text-gray-500">{formatUptime(metrics.status.uptime_seconds)}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg mt-3">
                  <Users className="w-4 h-4 text-gray-500 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Active Users</div>
                    <div className="text-xs text-gray-500">
                      {metrics.user_activity.current_username || 'No user logged in'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - System Info & Actions */}
          <div className="space-y-6">
            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Machine ID</span>
                  <span className="font-medium">{info.machine_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hostname</span>
                  <span className="font-medium">{info.hostname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{info.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IP Address</span>
                  <span className="font-medium font-mono text-xs">{metrics.network.ip_address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-medium">{formatUptime(metrics.status.uptime_seconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current User</span>
                  <span className="font-medium">
                    {metrics.user_activity.current_username || 'None'}
                  </span>
                </div>
                {metrics.resources.cpu_temperature_c && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPU Temp</span>
                    <span className={`font-medium ${getTemperatureColor(metrics.resources.cpu_temperature_c)}`}>
                      {metrics.resources.cpu_temperature_c}°C
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Seen</span>
                  <span className="font-medium text-xs">
                    {formatDistanceToNow(timestamp, { addSuffix: true })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Management Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-purple-600" />
                  Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Maintenance Status */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Maintenance</span>
                    <Badge variant={isMaintenanceMode ? "default" : "outline"}>
                      {isMaintenanceMode ? 'Active' : 'Not Scheduled'}
                    </Badge>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowMaintenanceDialog(true)}
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Schedule
                  </Button>
                </div>

                {/* Notes */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Notes</span>
                    <Badge variant="outline">{notes.length} total</Badge>
                  </div>
                  
                  {/* Display notes list */}
                  {notes.length > 0 && (
                    <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                      {notes.slice().reverse().map((note) => (
                        <div key={note.id} className="p-2 bg-white rounded border text-xs group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="outline" 
                                className={`text-[9px] px-1 py-0 ${
                                  note.category === 'maintenance' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  note.category === 'issue' ? 'bg-red-50 text-red-700 border-red-200' :
                                  note.category === 'update' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                  'bg-gray-50 text-gray-700 border-gray-200'
                                }`}
                              >
                                {note.category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(note.timestamp, { addSuffix: true })}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setNotes(notes.filter(n => n.id !== note.id))
                                toast.success('Note deleted')
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                              title="Delete note"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-xs leading-relaxed">{note.content}</p>
                          {note.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {note.tags.map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[8px] px-1 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowNoteDialog(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                </div>

                {/* Alerts */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Active Alerts</span>
                    <Badge variant="destructive">{health.issues.length}</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowAlertDialog(true)}
                    disabled={health.issues.length === 0}
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </div>

                {/* Tags */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2 min-h-[24px]">
                    {info.tags && info.tags.length > 0 ? (
                      info.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No tags</span>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowTagDialog(true)}
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="default" 
                  className="w-full justify-start gap-2 bg-primary hover:bg-primary/90" 
                  onClick={() => setShowTechnicalDetails(true)}
                >
                  <ListTree className="w-4 h-4" />
                  View Technical Details
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={handleExportReport}>
                  <Download className="w-4 h-4" />
                  Export Report
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={handleCopyMachineId}>
                  <Copy className="w-4 h-4" />
                  Copy Machine ID
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showMaintenanceDialog && (
        <MaintenanceScheduleDialog
          machineId={info.machine_id}
          machineName={info.machine_id}
          onClose={() => setShowMaintenanceDialog(false)}
          onSchedule={async (schedule: MaintenanceSchedule) => {
            try {
              // Convert form data to API format
              const startDateTime = `${schedule.startDate}T${schedule.startTime}:00`
              const endDateTime = `${schedule.endDate}T${schedule.endTime}:00`
              
              await scheduleMaintenanceWindow({
                machine_id: info.machine_id,
                description: schedule.notes || `Scheduled ${schedule.reason} maintenance`,
                scheduled_start: startDateTime,
                scheduled_end: endDateTime,
                technician: 'system@university.edu', // System-initiated maintenance (no auth)
                notify_users: !schedule.suppressAlerts
              })
              
              toast.success('Maintenance scheduled successfully')
              setShowMaintenanceDialog(false)
            } catch (error) {
              // Error is already handled by the hook with toast
            }
          }}
        />
      )}

      {showNoteDialog && (
        <AddNoteDialog
          machineId={info.machine_id}
          machineName={info.hostname}
          onClose={() => setShowNoteDialog(false)}
          onAddNote={(note: MachineNote) => {
            setNotes([...notes, { ...note, id: Date.now().toString(), timestamp: new Date(), author: 'User' }])
            setShowNoteDialog(false)
          }}
        />
      )}

      {showTagDialog && (
        <TagManagementDialog
          open={showTagDialog}
          onOpenChange={setShowTagDialog}
          machineId={info.machine_id}
          machineName={info.hostname}
          currentTags={info.tags || []}
          allTags={allTags}
          onTagsUpdated={(machineId, tags) => {
            // Update parent component
            if (onTagsUpdated) {
              onTagsUpdated(machineId, tags)
            }
          }}
        />
      )}

      {showAlertDialog && (
        <AlertDetailsDialog
          machineId={info.machine_id}
          machineName={info.hostname}
          alerts={health.issues.map((issue, idx) => ({
            id: `alert-${idx}`,
            severity: health.status === 'critical' ? 'critical' : 'warning',
            title: issue,
            description: issue,
            timestamp: new Date(),
            acknowledged: false
          }))}
          onClose={() => setShowAlertDialog(false)}
          onAcknowledge={(alertIds: string[]) => {
            setShowAlertDialog(false)
          }}
        />
      )}

      {showTechnicalDetails && (
        <ComputerDetail
          machine={machine}
          specs={specs}
          hardware={hardware}
          onClose={() => setShowTechnicalDetails(false)}
        />
      )}
    </div>
  )
}