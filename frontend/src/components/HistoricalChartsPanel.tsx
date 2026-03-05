import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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
  ReferenceLine,
  ComposedChart,
  Bar
} from 'recharts'
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Network, 
  Thermometer,
  RefreshCw,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Info,
  Database
} from 'lucide-react'
import { 
  getMachineCPUHistory,
  getMachineMemoryHistory,
  getMachineDiskHistory,
  getMachineNetworkHistory,
  getMachineTemperatureHistory
} from '../services/api'
import { formatChartTimeLabel } from '../lib/timezone-utils'

interface HistoricalChartsPanelProps {
  machineId: string
}

type TimeRange = 1 | 6 | 24 | 168 // hours: 1h, 6h, 24h, 7d

interface ChartDataPoint {
  timestamp: string
  time: string
  value: number
  value2?: number
  label?: string
}

export function HistoricalChartsPanel({ machineId }: HistoricalChartsPanelProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(24)
  const [activeTab, setActiveTab] = useState<'cpu' | 'memory' | 'disk' | 'network' | 'temperature' | 'overview'>('overview')
  
  // Data states
  const [cpuData, setCpuData] = useState<ChartDataPoint[]>([])
  const [memoryData, setMemoryData] = useState<ChartDataPoint[]>([])
  const [diskData, setDiskData] = useState<ChartDataPoint[]>([])
  const [networkData, setNetworkData] = useState<ChartDataPoint[]>([])
  const [temperatureData, setTemperatureData] = useState<ChartDataPoint[]>([])
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHistoricalData = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Fetch all metrics in parallel (now InfluxDB-backed!)
      const [cpuResponse, memoryResponse, diskResponse, networkResponse, temperatureResponse] = await Promise.all([
        getMachineCPUHistory(machineId, timeRange).catch(() => ({ history: [] })),
        getMachineMemoryHistory(machineId, timeRange).catch(() => ({ history: [] })),
        getMachineDiskHistory(machineId, timeRange).catch(() => ({ history: [] })),
        getMachineNetworkHistory(machineId, timeRange).catch(() => ({ history: [] })),
        getMachineTemperatureHistory(machineId, timeRange).catch(() => ({ history: [] }))
      ])

      // Transform CPU data
      if (cpuResponse.history && cpuResponse.history.length > 0) {
        const transformed = cpuResponse.history.map((point: any) => ({
          timestamp: point.timestamp,
          time: formatChartTimeLabel(point.timestamp, timeRange === 1 ? '6h' : timeRange === 6 ? '6h' : timeRange === 24 ? '24h' : '7d'),
          value: point.cpu_usage || point.cpu_usage_percent || 0,
          value2: point.cpu_temp || point.cpu_temperature_c || null,
          label: 'CPU %'
        }))
        setCpuData(transformed)
      } else {
        setCpuData([])
      }

      // Transform Memory data
      if (memoryResponse.history && memoryResponse.history.length > 0) {
        const transformed = memoryResponse.history.map((point: any) => ({
          timestamp: point.timestamp,
          time: formatChartTimeLabel(point.timestamp, timeRange === 1 ? '6h' : timeRange === 6 ? '6h' : timeRange === 24 ? '24h' : '7d'),
          value: point.mem_usage || point.memory_usage_percent || 0,
          value2: point.mem_used || point.memory_used_gb || null,
          label: 'Memory %'
        }))
        setMemoryData(transformed)
      } else {
        setMemoryData([])
      }

      // Transform Disk data
      if (diskResponse.history && diskResponse.history.length > 0) {
        const transformed = diskResponse.history.map((point: any) => ({
          timestamp: point.timestamp,
          time: formatChartTimeLabel(point.timestamp, timeRange === 1 ? '6h' : timeRange === 6 ? '6h' : timeRange === 24 ? '24h' : '7d'),
          value: point.disk_usage || point.disk_usage_percent || 0,
          value2: point.disk_used || point.disk_used_gb || null,
          label: 'Disk %'
        }))
        setDiskData(transformed)
      } else {
        setDiskData([])
      }

      // Transform Network data
      if (networkResponse.history && networkResponse.history.length > 0) {
        const transformed = networkResponse.history.map((point: any) => ({
          timestamp: point.timestamp,
          time: formatChartTimeLabel(point.timestamp, timeRange === 1 ? '6h' : timeRange === 6 ? '6h' : timeRange === 24 ? '24h' : '7d'),
          value: point.net_download || point.network_download_mbps || 0,
          value2: point.net_upload || point.network_upload_mbps || null,
          label: 'Network'
        }))
        setNetworkData(transformed)
      } else {
        setNetworkData([])
      }

      // Transform Temperature data
      if (temperatureResponse.history && temperatureResponse.history.length > 0) {
        const transformed = temperatureResponse.history.map((point: any) => ({
          timestamp: point.timestamp,
          time: formatChartTimeLabel(point.timestamp, timeRange === 1 ? '6h' : timeRange === 6 ? '6h' : timeRange === 24 ? '24h' : '7d'),
          value: point.cpu_temp || point.cpu_temperature_c || 0,
          label: 'Temp °C'
        }))
        setTemperatureData(transformed)
      } else {
        setTemperatureData([])
      }

      setLastUpdated(new Date())
      
      // Check if we have any data at all
      const hasData = [cpuResponse, memoryResponse, diskResponse, networkResponse, temperatureResponse]
        .some(response => response.history && response.history.length > 0)
      
      if (!hasData) {
        setError('No historical data available yet. Data collection is ongoing.')
      }
      
    } catch (err) {
      console.error('Failed to fetch historical data:', err)
      setError('Failed to load historical data from backend')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistoricalData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHistoricalData, 30000)
    return () => clearInterval(interval)
  }, [machineId, timeRange])

  const timeRangeOptions: { value: TimeRange; label: string; icon: string }[] = [
    { value: 1, label: '1 Hour', icon: '1h' },
    { value: 6, label: '6 Hours', icon: '6h' },
    { value: 24, label: '24 Hours', icon: '1d' },
    { value: 168, label: '7 Days', icon: '7d' }
  ]

  const calculateStats = (data: ChartDataPoint[]) => {
    if (data.length === 0) return { min: 0, max: 0, avg: 0, current: 0 }
    
    const values = data.map(d => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const current = values[values.length - 1]
    
    return { min, max, avg, current }
  }

  const cpuStats = calculateStats(cpuData)
  const memoryStats = calculateStats(memoryData)
  const diskStats = calculateStats(diskData)
  const networkStats = calculateStats(networkData)
  const tempStats = calculateStats(temperatureData)

  // Combine all data for overview chart
  const overviewData = cpuData.map((point, index) => ({
    time: point.time,
    timestamp: point.timestamp,
    cpu: point.value,
    memory: memoryData[index]?.value || 0,
    disk: diskData[index]?.value || 0,
    network: networkData[index]?.value || 0,
    temperature: temperatureData[index]?.value || 0
  }))

  const MetricCard = ({ 
    title, 
    icon: Icon, 
    stats, 
    unit, 
    color, 
    hasData 
  }: { 
    title: string
    icon: any
    stats: ReturnType<typeof calculateStats>
    unit: string
    color: string
    hasData: boolean
  }) => (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          {!hasData && (
            <Badge variant="outline" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              Collecting
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stats.current.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Min</div>
                <div className="font-medium">{stats.min.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg</div>
                <div className="font-medium">{stats.avg.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Max</div>
                <div className="font-medium">{stats.max.toFixed(1)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">Waiting for data...</p>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">Historical Performance Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Powered by MongoDB + InfluxDB • {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHistoricalData}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Time Range:</span>
        <div className="flex gap-1">
          {timeRangeOptions.map((option) => (
            <Button
              key={option.value}
              variant={timeRange === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(option.value)}
              className="text-xs"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-amber-600" />
              <span className="text-amber-900">{error}</span>
              <span className="text-amber-700 ml-auto text-xs">
                Historical data is collected every 5 minutes by the backend
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard
          title="CPU Usage"
          icon={Cpu}
          stats={cpuStats}
          unit="%"
          color="#3b82f6"
          hasData={cpuData.length > 0}
        />
        <MetricCard
          title="Memory"
          icon={MemoryStick}
          stats={memoryStats}
          unit="%"
          color="#10b981"
          hasData={memoryData.length > 0}
        />
        <MetricCard
          title="Disk Usage"
          icon={HardDrive}
          stats={diskStats}
          unit="%"
          color="#f59e0b"
          hasData={diskData.length > 0}
        />
        <MetricCard
          title="Network"
          icon={Network}
          stats={networkStats}
          unit=" Mbps"
          color="#8b5cf6"
          hasData={networkData.length > 0}
        />
        <MetricCard
          title="CPU Temp"
          icon={Thermometer}
          stats={tempStats}
          unit="°C"
          color="#ef4444"
          hasData={temperatureData.length > 0}
        />
      </div>

      {/* Charts Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cpu">CPU</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="disk">Disk</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="temperature">Temperature</TabsTrigger>
        </TabsList>

        {/* Overview - All Metrics */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>All Metrics Overview</CardTitle>
              <CardDescription>Combined view of all system performance indicators</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={overviewData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="cpu" stroke="#3b82f6" name="CPU %" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="memory" stroke="#10b981" name="Memory %" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="disk" stroke="#f59e0b" name="Disk %" strokeWidth={2} dot={false} />
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label="High Usage" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <Database className="h-16 w-16 mb-4 opacity-20" />
                  <p>No historical data available yet</p>
                  <p className="text-xs mt-2">Backend is collecting metrics every 5 minutes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CPU Chart */}
        <TabsContent value="cpu">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-600" />
                CPU Usage & Temperature History
              </CardTitle>
              <CardDescription>Processor utilization and thermal performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {cpuData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={cpuData}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      fill="url(#cpuGradient)"
                      name="CPU Usage %"
                      strokeWidth={2}
                    />
                    {cpuData[0]?.value2 !== null && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="value2"
                        stroke="#ef4444"
                        name="Temperature °C"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                    <ReferenceLine yAxisId="left" y={80} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                    <ReferenceLine yAxisId="left" y={60} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <Cpu className="h-16 w-16 mb-4 opacity-20" />
                  <p>No CPU history data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Chart */}
        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MemoryStick className="h-5 w-5 text-green-600" />
                Memory Usage History
              </CardTitle>
              <CardDescription>RAM utilization trends and patterns</CardDescription>
            </CardHeader>
            <CardContent>
              {memoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={memoryData}>
                    <defs>
                      <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      fill="url(#memoryGradient)"
                      name="Memory Usage %"
                      strokeWidth={2}
                    />
                    {memoryData[0]?.value2 !== null && (
                      <Bar
                        yAxisId="right"
                        dataKey="value2"
                        fill="#10b981"
                        name="Used GB"
                        opacity={0.3}
                      />
                    )}
                    <ReferenceLine yAxisId="left" y={85} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                    <ReferenceLine yAxisId="left" y={70} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <MemoryStick className="h-16 w-16 mb-4 opacity-20" />
                  <p>No memory history data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Disk Chart */}
        <TabsContent value="disk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-orange-600" />
                Disk Usage History
              </CardTitle>
              <CardDescription>Storage utilization over time</CardDescription>
            </CardHeader>
            <CardContent>
              {diskData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={diskData}>
                    <defs>
                      <linearGradient id="diskGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#f59e0b"
                      fill="url(#diskGradient)"
                      name="Disk Usage %"
                      strokeWidth={2}
                    />
                    <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                    <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <HardDrive className="h-16 w-16 mb-4 opacity-20" />
                  <p>No disk history data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Chart */}
        <TabsContent value="network">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-purple-600" />
                Network Throughput History
              </CardTitle>
              <CardDescription>Data transfer rates and network activity</CardDescription>
            </CardHeader>
            <CardContent>
              {networkData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={networkData}>
                    <defs>
                      <linearGradient id="networkGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#8b5cf6"
                      fill="url(#networkGradient)"
                      name="Network Mbps"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <Network className="h-16 w-16 mb-4 opacity-20" />
                  <p>No network history data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Temperature Chart */}
        <TabsContent value="temperature">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-red-600" />
                CPU Temperature History
              </CardTitle>
              <CardDescription>Thermal performance monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              {temperatureData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={temperatureData}>
                    <defs>
                      <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#ef4444"
                      fill="url(#tempGradient)"
                      name="Temperature °C"
                      strokeWidth={2}
                    />
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                    <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
                  <Thermometer className="h-16 w-16 mb-4 opacity-20" />
                  <p>No temperature history data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Data Source Info */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-4 w-4" />
            <span>
              <strong>Data Sources:</strong> MongoDB (7-day history) • InfluxDB (90-day history) • 
              Grafana dashboards available • Auto-refresh every 30 seconds
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}