import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { User, Clock, MapPin, Activity } from 'lucide-react'
import { MonitorData, HeartbeatMetrics } from '../types/monitor-schema'
import { formatTimeWithTimezone } from '../lib/timezone-utils'

interface UserSession {
  username: string // "ENGLISH" or "FRENCH"
  machineId: string
  hostname: string
  location: string
  loginLocation: string
  loginTime: Date
  duration: number // minutes
  isIdle: boolean
  lastActivity: Date
}

interface UserSessionsPanelProps {
  machines: MonitorData<HeartbeatMetrics>[]
}

export function UserSessionsPanel({ machines }: UserSessionsPanelProps) {
  // Extract active user sessions
  const activeSessions = useMemo(() => {
    const sessions: UserSession[] = []

    machines.forEach(machine => {
      const { user_activity } = machine.metrics
      
      if (user_activity.current_username && user_activity.login_time) {
        const now = new Date()
        const loginTime = new Date(user_activity.login_time)
        const duration = Math.floor((now.getTime() - loginTime.getTime()) / 1000 / 60) // minutes

        sessions.push({
          username: user_activity.current_username,
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          loginLocation: user_activity.login_location || 'Unknown',
          loginTime,
          duration,
          isIdle: user_activity.is_idle,
          lastActivity: user_activity.last_activity ? new Date(user_activity.last_activity) : loginTime
        })
      }
    })

    // Sort by login time (newest first)
    return sessions.sort((a, b) => b.loginTime.getTime() - a.loginTime.getTime())
  }, [machines])

  // Session statistics
  const stats = useMemo(() => {
    const total = activeSessions.length
    const english = activeSessions.filter(s => s.username === 'ENGLISH').length
    const french = activeSessions.filter(s => s.username === 'FRENCH').length
    const idle = activeSessions.filter(s => s.isIdle).length
    const active = total - idle

    const avgDuration = total > 0
      ? Math.floor(activeSessions.reduce((sum, s) => sum + s.duration, 0) / total)
      : 0

    return { total, english, french, idle, active, avgDuration }
  }, [activeSessions])

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <User className="h-6 w-6" />
          Active User Sessions
        </h2>
        <p className="text-muted-foreground">
          Monitor active lab account sessions across all machines
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-semibold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-semibold text-blue-600">{stats.english}</p>
              <p className="text-sm text-muted-foreground">ENGLISH Accounts</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-semibold text-purple-600">{stats.french}</p>
              <p className="text-sm text-muted-foreground">FRENCH Accounts</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-semibold text-green-600">{stats.active}</p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-semibold text-orange-600">{stats.idle}</p>
              <p className="text-sm text-muted-foreground">Idle</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Average Session Duration */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Average Session Duration</span>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-1">
              {formatDuration(stats.avgDuration)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions ({activeSessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No Active Sessions</p>
              <p className="text-sm">All machines are currently idle</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {activeSessions.map((session, index) => (
                  <div
                    key={`${session.machineId}-${index}`}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* User & Machine Info */}
                    <div className="flex items-center gap-4 flex-1">
                      {/* User Icon */}
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${
                        session.username === 'ENGLISH' ? 'bg-blue-100' : 'bg-purple-100'
                      }`}>
                        <User className={`h-6 w-6 ${
                          session.username === 'ENGLISH' ? 'text-blue-600' : 'text-purple-600'
                        }`} />
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={session.username === 'ENGLISH' ? 'default' : 'secondary'}>
                            {session.username}
                          </Badge>
                          {session.isIdle && (
                            <Badge variant="outline" className="border-orange-300 text-orange-700">
                              Idle
                            </Badge>
                          )}
                          {!session.isIdle && (
                            <Badge variant="outline" className="border-green-300 text-green-700">
                              <Activity className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="font-mono font-medium text-gray-700">
                            {session.machineId}
                          </span>
                          <span>•</span>
                          <span>{session.hostname}</span>
                          <span>•</span>
                          <span>{session.location}</span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>Login Location: {session.loginLocation}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Session Duration */}
                    <div className="text-right shrink-0 ml-4">
                      <div className="flex items-center gap-1 justify-end mb-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{formatDuration(session.duration)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Since {formatTimeWithTimezone(session.loginTime)}
                      </p>
                      {session.isIdle && (
                        <p className="text-xs text-orange-600 mt-1">
                          Last active {Math.floor((Date.now() - session.lastActivity.getTime()) / 1000 / 60)}m ago
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Distribution Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Session Distribution by Account Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-blue-500 rounded" />
                  <span>ENGLISH Accounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.english}</span>
                  <Badge variant="outline">
                    {stats.total > 0 ? Math.round((stats.english / stats.total) * 100) : 0}%
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-purple-500 rounded" />
                  <span>FRENCH Accounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.french}</span>
                  <Badge variant="outline">
                    {stats.total > 0 ? Math.round((stats.french / stats.total) * 100) : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-green-500 rounded" />
                  <span>Active Sessions</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.active}</span>
                  <Badge variant="outline" className="border-green-300 text-green-700">
                    {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-orange-500 rounded" />
                  <span>Idle Sessions</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.idle}</span>
                  <Badge variant="outline" className="border-orange-300 text-orange-700">
                    {stats.total > 0 ? Math.round((stats.idle / stats.total) * 100) : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}