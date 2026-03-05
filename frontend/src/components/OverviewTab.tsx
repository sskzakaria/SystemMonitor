import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Activity, Cpu, HardDrive, Wifi, Users, Clock, MemoryStick, Network, AlertCircle } from 'lucide-react'
import type { HeartbeatMetrics, HealthInfo } from '../types/monitor-schema'
import { formatDuration } from '../lib/utils'
import { formatDateOnlyWithTimezone, formatDateWithTimezone } from '../lib/timezone-utils'

interface OverviewTabProps {
  machineId: string
  metrics: HeartbeatMetrics
  health: HealthInfo
}

export function OverviewTab({ machineId, metrics, health }: OverviewTabProps) {
  const { status, resources, user_activity, system } = metrics

  const getResourceColor = (value: number) => {
    if (value > 90) return 'text-red-600'
    if (value > 75) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getResourceBgColor = (value: number) => {
    if (value > 90) return 'bg-red-50'
    if (value > 75) return 'bg-yellow-50'
    return 'bg-green-50'
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CPU Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <div className={`h-10 w-10 rounded-lg ${getResourceBgColor(resources.cpu_usage_percent)} flex items-center justify-center`}>
              <Cpu className={`h-5 w-5 ${getResourceColor(resources.cpu_usage_percent)}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${getResourceColor(resources.cpu_usage_percent)}`}>
              {resources.cpu_usage_percent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              Temp: {resources.cpu_temp_celsius || 'N/A'}°C
            </p>
          </CardContent>
        </Card>

        {/* Memory Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <div className={`h-10 w-10 rounded-lg ${getResourceBgColor(resources.memory_usage_percent)} flex items-center justify-center`}>
              <MemoryStick className={`h-5 w-5 ${getResourceColor(resources.memory_usage_percent)}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${getResourceColor(resources.memory_usage_percent)}`}>
              {resources.memory_usage_percent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              RAM utilization
            </p>
          </CardContent>
        </Card>

        {/* Disk Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
            <div className={`h-10 w-10 rounded-lg ${getResourceBgColor(resources.disk_usage_percent)} flex items-center justify-center`}>
              <HardDrive className={`h-5 w-5 ${getResourceColor(resources.disk_usage_percent)}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${getResourceColor(resources.disk_usage_percent)}`}>
              {resources.disk_usage_percent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              Storage capacity
            </p>
          </CardContent>
        </Card>

        {/* Network Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network</CardTitle>
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Network className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-purple-600">
              {resources.network_throughput_mbps.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              Mbps throughput
            </p>
          </CardContent>
        </Card>

        {/* User Activity Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-blue-600">{user_activity.active_users}</div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 truncate">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50 flex-shrink-0" />
              {user_activity.current_username || 'No active user'}
            </p>
          </CardContent>
        </Card>

        {/* Uptime Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-indigo-600">{formatDuration(system.uptime_seconds)}</div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              Last boot: {new Date(status.last_boot).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white">
          <CardTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Activity className="h-4 w-4 text-gray-600" />
            </div>
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Uptime</p>
              <p className="text-lg font-semibold">{formatDuration(system.uptime_seconds)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Boot Time</p>
              <p className="text-lg font-semibold">{formatDateWithTimezone(system.boot_time)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Heartbeat</p>
              <p className="text-lg font-semibold">{formatDateWithTimezone(system.last_heartbeat)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
              <Badge className={`
                ${status.state === 'online' ? 'bg-green-500' : 
                  status.state === 'offline' ? 'bg-red-500' : 
                  status.state === 'idle' ? 'bg-blue-500' : 
                  'bg-purple-500'} text-white
              `}>
                {typeof status === 'object' ? status.state : status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Status */}
      {health.issues.length > 0 && (
        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-red-500">
          <CardHeader className="bg-gradient-to-r from-red-50 to-white border-b">
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              Health Issues
              <Badge variant="destructive" className="ml-auto">{health.issues.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {health.issues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                  <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-semibold">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <Badge 
                      variant={health.status === 'critical' ? 'destructive' : 'secondary'}
                      className="mb-1"
                    >
                      {health.status}
                    </Badge>
                    <p className="text-sm text-gray-700 leading-relaxed">{issue}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}