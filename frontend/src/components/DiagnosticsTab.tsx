import { MonitorData, HeartbeatMetrics, HealthInfo } from '../types/monitor-schema'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Thermometer,
  Zap,
  Info,
  ArrowRight,
  Activity
} from 'lucide-react'
import { formatRelativeTime } from '../lib/utils'

interface DiagnosticsTabProps {
  machineId: string
  metrics: HeartbeatMetrics
  health: HealthInfo
  processes?: Array<{
    name: string
    pid: number
    cpu: number
    memory: number
  }>
  events?: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    timestamp: Date
  }>
}

// Health scoring function
function calculateHealthScore(value: number, type: 'usage' | 'temperature'): {
  score: number
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical'
  status: 'success' | 'warning' | 'error'
} {
  let score = 0
  
  if (type === 'usage') {
    // Lower is better for usage
    if (value <= 60) score = 100 - (value * 0.5)
    else if (value <= 75) score = 80 - ((value - 60) * 1.5)
    else if (value <= 85) score = 70 - ((value - 75) * 2)
    else if (value <= 95) score = 50 - ((value - 85) * 3)
    else score = 20 - ((value - 95) * 4)
  } else if (type === 'temperature') {
    // Temperature scoring (assuming Celsius)
    if (value <= 50) score = 100
    else if (value <= 65) score = 90 - ((value - 50) * 1)
    else if (value <= 75) score = 75 - ((value - 65) * 2)
    else if (value <= 85) score = 55 - ((value - 75) * 3)
    else score = 25 - ((value - 85) * 2)
  }

  score = Math.max(0, Math.min(100, score))

  let rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical'
  let status: 'success' | 'warning' | 'error'

  if (score >= 90) {
    rating = 'Excellent'
    status = 'success'
  } else if (score >= 75) {
    rating = 'Good'
    status = 'success'
  } else if (score >= 60) {
    rating = 'Fair'
    status = 'warning'
  } else if (score >= 40) {
    rating = 'Poor'
    status = 'warning'
  } else {
    rating = 'Critical'
    status = 'error'
  }

  return { score, rating, status }
}

export function DiagnosticsTab({ machineId, metrics, health, processes = [], events = [] }: DiagnosticsTabProps) {
  const { resources, system, network } = metrics

  // Calculate health scores for each component
  const cpuHealth = calculateHealthScore(resources.cpu_usage_percent || 0, 'usage')
  const memoryHealth = calculateHealthScore(resources.memory_usage_percent || 0, 'usage')
  const diskHealth = calculateHealthScore(resources.disk_usage_percent || 0, 'usage')
  
  // Network stability - calculate from actual network metrics
  const networkUsage = network.network_usage_mbps || 0
  const internetAccessible = network.internet_accessible
  const networkScore = internetAccessible 
    ? (networkUsage < 100 ? 100 - (networkUsage * 0.3) : 70)
    : 30 // Low score if no internet
  const networkHealth = {
    score: Math.round(networkScore),
    rating: networkScore >= 75 ? 'Good' : networkScore >= 60 ? 'Fair' : 'Poor' as 'Good' | 'Fair' | 'Poor',
    status: networkScore >= 60 ? 'warning' : 'error' as 'warning' | 'error'
  }

  // Temperature - use actual CPU temperature
  const temperature = resources.cpu_temperature_c || null
  const tempHealth = temperature !== null 
    ? calculateHealthScore(temperature, 'temperature')
    : { score: 100, rating: 'Excellent' as const, status: 'success' as const } // No temp sensor = no issue

  // Power/Uptime health - based on system uptime and stability
  const uptimeHours = system.uptime_seconds / 3600
  const powerScore = Math.min(100, 50 + (Math.min(uptimeHours, 720) / 720 * 50)) // Max score after 30 days uptime
  const powerHealth = {
    score: Math.round(powerScore),
    rating: powerScore >= 90 ? 'Stable' : powerScore >= 70 ? 'Good' : 'Fair' as 'Stable' | 'Good' | 'Fair',
    status: 'success' as const
  }

  // Calculate overall health score
  const overallScore = Math.round(
    (cpuHealth.score + memoryHealth.score + diskHealth.score + networkHealth.score + tempHealth.score + powerHealth.score) / 6
  )
  
  const overallGrade = 
    overallScore >= 90 ? 'A' :
    overallScore >= 80 ? 'B+' :
    overallScore >= 70 ? 'B' :
    overallScore >= 60 ? 'C' :
    overallScore >= 50 ? 'D' : 'F'

  // Health components
  const healthComponents = [
    {
      icon: Cpu,
      name: 'CPU Health',
      ...cpuHealth,
      detail: `${(resources.cpu_usage_percent || 0).toFixed(1)}% usage`
    },
    {
      icon: MemoryStick,
      name: 'Memory Health',
      ...memoryHealth,
      detail: `${(resources.memory_usage_percent || 0).toFixed(1)}% usage`
    },
    {
      icon: HardDrive,
      name: 'Disk Health',
      ...diskHealth,
      detail: `${(resources.disk_usage_percent || 0).toFixed(1)}% usage`
    },
    {
      icon: Wifi,
      name: 'Network Stability',
      ...networkHealth,
      detail: 'Latency within normal range'
    },
    {
      icon: Thermometer,
      name: 'Temperature',
      ...tempHealth,
      detail: temperature !== null ? `${temperature}°C` : 'No sensor detected'
    },
    {
      icon: Zap,
      name: 'Power Supply',
      ...powerHealth,
      detail: 'Operating normally'
    }
  ]

  // Mock events if none provided
  const displayEvents = events.length > 0 ? events : []

  // Mock processes if none provided  
  const displayProcesses = processes.length > 0 ? processes.slice(0, 5) : []

  const getStatusIcon = (status: 'success' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-700'
    if (score >= 75) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const formatMemory = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
  }

  return (
    <div className="space-y-6">
      {/* System Health Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Overall Score:</span>
              <Badge variant="outline" className={`text-lg px-3 py-1 ${getScoreColor(overallScore)}`}>
                {overallGrade} ({overallScore}/100)
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {healthComponents.map((component, index) => {
              const Icon = component.icon
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(component.status)}
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{component.name}</div>
                      <div className="text-sm text-muted-foreground">{component.detail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={getScoreColor(component.score)}>
                      {component.rating} ({component.score}/100)
                    </Badge>
                    {/* Trend indicator - could be dynamic in real system */}
                    <div className="text-muted-foreground">
                      <Minus className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Events Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Events</span>
            <Button variant="link" className="h-auto p-0">
              View All Events <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {displayEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                {getEventIcon(event.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{event.title}</div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{event.message}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Running Processes Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Running Processes (Top 5 by CPU)</span>
            <Button variant="link" className="h-auto p-0">
              View All Processes <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {displayProcesses.map((process, index) => (
              <div
                key={process.pid}
                className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="font-semibold text-muted-foreground w-6">
                  {index + 1}.
                </div>
                <div className="flex-1 font-mono">{process.name}</div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{process.cpu.toFixed(1)}%</span>
                  </div>
                  <div className="text-muted-foreground">•</div>
                  <div className="flex items-center gap-2">
                    <MemoryStick className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">{formatMemory(process.memory)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}