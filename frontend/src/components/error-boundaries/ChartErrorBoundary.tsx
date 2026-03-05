/**
 * Chart Error Boundary
 * Specialized error boundary for chart/visualization components
 */

import React, { Component, ReactNode } from 'react'
import { BarChart3, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '../ui/card'

interface Props {
  children: ReactNode
  chartName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error.message?.includes('figma.com/webpack-artifacts')) {
      return
    }
    
    console.error(`❌ Chart error (${this.props.chartName || 'Unknown'}):`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <BarChart3 className="size-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              Chart unavailable
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.props.chartName 
                ? `The ${this.props.chartName} could not be displayed due to an error`
                : 'This chart could not be displayed due to an error'
              }
            </p>
            {this.state.error && (
              <div className="mt-4 p-2 bg-muted rounded text-xs font-mono text-muted-foreground max-w-full overflow-auto">
                {this.state.error.message}
              </div>
            )}
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
