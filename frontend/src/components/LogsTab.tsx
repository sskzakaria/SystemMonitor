import { useState, useEffect } from 'react'
import { getMachineEvents } from '../services/api'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle2,
  FileText,
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react'

interface LogsTabProps {
  machineId: string
  hostname: string
}

interface EventLog {
  event_id: number
  event_type: string
  source: string
  category: number
  time_generated: string
  computer: string
  message: string
  log_name: string
}

interface EventLogData {
  application_events: EventLog[]
  system_events: EventLog[]
  security_events: EventLog[]
  critical_events: EventLog[]
  summary: {
    system: {
      errors: number
      warnings: number
      information: number
    }
    security: {
      audit_success: number
      audit_failure: number
    }
    application: {
      errors: number
      warnings: number
      information: number
    }
    total_errors: number
    total_warnings: number
  }
  total_application_events: number
  total_system_events: number
  total_security_events: number
  total_critical_events: number
}

export function LogsTab({ machineId, hostname }: LogsTabProps) {
  const [logsData, setLogsData] = useState<EventLogData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLogType, setSelectedLogType] = useState<'all' | 'application' | 'system' | 'security' | 'critical'>('all')
  const [selectedEventType, setSelectedEventType] = useState<'all' | 'error' | 'warning' | 'information'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchLogs()
  }, [machineId])

  const fetchLogs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getMachineEvents(machineId, { hours: 24 })
      console.log('📋 Logs API response:', data) // Debug log
      console.log('📋 Summary:', data?.summary)
      console.log('📋 Has application_events?', !!data?.application_events)
      console.log('📋 Has system_events?', !!data?.system_events)
      setLogsData(data)
    } catch (err) {
      console.error('Failed to fetch logs:', err)
      setError('Unable to load event logs')
      setLogsData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleEventExpansion = (eventKey: string) => {
    const newExpanded = new Set(expandedEvents)
    if (newExpanded.has(eventKey)) {
      newExpanded.delete(eventKey)
    } else {
      newExpanded.add(eventKey)
    }
    setExpandedEvents(newExpanded)
  }

  const getEventTypeIcon = (type: string) => {
    const typeUpper = type.toUpperCase()
    if (typeUpper.includes('ERROR')) {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
    if (typeUpper.includes('WARNING')) {
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    }
    if (typeUpper.includes('INFORMATION')) {
      return <Info className="h-4 w-4 text-blue-600" />
    }
    return <Activity className="h-4 w-4 text-gray-600" />
  }

  const getEventTypeBadge = (type: string) => {
    const typeUpper = type.toUpperCase()
    if (typeUpper.includes('ERROR')) {
      return <Badge className="bg-red-100 text-red-700 border-red-300">Error</Badge>
    }
    if (typeUpper.includes('WARNING')) {
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">Warning</Badge>
    }
    if (typeUpper.includes('INFORMATION')) {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-300">Info</Badge>
    }
    return <Badge className="bg-gray-100 text-gray-700 border-gray-300">{type}</Badge>
  }

  const getLogNameIcon = (logName: string) => {
    switch (logName.toLowerCase()) {
      case 'application':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'system':
        return <Server className="h-4 w-4 text-green-600" />
      case 'security':
        return <Shield className="h-4 w-4 text-purple-600" />
      default:
        return <Activity className="h-4 w-4 text-gray-600" />
    }
  }

  const exportLogs = () => {
    if (!logsData) return

    const allEvents = [
      ...logsData.application_events,
      ...logsData.system_events,
      ...logsData.security_events,
      ...logsData.critical_events
    ]

    const csv = [
      ['Time', 'Type', 'Log Name', 'Event ID', 'Source', 'Message'].join(','),
      ...allEvents.map(event => [
        event.time_generated,
        event.event_type,
        event.log_name,
        event.event_id,
        event.source,
        `"${event.message.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${hostname}_logs_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Logs exported successfully')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !logsData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <FileText className="h-12 w-12 mb-3 text-gray-400" />
        <p className="text-sm">{error || 'No event logs available'}</p>
        <p className="text-xs mt-2">Event logs will appear once collected by the backend</p>
        <Button variant="outline" className="mt-4" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  // Combine and filter events - SAFETY: Ensure arrays exist
  let allEvents: EventLog[] = []
  
  const appEvents = logsData.application_events || []
  const sysEvents = logsData.system_events || []
  const secEvents = logsData.security_events || []
  const critEvents = logsData.critical_events || []
  
  if (selectedLogType === 'all') {
    allEvents = [...appEvents, ...sysEvents, ...secEvents, ...critEvents]
  } else if (selectedLogType === 'application') {
    allEvents = appEvents
  } else if (selectedLogType === 'system') {
    allEvents = sysEvents
  } else if (selectedLogType === 'security') {
    allEvents = secEvents
  } else if (selectedLogType === 'critical') {
    allEvents = critEvents
  }

  // Filter by event type
  if (selectedEventType !== 'all') {
    allEvents = allEvents.filter(event => 
      event.event_type.toLowerCase().includes(selectedEventType)
    )
  }

  // Filter by search term
  if (searchTerm) {
    allEvents = allEvents.filter(event =>
      event.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.event_id.toString().includes(searchTerm)
    )
  }

  // Sort by time (most recent first)
  allEvents.sort((a, b) => 
    new Date(b.time_generated).getTime() - new Date(a.time_generated).getTime()
  )

  // Safe summary with defaults
  const summary = logsData.summary || {
    system: { errors: 0, warnings: 0, information: 0 },
    security: { audit_success: 0, audit_failure: 0 },
    application: { errors: 0, warnings: 0, information: 0 },
    total_errors: 0,
    total_warnings: 0
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logsData.total_application_events + logsData.total_system_events + logsData.total_security_events}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{summary.total_errors}</div>
            <p className="text-xs text-red-600 mt-1">
              System: {summary.system.errors}, App: {summary.application.errors}
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{summary.total_warnings}</div>
            <p className="text-xs text-yellow-600 mt-1">
              System: {summary.system.warnings}, App: {summary.application.warnings}
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {summary.system.information + summary.application.information}
            </div>
            <p className="text-xs text-blue-600 mt-1">Informational events</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Event Logs ({allEvents.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportLogs}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="space-y-3 mt-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by source, message, or event ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Log Type Filter */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground flex items-center">
                <Filter className="h-4 w-4 mr-2" />
                Log Type:
              </span>
              <Button
                variant={selectedLogType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedLogType('all')}
              >
                All ({logsData.total_application_events + logsData.total_system_events + logsData.total_security_events})
              </Button>
              <Button
                variant={selectedLogType === 'application' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedLogType('application')}
              >
                <FileText className="h-3 w-3 mr-1" />
                Application ({logsData.total_application_events})
              </Button>
              <Button
                variant={selectedLogType === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedLogType('system')}
              >
                <Server className="h-3 w-3 mr-1" />
                System ({logsData.total_system_events})
              </Button>
              <Button
                variant={selectedLogType === 'security' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedLogType('security')}
              >
                <Shield className="h-3 w-3 mr-1" />
                Security ({logsData.total_security_events})
              </Button>
              {logsData.total_critical_events > 0 && (
                <Button
                  variant={selectedLogType === 'critical' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLogType('critical')}
                >
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Critical ({logsData.total_critical_events})
                </Button>
              )}
            </div>

            {/* Event Type Filter */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground flex items-center">
                Event Type:
              </span>
              <Button
                variant={selectedEventType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedEventType('all')}
              >
                All
              </Button>
              <Button
                variant={selectedEventType === 'error' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedEventType('error')}
                className="text-red-700"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Errors
              </Button>
              <Button
                variant={selectedEventType === 'warning' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedEventType('warning')}
                className="text-yellow-700"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Warnings
              </Button>
              <Button
                variant={selectedEventType === 'information' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedEventType('information')}
                className="text-blue-700"
              >
                <Info className="h-3 w-3 mr-1" />
                Information
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            {allEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p>No events match your filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allEvents.map((event, index) => {
                  const eventKey = `${event.log_name}-${event.event_id}-${index}`
                  const isExpanded = expandedEvents.has(eventKey)

                  return (
                    <div
                      key={eventKey}
                      className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-1">
                          {getEventTypeIcon(event.event_type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getEventTypeBadge(event.event_type)}
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  {getLogNameIcon(event.log_name)}
                                  <span>{event.log_name}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  ID: {event.event_id}
                                </Badge>
                              </div>
                              <div className="mt-2">
                                <div className="font-medium text-sm">{event.source}</div>
                                <div className="text-sm text-muted-foreground line-clamp-2">
                                  {event.message}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 flex-shrink-0">
                              <div className="text-xs text-muted-foreground text-right">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(event.time_generated), { addSuffix: true })}
                                </div>
                                <div className="mt-1">
                                  {new Date(event.time_generated).toLocaleString()}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleEventExpansion(eventKey)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t space-y-2">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Computer:</span>
                                  <span className="ml-2 font-mono">{event.computer}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Category:</span>
                                  <span className="ml-2">{event.category}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm">Full Message:</span>
                                <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
                                  {event.message}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}