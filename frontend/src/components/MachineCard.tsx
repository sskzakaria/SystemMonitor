import { memo, useState } from 'react'
import type { MonitorData, HeartbeatMetrics } from '../types/monitor-schema'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { getStatusText } from '../lib/constants'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Checkbox } from './ui/checkbox'
import { Copy, User, Clock, AlertTriangle, Tag, Users, ArrowUp, ArrowDown, Shield } from 'lucide-react'
import { StatusBadge } from './ui/status-badge'
import { HealthBadge } from './ui/health-badge'
import { ResourceProgressBarWithSparkline } from './ResourceProgressBarWithSparkline'
import { MachineContextMenu } from './MachineContextMenu'

interface MachineCardProps {
  machine: MonitorData<HeartbeatMetrics>
  onClick: () => void
  selected?: boolean
  onSelect?: (selected: boolean) => void
  inMaintenanceMode?: boolean
}

// Keyboard shortcuts
const KEYBOARD_SHORTCUTS = {
  ENTER: 'Enter',
  SPACE: ' '
}

// Status styling helpers
function getStatusDotClasses(status: string) {
  const baseClasses = 'h-2 w-2 rounded-full flex-shrink-0'
  switch (status) {
    case 'online':
      return `${baseClasses} bg-green-500 animate-pulse-subtle`
    case 'offline':
      return `${baseClasses} bg-gray-400`
    case 'critical':
      return `${baseClasses} bg-red-500 animate-pulse`
    case 'warning':
      return `${baseClasses} bg-orange-500`
    default:
      return `${baseClasses} bg-gray-400`
  }
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case 'online':
      return 'bg-green-100 text-green-700 border-green-300'
    case 'in-use':
      return 'bg-purple-100 text-purple-700 border-purple-300'
    case 'idle':
      return 'bg-blue-100 text-blue-700 border-blue-300'
    case 'offline':
      return 'bg-gray-100 text-gray-700 border-gray-300'
    case 'maintenance':
      return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    case 'error':
      return 'bg-red-100 text-red-700 border-red-300'
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-300'
    case 'warning':
      return 'bg-orange-100 text-orange-700 border-orange-300'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-300'
  }
}

function getStatusDescription(status: string) {
  switch (status) {
    case 'online':
      return 'Machine is online and functioning normally'
    case 'in-use':
      return 'Machine is currently in use by a user'
    case 'idle':
      return 'Machine is online but idle'
    case 'offline':
      return 'Machine is offline or unreachable'
    case 'maintenance':
      return 'Machine is in maintenance mode'
    case 'error':
      return 'Machine has encountered an error'
    case 'critical':
      return 'Machine has critical issues requiring immediate attention'
    case 'warning':
      return 'Machine has warnings or potential issues'
    default:
      return 'Machine status unknown'
  }
}

function formatNetworkSpeed(mbps: number): string {
  if (mbps < 1) return `${(mbps * 1024).toFixed(0)} Kbps`
  return `${mbps.toFixed(1)} Mbps`
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  
  return parts.join(' ')
}

function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(dateObj, { addSuffix: true })
}

// Memoized component to prevent unnecessary re-renders
export const MachineCard = memo(function MachineCard({ 
  machine, 
  onClick, 
  selected = false, 
  onSelect,
  inMaintenanceMode = false 
}: MachineCardProps) {
  const { machine: info, metrics, health } = machine
  const [isHovered, setIsHovered] = useState(false)

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleCheckboxChange = (checked: boolean) => {
    onSelect?.(checked)
  }

  const handleCopyMachineId = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(info.machine_id).then(() => {
      toast.success(`Copied ${info.machine_id}`)
    }).catch(() => {
      toast.error('Failed to copy')
    })
  }

  // Determine status
  const getStatus = () => {
    // ✅ Check actual state value first - preserve exact status
    const state = metrics?.status?.state
    
    // 🔍 DEBUG: Log what status we see
    console.log('🔍 MachineCard getStatus for', info.machine_id, ':', {
      state,
      fullMetrics: metrics,
      health: health
    })
    
    // Return the actual state, not a simplified version
    if (state === 'offline') return 'offline'
    if (state === 'in-use') return 'in-use'
    if (state === 'idle') return 'idle'
    if (state === 'error' || state === 'maintenance') return state
    if (state === 'online') return 'online'
    
    // Only use health status if no explicit state
    if (health?.status === 'critical') return 'critical'
    if (health?.status === 'warning') return 'warning'
    
    return 'online'
  }

  const status = getStatus()
  const statusText = getStatusText(status)
  
  // 🔍 DEBUG: Log final status
  console.log('🔍 MachineCard final status for', info.machine_id, ':', status)

  // ARIA label for screen readers
  const ariaLabel = `Machine ${info.machine_id}, ${statusText}, ${info.building} Room ${info.room}, CPU ${(metrics?.resources?.cpu_usage_percent || 0).toFixed(0)}%, RAM ${(metrics?.resources?.memory_usage_percent || 0).toFixed(0)}%, Disk ${(metrics?.resources?.disk_usage_percent || 0).toFixed(0)}%${metrics?.user_activity?.current_username ? `, User: ${metrics.user_activity.current_username}` : ', No active user'}${health?.performance_grade ? `, Health grade ${health.performance_grade}` : ''}`

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEYBOARD_SHORTCUTS.ENTER || e.key === KEYBOARD_SHORTCUTS.SPACE) {
      e.preventDefault()
      onClick()
    }
    // Allow selection with 's' key when focused
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
      onSelect?.(!selected)
    }
  }

  return (
    <MachineContextMenu machine={machine} onViewDetails={onClick}>
      <Card 
        className={`
          machine-card cursor-pointer group relative
          ${selected ? 'machine-card-selected' : ''}
          animate-fade-in
          w-full
        `}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        aria-pressed={selected}
        aria-describedby={`machine-${info.machine_id}-status`}
      >
        {/* Selection Checkbox - Shows on hover or when selected */}
        {onSelect && (
          <div 
            className={`
              absolute top-2 left-2 z-10 transition-opacity duration-200
              ${isHovered || selected ? 'opacity-100' : 'opacity-0'}
            `}
            onClick={handleCheckboxClick}
          >
            <Checkbox 
              checked={selected}
              onCheckedChange={handleCheckboxChange}
              className="bg-white shadow-sm border-2"
            />
          </div>
        )}

        {/* Copy Button - Shows on hover */}
        {isHovered && (
          <button
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white shadow-md border border-gray-200 hover:bg-gray-50 transition-colors animate-fade-in"
            onClick={handleCopyMachineId}
            title="Copy Machine ID"
          >
            <Copy className="h-3.5 w-3.5 text-gray-600" />
          </button>
        )}
        
        <CardContent className="p-3 space-y-2.5">
          {/* === HEADER: STATUS DOT + MACHINE ID + STATUS BADGE + HEALTH GRADE === */}
          <div className="flex items-start justify-between gap-3">
            <div className={`flex-1 min-w-0 ${onSelect ? 'ml-7' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                {/* Status Dot with Pulse */}
                <div className={getStatusDotClasses(status)} />
                
                {/* Machine ID */}
                <h3 className="font-semibold text-sm group-hover:text-primary transition-smooth truncate">
                  {info.machine_id}
                </h3>
              </div>
              
              {/* Hostname */}
              <p className="text-xs text-muted-foreground font-mono truncate">
                {info.hostname}
              </p>
            </div>

            {/* Status Badge + Health Grade */}
            <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
              <StatusBadge 
                status={status as any}
                showIcon={false}
                size="sm"
              />
              
              {health.performance_grade && (
                <HealthBadge 
                  grade={health.performance_grade} 
                  score={health.score}
                  variant="compact"
                  size="sm"
                />
              )}
            </div>
          </div>

          {/* === LAST SEEN (for offline machines) === */}
          {status === 'offline' && metrics?.status?.last_heartbeat && (
            <div className="text-xs text-gray-500 flex items-center gap-1 pb-2.5 border-b border-gray-100">
              <Clock className="w-3 h-3" />
              Last seen {formatRelativeTime(metrics.status.last_heartbeat)}
            </div>
          )}

          {/* === LOCATION === */}
          <div className="text-xs text-muted-foreground border-b border-gray-100 pb-2.5">
            <span className="font-medium">
              {info.building && info.building !== 'Unknown' ? info.building : 'N/A'}
            </span>
            {' • '}
            <span>
              Room {info.room && info.room !== 'Unknown' ? info.room : 'N/A'}
            </span>
          </div>

          {/* === RESOURCE METRICS === */}
          <div className="space-y-2.5">
            {/* CPU Usage */}
            <ResourceProgressBarWithSparkline
              label="CPU"
              value={metrics?.resources?.cpu_usage_percent || 0}
              type="cpu"
              showPercentage
              showSparkline
              height="md"
            />

            {/* Memory Usage */}
            <ResourceProgressBarWithSparkline
              label="RAM"
              value={metrics?.resources?.memory_usage_percent || 0}
              type="memory"
              showPercentage
              showSparkline
              height="md"
            />

            {/* Disk Usage */}
            <ResourceProgressBarWithSparkline
              label="Disk"
              value={metrics?.resources?.disk_usage_percent || 0}
              type="disk"
              showPercentage
              showSparkline
              height="md"
            />
          </div>

          {/* === NETWORK STATS === */}
          {metrics?.network && ((metrics.network.upload_mbps || 0) > 0 || (metrics.network.download_mbps || 0) > 0) && (
            <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-blue-50/50 rounded-md border border-blue-100">
              <div className="flex items-center gap-1.5 text-blue-700">
                <ArrowUp className="h-3.5 w-3.5" />
                <span className="font-medium">{formatNetworkSpeed(metrics.network.upload_mbps || 0)}</span>
              </div>
              <div className="h-3 w-px bg-blue-200" />
              <div className="flex items-center gap-1.5 text-blue-700">
                <ArrowDown className="h-3.5 w-3.5" />
                <span className="font-medium">{formatNetworkSpeed(metrics.network.download_mbps || 0)}</span>
              </div>
            </div>
          )}

          {/* === USER SESSION & UPTIME === */}
          <div className="pt-2.5 border-t border-gray-100 space-y-1.5">
            {metrics?.user_activity?.current_username ? (
              <div className="flex items-center gap-2 text-xs">
                <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-gray-900 truncate">
                    {metrics.user_activity.current_username}
                  </span>
                  {/* ✅ Session Duration */}
                  {metrics.user_activity.session_duration_minutes && metrics.user_activity.session_duration_minutes > 0 && (
                    <span className="text-xs text-blue-600 font-medium">
                      ({formatDuration(metrics.user_activity.session_duration_minutes * 60)})
                    </span>
                  )}
                  {metrics.user_activity.login_location && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground truncate">
                        {metrics.user_activity.login_location}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span>No active user</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {metrics?.status?.state === 'active' ? 'Active' : 
                 metrics?.status?.state === 'idle' ? 'Idle' : 
                 metrics?.status?.state === 'offline' ? 'Offline' :
                 metrics?.status?.state}{' '}
                {metrics?.status?.state !== 'offline' && formatDuration(metrics?.system?.uptime_seconds || 0)}
              </span>
            </div>
          </div>

          {/* === WARNINGS (IF ANY) === */}
          {(health?.issues?.length || 0) > 0 && (
            <div className="pt-2.5 border-t border-gray-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground truncate-2-lines leading-relaxed">
                  {health.issues[0]}
                </p>
              </div>
            </div>
          )}

          {/* === SECURITY ALERTS & STATUS === */}
          {((metrics as any)?.alerts?.failed_login_count >= 3 || (metrics as any)?.security?.overall_status) && (
            <div className="pt-2.5 border-t border-gray-100 flex flex-wrap gap-1.5">
              {/* ✅ Failed Login Alert */}
              {(metrics as any)?.alerts?.failed_login_count >= 3 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {(metrics as any).alerts.failed_login_count} failed logins
                </Badge>
              )}

              {/* ✅ Security Status Badge */}
              {(metrics as any)?.security?.overall_status && (
                <Badge 
                  variant={
                    (metrics as any).security.overall_status === 'protected' ? 'default' :
                    (metrics as any).security.overall_status === 'at_risk' ? 'destructive' :
                    'secondary'
                  }
                  className="text-[10px] px-1.5 py-0.5 flex items-center gap-1"
                >
                  <Shield className="w-3 h-3" />
                  {(metrics as any).security.overall_status === 'protected' ? 'Protected' :
                   (metrics as any).security.overall_status === 'at_risk' ? 'At Risk' :
                   (metrics as any).security.overall_status === 'unknown' ? 'Unknown' :
                   (metrics as any).security.overall_status}
                </Badge>
              )}

              {/* Antivirus/Firewall indicators */}
              {(metrics as any)?.security?.antivirus_enabled === false && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-orange-300 text-orange-700">
                  No Antivirus
                </Badge>
              )}
              {(metrics as any)?.security?.firewall_enabled === false && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-orange-300 text-orange-700">
                  Firewall Off
                </Badge>
              )}
              {(metrics as any)?.security?.updates_pending > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-blue-300 text-blue-700">
                  {(metrics as any).security.updates_pending} updates
                </Badge>
              )}
            </div>
          )}

          {/* === TAGS & GROUPS === */}
          {((info.tags && info.tags.length > 0) || (info.groups && info.groups.length > 0)) && (
            <div className="pt-2.5 border-t border-gray-100 space-y-2">
              {/* Tags */}
              {info.tags && info.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="h-3 w-3 text-indigo-600 flex-shrink-0" />
                  {info.tags.slice(0, 3).map(tag => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {info.tags.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{info.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
              
              {/* Groups */}
              {info.groups && info.groups.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Users className="h-3 w-3 text-purple-600 flex-shrink-0" />
                  {info.groups.slice(0, 2).map(group => (
                    <Badge
                      key={group}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                    >
                      {group}
                    </Badge>
                  ))}
                  {info.groups.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{info.groups.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </MachineContextMenu>
  )
})