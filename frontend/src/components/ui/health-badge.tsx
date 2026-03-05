export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

interface HealthBadgeProps {
  grade: HealthGrade
  score: number
  variant?: 'default' | 'circle' | 'compact'
  size?: 'sm' | 'md' | 'lg'
}

const gradeConfig = {
  A: {
    gradient: 'bg-gradient-to-br from-green-500 to-green-600',
    border: 'border-green-500',
    text: 'text-green-700',
    bg: 'bg-green-50',
  },
  B: {
    gradient: 'bg-gradient-to-br from-emerald-400 to-green-500',
    border: 'border-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  C: {
    gradient: 'bg-gradient-to-br from-yellow-400 to-yellow-500',
    border: 'border-yellow-500',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50',
  },
  D: {
    gradient: 'bg-gradient-to-br from-orange-400 to-orange-500',
    border: 'border-orange-500',
    text: 'text-orange-700',
    bg: 'bg-orange-50',
  },
  F: {
    gradient: 'bg-gradient-to-br from-red-500 to-red-600',
    border: 'border-red-500',
    text: 'text-red-700',
    bg: 'bg-red-50',
  },
}

const sizeConfig = {
  sm: {
    container: 'w-8 h-8',
    grade: 'text-sm',
    score: 'text-[10px]',
  },
  md: {
    container: 'w-12 h-12',
    grade: 'text-xl',
    score: 'text-xs',
  },
  lg: {
    container: 'w-16 h-16',
    grade: 'text-2xl',
    score: 'text-sm',
  },
}

export function HealthBadge({ grade, score, variant = 'default', size = 'md' }: HealthBadgeProps) {
  const config = gradeConfig[grade]
  const sizeStyles = sizeConfig[size]

  // Circle variant (like in catalog)
  if (variant === 'circle') {
    return (
      <div
        className={`
          ${config.gradient} ${sizeStyles.container}
          rounded-full flex flex-col items-center justify-center
          text-white shadow-md
        `}
      >
        <span className={`font-bold leading-none ${sizeStyles.grade}`}>{grade}</span>
        <span className={`leading-none ${sizeStyles.score}`}>{score}%</span>
      </div>
    )
  }

  // Compact variant (inline badge)
  if (variant === 'compact') {
    return (
      <span
        className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded-full
          border ${config.border} ${config.bg} ${config.text}
          text-xs font-medium
        `}
      >
        Grade {grade}
      </span>
    )
  }

  // Default variant (rounded square)
  return (
    <div
      className={`
        ${config.gradient} ${sizeStyles.container}
        rounded-lg flex flex-col items-center justify-center
        text-white shadow-md
      `}
    >
      <span className={`font-bold leading-none ${sizeStyles.grade}`}>{grade}</span>
      <span className={`leading-none ${sizeStyles.score}`}>{score}%</span>
    </div>
  )
}
