/**
 * Timezone Display Component
 * 
 * Shows current user timezone in the UI
 * Useful for confirming timezone detection is working correctly
 */

import { Clock, Globe } from 'lucide-react'
import { getTimezoneDisplayInfo } from '../lib/timezone-utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

interface TimezoneDisplayProps {
  variant?: 'full' | 'compact' | 'icon-only'
  className?: string
}

export function TimezoneDisplay({ variant = 'compact', className = '' }: TimezoneDisplayProps) {
  const tzInfo = getTimezoneDisplayInfo()
  
  if (variant === 'icon-only') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
              <Globe className="h-3.5 w-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <div className="font-semibold">{tzInfo.fullDisplay}</div>
              <div className="text-xs text-muted-foreground">{tzInfo.timezone}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  
  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium">{tzInfo.abbreviation}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <div className="font-semibold">{tzInfo.fullDisplay}</div>
              <div className="text-xs text-muted-foreground">{tzInfo.timezone}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  
  // Full variant
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
      <Globe className="h-4 w-4 text-gray-500" />
      <div className="text-sm">
        <div className="font-medium text-gray-900">{tzInfo.fullDisplay}</div>
        <div className="text-xs text-gray-500">{tzInfo.timezone}</div>
      </div>
    </div>
  )
}

/**
 * Timezone badge for navigation bar
 */
export function TimezoneNavBadge() {
  const tzInfo = getTimezoneDisplayInfo()
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
            <Clock className="h-3 w-3" />
            <span>{tzInfo.abbreviation}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div className="font-semibold">Your Timezone</div>
            <div className="text-muted-foreground mt-1">{tzInfo.timezone}</div>
            <div className="text-muted-foreground">{tzInfo.offset}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
