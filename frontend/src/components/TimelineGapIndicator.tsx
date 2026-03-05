/**
 * Timeline Gap Indicator Component
 * 
 * Shows visual gaps in timeline when machines are offline
 * Displays actual offline periods instead of just showing latest data
 */

import { AlertTriangle, WifiOff, Clock } from 'lucide-react'
import { calculateTimeGap, formatExactTimestampWithTimezone } from '../lib/timezone-utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

interface TimelineGapIndicatorProps {
  startTime: Date | string | number
  endTime: Date | string | number
  className?: string
}

export function TimelineGapIndicator({ startTime, endTime, className = '' }: TimelineGapIndicatorProps) {
  const gap = calculateTimeGap(startTime, endTime)
  
  if (!gap.isSignificant) {
    return null // Don't show gaps less than 5 minutes
  }
  
  const start = typeof startTime === 'string' || typeof startTime === 'number' ? new Date(startTime) : startTime
  const end = typeof endTime === 'string' || typeof endTime === 'number' ? new Date(endTime) : endTime
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded ${className}`}
            role="alert"
            aria-label={`Data gap: ${gap.duration}`}
          >
            <WifiOff className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-amber-900">
                Offline Period
              </div>
              <div className="text-xs text-amber-700">
                {gap.duration} gap
              </div>
            </div>
            <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-2">
            <div>
              <div className="font-semibold text-xs uppercase text-muted-foreground">Offline Start</div>
              <div className="text-sm">{formatExactTimestampWithTimezone(start)}</div>
            </div>
            <div>
              <div className="font-semibold text-xs uppercase text-muted-foreground">Back Online</div>
              <div className="text-sm">{formatExactTimestampWithTimezone(end)}</div>
            </div>
            <div className="pt-2 border-t">
              <div className="font-semibold text-xs uppercase text-muted-foreground">Duration</div>
              <div className="text-sm font-medium text-amber-600">{gap.duration}</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Compact version for charts and dense UIs
 */
export function CompactGapIndicator({ startTime, endTime }: TimelineGapIndicatorProps) {
  const gap = calculateTimeGap(startTime, endTime)
  
  if (!gap.isSignificant) {
    return null
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>{gap.duration}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            Machine was offline for {gap.duration}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
