/**
 * Accessibility Utilities for University Computer Monitoring System
 * Provides keyboard shortcuts, focus management, and ARIA helpers
 */

/**
 * Keyboard Navigation Map
 */
export const KEYBOARD_SHORTCUTS = {
  SEARCH: '/',
  ESCAPE: 'Escape',
  ENTER: 'Enter',
  SPACE: ' ',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  TAB: 'Tab',
  HOME: 'Home',
  END: 'End',
} as const

/**
 * Focus management utilities
 */
export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== KEYBOARD_SHORTCUTS.TAB) return

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus()
        e.preventDefault()
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus()
        e.preventDefault()
      }
    }
  }

  element.addEventListener('keydown', handleTabKey)
  return () => element.removeEventListener('keydown', handleTabKey)
}

/**
 * Announce to screen readers via live region
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div')
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.appendChild(announcement)
  
  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

/**
 * Generate unique IDs for ARIA relationships
 */
let idCounter = 0
export function generateUniqueId(prefix: string = 'a11y'): string {
  return `${prefix}-${++idCounter}`
}

/**
 * Format number for screen readers
 */
export function formatNumberForScreenReader(value: number, unit?: string): string {
  const formatted = value.toFixed(1)
  return unit ? `${formatted} ${unit}` : formatted
}

/**
 * Get descriptive status text for screen readers
 */
export function getStatusDescription(status: string): string {
  const descriptions = {
    online: 'Machine is online and operating normally',
    offline: 'Machine is offline and unavailable',
    'in-use': 'Machine is in use with an active user session',
    idle: 'Machine is idle with minimal activity',
    maintenance: 'Machine is under maintenance',
    error: 'Machine is experiencing errors',
    critical: 'Machine has critical health issues',
    warning: 'Machine has warning-level issues',
  }
  
  return descriptions[status as keyof typeof descriptions] || `Machine status: ${status}`
}

/**
 * Get health grade description for screen readers
 */
export function getHealthGradeDescription(grade: string, score: number): string {
  const gradeDescriptions = {
    A: 'Excellent performance',
    B: 'Good performance',
    C: 'Average performance',
    D: 'Below average performance',
    F: 'Poor performance',
  }
  const desc = gradeDescriptions[grade as keyof typeof gradeDescriptions] || 'Unknown'
  return `Health grade ${grade}, ${desc}, score ${score} out of 100`
}

/**
 * Keyboard event helpers
 */
export function isKeyboardEvent(event: React.KeyboardEvent, key: string): boolean {
  return event.key === key
}

export function handleKeyboardClick(
  event: React.KeyboardEvent,
  onClick: () => void
) {
  if (event.key === KEYBOARD_SHORTCUTS.ENTER || event.key === KEYBOARD_SHORTCUTS.SPACE) {
    event.preventDefault()
    onClick()
  }
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Screen reader only text component props
 */
export function createScreenReaderText(text: string): React.ReactNode {
  return <span className="sr-only">{text}</span>
}