import { useState, useMemo } from 'react'
import { MonitorData, HeartbeatMetrics, SpecsMetrics } from '../types/monitor-schema'
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Users,
  AlertTriangle,
  Server,
  Thermometer,
  Download,
  Network,
  Monitor,
  BarChart3,
  TrendingUp,
  Zap
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts'

interface SystemAnalyticsProps {
  machines: MonitorData<HeartbeatMetrics>[]
  specsMap: Map<string, SpecsMetrics>
  hardwareMap: Map<string, any>
  onFilterByAlert?: (alertType: string) => void
}

const COLORS = {
  primary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#a855f7',
  cyan: '#06b6d4',
  gray: '#6b7280'
}

export function SystemAnalytics({ machines, specsMap, hardwareMap, onFilterByAlert }: SystemAnalyticsProps) {
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all')

  // Overview Statistics
  const stats = useMemo(() => {
    const total = machines.length
    const online = machines.filter(m => m.metrics.status.state !== 'offline').length
    const activeUsers = machines.filter(m => m.metrics.user_activity.current_username).length
    const critical = machines.filter(m => m.health.status === 'critical').length
    const warning = machines.filter(m => m.health.status === 'warning').length
    const healthy = machines.filter(m => m.health.status === 'healthy').length

    const avgCpu = total > 0 ? Math.round(machines.reduce((sum, m) => sum + m.metrics.resources.cpu_usage_percent, 0) / total) : 0
    const avgMemory = total > 0 ? Math.round(machines.reduce((sum, m) => sum + m.metrics.resources.memory_usage_percent, 0) / total) : 0
    const avgDisk = total > 0 ? Math.round(machines.reduce((sum, m) => sum + m.metrics.resources.disk_usage_percent, 0) / total) : 0

    const criticalDisk = machines.filter(m => m.metrics.resources.disk_usage_percent > 95).length
    const diskWarning = machines.filter(m => m.metrics.resources.disk_usage_percent > 85 && m.metrics.resources.disk_usage_percent <= 95).length
    const criticalMemory = machines.filter(m => m.metrics.resources.memory_usage_percent > 95).length
    const memoryWarning = machines.filter(m => m.metrics.resources.memory_usage_percent > 85 && m.metrics.resources.memory_usage_percent <= 95).length
    const networkIssues = machines.filter(m => m.metrics.network.packet_loss_percent > 5).length
    const highTemp = machines.filter(m => m.metrics.resources.cpu_temp_celsius && m.metrics.resources.cpu_temp_celsius > 70).length

    return {
      total,
      online,
      activeUsers,
      critical,
      warning,
      healthy,
      avgCpu,
      avgMemory,
      avgDisk,
      criticalDisk,
      diskWarning,
      criticalMemory,
      memoryWarning,
      networkIssues,
      highTemp,
      utilizationRate: total > 0 ? Math.round((activeUsers / total) * 100) : 0,
      uptimePercent: total > 0 ? Math.round((online / total) * 100) : 0
    }
  }, [machines])

  // Health Distribution
  const healthData = useMemo(() => [
    { name: 'Healthy', value: stats.healthy, color: COLORS.success },
    { name: 'Warning', value: stats.warning, color: COLORS.warning },
    { name: 'Critical', value: stats.critical, color: COLORS.danger },
    { name: 'Offline', value: stats.total - stats.online, color: COLORS.gray }
  ].filter(item => item.value > 0), [stats])

  // Top Users
  const topUsers = useMemo(() => {
    const usersMap = new Map<string, number>()
    machines.forEach(m => {
      const username = m.metrics.user_activity.current_username
      if (username) {
        usersMap.set(username, (usersMap.get(username) || 0) + 1)
      }
    })
    return Array.from(usersMap.entries())
      .map(([username, count]) => ({ username, machines: count }))
      .sort((a, b) => b.machines - a.machines)
      .slice(0, 5)
  }, [machines])

  // Building Distribution
  const buildingData = useMemo(() => {
    const buildingCounts = new Map<string, { total: number; active: number }>()
    machines.forEach(m => {
      const building = m.machine.building
      const current = buildingCounts.get(building) || { total: 0, active: 0 }
      buildingCounts.set(building, {
        total: current.total + 1,
        active: current.active + (m.metrics.user_activity.current_username ? 1 : 0)
      })
    })
    return Array.from(buildingCounts.entries())
      .map(([name, data]) => ({
        name: name.length > 12 ? name.substring(0, 9) + '...' : name,
        total: data.total,
        active: data.active,
        utilization: data.total > 0 ? Math.round((data.active / data.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [machines])

  // CPU Distribution
  const cpuDistribution = useMemo(() => {
    if (!specsMap || specsMap.size === 0) return []
    const cpuCounts = new Map<string, number>()
    Array.from(specsMap.values()).forEach(spec => {
      const cpu = spec?.static_hardware?.cpu?.name || 'Unknown'
      cpuCounts.set(cpu, (cpuCounts.get(cpu) || 0) + 1)
    })
    return Array.from(cpuCounts.entries())
      .map(([name, count]) => ({ name: name.length > 18 ? name.substring(0, 15) + '...' : name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [specsMap])

  // OS Distribution
  const osDistribution = useMemo(() => {
    if (!specsMap || specsMap.size === 0) return []
    const osCounts = new Map<string, number>()
    Array.from(specsMap.values()).forEach(spec => {
      const os = spec?.static_system?.os?.name || 'Unknown'
      osCounts.set(os, (osCounts.get(os) || 0) + 1)
    })
    return Array.from(osCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [specsMap])

  // Resource distribution buckets
  const resourceDistribution = useMemo(() => {
    const cpuBuckets = { low: 0, medium: 0, high: 0, critical: 0 }
    const memoryBuckets = { low: 0, medium: 0, high: 0, critical: 0 }
    const diskBuckets = { low: 0, medium: 0, high: 0, critical: 0 }

    machines.forEach(m => {
      const cpu = m.metrics.resources.cpu_usage_percent
      const memory = m.metrics.resources.memory_usage_percent
      const disk = m.metrics.resources.disk_usage_percent

      if (cpu < 50) cpuBuckets.low++
      else if (cpu < 70) cpuBuckets.medium++
      else if (cpu < 90) cpuBuckets.high++
      else cpuBuckets.critical++

      if (memory < 50) memoryBuckets.low++
      else if (memory < 70) memoryBuckets.medium++
      else if (memory < 90) memoryBuckets.high++
      else memoryBuckets.critical++

      if (disk < 50) diskBuckets.low++
      else if (disk < 70) diskBuckets.medium++
      else if (disk < 90) diskBuckets.high++
      else diskBuckets.critical++
    })

    return [
      { name: 'CPU', low: cpuBuckets.low, medium: cpuBuckets.medium, high: cpuBuckets.high, critical: cpuBuckets.critical },
      { name: 'Memory', low: memoryBuckets.low, medium: memoryBuckets.medium, high: memoryBuckets.high, critical: memoryBuckets.critical },
      { name: 'Disk', low: diskBuckets.low, medium: diskBuckets.medium, high: diskBuckets.high, critical: diskBuckets.critical }
    ]
  }, [machines])

  const buildings = useMemo(() => {
    return ['all', ...Array.from(new Set(machines.map(m => m.machine.building))).sort()]
  }, [machines])

  const getStatusColor = (value: number) => {
    if (value < 70) return COLORS.success
    if (value < 85) return COLORS.warning
    return COLORS.danger
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] overflow-auto">
      {/* Header */}
      <div className="flex-none flex items-center justify-between pb-4 sticky top-0 bg-white z-10 border-b mb-1">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">{machines.length} machines · {stats.online} online · {stats.activeUsers} active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="border rounded-lg px-4 py-2 text-sm bg-white shadow-sm h-9"
          >
            {buildings.map(b => (
              <option key={b} value={b}>{b === 'all' ? 'All Buildings' : b}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="gap-2 text-sm h-9 px-4">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="space-y-4 pb-4">
        {/* Row 1: 6 Metric Cards */}
        <div className="grid grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-5 w-5 text-indigo-600" />
                <span className="text-sm text-muted-foreground">Systems</span>
              </div>
              <p className="text-3xl font-bold text-indigo-600">{stats.total}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                {stats.online} online
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-green-600" />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
              <p className="text-3xl font-bold text-green-600">{stats.activeUsers}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                {stats.utilizationRate}% utilization
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-blue-600" />
                <span className="text-sm text-muted-foreground">Healthy</span>
              </div>
              <p className="text-3xl font-bold text-blue-600">{stats.healthy}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                {Math.round((stats.healthy / stats.total) * 100)}% fleet
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <span className="text-sm text-muted-foreground">Warning</span>
              </div>
              <p className="text-3xl font-bold text-orange-600">{stats.warning}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                Review needed
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm text-muted-foreground">Critical</span>
              </div>
              <p className="text-3xl font-bold text-red-600">{stats.critical}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                Urgent action
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <span className="text-sm text-muted-foreground">Uptime</span>
              </div>
              <p className="text-3xl font-bold text-purple-600">{stats.uptimePercent}%</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                Availability
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Resource Gauges + Building Chart + Health Pie */}
        <div className="grid grid-cols-12 gap-4">
          {/* Resource Gauges */}
          <Card className="col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Fleet Resources</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <svg className="w-28 h-28 transform -rotate-90">
                      <circle cx="56" cy="56" r="48" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                      <circle 
                        cx="56" 
                        cy="56" 
                        r="48" 
                        stroke={getStatusColor(stats.avgCpu)}
                        strokeWidth="8" 
                        fill="none"
                        strokeDasharray={`${(stats.avgCpu / 100) * 301.6} 301.6`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute">
                      <p className="text-xl font-bold">{stats.avgCpu}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">CPU</p>
                  </div>
                </div>

                <div className="text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <svg className="w-28 h-28 transform -rotate-90">
                      <circle cx="56" cy="56" r="48" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                      <circle 
                        cx="56" 
                        cy="56" 
                        r="48" 
                        stroke={getStatusColor(stats.avgMemory)}
                        strokeWidth="8" 
                        fill="none"
                        strokeDasharray={`${(stats.avgMemory / 100) * 301.6} 301.6`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute">
                      <p className="text-xl font-bold">{stats.avgMemory}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">RAM</p>
                  </div>
                </div>

                <div className="text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <svg className="w-28 h-28 transform -rotate-90">
                      <circle cx="56" cy="56" r="48" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                      <circle 
                        cx="56" 
                        cy="56" 
                        r="48" 
                        stroke={getStatusColor(stats.avgDisk)}
                        strokeWidth="8" 
                        fill="none"
                        strokeDasharray={`${(stats.avgDisk / 100) * 301.6} 301.6`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute">
                      <p className="text-xl font-bold">{stats.avgDisk}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Disk</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Building Utilization */}
          <Card className="col-span-5">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Building Utilization</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={buildingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} height={28} />
                  <YAxis tick={{ fontSize: 11 }} width={35} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="total" fill={COLORS.info} name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="active" fill={COLORS.success} name="Active" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Health Status + Top Users */}
          <Card className="col-span-3">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Health & Users</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie
                    data={healthData}
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={48}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {healthData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {topUsers.slice(0, 3).map((user, idx) => (
                  <div key={user.username} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <span className="font-medium truncate">{user.username}</span>
                    </div>
                    <Badge variant="outline" className="text-xs h-5 px-2 ml-2">{user.machines}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Resource Distribution + CPU Models + Alert Summary */}
        <div className="grid grid-cols-12 gap-4">
          {/* Resource Distribution Stacked */}
          <Card className="col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Resource Distribution</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={resourceDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} height={28} />
                  <YAxis dataKey="name" type="category" width={55} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="low" stackId="a" fill={COLORS.success} name="<50%" />
                  <Bar dataKey="medium" stackId="a" fill={COLORS.info} name="50-70%" />
                  <Bar dataKey="high" stackId="a" fill={COLORS.warning} name="70-90%" />
                  <Bar dataKey="critical" stackId="a" fill={COLORS.danger} name=">90%" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CPU Models */}
          <Card className="col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">CPU Models</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={cpuDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} height={28} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Alert Summary */}
          <Card className="col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between p-2.5 bg-red-50 rounded">
                  <span className="text-sm font-medium">Disk &gt;95%</span>
                  <Badge variant="destructive" className="text-xs h-5 px-2">{stats.criticalDisk}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-red-50 rounded">
                  <span className="text-sm font-medium">RAM &gt;95%</span>
                  <Badge variant="destructive" className="text-xs h-5 px-2">{stats.criticalMemory}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-yellow-50 rounded">
                  <span className="text-sm font-medium">Disk 85-95%</span>
                  <Badge className="bg-yellow-600 text-xs h-5 px-2">{stats.diskWarning}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-yellow-50 rounded">
                  <span className="text-sm font-medium">RAM 85-95%</span>
                  <Badge className="bg-yellow-600 text-xs h-5 px-2">{stats.memoryWarning}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-orange-50 rounded">
                  <span className="text-sm font-medium">Network</span>
                  <Badge className="bg-orange-600 text-xs h-5 px-2">{stats.networkIssues}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-orange-50 rounded">
                  <span className="text-sm font-medium">High Temp</span>
                  <Badge className="bg-orange-600 text-xs h-5 px-2">{stats.highTemp}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 4: OS Distribution + Hardware Summary */}
        <div className="grid grid-cols-12 gap-4">
          {/* OS Distribution */}
          <Card className="col-span-8">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Operating Systems & Hardware</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={osDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name} (${entry.count})`}
                      outerRadius={65}
                      dataKey="count"
                    >
                      {osDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={Object.values(COLORS)[index % Object.values(COLORS).length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-indigo-50 rounded text-center">
                    <Monitor className="h-6 w-6 mx-auto mb-1.5 text-indigo-600" />
                    <p className="text-xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Machines</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded text-center">
                    <Cpu className="h-6 w-6 mx-auto mb-1.5 text-purple-600" />
                    <p className="text-xl font-bold">{cpuDistribution.length}</p>
                    <p className="text-xs text-muted-foreground">CPUs</p>
                  </div>
                  <div className="p-3 bg-cyan-50 rounded text-center">
                    <Server className="h-6 w-6 mx-auto mb-1.5 text-cyan-600" />
                    <p className="text-xl font-bold">{osDistribution.length}</p>
                    <p className="text-xs text-muted-foreground">OS Types</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-1.5 text-green-600" />
                    <p className="text-xl font-bold">{stats.uptimePercent}%</p>
                    <p className="text-xs text-muted-foreground">Uptime</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <span className="text-sm text-muted-foreground">Total Machines</span>
                <span className="text-base font-bold">{stats.total}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <span className="text-sm text-muted-foreground">Online Systems</span>
                <span className="text-base font-bold text-green-600">{stats.online}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <span className="text-sm text-muted-foreground">Active Sessions</span>
                <span className="text-base font-bold text-blue-600">{stats.activeUsers}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <span className="text-sm text-muted-foreground">Fleet Utilization</span>
                <span className="text-base font-bold text-purple-600">{stats.utilizationRate}%</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <span className="text-sm text-muted-foreground">Total Alerts</span>
                <span className="text-base font-bold text-red-600">{stats.critical + stats.warning}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
