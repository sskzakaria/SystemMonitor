import { useEffect } from 'react'

interface KeyboardShortcutHandlers {
  onRefresh?: () => void
  onSearch?: () => void
  onEscape?: () => void
  onHelp?: () => void
}

/**
 * Custom hook for handling Escape key press
 * Commonly used for closing modals/dialogs
 */
export function useEscapeKey(callback: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callback()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [callback])
}

/**
 * Custom hook for keyboard shortcuts
 * 
 * Shortcuts:
 * - R: Refresh data
 * - /: Focus search
 * - ESC: Close dialogs / Clear selection
 * - ?: Show help (Shift + /)
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field or textarea
      const target = e.target as HTMLElement
      const isTyping = 
        target instanceof HTMLInputElement || 
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable

      // Allow ESC to work even when typing (to blur inputs)
      if (e.key === 'Escape') {
        if (isTyping) {
          target.blur()
        } else {
          handlers.onEscape?.()
        }
        return
      }

      // Ignore other shortcuts when typing
      if (isTyping) return

      // Handle keyboard shortcuts
      switch (e.key.toLowerCase()) {
        case 'r':
          // Prevent if Ctrl/Cmd+R (browser refresh)
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            handlers.onRefresh?.()
          }
          break

        case '/':
          // Show help if Shift+/
          if (e.shiftKey) {
            e.preventDefault()
            handlers.onHelp?.()
          } else {
            e.preventDefault()
            handlers.onSearch?.()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handlers])
}

/**
 * Helper to show keyboard shortcut hints
 */
export const KEYBOARD_SHORTCUTS = [
  { key: 'R', description: 'Refresh data' },
  { key: '/', description: 'Focus search' },
  { key: 'ESC', description: 'Close dialogs / Clear selection' },
  { key: 'Shift + /', description: 'Show keyboard shortcuts' }
] as const