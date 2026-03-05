import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}

export function AnimatedNumber({ 
  value, 
  duration = 800, 
  decimals = 0,
  suffix = '',
  prefix = '',
  className = ''
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isAnimating, setIsAnimating] = useState(false)
  const previousValue = useRef(value)
  const frameRef = useRef<number>()
  const startTimeRef = useRef<number>()

  useEffect(() => {
    if (value === previousValue.current) return

    setIsAnimating(true)
    const start = previousValue.current
    const end = value
    const diff = end - start

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function: easeOutCubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + (diff * eased)

      setDisplayValue(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(end)
        previousValue.current = end
        startTimeRef.current = undefined
        setIsAnimating(false)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value, duration])

  const formattedValue = displayValue.toFixed(decimals)

  return (
    <span className={`${className} ${isAnimating ? 'animate-number-count' : ''} font-mono-tabular`}>
      {prefix}{formattedValue}{suffix}
    </span>
  )
}
