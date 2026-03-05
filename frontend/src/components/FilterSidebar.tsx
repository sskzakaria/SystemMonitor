import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { 
  Filter, 
  X, 
  ChevronDown, 
  ChevronUp,
  Cpu, 
  Activity, 
  HardDrive, 
  Users, 
  AlertTriangle,
  Zap,
  Check
} from 'lucide-react'
import { MonitorData, HeartbeatMetrics } from '../types/monitor-schema'

interface FilterSidebarProps {
  machines: MonitorData<HeartbeatMetrics>[]
  activePreset: string | null
  onApplyPreset: (preset: string) => void
  onClearAllFilters: () => void
  activeFiltersCount: number
}

export function FilterSidebar({
  machines,
  activePreset,
  onApplyPreset,
  onClearAllFilters,
  activeFiltersCount
}: FilterSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Calculate counts
  const counts = {
    highCpu: machines.filter(m => (m.metrics?.resources?.cpu_usage_percent || 0) > 80).length,
    highMemory: machines.filter(m => (m.metrics?.resources?.memory_usage_percent || 0) > 80).length,
    highDisk: machines.filter(m => (m.metrics?.resources?.disk_usage_percent || 0) > 80).length,
    withUsers: machines.filter(m => m.metrics?.user_activity?.current_username).length,
    idle: machines.filter(m => m.metrics?.status?.state === 'idle').length,
    issues: machines.filter(m => m.health?.status === 'warning' || m.health?.status === 'critical').length
  }

  const presets = [
    {
      id: 'high-cpu',
      label: 'High CPU',
      icon: Cpu,
      count: counts.highCpu,
      description: 'CPU usage > 80%',
      colorClass: 'text-red-600',
      bgClass: 'bg-red-50',
      hoverBg: 'hover:bg-red-100',
      activeBg: 'bg-red-500',
      borderClass: 'border-red-200',
      activeBorder: 'border-red-500'
    },
    {
      id: 'high-memory',
      label: 'High Memory',
      icon: Activity,
      count: counts.highMemory,
      description: 'RAM usage > 80%',
      colorClass: 'text-orange-600',
      bgClass: 'bg-orange-50',
      hoverBg: 'hover:bg-orange-100',
      activeBg: 'bg-orange-500',
      borderClass: 'border-orange-200',
      activeBorder: 'border-orange-500'
    },
    {
      id: 'high-disk',
      label: 'High Disk',
      icon: HardDrive,
      count: counts.highDisk,
      description: 'Disk usage > 80%',
      colorClass: 'text-yellow-600',
      bgClass: 'bg-yellow-50',
      hoverBg: 'hover:bg-yellow-100',
      activeBg: 'bg-yellow-500',
      borderClass: 'border-yellow-200',
      activeBorder: 'border-yellow-500'
    },
    {
      id: 'with-users',
      label: 'Active Users',
      icon: Users,
      count: counts.withUsers,
      description: 'Machines with logged-in users',
      colorClass: 'text-blue-600',
      bgClass: 'bg-blue-50',
      hoverBg: 'hover:bg-blue-100',
      activeBg: 'bg-blue-500',
      borderClass: 'border-blue-200',
      activeBorder: 'border-blue-500'
    },
    {
      id: 'idle',
      label: 'Idle Systems',
      icon: Zap,
      count: counts.idle,
      description: 'Systems in idle state',
      colorClass: 'text-purple-600',
      bgClass: 'bg-purple-50',
      hoverBg: 'hover:bg-purple-100',
      activeBg: 'bg-purple-500',
      borderClass: 'border-purple-200',
      activeBorder: 'border-purple-500'
    },
    {
      id: 'issues',
      label: 'All Issues',
      icon: AlertTriangle,
      count: counts.issues,
      description: 'Warning or critical status',
      colorClass: 'text-pink-600',
      bgClass: 'bg-pink-50',
      hoverBg: 'hover:bg-pink-100',
      activeBg: 'bg-pink-500',
      borderClass: 'border-pink-200',
      activeBorder: 'border-pink-500'
    }
  ]

  return (
    <div className="sticky top-6 h-fit w-[280px] filter-sidebar-desktop">
      <Card className="shadow-md border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Quick Filters</CardTitle>
              {activeFiltersCount > 0 && (
                <Badge variant="default" className="bg-primary text-white">
                  {activeFiltersCount}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse filters" : "Expand filters"}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 space-y-3">
            {/* Clear All Button */}
            {activeFiltersCount > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-xs"
                  onClick={onClearAllFilters}
                >
                  <span className="flex items-center gap-2">
                    <X className="h-3.5 w-3.5" />
                    Clear All Filters
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {activeFiltersCount}
                  </Badge>
                </Button>
                <Separator />
              </>
            )}

            {/* Filter Chips */}
            <div className="space-y-2">
              {presets.map((preset) => {
                const isActive = activePreset === preset.id
                const Icon = preset.icon

                return (
                  <button
                    key={preset.id}
                    onClick={() => onApplyPreset(preset.id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-lg border
                      transition-all duration-200
                      ${isActive 
                        ? `${preset.activeBg} ${preset.activeBorder} text-white shadow-md scale-[1.02]` 
                        : `${preset.bgClass} ${preset.borderClass} ${preset.hoverBg}`
                      }
                    `}
                  >
                    {/* Icon */}
                    <div className={`
                      flex-shrink-0 p-2 rounded-md
                      ${isActive ? 'bg-white/20' : 'bg-white'}
                    `}>
                      <Icon className={`
                        h-4 w-4
                        ${isActive ? 'text-white' : preset.colorClass}
                      `} />
                    </div>

                    {/* Label and Description */}
                    <div className="flex-1 text-left min-w-0">
                      <div className={`
                        text-sm font-semibold
                        ${isActive ? 'text-white' : 'text-gray-900'}
                      `}>
                        {preset.label}
                      </div>
                      <div className={`
                        text-xs
                        ${isActive ? 'text-white/90' : 'text-gray-500'}
                        truncate
                      `}>
                        {preset.description}
                      </div>
                    </div>

                    {/* Count Badge */}
                    <div className={`
                      flex-shrink-0 px-2 py-1 rounded-md text-xs font-bold min-w-[2rem] text-center
                      ${isActive 
                        ? 'bg-white/20 text-white' 
                        : `${preset.colorClass} ${preset.bgClass}`
                      }
                    `}>
                      {preset.count}
                    </div>

                    {/* Check Icon (Active State) */}
                    {isActive && (
                      <Check className="h-4 w-4 text-white flex-shrink-0 ml-1" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Info Text */}
            <div className="pt-2 text-xs text-muted-foreground">
              Click a filter to view matching machines
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}