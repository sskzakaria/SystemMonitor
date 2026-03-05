import { forwardRef, InputHTMLAttributes, useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'

interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  success?: string
  helperText?: string
  showValidation?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const sizeConfig = {
  sm: {
    input: 'h-8 px-2 text-sm',
    label: 'text-xs',
  },
  md: {
    input: 'h-10 px-3 text-sm',
    label: 'text-sm',
  },
  lg: {
    input: 'h-12 px-4 text-base',
    label: 'text-base',
  },
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      label,
      error,
      success,
      helperText,
      showValidation = true,
      inputSize = 'md',
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const hasError = !!error
    const hasSuccess = !!success && !hasError
    const sizeStyles = sizeConfig[inputSize]

    // Determine border and ring colors
    const getBorderClass = () => {
      if (hasError) return 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      if (hasSuccess) return 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
      return 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
    }

    return (
      <div className="w-full">
        {label && (
          <label className={`block font-medium text-gray-700 mb-1.5 ${sizeStyles.label}`}>
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            className={`
              w-full rounded-lg border bg-white
              transition-all duration-150
              ${sizeStyles.input}
              ${getBorderClass()}
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon || showValidation ? 'pr-10' : ''}
              ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}
              ${isFocused && !disabled ? 'ring-4' : ''}
              focus:outline-none
              ${className}
            `}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />

          {/* Validation Icons */}
          {showValidation && !rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {hasError && <X className="h-5 w-5 text-red-500" />}
              {hasSuccess && <Check className="h-5 w-5 text-green-500" />}
            </div>
          )}

          {rightIcon && !showValidation && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Helper/Error/Success Text */}
        {(error || success || helperText) && (
          <div className="mt-1.5 flex items-start gap-1.5">
            {hasError && <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
            <p
              className={`text-xs ${
                hasError
                  ? 'text-red-600'
                  : hasSuccess
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}
            >
              {error || success || helperText}
            </p>
          </div>
        )}
      </div>
    )
  }
)

InputField.displayName = 'InputField'
