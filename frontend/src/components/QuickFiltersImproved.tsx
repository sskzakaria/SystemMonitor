import { useMemo } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Zap, Cpu, HardDrive, Users, AlertTriangle, Activity } from 'lucide-react'
import { MonitorData, HeartbeatMetrics } from '../types/monitor-schema'

interface QuickFiltersImprovedProps {
  machines: MonitorData<HeartbeatMetrics>[]
  activePreset: string | null
  onApplyPreset: (preset: string) => void
  onClearPreset: () => void
}

export function QuickFiltersImproved({ 
  machines, 
  activePreset, 
  onApplyPreset,
  onClearPreset 
}: QuickFiltersImprovedProps) {
  // Calculate counts for each filter
  const counts = useMemo(() => {
    return {
      highCpu: machines.filter(m => m.metrics.resources.cpu_usage_percent > 80).length,
      highMemory: machines.filter(m => m.metrics.resources.memory_usage_percent > 80).length,
      highDisk: machines.filter(m => m.metrics.resources.disk_usage_percent > 80).length,
      withUsers: machines.filter(m => m.metrics.user_activity.current_username).length,
      idle: machines.filter(m => m.metrics.status.state === 'idle').length,
      issues: machines.filter(m => m.health.status === 'warning' || m.health.status === 'critical').length
    }
  }, [machines])

  const presets = [
    {
      id: 'high-cpu',
      label: 'High CPU',
      icon: Cpu,
      count: counts.highCpu,
      color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700',
      activeColor: 'bg-red-500 text-white border-red-600 shadow-md'
    },
    {
      id: 'high-memory',
      label: 'High Memory',
      icon: Activity,
      count: counts.highMemory,
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700',
      activeColor: 'bg-orange-500 text-white border-orange-600 shadow-md'
    },
    {
      id: 'high-disk',
      label: 'High Disk',
      icon: HardDrive,
      count: counts.highDisk,
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-700',
      activeColor: 'bg-yellow-500 text-white border-yellow-600 shadow-md'
    },
    {
      id: 'with-users',
      label: 'Active Users',
      icon: Users,
      count: counts.withUsers,
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700',
      activeColor: 'bg-blue-500 text-white border-blue-600 shadow-md'
    },
    {
      id: 'idle',
      label: 'Idle Systems',
      icon: Zap,
      count: counts.idle,
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700',
      activeColor: 'bg-purple-500 text-white border-purple-600 shadow-md'
    },
    {
      id: 'issues',
      label: 'All Issues',
      icon: AlertTriangle,
      count: counts.issues,
      color: 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-700',
      activeColor: 'bg-pink-500 text-white border-pink-600 shadow-md'
    }
  ]

  const handlePresetClick = (presetId: string) => {
    if (activePreset === presetId) {
      onClearPreset()
    } else {
      onApplyPreset(presetId)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-indigo-600" />
          <h3 className="font-medium text-sm">Quick Filters</h3>
          {activePreset && (
            <Badge variant="outline" className="text-xs">
              Active
            </Badge>
          )}
        </div>
        {activePreset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearPreset}
            className="h-6 text-xs px-2"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map(preset => {
          const Icon = preset.icon
          const isActive = activePreset === preset.id

          return (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset.id)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border 
                transition-all duration-200 font-medium text-xs
                ${isActive ? preset.activeColor : preset.color}
                ${!isActive && 'hover:scale-105'}
                ${isActive && 'ring-2 ring-offset-1'}
                ${isActive && preset.id === 'high-cpu' && 'ring-red-500'}
                ${isActive && preset.id === 'high-memory' && 'ring-orange-500'}
                ${isActive && preset.id === 'high-disk' && 'ring-yellow-500'}
                ${isActive && preset.id === 'with-users' && 'ring-blue-500'}
                ${isActive && preset.id === 'idle' && 'ring-purple-500'}
                ${isActive && preset.id === 'issues' && 'ring-pink-500'}
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{preset.label}</span>
              <Badge 
                variant={isActive ? "secondary" : "outline"}
                className={`
                  ${isActive ? 'bg-white/20 text-white border-white/30' : ''}
                `}
              >
                {preset.count}
              </Badge>
            </button>
          )
        })}
      </div>
    </div>
  )
}