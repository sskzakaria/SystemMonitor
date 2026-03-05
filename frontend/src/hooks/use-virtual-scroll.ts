import { useState, useEffect, useRef, useMemo } from 'react'

interface VirtualScrollOptions {
  itemHeight: number
  containerHeight: number
  overscan?: number
}

/**
 * Virtual scrolling hook for rendering only visible items
 * Dramatically improves performance for large lists (300+ items)
 */
export function useVirtualScroll<T>(
  items: T[],
  options: VirtualScrollOptions
) {
  const { itemHeight, containerHeight, overscan = 3 } = options
  const [scrollTop, setScrollTop] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Calculate visible range
  const { startIndex, endIndex, visibleItems, totalHeight, offsetY } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
    
    const visibleItems = items.slice(startIndex, endIndex + 1)
    const totalHeight = items.length * itemHeight
    const offsetY = startIndex * itemHeight

    return { startIndex, endIndex, visibleItems, totalHeight, offsetY }
  }, [items, scrollTop, itemHeight, containerHeight, overscan])

  // Handle scroll events
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleScroll = () => {
      setScrollTop(element.scrollTop)
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [])

  return {
    scrollRef,
    visibleItems,
    totalHeight,
    offsetY,
    startIndex
  }
}
