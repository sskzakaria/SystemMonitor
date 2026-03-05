import { useEffect } from 'react'

/**
 * Locks body scroll when a modal is open
 * Prevents background scrolling and layout shift
 */
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return

    // Save original values
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    // Calculate scrollbar width to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    // Lock scroll
    document.body.style.overflow = 'hidden'
    
    // Add padding to compensate for scrollbar removal
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    // Cleanup: Restore original values
    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [isLocked])
}
