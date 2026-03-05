import { MonitorData, HeartbeatMetrics, TimelineEvent } from '../types/monitor-schema'

interface MachineSnapshot {
  status: string
  username: string | null
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  healthStatus: string
  uptime: number
}

/**
 * Create a snapshot of a machine's current state for comparison
 */
function createMachineSnapshot(machine: MonitorData<HeartbeatMetrics>): MachineSnapshot {
  return {
    status: machine.metrics.status.state,
    username: machine.metrics.user_activity.current_username,
    cpuUsage: machine.metrics.resources.cpu_usage_percent,
    memoryUsage: machine.metrics.resources.memory_usage_percent,
    diskUsage: machine.metrics.resources.disk_usage_percent,
    healthStatus: machine.health.status,
    uptime: machine.metrics.status.uptime_seconds
  }
}

/**
 * Generate timeline events by comparing current and previous machine states
 */
export function generateTimelineEvents(
  currentMachines: MonitorData<HeartbeatMetrics>[],
  previousMachines: MonitorData<HeartbeatMetrics>[] | null
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // If no previous state, generate initial events for current critical situations
  if (!previousMachines) {
    currentMachines.forEach(machine => {
      // User login events
      if (machine.metrics.user_activity.current_username) {
        events.push({
          id: `${machine.machine.machine_id}-login-${Date.now()}`,
          timestamp: machine.metrics.user_activity.login_time || new Date(),
          type: 'user_login',
          severity: 'info',
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: 'User Login',
          description: `${machine.metrics.user_activity.current_username} logged in`,
          metadata: {
            username: machine.metrics.user_activity.current_username,
            loginLocation: machine.metrics.user_activity.login_location
          }
        })
      }

      // Critical health alerts
      if (machine.health.status === 'critical') {
        events.push({
          id: `${machine.machine.machine_id}-critical-${Date.now()}`,
          timestamp: new Date(),
          type: 'alert',
          severity: 'critical',
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: 'Critical Health Alert',
          description: `Machine health critical: ${machine.health.issues.join(', ')}`,
          metadata: {
            healthScore: machine.health.score,
            issues: machine.health.issues
          }
        })
      }
    })
    return events
  }

  // Create a map of previous machine states for quick lookup
  const previousMap = new Map<string, MachineSnapshot>()
  previousMachines.forEach(machine => {
    previousMap.set(machine.machine.machine_id, createMachineSnapshot(machine))
  })

  // Compare current state with previous state
  currentMachines.forEach(current => {
    const previous = previousMap.get(current.machine.machine_id)
    if (!previous) return // New machine, skip for now

    const currentSnapshot = createMachineSnapshot(current)

    // Status changes
    if (previous.status !== currentSnapshot.status) {
      const severity = 
        currentSnapshot.status === 'error' ? 'critical' :
        currentSnapshot.status === 'offline' ? 'warning' :
        currentSnapshot.status === 'online' ? 'success' :
        currentSnapshot.status === 'in-use' ? 'info' : 'info'

      events.push({
        id: `${current.machine.machine_id}-status-${Date.now()}`,
        timestamp: new Date(),
        type: 'status_change',
        severity,
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'Status Changed',
        description: `Machine status changed from ${previous.status} to ${currentSnapshot.status}`,
        metadata: {
          previousStatus: previous.status,
          currentStatus: currentSnapshot.status
        }
      })
    }

    // User login
    if (!previous.username && currentSnapshot.username) {
      events.push({
        id: `${current.machine.machine_id}-login-${Date.now()}`,
        timestamp: current.metrics.user_activity.login_time || new Date(),
        type: 'user_login',
        severity: 'info',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'User Login',
        description: `${currentSnapshot.username} logged in`,
        metadata: {
          username: currentSnapshot.username,
          loginLocation: current.metrics.user_activity.login_location
        }
      })
    }

    // User logout
    if (previous.username && !currentSnapshot.username) {
      events.push({
        id: `${current.machine.machine_id}-logout-${Date.now()}`,
        timestamp: new Date(),
        type: 'user_logout',
        severity: 'info',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'User Logout',
        description: `${previous.username} logged out`,
        metadata: {
          username: previous.username
        }
      })
    }

    // System reboot detection (uptime decreased significantly)
    if (currentSnapshot.uptime < previous.uptime - 60) {
      events.push({
        id: `${current.machine.machine_id}-reboot-${Date.now()}`,
        timestamp: current.metrics.status.last_boot,
        type: 'system_event',
        severity: 'info',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'System Reboot',
        description: 'Machine was rebooted',
        metadata: {
          previousUptime: previous.uptime,
          bootTime: current.metrics.status.last_boot
        }
      })
    }

    // High CPU usage alert (threshold: 90%)
    if (previous.cpuUsage < 90 && currentSnapshot.cpuUsage >= 90) {
      events.push({
        id: `${current.machine.machine_id}-cpu-high-${Date.now()}`,
        timestamp: new Date(),
        type: 'hardware_event',
        severity: currentSnapshot.cpuUsage >= 95 ? 'critical' : 'warning',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'High CPU Usage',
        description: `CPU usage spiked to ${currentSnapshot.cpuUsage.toFixed(1)}%`,
        metadata: {
          cpuUsage: currentSnapshot.cpuUsage,
          threshold: 90
        }
      })
    }

    // High memory usage alert (threshold: 90%)
    if (previous.memoryUsage < 90 && currentSnapshot.memoryUsage >= 90) {
      events.push({
        id: `${current.machine.machine_id}-memory-high-${Date.now()}`,
        timestamp: new Date(),
        type: 'hardware_event',
        severity: currentSnapshot.memoryUsage >= 95 ? 'critical' : 'warning',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'High Memory Usage',
        description: `Memory usage reached ${currentSnapshot.memoryUsage.toFixed(1)}%`,
        metadata: {
          memoryUsage: currentSnapshot.memoryUsage,
          threshold: 90
        }
      })
    }

    // High disk usage alert (threshold: 85%)
    if (previous.diskUsage < 85 && currentSnapshot.diskUsage >= 85) {
      events.push({
        id: `${current.machine.machine_id}-disk-high-${Date.now()}`,
        timestamp: new Date(),
        type: 'hardware_event',
        severity: currentSnapshot.diskUsage >= 95 ? 'critical' : 'warning',
        machineId: current.machine.machine_id,
        hostname: current.machine.hostname,
        location: current.machine.location,
        title: 'High Disk Usage',
        description: `Disk usage at ${currentSnapshot.diskUsage.toFixed(1)}%`,
        metadata: {
          diskUsage: currentSnapshot.diskUsage,
          threshold: 85
        }
      })
    }

    // Health status degradation
    if (previous.healthStatus !== currentSnapshot.healthStatus) {
      if (currentSnapshot.healthStatus === 'critical' || currentSnapshot.healthStatus === 'warning') {
        events.push({
          id: `${current.machine.machine_id}-health-${Date.now()}`,
          timestamp: new Date(),
          type: 'alert',
          severity: currentSnapshot.healthStatus === 'critical' ? 'critical' : 'warning',
          machineId: current.machine.machine_id,
          hostname: current.machine.hostname,
          location: current.machine.location,
          title: 'Health Status Changed',
          description: `Machine health degraded to ${currentSnapshot.healthStatus}`,
          metadata: {
            previousHealth: previous.healthStatus,
            currentHealth: currentSnapshot.healthStatus,
            healthScore: current.health.score,
            issues: current.health.issues
          }
        })
      } else if (currentSnapshot.healthStatus === 'healthy' && previous.healthStatus !== 'healthy') {
        events.push({
          id: `${current.machine.machine_id}-health-recovered-${Date.now()}`,
          timestamp: new Date(),
          type: 'alert',
          severity: 'success',
          machineId: current.machine.machine_id,
          hostname: current.machine.hostname,
          location: current.machine.location,
          title: 'Health Recovered',
          description: 'Machine health returned to normal',
          metadata: {
            previousHealth: previous.healthStatus,
            currentHealth: currentSnapshot.healthStatus,
            healthScore: current.health.score
          }
        })
      }
    }
  })

  return events
}

/**
 * Generate some historical events for initial timeline population
 */
export function generateHistoricalEvents(
  machines: MonitorData<HeartbeatMetrics>[],
  hoursBack: number = 24
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const now = new Date()

  // Randomly select some machines for historical events
  const selectedMachines = machines
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(50, Math.floor(machines.length * 0.15)))

  selectedMachines.forEach((machine, index) => {
    const machineEventCount = Math.floor(Math.random() * 5) + 1 // 1-5 events per machine

    for (let i = 0; i < machineEventCount; i++) {
      const hoursAgo = Math.random() * hoursBack
      const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)

      // Random event type
      const eventType = Math.random()
      
      if (eventType < 0.2) {
        // User login/logout
        const isLogin = Math.random() > 0.5
        events.push({
          id: `hist-${machine.machine.machine_id}-user-${timestamp.getTime()}-${i}`,
          timestamp,
          type: isLogin ? 'user_login' : 'user_logout',
          severity: 'info',
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: isLogin ? 'User Login' : 'User Logout',
          description: isLogin 
            ? `User logged in` 
            : `User logged out`,
          metadata: {}
        })
      } else if (eventType < 0.4) {
        // Status change
        const statuses: Array<'online' | 'idle' | 'offline'> = ['online', 'idle', 'offline']
        const status = statuses[Math.floor(Math.random() * statuses.length)]
        events.push({
          id: `hist-${machine.machine.machine_id}-status-${timestamp.getTime()}-${i}`,
          timestamp,
          type: 'status_change',
          severity: status === 'offline' ? 'warning' : status === 'online' ? 'success' : 'info',
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: 'Status Changed',
          description: `Machine status changed to ${status}`,
          metadata: { status }
        })
      } else if (eventType < 0.6) {
        // System event
        events.push({
          id: `hist-${machine.machine.machine_id}-reboot-${timestamp.getTime()}-${i}`,
          timestamp,
          type: 'system_event',
          severity: 'info',
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: 'System Reboot',
          description: 'Machine was rebooted',
          metadata: {}
        })
      } else if (eventType < 0.8) {
        // Hardware event
        const hardwareTypes = ['CPU', 'Memory', 'Disk']
        const hwType = hardwareTypes[Math.floor(Math.random() * hardwareTypes.length)]
        const usage = Math.floor(Math.random() * 20) + 80 // 80-100%
        const severity = usage >= 95 ? 'critical' : 'warning'
        
        events.push({
          id: `hist-${machine.machine.machine_id}-hw-${timestamp.getTime()}-${i}`,
          timestamp,
          type: 'hardware_event',
          severity,
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: `High ${hwType} Usage`,
          description: `${hwType} usage reached ${usage}%`,
          metadata: { type: hwType, usage }
        })
      } else {
        // Alert
        const alertSeverities: Array<'warning' | 'critical'> = ['warning', 'critical']
        const severity = alertSeverities[Math.floor(Math.random() * alertSeverities.length)]
        events.push({
          id: `hist-${machine.machine.machine_id}-alert-${timestamp.getTime()}-${i}`,
          timestamp,
          type: 'alert',
          severity,
          machineId: machine.machine.machine_id,
          hostname: machine.machine.hostname,
          location: machine.machine.location,
          title: 'System Alert',
          description: severity === 'critical' 
            ? 'Critical system alert triggered' 
            : 'Warning alert triggered',
          metadata: { severity }
        })
      }
    }
  })

  // Sort events by timestamp (newest first)
  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}