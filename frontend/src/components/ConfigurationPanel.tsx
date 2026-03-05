import React, { useState, useEffect } from 'react'
import { Settings, Database, BarChart3, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { toast } from 'sonner'

interface InfluxDBSettings {
  url: string
  token: string
  org: string
  bucket: string
}

interface GrafanaSettings {
  url: string
  api_key?: string
  username?: string
  password?: string
}

export function ConfigurationPanel() {
  const [activeTab, setActiveTab] = useState<'influxdb' | 'grafana'>('influxdb')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    details?: any
  } | null>(null)

  // InfluxDB State
  const [influxSettings, setInfluxSettings] = useState<InfluxDBSettings>({
    url: 'http://localhost:8086',
    token: '',
    org: 'university',
    bucket: 'hardware_metrics'
  })
  const [influxEnabled, setInfluxEnabled] = useState(false)

  // Grafana State
  const [grafanaSettings, setGrafanaSettings] = useState<GrafanaSettings>({
    url: 'http://localhost:3000',
    api_key: '',
    username: '',
    password: ''
  })
  const [grafanaEnabled, setGrafanaEnabled] = useState(false)
  const [grafanaAuthMethod, setGrafanaAuthMethod] = useState<'api_key' | 'basic'>('api_key')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      // Load InfluxDB config
      const influxResponse = await fetch('http://localhost:8001/api/config/settings?config_type=influxdb')
      if (influxResponse.ok) {
        const influxData = await influxResponse.json()
        setInfluxDBConfig({
          url: influxData.url || '',
          token: influxData.token || '',
          org: influxData.org || '',
          bucket: influxData.bucket || '',
        })
      }

      // Load Grafana config
      const grafanaResponse = await fetch('http://localhost:8001/api/config/settings?config_type=grafana')
      if (grafanaResponse.ok) {
        const grafanaData = await grafanaResponse.json()
        setGrafanaConfig({
          url: grafanaData.url || '',
          apiKey: grafanaData.api_key || '',
        })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const testInfluxDB = async () => {
    setInfluxDBTesting(true)

    try {
      const response = await fetch('http://localhost:8001/api/config/influxdb/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(influxSettings)
      })

      const result = await response.json()
      setTestResult(result)

      if (result.success) {
        toast.success('InfluxDB connection successful!', {
          description: result.message
        })
      } else {
        toast.error('InfluxDB connection failed', {
          description: result.message
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      setTestResult({
        success: false,
        message: errorMessage
      })
      toast.error('Connection test failed', {
        description: errorMessage
      })
    } finally {
      setInfluxDBTesting(false)
    }
  }

  const testGrafanaConnection = async () => {
    setLoading(true)
    setTestResult(null)

    try {
      const settings = {
        ...grafanaSettings,
        ...(grafanaAuthMethod === 'api_key' 
          ? { username: undefined, password: undefined }
          : { api_key: undefined })
      }

      const response = await fetch('http://localhost:8001/api/config/grafana/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      const result = await response.json()
      setTestResult(result)

      if (result.success) {
        toast.success('Grafana connection successful!', {
          description: result.message
        })
      } else {
        toast.error('Grafana connection failed', {
          description: result.message
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      setTestResult({
        success: false,
        message: errorMessage
      })
      toast.error('Connection test failed', {
        description: errorMessage
      })
    } finally {
      setLoading(false)
    }
  }

  const saveInfluxDBConfig = async () => {
    try {
      const response = await fetch('http://localhost:8001/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_type: 'influxdb',
          enabled: influxEnabled,
          settings: influxSettings
        })
      })

      if (response.ok) {
        toast.success('InfluxDB configuration saved!', {
          description: 'Configuration has been updated successfully'
        })
      } else {
        throw new Error('Failed to save configuration')
      }
    } catch (error) {
      toast.error('Failed to save configuration', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const saveGrafanaConfig = async () => {
    try {
      const settings = {
        ...grafanaSettings,
        ...(grafanaAuthMethod === 'api_key' 
          ? { username: undefined, password: undefined }
          : { api_key: undefined })
      }

      const response = await fetch('http://localhost:8001/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_type: 'grafana',
          enabled: grafanaEnabled,
          settings
        })
      })

      if (response.ok) {
        toast.success('Grafana configuration saved!', {
          description: 'Configuration has been updated successfully'
        })
      } else {
        throw new Error('Failed to save configuration')
      }
    } catch (error) {
      toast.error('Failed to save configuration', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-bold">System Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Configure external integrations and data storage
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => {
            setActiveTab('influxdb')
            setTestResult(null)
          }}
          className={`px-4 py-2 flex items-center gap-2 transition-colors ${
            activeTab === 'influxdb'
              ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="h-4 w-4" />
          InfluxDB
        </button>
        <button
          onClick={() => {
            setActiveTab('grafana')
            setTestResult(null)
          }}
          className={`px-4 py-2 flex items-center gap-2 transition-colors ${
            activeTab === 'grafana'
              ? 'border-b-2 border-orange-600 text-orange-600 font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Grafana
        </button>
      </div>

      {/* InfluxDB Configuration */}
      {activeTab === 'influxdb' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                InfluxDB Configuration
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Enabled</label>
                <input
                  type="checkbox"
                  checked={influxEnabled}
                  onChange={(e) => setInfluxEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">InfluxDB URL</label>
              <input
                type="text"
                value={influxSettings.url}
                onChange={(e) => setInfluxSettings({ ...influxSettings, url: e.target.value })}
                placeholder="http://localhost:8086"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Organization</label>
              <input
                type="text"
                value={influxSettings.org}
                onChange={(e) => setInfluxSettings({ ...influxSettings, org: e.target.value })}
                placeholder="university"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Bucket</label>
              <input
                type="text"
                value={influxSettings.bucket}
                onChange={(e) => setInfluxSettings({ ...influxSettings, bucket: e.target.value })}
                placeholder="hardware_metrics"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Token</label>
              <input
                type="password"
                value={influxSettings.token}
                onChange={(e) => setInfluxSettings({ ...influxSettings, token: e.target.value })}
                placeholder="Your InfluxDB API token"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      testResult.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {testResult.message}
                    </p>
                    {testResult.details && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {Object.entries(testResult.details).map(([key, value]) => (
                          <p key={key}>
                            <strong>{key}:</strong> {String(value)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={testInfluxDBConnection}
                disabled={loading || !influxSettings.token}
                className="gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button
                onClick={saveInfluxDBConfig}
                variant="default"
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grafana Configuration */}
      {activeTab === 'grafana' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-600" />
                Grafana Configuration
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Enabled</label>
                <input
                  type="checkbox"
                  checked={grafanaEnabled}
                  onChange={(e) => setGrafanaEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Grafana URL</label>
              <input
                type="text"
                value={grafanaSettings.url}
                onChange={(e) => setGrafanaSettings({ ...grafanaSettings, url: e.target.value })}
                placeholder="http://localhost:3000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Authentication Method</label>
              <div className="flex gap-2">
                <Button
                  variant={grafanaAuthMethod === 'api_key' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGrafanaAuthMethod('api_key')}
                >
                  API Key
                </Button>
                <Button
                  variant={grafanaAuthMethod === 'basic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGrafanaAuthMethod('basic')}
                >
                  Username/Password
                </Button>
              </div>
            </div>

            {grafanaAuthMethod === 'api_key' ? (
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="password"
                  value={grafanaSettings.api_key || ''}
                  onChange={(e) => setGrafanaSettings({ ...grafanaSettings, api_key: e.target.value })}
                  placeholder="Your Grafana API key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Username</label>
                  <input
                    type="text"
                    value={grafanaSettings.username || ''}
                    onChange={(e) => setGrafanaSettings({ ...grafanaSettings, username: e.target.value })}
                    placeholder="admin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={grafanaSettings.password || ''}
                    onChange={(e) => setGrafanaSettings({ ...grafanaSettings, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </>
            )}

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      testResult.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {testResult.message}
                    </p>
                    {testResult.details && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {Object.entries(testResult.details).map(([key, value]) => (
                          <p key={key}>
                            <strong>{key}:</strong> {String(value)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={testGrafanaConnection}
                disabled={loading}
                className="gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button
                onClick={saveGrafanaConfig}
                variant="default"
                className="gap-2 bg-orange-600 hover:bg-orange-700"
              >
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-2">Configuration Tips:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Always test your connection before saving</li>
                <li>InfluxDB is used for storing time-series metrics data</li>
                <li>Grafana provides advanced visualization dashboards</li>
                <li>Both services are optional and can be enabled independently</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}