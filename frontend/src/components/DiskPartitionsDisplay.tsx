import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { HardDrive, AlertTriangle, CheckCircle } from 'lucide-react'
import { getDiskSummary, formatDiskCapacity, getDiskUsageColor, getDiskUsageBgColor, type DiskPartition } from '../lib/disk-utils'

interface DiskPartitionsDisplayProps {
  partitions: DiskPartition[]
  showSummary?: boolean
  compact?: boolean
}

export function DiskPartitionsDisplay({ partitions, showSummary = true, compact = false }: DiskPartitionsDisplayProps) {
  if (!partitions || partitions.length === 0) {
    return null
  }

  const summary = getDiskSummary(partitions)

  if (compact) {
    // Compact view - just show the weighted average
    return (
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">
          <span className={getDiskUsageColor(summary.weighted_average_usage_percent)}>
            {summary.weighted_average_usage_percent.toFixed(1)}%
          </span>
          <span className="text-muted-foreground ml-1">
            ({formatDiskCapacity(summary.total_used_gb)} / {formatDiskCapacity(summary.total_capacity_gb)})
          </span>
        </span>
        {summary.critical_partitions.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {summary.critical_partitions.length} critical
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Disk Partitions
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {partitions.length} partition{partitions.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {showSummary && (
          <div className={`p-4 rounded-lg ${getDiskUsageBgColor(summary.weighted_average_usage_percent)}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Disk Usage</span>
              <span className={`text-lg font-bold ${getDiskUsageColor(summary.weighted_average_usage_percent)}`}>
                {summary.weighted_average_usage_percent.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={summary.weighted_average_usage_percent} 
              className="h-2 mb-2"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDiskCapacity(summary.total_used_gb)} used</span>
              <span>{formatDiskCapacity(summary.total_free_gb)} free</span>
              <span>{formatDiskCapacity(summary.total_capacity_gb)} total</span>
            </div>
          </div>
        )}

        {/* Individual Partitions */}
        <div className="space-y-3">
          {summary.partitions.map((partition, index) => {
            const isCritical = partition.usage_percent > 90
            const isWarning = partition.usage_percent > 80 && partition.usage_percent <= 90
            const isPrimary = partition.mountpoint === summary.primary_partition?.mountpoint

            return (
              <div 
                key={index} 
                className={`border rounded-lg p-3 ${
                  isCritical ? 'border-red-300 bg-red-50' :
                  isWarning ? 'border-orange-300 bg-orange-50' :
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      {partition.device}
                    </span>
                    {isPrimary && (
                      <Badge variant="outline" className="text-xs">
                        Primary
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {partition.fstype}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${getDiskUsageColor(partition.usage_percent)}`}>
                      {partition.usage_percent.toFixed(1)}%
                    </span>
                    {isCritical ? (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    ) : isWarning ? (
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>

                <Progress 
                  value={partition.usage_percent} 
                  className="h-1.5 mb-2"
                />

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Mountpoint:</span>
                    <span className="font-mono ml-1">{partition.mountpoint}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Capacity:</span>
                    <span className="ml-1">{formatDiskCapacity(partition.total_gb)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Used:</span>
                    <span className="ml-1">{formatDiskCapacity(partition.used_gb)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Free:</span>
                    <span className="ml-1">{formatDiskCapacity(partition.free_gb)}</span>
                  </div>
                </div>

                {isCritical && (
                  <div className="mt-2 text-xs text-red-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Critical: Disk usage above 90%
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Warnings */}
        {summary.critical_partitions.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="font-medium">
                {summary.critical_partitions.length} partition{summary.critical_partitions.length !== 1 ? 's' : ''} critically low on space
              </span>
            </div>
            <p className="text-xs text-red-700 mt-1">
              Recommended action: Free up disk space or expand storage capacity
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
