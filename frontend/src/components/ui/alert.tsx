import { X, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Button } from './button'

interface AlertProps {
  variant: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  dismissible?: boolean
  onDismiss?: () => void
  action?: {
    label: string
    onClick: () => void
  }
}

const alertStyles = {
  info: {
    container: 'bg-blue-50 border-l-4 border-blue-500',
    text: 'text-blue-900',
    icon: Info,
    iconColor: 'text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  warning: {
    container: 'bg-yellow-50 border-l-4 border-yellow-500',
    text: 'text-yellow-900',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
  error: {
    container: 'bg-red-50 border-l-4 border-red-500',
    text: 'text-red-900',
    icon: XCircle,
    iconColor: 'text-red-600',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  success: {
    container: 'bg-green-50 border-l-4 border-green-500',
    text: 'text-green-900',
    icon: CheckCircle,
    iconColor: 'text-green-600',
    button: 'bg-green-600 hover:bg-green-700 text-white',
  },
}

export function Alert({ variant, title, message, dismissible, onDismiss, action }: AlertProps) {
  const styles = alertStyles[variant]
  const Icon = styles.icon

  return (
    <div className={`${styles.container} p-4 rounded-lg mb-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${styles.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h4 className={`font-semibold ${styles.text} mb-1`}>{title}</h4>
          <p className={`text-sm ${styles.text}`}>{message}</p>
          {action && (
            <Button
              variant="default"
              size="sm"
              className={`mt-3 ${styles.button}`}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        </div>
        {dismissible && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 hover:bg-black/5"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
