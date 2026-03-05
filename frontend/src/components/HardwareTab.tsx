import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Cpu, HardDrive, MemoryStick, Wifi, Thermometer } from 'lucide-react'
import type { SpecsMetrics, HardwareMetrics } from '../types/monitor-schema'
import { HardwareComparisonCard } from './HardwareComparisonCard'
import { HardwareComparison } from '../lib/hardware-comparison'
import { DiskPartitionsDisplay } from './DiskPartitionsDisplay'
import { extractDiskPartitions } from '../lib/backend-adapter'

interface HardwareTabProps {
  specs: SpecsMetrics | undefined
  hardware: HardwareMetrics | undefined
  comparison?: HardwareComparison | null
}

export function HardwareTab({ specs, hardware, comparison }: HardwareTabProps) {
  // Extract disk partitions from hardware or specs data
  // Backend transformer flattens storage.partitions → storage (array)
  // Also check for legacy storage.partitions structure for backwards compatibility
  const diskPartitions = 
    (hardware as any)?.partitions || 
    (specs as any)?.storage?.partitions ||  // Legacy nested structure
    (specs as any)?.storage ||              // Transformed flat array
    []

  if (!specs && !hardware) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">Hardware information not available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hardware Comparison */}
      {comparison && (
        <HardwareComparisonCard hardwareComparison={comparison} />
      )}

      {/* Current Hardware Metrics */}
      {hardware && (
        <Card>
          <CardHeader>
            <CardTitle>Current Hardware Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {hardware.cpu_usage_percent !== undefined && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="h-4 w-4 text-blue-600" />
                    <p className="text-xs text-muted-foreground">CPU Usage</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{hardware.cpu_usage_percent.toFixed(1)}%</p>
                </div>
              )}
              {hardware.cpu_temperature_c !== undefined && hardware.cpu_temperature_c !== null && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Thermometer className="h-4 w-4 text-red-600" />
                    <p className="text-xs text-muted-foreground">CPU Temperature</p>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{hardware.cpu_temperature_c}°C</p>
                </div>
              )}
              {hardware.memory_usage_percent !== undefined && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <MemoryStick className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Memory Usage</p>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{hardware.memory_usage_percent.toFixed(1)}%</p>
                  {hardware.memory_used_gb && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {hardware.memory_used_gb.toFixed(1)} GB used
                    </p>
                  )}
                </div>
              )}
              {hardware.disk_usage_percent !== undefined && (
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Disk Usage (Avg)</p>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">{hardware.disk_usage_percent.toFixed(1)}%</p>
                  {hardware.disk_used_gb && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {hardware.disk_used_gb.toFixed(1)} GB used
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disk Partitions - Enhanced Display */}
      {diskPartitions && diskPartitions.length > 0 && (
        <DiskPartitionsDisplay partitions={diskPartitions} showSummary={true} />
      )}

      {/* CPU Information */}
      {specs && (specs as any).cpu_model && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Cpu className="h-5 w-5" />
            <CardTitle>CPU Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Model</p>
                <p>{(specs as any).cpu_model}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cores</p>
                <p>{(specs as any).cpu_cores} cores ({(specs as any).cpu_threads} threads)</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Base Clock</p>
                <p>{(specs as any).cpu_base_clock_ghz} GHz</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Max Clock</p>
                <p>{(specs as any).cpu_max_clock_ghz} GHz</p>
              </div>
              {(specs as any).cpu_manufacturer && (
                <div>
                  <p className="text-sm text-muted-foreground">Manufacturer</p>
                  <p>{(specs as any).cpu_manufacturer}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory Information */}
      {specs && (specs as any).memory_total_gb && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <MemoryStick className="h-5 w-5" />
            <CardTitle>Memory Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Capacity</p>
                <p>{(specs as any).memory_total_gb} GB</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p>{(specs as any).memory_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Speed</p>
                <p>{(specs as any).memory_speed_mhz} MHz</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Information */}
      {specs && (specs as any).storage && (specs as any).storage.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <HardDrive className="h-5 w-5" />
            <CardTitle>Storage Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(specs as any).storage.map((device: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Device</p>
                      <p className="font-mono text-sm">{device.device}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Capacity</p>
                      <p>{device.total_gb} GB</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">File System</p>
                      <p>{device.fstype}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mountpoint</p>
                      <p className="font-mono text-sm">{device.mountpoint}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GPU Information */}
      {specs && (specs as any).gpu && (specs as any).gpu.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Cpu className="h-5 w-5" />
            <CardTitle>GPU Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(specs as any).gpu.map((gpu: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Model</p>
                      <p>{gpu.name}</p>
                    </div>
                    {gpu.vram_gb && (
                      <div>
                        <p className="text-sm text-muted-foreground">VRAM</p>
                        <p>{gpu.vram_gb} GB</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operating System Information */}
      {specs && (specs as any).os_name && (
        <Card>
          <CardHeader>
            <CardTitle>Operating System</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p>{(specs as any).os_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Version</p>
                <p>{(specs as any).os_version}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Build</p>
                <p>{(specs as any).os_build}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Architecture</p>
                <p>{(specs as any).os_architecture}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}