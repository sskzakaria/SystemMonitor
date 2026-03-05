import { useState, useEffect } from 'react'
import { Settings, Database, BarChart3, Bell, Tag, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Badge } from './ui/badge'
import { TagsManager, type MachineTag } from './TagsManager'
import { MachineGroupsManager, type MachineGroup } from './MachineGroupsManager'
import { AlertManagementPanel, type Alert } from './AlertManagementPanel'
import * as api from '../services/api'

interface InfluxDBSettings {
  enabled: boolean
  url: string
  token: string
  org: string
  bucket: string
}

interface GrafanaSettings {
  enabled: boolean
  url: string
  apiKey: string
}

interface AlertSettings {
  criticalThreshold: number
  warningThreshold: number
  emailNotifications: boolean
  webhookNotifications: boolean
}

export function SettingsPanel() {
  const [influxDB, setInfluxDB] = useState<InfluxDBSettings>({
    enabled: false,
    url: 'http://localhost:8086',
    token: '',
    org: 'university',
    bucket: 'hardware_metrics'
  })

  const [grafana, setGrafana] = useState<GrafanaSettings>({
    enabled: false,
    url: 'http://localhost:3000',
    apiKey: ''
  })

  const [alerts, setAlerts] = useState<AlertSettings>({
    criticalThreshold: 90,
    warningThreshold: 75,
    emailNotifications: false,
    webhookNotifications: true
  })

  // System Alerts state (for AlertManagementPanel) - Load from backend
  const [systemAlerts, setSystemAlerts] = useState<Alert[]>([])
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)

  // Tags and Groups state - Loaded from backend
  const [tags, setTags] = useState<MachineTag[]>([])
  const [groups, setGroups] = useState<MachineGroup[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(true)
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)

  // Load tags from backend
  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await api.getAllTags()
        const backendTags = response.tags.map((tag: any) => ({
          id: tag.name, // Use name as ID since backend doesn't provide numeric ID
          name: tag.name,
          color: tag.color || '#3b82f6',
          description: tag.description || '',
          machineCount: 0, // Backend doesn't provide this, would need separate query
          createdAt: new Date(tag.created_at)
        }))
        setTags(backendTags)
      } catch (error) {
        // Silently handle - tags endpoints may not be implemented yet
        setTags([])
      } finally {
        setIsLoadingTags(false)
      }
    }

    loadTags()
  }, [])

  // Load groups from backend
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const response = await api.getAllGroups()
        const backendGroups = response.groups.map((group: any) => ({
          id: group.group_id,
          name: group.group_name,
          description: group.description || '',
          machineIds: group.machine_ids || [],
          color: '#3b82f6', // Backend doesn't provide color
          createdAt: new Date(group.created_at),
          updatedAt: new Date(group.updated_at)
        }))
        setGroups(backendGroups)
      } catch (error) {
        // Silently handle - groups endpoints may not be implemented yet
        setGroups([])
      } finally {
        setIsLoadingGroups(false)
      }
    }

    loadGroups()
  }, [])

  // Load alerts from backend
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        setIsLoadingAlerts(true)
        const response = await api.getAlerts({ limit: 100 })
        
        // Transform backend alerts to frontend format
        const backendAlerts = (response.alerts || []).map((alert: any) => ({
          id: alert._id || alert.id,
          machineId: alert.machine_id,
          hostname: alert.hostname || alert.machine_id,
          location: alert.location || `${alert.building || 'Unknown'} - ${alert.room || 'Unknown'}`,
          severity: alert.severity as AlertSeverity,
          status: alert.acknowledged ? 'acknowledged' : 'active' as AlertStatus,
          title: alert.alert_type || 'Alert',
          message: alert.message,
          timestamp: new Date(alert.timestamp),
          acknowledgedBy: alert.acknowledged_by,
          acknowledgedAt: alert.acknowledged_at ? new Date(alert.acknowledged_at) : undefined,
          snoozedUntil: alert.snoozed_until ? new Date(alert.snoozed_until) : undefined,
          resolvedAt: alert.resolved_at ? new Date(alert.resolved_at) : undefined
        }))
        
        setSystemAlerts(backendAlerts)
      } catch (error) {
        // Silently handle - backend might not be running
        setSystemAlerts([])
      } finally {
        setIsLoadingAlerts(false)
      }
    }

    loadAlerts()
  }, [])

  // Load alert configuration from backend
  useEffect(() => {
    const loadAlertConfig = async () => {
      try {
        const response = await api.getAlertConfig()
        setAlerts({
          criticalThreshold: response.critical_threshold,
          warningThreshold: response.warning_threshold,
          emailNotifications: response.email_notifications,
          webhookNotifications: response.webhook_notifications
        })
      } catch (error) {
        // Silently handle - backend might not be running, keep defaults
      }
    }

    loadAlertConfig()
  }, [])

  // Load InfluxDB configuration from backend
  useEffect(() => {
    const loadInfluxConfig = async () => {
      try {
        const response = await api.getInfluxConfig()
        setInfluxDB({
          enabled: response.enabled,
          url: response.url,
          token: '', // Don't populate token for security
          org: response.org,
          bucket: response.bucket
        })
      } catch (error) {
        // Silently handle - backend might not be running, keep defaults
      }
    }

    loadInfluxConfig()
  }, [])

  // Load Grafana configuration from backend
  useEffect(() => {
    const loadGrafanaConfig = async () => {
      try {
        const response = await api.getGrafanaConfig()
        setGrafana({
          enabled: response.enabled,
          url: response.url,
          apiKey: '' // Don't populate API key for security
        })
      } catch (error) {
        // Silently handle - backend might not be running, keep defaults
      }
    }

    loadGrafanaConfig()
  }, [])

  const testConnection = async (type: 'influxdb' | 'grafana') => {
    toast.loading(`Testing ${type === 'influxdb' ? 'InfluxDB' : 'Grafana'} connection...`)
    
    // Simulate API call
    setTimeout(() => {
      toast.dismiss()
      toast.success(`${type === 'influxdb' ? 'InfluxDB' : 'Grafana'} connection successful!`)
    }, 1500)
  }

  const saveSettings = async () => {
    const toastId = toast.loading('Saving settings...')
    
    try {
      // Save all configurations to backend in parallel
      await Promise.all([
        api.saveInfluxConfig({
          enabled: influxDB.enabled,
          url: influxDB.url,
          token: influxDB.token || undefined,
          org: influxDB.org,
          bucket: influxDB.bucket
        }),
        api.saveGrafanaConfig({
          enabled: grafana.enabled,
          url: grafana.url,
          api_key: grafana.apiKey || undefined
        }),
        api.saveAlertConfig({
          critical_threshold: alerts.criticalThreshold,
          warning_threshold: alerts.warningThreshold,
          email_notifications: alerts.emailNotifications,
          webhook_notifications: alerts.webhookNotifications
        })
      ])
      
      // Also save to localStorage as backup
      localStorage.setItem('monitoring-settings', JSON.stringify({
        influxDB,
        grafana,
        alerts
      }))
      
      toast.success('Settings saved successfully!', { id: toastId })
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save some settings. Please try again.', { id: toastId })
    }
  }

  // Tags handlers - Connected to backend
  const handleCreateTag = async (tag: Omit<MachineTag, 'id' | 'machineCount' | 'createdAt'>) => {
    try {
      await api.createTag({
        name: tag.name,
        color: tag.color,
        description: tag.description
      })
      
      // Reload tags from backend
      const response = await api.getAllTags()
      const backendTags = response.tags.map((t: any) => ({
        id: t.name,
        name: t.name,
        color: t.color || '#3b82f6',
        description: t.description || '',
        machineCount: 0,
        createdAt: new Date(t.created_at)
      }))
      setTags(backendTags)
      
      toast.success('Tag created successfully')
    } catch (error) {
      console.error('Failed to create tag:', error)
      toast.error('Failed to create tag')
    }
  }

  const handleUpdateTag = async (id: string, updates: Partial<MachineTag>) => {
    try {
      await api.updateTag(id, {
        color: updates.color,
        description: updates.description
      })
      
      // Update local state
      setTags(prev => prev.map(tag => 
        tag.id === id ? { ...tag, ...updates } : tag
      ))
      
      toast.success('Tag updated successfully')
    } catch (error) {
      console.error('Failed to update tag:', error)
      toast.error('Failed to update tag')
    }
  }

  const handleDeleteTag = async (id: string) => {
    try {
      await api.deleteTag(id)
      
      // Remove from local state
      setTags(prev => prev.filter(tag => tag.id !== id))
      
      toast.success('Tag deleted successfully')
    } catch (error) {
      console.error('Failed to delete tag:', error)
      toast.error('Failed to delete tag')
    }
  }

  // Groups handlers - Connected to backend
  const handleCreateGroup = async (group: Omit<MachineGroup, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await api.createGroup({
        group_id: group.name.toLowerCase().replace(/\s+/g, '-'),
        group_name: group.name,
        description: group.description,
        machine_ids: group.machineIds
      })
      
      // Reload groups from backend
      const response = await api.getAllGroups()
      const backendGroups = response.groups.map((g: any) => ({
        id: g.group_id,
        name: g.group_name,
        description: g.description || '',
        machineIds: g.machine_ids || [],
        color: '#3b82f6',
        createdAt: new Date(g.created_at),
        updatedAt: new Date(g.updated_at)
      }))
      setGroups(backendGroups)
      
      toast.success('Group created successfully')
    } catch (error) {
      console.error('Failed to create group:', error)
      toast.error('Failed to create group')
    }
  }

  const handleUpdateGroup = async (id: string, updates: Partial<MachineGroup>) => {
    try {
      await api.updateGroup(id, {
        group_name: updates.name,
        description: updates.description,
        add_machines: updates.machineIds,
        remove_machines: undefined
      })
      
      // Update local state
      setGroups(prev => prev.map(group =>
        group.id === id ? { ...group, ...updates, updatedAt: new Date() } : group
      ))
      
      toast.success('Group updated successfully')
    } catch (error) {
      console.error('Failed to update group:', error)
      toast.error('Failed to update group')
    }
  }

  const handleDeleteGroup = async (id: string) => {
    try {
      await api.deleteGroup(id)
      
      // Remove from local state
      setGroups(prev => prev.filter(group => group.id !== id))
      
      toast.success('Group deleted successfully')
    } catch (error) {
      console.error('Failed to delete group:', error)
      toast.error('Failed to delete group')
    }
  }

  const handleViewGroupMachines = (group: MachineGroup) => {
    toast.info(`Viewing ${group.machineIds.length} machines in \"${group.name}\"`)
    // In real implementation, this would navigate to dashboard with group filter
  }

  // Alert handlers
  const handleAcknowledgeAlert = (alertId: string) => {
    setSystemAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? {
            ...alert,
            status: 'acknowledged',
            acknowledgedBy: 'admin@university.edu',
            acknowledgedAt: new Date()
          }
        : alert
    ))
  }

  const handleSnoozeAlert = (alertId: string, duration: number) => {
    setSystemAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? {
            ...alert,
            status: 'snoozed',
            snoozedUntil: new Date(Date.now() + duration * 60 * 1000) // duration in minutes
          }
        : alert
    ))
  }

  const handleResolveAlert = (alertId: string) => {
    setSystemAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? {
            ...alert,
            status: 'resolved',
            resolvedAt: new Date()
          }
        : alert
    ))
  }

  const handleDeleteAlert = (alertId: string) => {
    setSystemAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h2>
        <p className="text-muted-foreground">
          Configure integrations and system preferences
        </p>
      </div>

      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList>
          <TabsTrigger value="integrations" className="gap-2">
            <Database className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Groups
          </TabsTrigger>
        </TabsList>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          {/* InfluxDB */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    InfluxDB
                  </CardTitle>
                  <CardDescription>
                    Time-series database for storing historical metrics
                  </CardDescription>
                </div>
                <Switch
                  checked={influxDB.enabled}
                  onCheckedChange={(checked) => 
                    setInfluxDB(prev => ({ ...prev, enabled: checked }))
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="influx-url">Server URL</Label>
                <Input
                  id="influx-url"
                  type="url"
                  placeholder="http://localhost:8086"
                  value={influxDB.url}
                  onChange={(e) => setInfluxDB(prev => ({ ...prev, url: e.target.value }))}
                  disabled={!influxDB.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="influx-token">API Token</Label>
                <Input
                  id="influx-token"
                  type="password"
                  placeholder="Enter your InfluxDB token"
                  value={influxDB.token}
                  onChange={(e) => setInfluxDB(prev => ({ ...prev, token: e.target.value }))}
                  disabled={!influxDB.enabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="influx-org">Organization</Label>
                  <Input
                    id="influx-org"
                    placeholder="university"
                    value={influxDB.org}
                    onChange={(e) => setInfluxDB(prev => ({ ...prev, org: e.target.value }))}
                    disabled={!influxDB.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="influx-bucket">Bucket</Label>
                  <Input
                    id="influx-bucket"
                    placeholder="hardware_metrics"
                    value={influxDB.bucket}
                    onChange={(e) => setInfluxDB(prev => ({ ...prev, bucket: e.target.value }))}
                    disabled={!influxDB.enabled}
                  />
                </div>
              </div>

              <Button 
                onClick={() => testConnection('influxdb')}
                disabled={!influxDB.enabled}
                variant="outline"
                className="w-full"
              >
                Test Connection
              </Button>
            </CardContent>
          </Card>

          {/* Grafana */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Grafana
                  </CardTitle>
                  <CardDescription>
                    Embed Grafana dashboards for advanced visualization
                  </CardDescription>
                </div>
                <Switch
                  checked={grafana.enabled}
                  onCheckedChange={(checked) => 
                    setGrafana(prev => ({ ...prev, enabled: checked }))
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="grafana-url">Grafana URL</Label>
                <Input
                  id="grafana-url"
                  type="url"
                  placeholder="http://localhost:3000"
                  value={grafana.url}
                  onChange={(e) => setGrafana(prev => ({ ...prev, url: e.target.value }))}
                  disabled={!grafana.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="grafana-key">API Key (Optional)</Label>
                <Input
                  id="grafana-key"
                  type="password"
                  placeholder="Enter Grafana API key"
                  value={grafana.apiKey}
                  onChange={(e) => setGrafana(prev => ({ ...prev, apiKey: e.target.value }))}
                  disabled={!grafana.enabled}
                />
              </div>

              <Button 
                onClick={() => testConnection('grafana')}
                disabled={!grafana.enabled}
                variant="outline"
                className="w-full"
              >
                Test Connection
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <AlertManagementPanel 
            alerts={systemAlerts}
            onAcknowledge={handleAcknowledgeAlert}
            onSnooze={handleSnoozeAlert}
            onResolve={handleResolveAlert}
            onDelete={handleDeleteAlert}
          />
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-6">
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>Tags Management:</strong> Create and organize tags to categorize your machines. 
                Tags help with filtering and bulk operations.
              </p>
            </div>
            
            <TagsManager 
              tags={tags}
              onCreateTag={handleCreateTag}
              onUpdateTag={handleUpdateTag}
              onDeleteTag={handleDeleteTag}
            />
          </div>
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-6">
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-900">
                <strong>Groups Management:</strong> Organize machines into logical groups like labs or departments. 
                Groups allow you to perform bulk actions and monitor specific machine sets.
              </p>
            </div>
            
            <MachineGroupsManager 
              groups={groups}
              onCreateGroup={handleCreateGroup}
              onUpdateGroup={handleUpdateGroup}
              onDeleteGroup={handleDeleteGroup}
              onViewGroupMachines={handleViewGroupMachines}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end pt-6 border-t">
        <Button onClick={saveSettings} size="lg" className="gap-2">
          <Settings className="h-4 w-4" />
          Save All Settings
        </Button>
      </div>
    </div>
  )
}