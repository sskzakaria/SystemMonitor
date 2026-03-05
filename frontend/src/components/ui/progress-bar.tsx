import { useEffect, useState } from 'react'

interface ProgressBarProps {
  label?: string
  value: number
  max?: number
  showValue?: boolean
  colorThresholds?: {
    low: number
    medium: number
  }
  animate?: boolean
  height?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'gradient'
}

const heightConfig = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export function ProgressBar({
  label,
  value,
  max = 100,
  showValue = true,
  colorThresholds = { low: 60, medium: 85 },
  animate = true,
  height = 'md',
  variant = 'default',
}: ProgressBarProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value)
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  // Animate value on mount/change
  useEffect(() => {
    if (!animate) {
      setDisplayValue(value)
      return
    }

    const startValue = displayValue
    const difference = value - startValue
    const duration = 500
    const startTime = Date.now()

    const animateValue = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-out function
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + difference * easeOut

      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(animateValue)
      }
    }

    requestAnimationFrame(animateValue)
  }, [value, animate])

  // Determine color based on thresholds
  const getColor = () => {
    if (percentage <= colorThresholds.low) {
      return variant === 'gradient'
        ? 'bg-gradient-to-r from-green-500 to-green-600'
        : 'bg-green-500'
    }
    if (percentage <= colorThresholds.medium) {
      return variant === 'gradient'
        ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
        : 'bg-yellow-500'
    }
    return variant === 'gradient'
      ? 'bg-gradient-to-r from-red-500 to-red-600'
      : 'bg-red-500'
  }

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-gray-700">{label}</span>}
          {showValue && (
            <span className="text-sm font-medium font-mono-tabular text-gray-900">
              {displayValue.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${heightConfig[height]}`}>
        <div
          className={`${getColor()} h-full rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Stacked progress bar for multiple segments
interface StackedProgressBarProps {
  segments: Array<{
    label: string
    value: number
    color: string
  }>
  max?: number
  height?: 'sm' | 'md' | 'lg'
}

export function StackedProgressBar({ segments, max = 100, height = 'md' }: StackedProgressBarProps) {
  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden flex ${heightConfig[height]}`}>
        {segments.map((segment, index) => {
          const percentage = (segment.value / max) * 100
          return (
            <div
              key={index}
              className={`${segment.color} h-full transition-all duration-300 ease-out`}
              style={{ width: `${percentage}%` }}
              title={`${segment.label}: ${segment.value}%`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center gap-1 text-xs">
            <div className={`w-3 h-3 rounded-sm ${segment.color}`} />
            <span className="text-gray-600">{segment.label}</span>
            <span className="font-medium font-mono-tabular text-gray-900">{segment.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Circular progress (for health scores)
interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  label?: string
  showPercentage?: boolean
}

export function CircularProgress({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  label,
  showPercentage = true,
}: CircularProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  // Determine color
  const getColor = () => {
    if (percentage >= 90) return '#10B981' // Green
    if (percentage >= 80) return '#34D399' // Light green
    if (percentage >= 70) return '#FBBF24' // Yellow
    if (percentage >= 60) return '#FB923C' // Orange
    return '#EF4444' // Red
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-2xl font-bold">{label}</span>}
        {showPercentage && (
          <span className="text-xs text-gray-600 font-mono-tabular">{percentage.toFixed(0)}%</span>
        )}
      </div>
    </div>
  )
}
