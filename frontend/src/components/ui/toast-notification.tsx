import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { Button } from './button'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  dismissible?: boolean
}

interface ToastNotificationProps {
  toast: Toast
  onDismiss: (id: string) => void
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-500',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-white',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-500',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-white',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    borderColor: 'border-l-yellow-500',
    bgColor: 'bg-white',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-white',
  },
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  const [isExiting, setIsExiting] = useState(false)
  const config = toastConfig[toast.type]
  const Icon = config.icon
  const duration = toast.duration ?? 5000

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 300) // Match exit animation duration
  }

  return (
    <div
      className={`
        ${config.bgColor} ${config.borderColor}
        border-l-4 rounded-lg shadow-lg
        p-4 mb-3 min-w-[320px] max-w-md
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
        animate-slide-in-right
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`${config.iconColor} h-5 w-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm">{toast.title}</h4>
          {toast.message && (
            <p className="text-sm text-gray-600 mt-1">{toast.message}</p>
          )}
        </div>
        {toast.dismissible !== false && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 flex-shrink-0 hover:bg-gray-100"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// Toast container component
interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
}

const positionConfig = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
}

export function ToastContainer({ toasts, onDismiss, position = 'top-right' }: ToastContainerProps) {
  return (
    <div className={`fixed ${positionConfig[position]} z-[9999] pointer-events-none`}>
      <div className="flex flex-col pointer-events-auto">
        {toasts.map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

// Toast hook for easy usage
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (
    type: Toast['type'],
    title: string,
    message?: string,
    duration?: number
  ) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      id,
      type,
      title,
      message,
      duration,
      dismissible: true,
    }

    setToasts((prev) => [...prev, newToast])
  }

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  return {
    toasts,
    showToast,
    dismissToast,
    success: (title: string, message?: string) => showToast('success', title, message),
    error: (title: string, message?: string) => showToast('error', title, message),
    warning: (title: string, message?: string) => showToast('warning', title, message),
    info: (title: string, message?: string) => showToast('info', title, message),
  }
}
