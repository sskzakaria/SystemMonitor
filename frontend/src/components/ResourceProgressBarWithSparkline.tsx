import { formatPercentage } from '../lib/design-tokens'
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { useMemo } from 'react'
import { formatTimeWithTimezone } from '../lib/timezone-utils'

interface ResourceProgressBarWithSparklineProps {
  label: string
  value: number
  type?: 'cpu' | 'memory' | 'disk' | 'network'
  showPercentage?: boolean
  showSparkline?: boolean
  height?: 'sm' | 'md' | 'lg'
}

// ✅ DATA-DRIVEN: Generate sparkline based on current value (flat line until historical data available)
// In production, this should use real historical data from InfluxDB
function generateSparklineData(value: number): { v: number; time: string }[] {
  const data = []
  const now = new Date()
  // Use current value for all points until real historical data is available
  for (let i = 11; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000) // 1 hour intervals
    data.push({ 
      v: value, // Use actual current value, not random variance
      time: formatTimeWithTimezone(time)
    })
  }
  return data
}

// Custom tooltip for sparklines
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 shadow-lg px-3 py-2 rounded-lg">
        <p className="font-semibold text-sm text-gray-900 mb-0.5">
          {payload[0].value.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">
          {payload[0].payload.time}
        </p>
      </div>
    )
  }
  return null
}

/**
 * Resource Progress Bar with optional sparkline graph
 * Shows last 12 hours of simulated data
 */
export function ResourceProgressBarWithSparkline({
  label,
  value,
  type = 'cpu',
  showPercentage = true,
  showSparkline = false,
  height = 'md'
}: ResourceProgressBarWithSparklineProps) {
  
  // Color coding based on design guide thresholds
  const getColorClass = () => {
    if (type === 'network') return 'bg-blue-500'
    if (value <= 60) return 'bg-green-500'
    if (value <= 85) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getTextColorClass = () => {
    if (type === 'network') return 'text-blue-600'
    if (value <= 60) return 'text-green-600'
    if (value <= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getLineColor = () => {
    if (type === 'network') return '#3B82F6' // blue-500
    if (value <= 60) return '#10B981' // green-500
    if (value <= 85) return '#F59E0B' // yellow-500
    return '#EF4444' // red-500
  }

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }

  // Generate sparkline data
  const sparklineData = useMemo(() => generateSparklineData(value), [value])

  return (
    <div className="w-full">
      {/* Label and Value Row */}
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted-foreground font-medium flex items-center gap-2">
          {label}
        </span>
        {showPercentage && (
          <span className={`font-mono-tabular font-semibold ${getTextColorClass()}`}>
            {formatPercentage(value)}
          </span>
        )}
      </div>

      {/* Progress Bar + Optional Sparkline */}
      <div className="flex items-center gap-2">
        {/* Progress Bar */}
        <div className={`flex-1 ${heightClasses[height]} bg-gray-100 rounded-full overflow-hidden`}>
          <div
            className={`
              ${heightClasses[height]} 
              ${getColorClass()}
              transition-all duration-300 ease-out
              rounded-full
            `}
            style={{ width: `${Math.min(value, 100)}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${formatPercentage(value)}`}
          />
        </div>

        {/* Sparkline Graph */}
        {showSparkline && (
          <div 
            className="w-20 h-6 flex-shrink-0 opacity-60 hover:opacity-100 transition-all duration-200 hover:scale-105 cursor-pointer bg-gray-50 rounded px-1" 
            style={{ minWidth: '80px', minHeight: '24px' }}
            title="Last 12 hours"
          >
            <ResponsiveContainer width="100%" height={24}>
              <LineChart data={sparklineData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line 
                  type="monotone" 
                  dataKey="v" 
                  stroke={getLineColor()}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <RechartsTooltip 
                  content={<CustomTooltip />}
                  cursor={{ stroke: getLineColor(), strokeWidth: 1, strokeDasharray: '3 3' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}