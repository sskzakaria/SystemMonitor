import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Monitor, BarChart3, Clock, Settings, RefreshCw, Download } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../lib/utils'
import { TimezoneNavBadge } from './TimezoneDisplay'

type ViewType = 'dashboard' | 'analytics' | 'timeline' | 'settings'

interface NavigationBarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  onRefresh: () => void
  onExportCSV: () => void
  autoRefreshEnabled: boolean
  onToggleAutoRefresh: () => void
  lastUpdated: Date
  criticalAlertsCount?: number
  isRefreshing?: boolean
  backendAvailable?: boolean
  wsConnected?: boolean
}

export function NavigationBar({
  currentView,
  onViewChange,
  onRefresh,
  onExportCSV,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  lastUpdated,
  criticalAlertsCount = 0,
  isRefreshing = false,
  backendAvailable = true,
  wsConnected = false
}: NavigationBarProps) {
  const formatLastUpdated = () => {
    return formatDistanceToNow(lastUpdated, { addSuffix: true })
  }

  const navItems: { id: ViewType; label: string; icon: typeof Monitor; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Monitor },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings }
  ]

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-[1800px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
              <Monitor className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">University Computer Monitoring</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className={cn(
                  "inline-block w-1 h-1 rounded-full animate-pulse",
                  backendAvailable ? "bg-green-500" : "bg-red-500"
                )} />
                {backendAvailable ? "Real-time Lab Management System" : "Backend Offline - Cached Data"}
              </p>
            </div>
          </div>

          {/* Center: Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {navItems.map(({ id, label, icon: Icon, badge }) => (
              <Button
                key={id}
                variant={currentView === id ? 'secondary' : 'ghost'}
                className={cn(
                  "gap-2 relative transition-all",
                  currentView === id && "shadow-md bg-white text-gray-900 hover:bg-white hover:text-gray-900"
                )}
                onClick={() => onViewChange(id)}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                    {badge}
                  </Badge>
                )}
              </Button>
            ))}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Timezone Display */}
            <TimezoneNavBadge />
            
            {/* Last Updated */}
            <div className="text-xs text-muted-foreground hidden lg:block px-3 py-1.5 bg-gray-50 rounded-md">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  autoRefreshEnabled ? "bg-green-500 animate-pulse" : "bg-gray-300"
                )} />
                <span>Updated {formatLastUpdated()}</span>
              </div>
            </div>

            {/* Auto-refresh Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleAutoRefresh}
              className={cn(
                "gap-2 transition-all",
                autoRefreshEnabled && "border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
              )}
            >
              <RefreshCw className={cn(
                "h-3.5 w-3.5",
                autoRefreshEnabled && "animate-spin-slow"
              )} />
              <span className="hidden sm:inline">
                {autoRefreshEnabled ? 'Auto ON' : 'Auto OFF'}
              </span>
            </Button>

            {/* Manual Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw className={cn(
                "h-3.5 w-3.5",
                isRefreshing && "animate-spin"
              )} />
              <span className="hidden sm:inline">
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </Button>

            {/* Export CSV */}
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCSV}
              className="gap-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            {/* Critical Alerts Badge */}
            {criticalAlertsCount > 0 && (
              <Badge variant="destructive" className="animate-pulse shadow-lg">
                {criticalAlertsCount} Critical
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}