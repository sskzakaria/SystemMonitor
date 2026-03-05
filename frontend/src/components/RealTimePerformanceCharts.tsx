import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { formatTimeWithTimezone } from '../lib/timezone-utils'
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { 
  Activity, 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Network, 
  Thermometer,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'
import { HeartbeatMetrics } from '../types/monitor-schema'

interface RealTimePerformanceChartsProps {
  metrics: HeartbeatMetrics
  machineId: string
}

interface DataPoint {
  timestamp: string
  time: number
  cpu: number
  memory: number
  disk: number
  network: number
  temperature: number
}

const MAX_DATA_POINTS = 60 // Show last 60 seconds
const UPDATE_INTERVAL = 1000 // Update every 1 second

export function RealTimePerformanceCharts({ metrics, machineId }: RealTimePerformanceChartsProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [selectedMetric, setSelectedMetric] = useState<'all' | 'cpu' | 'memory' | 'disk' | 'network' | 'temperature'>('all')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize with current metrics
  useEffect(() => {
    const initialData: DataPoint[] = []
    const now = Date.now()
    
    // ✅ DATA-DRIVEN: Use actual backend values, not random fluctuations
    // Create initial 60 data points (same value repeated - will update with real data)
    for (let i = MAX_DATA_POINTS - 1; i >= 0; i--) {
      const timestamp = now - (i * 1000)
      initialData.push({
        timestamp: formatTimeWithTimezone(timestamp),
        time: timestamp,
        cpu: metrics.resources.cpu_usage_percent,
        memory: metrics.resources.memory_usage_percent,
        disk: metrics.resources.disk_usage_percent,
        network: metrics.resources.network_throughput_mbps || 0,
        temperature: metrics.resources.cpu_temp_celsius || 0,
      })
    }
    
    setDataPoints(initialData)
  }, [machineId])

  // Real-time data updates
  useEffect(() => {
    if (isPaused) return

    intervalRef.current = setInterval(() => {
      setDataPoints(prevData => {
        const now = Date.now()
        const newPoint: DataPoint = {
          timestamp: formatTimeWithTimezone(now),
          time: now,
          // ✅ DATA-DRIVEN: Use actual backend values
          // In production, these would be updated via WebSocket
          cpu: metrics.resources.cpu_usage_percent,
          memory: metrics.resources.memory_usage_percent,
          disk: metrics.resources.disk_usage_percent,
          network: metrics.resources.network_throughput_mbps || 0,
          temperature: metrics.resources.cpu_temp_celsius || 0,
        }

        // Keep only last MAX_DATA_POINTS
        const updated = [...prevData.slice(-(MAX_DATA_POINTS - 1)), newPoint]
        return updated
      })
    }, UPDATE_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPaused, metrics, machineId])

  const handleReset = () => {
    const now = Date.now()
    const resetData: DataPoint[] = []
    
    for (let i = MAX_DATA_POINTS - 1; i >= 0; i--) {
      const timestamp = now - (i * 1000)
      resetData.push({
        timestamp: formatTimeWithTimezone(timestamp),
        time: timestamp,
        cpu: metrics.resources.cpu_usage_percent,
        memory: metrics.resources.memory_usage_percent,
        disk: metrics.resources.disk_usage_percent,
        network: metrics.resources.network_throughput_mbps,
        temperature: metrics.resources.cpu_temp_celsius,
      })
    }
    
    setDataPoints(resetData)
  }

  // Calculate statistics
  const getStats = (key: keyof Omit<DataPoint, 'timestamp' | 'time'>) => {
    const values = dataPoints.map(d => d[key])
    const current = values[values.length - 1] || 0
    const previous = values[values.length - 2] || 0
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const max = Math.max(...values)
    const min = Math.min(...values)
    const trend = current > previous ? 'up' : current < previous ? 'down' : 'stable'
    
    return { current, avg, max, min, trend, change: current - previous }
  }

  const cpuStats = getStats('cpu')
  const memoryStats = getStats('memory')
  const diskStats = getStats('disk')
  const networkStats = getStats('network')
  const temperatureStats = getStats('temperature')

  const MetricCard = ({ 
    title, 
    icon: Icon, 
    stats, 
    unit,
    color,
    threshold 
  }: { 
    title: string
    icon: any
    stats: ReturnType<typeof getStats>
    unit: string
    color: string
    threshold?: number
  }) => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color }} />
            {title}
          </CardTitle>
          {stats.trend === 'up' ? (
            <TrendingUp className="h-4 w-4 text-red-500" />
          ) : stats.trend === 'down' ? (
            <TrendingDown className="h-4 w-4 text-green-500" />
          ) : (
            <Minus className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">{stats.current.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">{unit}</div>
            <Badge 
              variant={stats.change >= 0 ? 'destructive' : 'default'}
              className="text-xs ml-auto"
            >
              {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(1)}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>
              <div className="font-medium">Avg</div>
              <div>{stats.avg.toFixed(1)}{unit}</div>
            </div>
            <div>
              <div className="font-medium">Min</div>
              <div>{stats.min.toFixed(1)}{unit}</div>
            </div>
            <div>
              <div className="font-medium">Max</div>
              <div>{stats.max.toFixed(1)}{unit}</div>
            </div>
          </div>
          {threshold && stats.current > threshold && (
            <Badge variant="destructive" className="w-full justify-center text-xs">
              Above threshold ({threshold}{unit})
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="font-semibold">Real-Time Performance Monitor</h3>
            <p className="text-sm text-muted-foreground">
              Live data updating every second • Last {MAX_DATA_POINTS} seconds
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="gap-2"
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* Live Status Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`} />
        <span className="text-muted-foreground">
          {isPaused ? 'Monitoring Paused' : 'Live Monitoring Active'}
        </span>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          title="CPU Usage"
          icon={Cpu}
          stats={cpuStats}
          unit="%"
          color="#3b82f6"
          threshold={80}
        />
        <MetricCard
          title="Memory"
          icon={MemoryStick}
          stats={memoryStats}
          unit="%"
          color="#10b981"
          threshold={85}
        />
        <MetricCard
          title="Disk I/O"
          icon={HardDrive}
          stats={diskStats}
          unit="%"
          color="#f59e0b"
          threshold={90}
        />
        <MetricCard
          title="Network"
          icon={Network}
          stats={networkStats}
          unit=" Mbps"
          color="#8b5cf6"
        />
        <MetricCard
          title="CPU Temp"
          icon={Thermometer}
          stats={temperatureStats}
          unit="°C"
          color="#ef4444"
          threshold={75}
        />
      </div>

      {/* Charts */}
      <Tabs value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as any)}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="all">All Metrics</TabsTrigger>
          <TabsTrigger value="cpu">CPU</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="disk">Disk</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="temperature">Temperature</TabsTrigger>
        </TabsList>

        {/* All Metrics */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All System Metrics</CardTitle>
              <CardDescription>Real-time view of all performance indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ width: '100%', height: '400px', minHeight: '400px' }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={400}>
                  <LineChart data={dataPoints}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="timestamp" 
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="cpu" 
                      stroke="#3b82f6" 
                      name="CPU %" 
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="memory" 
                      stroke="#10b981" 
                      name="Memory %" 
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="disk" 
                      stroke="#f59e0b" 
                      name="Disk %" 
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label="Warning" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CPU Chart */}
        <TabsContent value="cpu">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-600" />
                CPU Usage Over Time
              </CardTitle>
              <CardDescription>Processor utilization percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dataPoints}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey="cpu" 
                    stroke="#3b82f6" 
                    fill="url(#cpuGradient)" 
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                  <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Chart */}
        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MemoryStick className="h-5 w-5 text-green-600" />
                Memory Usage Over Time
              </CardTitle>
              <CardDescription>RAM utilization percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dataPoints}>
                  <defs>
                    <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey="memory" 
                    stroke="#10b981" 
                    fill="url(#memoryGradient)" 
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                  <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Disk Chart */}
        <TabsContent value="disk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-orange-600" />
                Disk I/O Activity
              </CardTitle>
              <CardDescription>Storage read/write operations</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dataPoints}>
                  <defs>
                    <linearGradient id="diskGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey="disk" 
                    stroke="#f59e0b" 
                    fill="url(#diskGradient)" 
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Chart */}
        <TabsContent value="network">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-purple-600" />
                Network Throughput
              </CardTitle>
              <CardDescription>Data transfer rate in Mbps</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dataPoints}>
                  <defs>
                    <linearGradient id="networkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey="network" 
                    stroke="#8b5cf6" 
                    fill="url(#networkGradient)" 
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Temperature Chart */}
        <TabsContent value="temperature">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-red-600" />
                CPU Temperature
              </CardTitle>
              <CardDescription>Processor temperature in Celsius</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dataPoints}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#ef4444" 
                    fill="url(#tempGradient)" 
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                  <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}