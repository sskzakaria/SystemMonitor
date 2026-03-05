import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { HeartbeatMetrics } from '../types/monitor-schema'
import { HistoricalChartsPanel } from './HistoricalChartsPanel'

interface PerformanceTabProps {
  metrics: HeartbeatMetrics
  machineId: string
}

export function PerformanceTab({ metrics, machineId }: PerformanceTabProps) {
  const { resources } = metrics

  return (
    <div className="space-y-6">
      {/* Current Resource Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current CPU</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resources.cpu_usage_percent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Temperature: {resources.cpu_temp_celsius || 'N/A'}°C</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resources.memory_usage_percent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              System memory
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Disk Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resources.disk_usage_percent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Storage utilization</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Network Throughput</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resources.network_throughput_mbps.toFixed(2)} Mbps</div>
            <p className="text-xs text-muted-foreground">Current throughput</p>
          </CardContent>
        </Card>
      </div>

      {/* Historical Performance Charts */}
      <HistoricalChartsPanel machineId={machineId} />
    </div>
  )
}