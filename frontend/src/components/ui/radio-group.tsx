import * as React from "react"

interface RadioGroupContextValue {
  value: string
  onValueChange: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | undefined>(undefined)

interface RadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function RadioGroup({ value, onValueChange, children, className }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div className={className}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

interface RadioGroupItemProps {
  value: string
  id: string
  className?: string
}

export function RadioGroupItem({ value, id, className = "" }: RadioGroupItemProps) {
  const context = React.useContext(RadioGroupContext)
  
  if (!context) {
    throw new Error('RadioGroupItem must be used within RadioGroup')
  }

  const { value: selectedValue, onValueChange } = context
  const isChecked = selectedValue === value

  return (
    <input
      type="radio"
      id={id}
      value={value}
      checked={isChecked}
      onChange={(e) => onValueChange(e.target.value)}
      className={`h-4 w-4 text-primary border-gray-300 focus:ring-2 focus:ring-primary ${className}`}
    />
  )
}
