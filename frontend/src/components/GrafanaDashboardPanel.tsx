import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Activity, ExternalLink, RefreshCw, Settings, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface GrafanaDashboardPanelProps {
  dashboardUid: string
  dashboardTitle: string
  hostname?: string // For machine-specific dashboards
  building?: string // For filtered fleet views
  timeRange?: {
    from: string // e.g. "now-6h"
    to: string // e.g. "now"
  }
  refresh?: string // e.g. "5s", "30s", "1m"
  height?: number
  theme?: 'light' | 'dark'
}

export function GrafanaDashboardPanel({
  dashboardUid,
  dashboardTitle,
  hostname,
  building,
  timeRange = { from: 'now-1h', to: 'now' },
  refresh = '5s',
  height = 600,
  theme = 'light'
}: GrafanaDashboardPanelProps) {
  const [grafanaUrl, setGrafanaUrl] = useState<string>('')
  const [grafanaEnabled, setGrafanaEnabled] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState<number>(0)

  // Load Grafana settings from localStorage
  useEffect(() => {
    loadGrafanaSettings()
  }, [])

  const loadGrafanaSettings = () => {
    try {
      const settings = localStorage.getItem('grafana_settings')
      if (settings) {
        const parsed = JSON.parse(settings)
        setGrafanaUrl(parsed.url || 'http://localhost:3000')
        setGrafanaEnabled(parsed.enabled || false)
      } else {
        // Default settings
        setGrafanaUrl('http://localhost:3000')
        setGrafanaEnabled(false)
      }
      setIsLoading(false)
    } catch (error) {
      console.error('Failed to load Grafana settings:', error)
      setError('Failed to load Grafana settings')
      setIsLoading(false)
    }
  }

  const handleRefresh = () => {
    // Force iframe reload by changing key
    setIframeKey(prev => prev + 1)
    toast.success('Dashboard refreshed')
  }

  const handleOpenInGrafana = () => {
    const url = buildGrafanaUrl(false)
    window.open(url, '_blank')
  }

  const buildGrafanaUrl = (embed: boolean = true): string => {
    if (!grafanaUrl) return ''

    // Build URL with parameters
    let url = `${grafanaUrl}/d/${dashboardUid}`
    
    const params = new URLSearchParams()
    
    // Time range
    params.append('from', timeRange.from)
    params.append('to', timeRange.to)
    
    // Refresh interval
    params.append('refresh', refresh)
    
    // Theme
    params.append('theme', theme)
    
    // Variables (for machine-specific dashboards)
    if (hostname) {
      params.append('var-hostname', hostname)
    }
    if (building) {
      params.append('var-building', building)
    }
    
    // Kiosk mode for embedding (removes top nav)
    if (embed) {
      params.append('kiosk', 'tv')
    }
    
    return `${url}?${params.toString()}`
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Loading Grafana Dashboard...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center space-y-2">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="text-sm text-gray-500">Loading dashboard...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!grafanaEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Grafana Not Enabled
          </CardTitle>
          <CardDescription>
            Enable Grafana integration to view real-time dashboards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900">
                Grafana provides advanced real-time visualization of your hardware metrics stored in InfluxDB.
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm">To enable Grafana:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Go to Settings → Integrations</li>
                <li>Enable Grafana and enter your Grafana URL</li>
                <li>Configure InfluxDB as a datasource in Grafana</li>
                <li>Import the dashboard JSON files from <code className="bg-gray-100 px-1 rounded">/grafana-dashboards/</code></li>
              </ol>
            </div>

            <Button
              onClick={() => window.location.href = '/#settings'}
              className="w-full"
            >
              <Settings className="h-4 w-4 mr-2" />
              Go to Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Grafana Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-900">{error}</p>
          </div>
          <Button
            onClick={loadGrafanaSettings}
            variant="outline"
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const embedUrl = buildGrafanaUrl(true)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle>{dashboardTitle}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  Live: {refresh}
                </Badge>
                {hostname && (
                  <Badge variant="secondary" className="text-xs">
                    {hostname}
                  </Badge>
                )}
                {building && (
                  <Badge variant="secondary" className="text-xs">
                    {building}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleOpenInGrafana}
              variant="outline"
              size="sm"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div 
          className="rounded-lg overflow-hidden border border-gray-200"
          style={{ height: `${height}px` }}
        >
          <iframe
            key={iframeKey}
            src={embedUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            title={dashboardTitle}
            allow="fullscreen"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            onError={() => {
              setError('Failed to load Grafana dashboard. Check your Grafana URL and network connection.')
            }}
          />
        </div>
        
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            Powered by Grafana + InfluxDB
          </span>
          <span>
            Time Range: {timeRange.from} to {timeRange.to}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}