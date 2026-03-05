import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  end: number
  duration?: number
  decimals?: number
  className?: string
  suffix?: string
}

export function CountUp({ end, duration = 1000, decimals = 0, className = '', suffix = '' }: CountUpProps) {
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      
      const nextCount = easeOutQuart * end
      countRef.current = nextCount
      setCount(nextCount)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setCount(end) // Ensure we end at the exact value
      }
    }

    startTimeRef.current = null
    requestAnimationFrame(animate)
  }, [end, duration])

  const formattedCount = decimals > 0 
    ? count.toFixed(decimals)
    : Math.round(count).toString()

  return (
    <span className={className}>
      {formattedCount}{suffix}
    </span>
  )
}
