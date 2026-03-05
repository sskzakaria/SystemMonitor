import { useState, useEffect } from 'react'

/**
 * Persists state to localStorage
 * Automatically syncs across tabs
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Update localStorage when value changes
  const setValue = (value: T) => {
    try {
      setStoredValue(value)
      window.localStorage.setItem(key, JSON.stringify(value))
      
      // Dispatch custom event for cross-tab sync
      window.dispatchEvent(new CustomEvent('local-storage', { 
        detail: { key, value } 
      }))
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error)
    }
  }

  // Listen for changes in other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      if (e instanceof StorageEvent) {
        if (e.key === key && e.newValue) {
          try {
            setStoredValue(JSON.parse(e.newValue))
          } catch (error) {
            console.warn(`Error parsing localStorage value for "${key}":`, error)
          }
        }
      } else if (e instanceof CustomEvent) {
        if (e.detail?.key === key) {
          setStoredValue(e.detail.value)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange as EventListener)
    window.addEventListener('local-storage', handleStorageChange as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorageChange as EventListener)
      window.removeEventListener('local-storage', handleStorageChange as EventListener)
    }
  }, [key])

  return [storedValue, setValue]
}
