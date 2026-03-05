import { useState, useEffect } from 'react'
import { Loader2, Database, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { getMachineAllHistory } from '../services/api'
import { toast } from 'sonner'
import { formatChartTimeLabel, calculateTimeGap, isOfflineByTimestamp } from '../lib/timezone-utils'
import { Badge } from './ui/badge'

type TimeWindow = '6h' | '24h' | '7d' | '30d'

interface HistoricalChartProps {
  machineId: string
}

export function HistoricalChart({ machineId }: HistoricalChartProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h')
  const [isLoading, setIsLoading] = useState(false)
  const [chartData, setChartData] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dataPointCount, setDataPointCount] = useState(0)

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        // Convert time window to hours
        const hours = 
          timeWindow === '6h' ? 6 :
          timeWindow === '24h' ? 24 :
          timeWindow === '7d' ? 168 :
          720 // 30 days
        
        // Call real backend API (now InfluxDB-backed!)
        const response = await getMachineAllHistory(machineId, hours)
        
        // Transform backend data to chart format
        if (response.history && response.history.length > 0) {
          const transformed = response.history.map((point: any, index: number, array: any[]) => {
            // Check if there's a gap before this point
            let hasGap = false
            if (index > 0) {
              const prevPoint = array[index - 1]
              const gap = calculateTimeGap(prevPoint.timestamp, point.timestamp)
              hasGap = gap.isSignificant
            }
            
            return {
              timestamp: point.timestamp,
              time: formatChartTimeLabel(point.timestamp, timeWindow),
              cpu_usage: point.cpu_usage_percent || 0,
              memory_usage: point.memory_usage_percent || 0,
              disk_usage: point.disk_usage_percent || 0,
              isGap: hasGap // Mark points that follow a gap
            }
          })
          
          setChartData(transformed)
          setDataPointCount(transformed.length)
          setError(null)
        } else {
          setChartData([])
          setDataPointCount(0)
          setError('No historical data available for this time window')
        }
      } catch (err) {
        const error = err as Error
        console.error('Failed to load historical data:', err)
        
        // Check if it's a connection error or InfluxDB not configured
        if (error.message?.includes('offline') || error.message?.includes('timeout')) {
          setError('Backend offline - unable to load historical data')
        } else {
          setError('InfluxDB not configured - using MongoDB (may be slower)')
        }
        
        setChartData([])
        setDataPointCount(0)
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHistory, 30000)
    return () => clearInterval(interval)
  }, [machineId, timeWindow])

  const timeWindowOptions: { value: TimeWindow; label: string }[] = [
    { value: '6h', label: '6 Hours' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' }
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Performance History</CardTitle>
            {dataPointCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {dataPointCount} data points
              </Badge>
            )}
          </div>
          <div className="flex gap-1.5">
            {timeWindowOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeWindow(option.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeWindow === option.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading historical data...</p>
            </div>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Line 
                type="monotone" 
                dataKey="cpu_usage" 
                stroke="#6366f1" 
                name="CPU %"
                strokeWidth={2}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="memory_usage" 
                stroke="#10b981" 
                name="Memory %"
                strokeWidth={2}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="disk_usage" 
                stroke="#f59e0b" 
                name="Disk %"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center">
            <Database className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No historical data available yet</p>
            <p className="text-xs text-muted-foreground">Backend collects metrics every 5 minutes</p>
          </div>
        )}
        
        {!isLoading && error && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-amber-900">
              <Info className="h-4 w-4 text-amber-600" />
              <span>{error}</span>
              <span className="ml-auto text-amber-700">Historical data collection in progress</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}