import { Circle, AlertTriangle, Wrench, Activity, User, HelpCircle } from 'lucide-react'

export type MachineStatus = 'online' | 'idle' | 'offline' | 'in-use' | 'error' | 'maintenance' | 'unknown'

interface StatusBadgeProps {
  status: MachineStatus
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const statusConfig = {
  online: {
    label: 'Online',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: Circle,
    iconColor: 'text-green-500',
    dot: 'bg-green-500',
  },
  'in-use': {
    label: 'In Use',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: User,
    iconColor: 'text-blue-500',
    dot: 'bg-blue-500',
  },
  idle: {
    label: 'Idle',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: Activity,
    iconColor: 'text-yellow-500',
    dot: 'bg-yellow-500',
  },
  offline: {
    label: 'Offline',
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    icon: Circle,
    iconColor: 'text-gray-500',
    dot: 'bg-gray-500',
  },
  error: {
    label: 'Error',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    dot: 'bg-red-500',
    pulse: true,
  },
  maintenance: {
    label: 'Maintenance',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: Wrench,
    iconColor: 'text-purple-500',
    dot: 'bg-purple-500',
  },
  // ✅ NEW: Add unknown status
  unknown: {
    label: 'Unknown',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-300',
    icon: HelpCircle,
    iconColor: 'text-gray-400',
    dot: 'bg-gray-400',
  },
}

const sizeConfig = {
  sm: {
    padding: 'px-2 py-0.5',
    text: 'text-xs',
    icon: 'h-3 w-3',
  },
  md: {
    padding: 'px-3 py-1',
    text: 'text-sm',
    icon: 'h-4 w-4',
  },
  lg: {
    padding: 'px-4 py-1.5',
    text: 'text-base',
    icon: 'h-5 w-5',
  },
}

export function StatusBadge({ status, showIcon = true, size = 'md' }: StatusBadgeProps) {
  // ✅ FIX: Add fallback for undefined status
  const config = statusConfig[status] || statusConfig.offline
  const sizeStyles = sizeConfig[size]
  const Icon = config.icon

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${config.bg} ${config.text} ${config.border} border
        ${sizeStyles.padding} ${sizeStyles.text}
        ${config.pulse ? 'animate-pulse' : ''}
      `}
    >
      {showIcon && (
        <Icon className={`${sizeStyles.icon} ${config.iconColor} fill-current`} />
      )}
      {config.label}
    </span>
  )
}

// Simple status dot for compact displays
export function StatusDot({ status, size = 'md' }: { status: MachineStatus; size?: 'sm' | 'md' | 'lg' }) {
  const config = statusConfig[status]
  const dotSize = size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'

  return (
    <span
      className={`
        inline-block rounded-full
        ${config.dot} ${dotSize}
        ${config.pulse ? 'animate-pulse' : ''}
      `}
      title={config.label}
    />
  )
}