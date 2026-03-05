import { X, Tag } from 'lucide-react'
import { Button } from './button'

interface TagPillProps {
  label: string
  onRemove?: () => void
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md'
}

const variantConfig = {
  default: {
    bg: 'bg-gray-50 hover:bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
  },
  primary: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  success: {
    bg: 'bg-green-50 hover:bg-green-100',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  warning: {
    bg: 'bg-yellow-50 hover:bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
  },
  error: {
    bg: 'bg-red-50 hover:bg-red-100',
    text: 'text-red-700',
    border: 'border-red-200',
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
}

export function TagPill({ label, onRemove, icon, variant = 'default', size = 'md' }: TagPillProps) {
  const config = variantConfig[variant]
  const sizeStyles = sizeConfig[size]
  const Icon = icon || Tag

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium border
        ${config.bg} ${config.text} ${config.border}
        ${sizeStyles.padding} ${sizeStyles.text}
        transition-all duration-150
        ${onRemove ? 'hover:scale-105' : ''}
      `}
    >
      <Icon className={`${sizeStyles.icon} flex-shrink-0`} />
      <span>{label}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 -mr-0.5 hover:bg-black/10 rounded-full p-0.5 transition-colors"
          aria-label={`Remove ${label}`}
        >
          <X className={`${sizeStyles.icon}`} />
        </button>
      )}
    </span>
  )
}

// Count badge (notification style)
export function CountBadge({ count, max = 99 }: { count: number; max?: number }) {
  const displayCount = count > max ? `${max}+` : count.toString()

  return (
    <span
      className="
        absolute -top-1 -right-1
        min-w-[18px] h-[18px] px-1
        flex items-center justify-center
        bg-red-500 text-white
        text-[10px] font-bold
        rounded-full
        border-2 border-white
      "
    >
      {displayCount}
    </span>
  )
}
