import React from 'react'

/**
 * Log render count (for debugging unnecessary re-renders)
 */
export function useRenderCount(componentName: string) {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const renderCount = React.useRef(0)
    
    React.useEffect(() => {
      renderCount.current += 1
      console.log(`🔄 ${componentName} rendered ${renderCount.current} times`)
    })
  }
}

/**
 * Performance measurement utility
 */
export class Performance {
  private marks: Map<string, number> = new Map()

  start(label: string) {
    this.marks.set(label, performance.now())
  }

  end(label: string) {
    const startTime = this.marks.get(label)
    if (!startTime) {
      console.warn(`No start mark found for "${label}"`)
      return
    }
    
    const duration = performance.now() - startTime
    this.marks.delete(label)
    
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`)
    }
    
    return duration
  }
  
  measure(label: string, startMark: string, endMark: string) {
    const start = this.marks.get(startMark)
    const end = this.marks.get(endMark)
    
    if (!start || !end) {
      console.warn(`Missing marks for measurement "${label}"`)
      return
    }
    
    const duration = end - start
    
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`)
    }
    
    return duration
  }
}