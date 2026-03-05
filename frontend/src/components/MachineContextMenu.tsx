import { ReactNode } from 'react'
import { MonitorData, HeartbeatMetrics } from '../types/monitor-schema'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './ui/context-menu'
import {
  Eye,
  Copy,
  Power,
  PowerOff,
  Wrench,
  Monitor,
  FileText,
  Activity,
  Tag,
  FolderOpen,
  Wifi,
  AlertTriangle,
  PlayCircle,
  RefreshCw,
  Users,
  Settings,
  Trash2,
} from 'lucide-react'

interface MachineContextMenuProps {
  machine: MonitorData<HeartbeatMetrics>
  onViewDetails: () => void
  children: ReactNode
}

export function MachineContextMenu({ machine, onViewDetails, children }: MachineContextMenuProps) {
  const { machine: info, metrics } = machine

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(info.machine_id)
    toast.success('Machine ID copied to clipboard', {
      description: info.machine_id
    })
  }

  const handleCopyIpAddress = () => {
    navigator.clipboard.writeText(info.ip_address)
    toast.success('IP Address copied to clipboard', {
      description: info.ip_address
    })
  }

  const handleRestartMachine = () => {
    toast.success('Restart command sent', {
      description: `${info.hostname} will restart shortly`
    })
  }

  const handleShutdownMachine = () => {
    toast.warning('Shutdown command sent', {
      description: `${info.hostname} will shut down shortly`
    })
  }

  const handleMaintenanceMode = () => {
    toast.info('Maintenance mode activated', {
      description: `${info.hostname} is now in maintenance mode`
    })
  }

  const handleRemoteDesktop = () => {
    toast.info('Launching Remote Desktop', {
      description: `Connecting to ${info.hostname}...`
    })
  }

  const handleViewLogs = () => {
    toast.info('Opening logs viewer', {
      description: `Loading logs for ${info.hostname}...`
    })
  }

  const handleRunDiagnostics = () => {
    toast.info('Running diagnostics', {
      description: `Running full system diagnostics on ${info.hostname}...`
    })
  }

  const handleAddTag = (tag: string) => {
    toast.success(`Tag "${tag}" added`, {
      description: `Added to ${info.hostname}`
    })
  }

  const handleAddToGroup = (group: string) => {
    toast.success(`Added to group "${group}"`, {
      description: `${info.hostname} is now in ${group}`
    })
  }

  const handleWakeOnLan = () => {
    toast.info('Wake-on-LAN packet sent', {
      description: `Attempting to wake ${info.hostname}...`
    })
  }

  const handleForceReboot = () => {
    toast.warning('Force reboot initiated', {
      description: `${info.hostname} will forcefully restart`
    })
  }

  const isOffline = metrics.status.state === 'offline'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* Quick Actions */}
        <ContextMenuItem onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
          <ContextMenuShortcut>Enter</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />

        {/* Power Management */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Power className="mr-2 h-4 w-4" />
            Power Management
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {isOffline ? (
              <ContextMenuItem onClick={handleWakeOnLan}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Wake-on-LAN
              </ContextMenuItem>
            ) : (
              <>
                <ContextMenuItem onClick={handleRestartMachine}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restart
                </ContextMenuItem>
                <ContextMenuItem onClick={handleShutdownMachine}>
                  <PowerOff className="mr-2 h-4 w-4" />
                  Shutdown
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleForceReboot} className="text-red-600">
                  <Power className="mr-2 h-4 w-4" />
                  Force Reboot
                </ContextMenuItem>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onClick={handleMaintenanceMode}>
          <Wrench className="mr-2 h-4 w-4" />
          Maintenance Mode
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Organization */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Tag className="mr-2 h-4 w-4" />
            Add Tag
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem onClick={() => handleAddTag('Critical')}>
              <span className="mr-2 h-2 w-2 rounded-full bg-red-500" />
              Critical
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddTag('High Priority')}>
              <span className="mr-2 h-2 w-2 rounded-full bg-orange-500" />
              High Priority
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddTag('Testing')}>
              <span className="mr-2 h-2 w-2 rounded-full bg-blue-500" />
              Testing
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddTag('Production')}>
              <span className="mr-2 h-2 w-2 rounded-full bg-green-500" />
              Production
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddTag('Faculty')}>
              <span className="mr-2 h-2 w-2 rounded-full bg-purple-500" />
              Faculty
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Users className="mr-2 h-4 w-4" />
            Add to Group
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem onClick={() => handleAddToGroup('Lab A Computers')}>
              Lab A Computers
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddToGroup('Engineering Pool')}>
              Engineering Pool
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddToGroup('Student Workstations')}>
              Student Workstations
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAddToGroup('Faculty Machines')}>
              Faculty Machines
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Remote Actions */}
        {!isOffline && (
          <>
            <ContextMenuItem onClick={handleRemoteDesktop}>
              <Monitor className="mr-2 h-4 w-4" />
              Remote Desktop
              <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleViewLogs}>
              <FileText className="mr-2 h-4 w-4" />
              View Logs
            </ContextMenuItem>

            <ContextMenuItem onClick={handleRunDiagnostics}>
              <Activity className="mr-2 h-4 w-4" />
              Run Diagnostics
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {/* Copy Actions */}
        <ContextMenuItem onClick={handleCopyMachineId}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Machine ID
        </ContextMenuItem>

        <ContextMenuItem onClick={handleCopyIpAddress}>
          <Copy className="mr-2 h-4 w-4" />
          Copy IP Address
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Advanced */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Settings className="mr-2 h-4 w-4" />
            Advanced
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem>
              Edit Configuration
            </ContextMenuItem>
            <ContextMenuItem>
              Update Agent
            </ContextMenuItem>
            <ContextMenuItem>
              Clear Cache
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Remove from Fleet
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}