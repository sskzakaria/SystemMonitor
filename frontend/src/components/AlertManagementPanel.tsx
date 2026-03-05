import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '../lib/utils'
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter,
  User,
  Calendar,
  Bell,
  BellOff,
  XCircle,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import { 
  acknowledgeAlert, 
  resolveAlert, 
  snoozeAlert, 
  dismissAlert, 
  getAlertHistory 
} from '../services/api'
import { formatDateWithTimezone, formatTimeWithTimezone } from '../lib/timezone-utils'

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'active' | 'acknowledged' | 'snoozed' | 'resolved'

export interface Alert {
  id: string
  machineId: string
  hostname: string
  location: string
  severity: AlertSeverity
  status: AlertStatus
  title: string
  message: string
  timestamp: Date
  acknowledgedBy?: string
  acknowledgedAt?: Date
  snoozedUntil?: Date
  resolvedAt?: Date
}

interface AlertManagementPanelProps {
  alerts: Alert[]
  onAcknowledge: (alertId: string) => void
  onSnooze: (alertId: string, duration: number) => void
  onResolve: (alertId: string) => void
  onDelete: (alertId: string) => void
}

export function AlertManagementPanel({
  alerts,
  onAcknowledge,
  onSnooze,
  onResolve,
  onDelete
}: AlertManagementPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all')

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesSearch = 
          alert.machineId.toLowerCase().includes(search) ||
          alert.hostname.toLowerCase().includes(search) ||
          alert.title.toLowerCase().includes(search) ||
          alert.message.toLowerCase().includes(search)
        if (!matchesSearch) return false
      }

      // Severity filter
      if (severityFilter !== 'all' && alert.severity !== severityFilter) return false

      // Status filter
      if (statusFilter !== 'all' && alert.status !== statusFilter) return false

      return true
    })
  }, [alerts, searchTerm, severityFilter, statusFilter])

  // Group by severity
  const alertsBySeverity = useMemo(() => {
    return {
      critical: filteredAlerts.filter(a => a.severity === 'critical' && a.status === 'active'),
      warning: filteredAlerts.filter(a => a.severity === 'warning' && a.status === 'active'),
      info: filteredAlerts.filter(a => a.severity === 'info' && a.status === 'active')
    }
  }, [filteredAlerts])

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return AlertTriangle
      case 'warning':
        return AlertTriangle
      case 'info':
        return Info
    }
  }

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-800'
      case 'warning':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800'
      case 'info':
        return 'bg-blue-100 border-blue-300 text-blue-800'
    }
  }

  const getStatusBadge = (alert: Alert) => {
    switch (alert.status) {
      case 'active':
        return <Badge variant="destructive">Active</Badge>
      case 'acknowledged':
        return <Badge variant="secondary">Acknowledged</Badge>
      case 'snoozed':
        return <Badge variant="outline">Snoozed</Badge>
      case 'resolved':
        return <Badge variant="default" className="bg-green-600">Resolved</Badge>
    }
  }

  const handleSnooze = (alertId: string) => {
    // Default snooze: 1 hour
    onSnooze(alertId, 60)
    toast.success('Alert snoozed for 1 hour')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Alert Management
          </h2>
          <p className="text-muted-foreground">
            Monitor and manage system alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="h-8 px-3">
            {alertsBySeverity.critical.length} Critical
          </Badge>
          <Badge variant="secondary" className="h-8 px-3 bg-yellow-100 text-yellow-800 border-yellow-300">
            {alertsBySeverity.warning.length} Warning
          </Badge>
          <Badge variant="outline" className="h-8 px-3">
            {alertsBySeverity.info.length} Info
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Severity Filter */}
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as AlertSeverity | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="snoozed">Snoozed</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Alert List */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {filteredAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-600 opacity-20" />
                <h3 className="font-medium mb-1">No Alerts</h3>
                <p className="text-sm text-muted-foreground">
                  {alerts.length === 0 
                    ? 'All systems are operating normally'
                    : 'No alerts match your filters'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredAlerts.map(alert => {
              const Icon = getSeverityIcon(alert.severity)
              return (
                <Card
                  key={alert.id}
                  className={cn(
                    "border-l-4 transition-all hover:shadow-md",
                    getSeverityColor(alert.severity)
                  )}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Alert Icon & Info */}
                      <div className="flex items-start gap-3 flex-1">
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                          alert.severity === 'critical' ? 'bg-red-200' :
                          alert.severity === 'warning' ? 'bg-yellow-200' :
                          'bg-blue-200'
                        )}>
                          <Icon className={cn(
                            "h-5 w-5",
                            alert.severity === 'critical' ? 'text-red-700' :
                            alert.severity === 'warning' ? 'text-yellow-700' :
                            'text-blue-700'
                          )} />
                        </div>

                        <div className="flex-1 space-y-2">
                          {/* Title & Status */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold">{alert.title}</h4>
                            {getStatusBadge(alert)}
                          </div>

                          {/* Message */}
                          <p className="text-sm text-gray-700">{alert.message}</p>

                          {/* Machine Info */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-mono font-medium text-gray-700">
                              {alert.machineId}
                            </span>
                            <span>•</span>
                            <span>{alert.hostname}</span>
                            <span>•</span>
                            <span>{alert.location}</span>
                          </div>

                          {/* Timestamp & Additional Info */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatDateWithTimezone(alert.timestamp)}</span>
                            </div>
                            {alert.acknowledgedBy && (
                              <>
                                <span>•</span>
                                <span>Acknowledged by {alert.acknowledgedBy}</span>
                              </>
                            )}
                            {alert.snoozedUntil && (
                              <>
                                <span>•</span>
                                <span>Snoozed until {formatTimeWithTimezone(alert.snoozedUntil)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0">
                        {alert.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onAcknowledge(alert.id)
                                toast.success('Alert acknowledged')
                              }}
                              className="gap-2 w-32"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Acknowledge
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSnooze(alert.id)}
                              className="gap-2 w-32"
                            >
                              <BellOff className="h-4 w-4" />
                              Snooze 1h
                            </Button>
                          </>
                        )}
                        {(alert.status === 'acknowledged' || alert.status === 'snoozed') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              onResolve(alert.id)
                              toast.success('Alert resolved')
                            }}
                            className="gap-2 w-32 border-green-500 text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Resolve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            onDelete(alert.id)
                            toast.success('Alert deleted')
                          }}
                          className="gap-2 w-32 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}