import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { formatDateOnlyWithTimezone, formatTimeWithTimezone } from '../lib/timezone-utils'
import { 
  Activity, 
  Power, 
  User, 
  AlertTriangle, 
  CheckCircle, 
  Wrench,
  HardDrive,
  Cpu,
  Clock
} from 'lucide-react'
import { cn } from '../lib/utils'
import { TimelineEvent } from '../types/monitor-schema'

interface TimelineViewProps {
  events: TimelineEvent[]
  onEventClick?: (event: TimelineEvent) => void
}

export function TimelineView({ events = [], onEventClick }: TimelineViewProps) {
  const getIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'status_change':
        return Activity
      case 'user_login':
      case 'user_logout':
        return User
      case 'hardware_event':
        return Cpu
      case 'maintenance':
        return Wrench
      case 'alert':
        return AlertTriangle
      case 'system_event':
        return HardDrive
      default:
        return Activity
    }
  }

  const getSeverityColor = (severity: TimelineEvent['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-700'
      case 'warning':
        return 'bg-yellow-100 border-yellow-300 text-yellow-700'
      case 'success':
        return 'bg-green-100 border-green-300 text-green-700'
      default:
        return 'bg-blue-100 border-blue-300 text-blue-700'
    }
  }

  const getIconColor = (severity: TimelineEvent['severity']) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-100'
      case 'warning':
        return 'text-yellow-600 bg-yellow-100'
      case 'success':
        return 'text-green-600 bg-green-100'
      default:
        return 'text-blue-600 bg-blue-100'
    }
  }

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = formatDateOnlyWithTimezone(event.timestamp)
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, TimelineEvent[]>)

  const sortedDates = Object.keys(eventsByDate).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime()
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Timeline</h2>
          <p className="text-muted-foreground">
            Chronological event history across all machines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{events.length} events</Badge>
        </div>
      </div>

      {/* Timeline */}
      <ScrollArea className="h-[calc(100vh-16rem)]">
        <div className="space-y-8">
          {sortedDates.map(dateKey => (
            <div key={dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-200" />
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{dateKey}</span>
                </div>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Events for this date */}
              <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                {eventsByDate[dateKey].map((event, index) => {
                  const Icon = getIcon(event.type)
                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "relative group cursor-pointer",
                        onEventClick && "hover:translate-x-1 transition-transform"
                      )}
                      onClick={() => onEventClick?.(event)}
                    >
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute -left-[29px] h-8 w-8 rounded-full flex items-center justify-center border-2 border-white shadow-sm",
                        getIconColor(event.severity)
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Event card */}
                      <Card className={cn(
                        "border-l-4 transition-all",
                        getSeverityColor(event.severity),
                        onEventClick && "group-hover:shadow-md"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              {/* Title and time */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium">{event.title}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {formatTimeWithTimezone(event.timestamp)}
                                </Badge>
                              </div>

                              {/* Description */}
                              <p className="text-sm text-muted-foreground">
                                {event.description}
                              </p>

                              {/* Machine info */}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                                <span className="font-mono font-medium text-gray-700">
                                  {event.machineId}
                                </span>
                                <span>•</span>
                                <span>{event.hostname}</span>
                                <span>•</span>
                                <span>{event.location}</span>
                              </div>

                              {/* Metadata */}
                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2">
                                  {Object.entries(event.metadata).map(([key, value]) => (
                                    <Badge key={key} variant="secondary" className="text-xs">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Severity badge */}
                            <Badge
                              variant={
                                event.severity === 'critical' ? 'destructive' :
                                event.severity === 'warning' ? 'secondary' :
                                event.severity === 'success' ? 'default' :
                                'outline'
                              }
                              className="shrink-0"
                            >
                              {event.severity}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {events.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Activity className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="font-medium mb-1">No Events</h3>
                <p className="text-sm text-muted-foreground">
                  Timeline events will appear here as they occur
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}