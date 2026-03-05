import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { 
  Server, 
  Filter, 
  Search, 
  AlertCircle,
  Inbox,
  Database,
  LucideIcon
} from 'lucide-react'

interface EmptyStateProps {
  type?: 'no-machines' | 'no-results' | 'error' | 'no-data' | 'custom'
  title?: string
  description?: string
  icon?: LucideIcon
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

/**
 * Polished empty state component with helpful messaging
 * Follows design system guidelines
 */
export function EmptyState({
  type = 'no-results',
  title,
  description,
  icon: CustomIcon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction
}: EmptyStateProps) {
  
  // Default configurations for each type
  const configs = {
    'no-machines': {
      icon: Server,
      title: 'No machines found',
      description: 'There are no machines to display at the moment. Check back later or verify your connection.',
      iconColor: 'text-gray-400',
      bgColor: 'bg-gray-100'
    },
    'no-results': {
      icon: Filter,
      title: 'No matching machines',
      description: 'Try adjusting your filters or search criteria to see more results.',
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-100',
      defaultAction: 'Clear all filters'
    },
    'error': {
      icon: AlertCircle,
      title: 'Something went wrong',
      description: 'We encountered an error loading the data. Please try again.',
      iconColor: 'text-red-400',
      bgColor: 'bg-red-100',
      defaultAction: 'Retry'
    },
    'no-data': {
      icon: Database,
      title: 'No data available',
      description: 'Data is still being collected. Check back in a few minutes.',
      iconColor: 'text-purple-400',
      bgColor: 'bg-purple-100'
    },
    'custom': {
      icon: Inbox,
      title: 'Nothing here yet',
      description: 'Start by adding some items.',
      iconColor: 'text-gray-400',
      bgColor: 'bg-gray-100'
    }
  }

  const config = configs[type]
  const Icon = CustomIcon || config.icon
  const finalTitle = title || config.title
  const finalDescription = description || config.description
  const finalActionLabel = actionLabel || config.defaultAction

  return (
    <Card className="border-2 border-dashed border-gray-200">
      <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
        {/* Icon Circle */}
        <div className={`
          h-24 w-24 rounded-full flex items-center justify-center mb-6
          ${config.bgColor}
          animate-fade-in
        `}>
          <Icon className={`h-12 w-12 ${config.iconColor}`} />
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-gray-900 mb-2 animate-slide-in">
          {finalTitle}
        </h3>

        {/* Description */}
        <p className="text-muted-foreground max-w-md mb-6 animate-slide-in" style={{ animationDelay: '50ms' }}>
          {finalDescription}
        </p>

        {/* Actions */}
        <div className="flex gap-3 animate-slide-in" style={{ animationDelay: '100ms' }}>
          {onAction && finalActionLabel && (
            <Button 
              onClick={onAction}
              className="gap-2"
            >
              {finalActionLabel}
            </Button>
          )}
          {onSecondaryAction && secondaryActionLabel && (
            <Button 
              variant="outline"
              onClick={onSecondaryAction}
              className="gap-2"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact empty state for smaller areas
 */
export function EmptyStateCompact({
  icon: Icon = Inbox,
  title = 'No items',
  description,
  action
}: {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h4 className="text-sm font-semibold text-gray-900 mb-1">{title}</h4>
      {description && (
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}
