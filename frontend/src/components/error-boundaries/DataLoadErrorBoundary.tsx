/**
 * Data Load Error Boundary
 * Specialized error boundary for data loading failures
 */

import React, { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Alert } from '../ui/alert'

interface Props {
  children: ReactNode
  onRetry?: () => void
  retryable?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
}

export class DataLoadErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null,
      retryCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error.message?.includes('figma.com/webpack-artifacts')) {
      return
    }
    
    console.error('❌ Data loading error:', error, errorInfo)
  }

  handleRetry = async () => {
    this.setState(prev => ({ 
      retryCount: prev.retryCount + 1,
      hasError: false,
      error: null
    }))
    
    if (this.props.onRetry) {
      try {
        await this.props.onRetry()
      } catch (error) {
        console.error('Retry failed:', error)
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const isNetworkError = this.state.error?.message?.toLowerCase().includes('network') ||
                            this.state.error?.message?.toLowerCase().includes('fetch')

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <Card className="max-w-md w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                {isNetworkError ? (
                  <WifiOff className="size-6 text-destructive" />
                ) : (
                  <AlertCircle className="size-6 text-destructive" />
                )}
                <div>
                  <CardTitle>
                    {isNetworkError ? 'Connection Error' : 'Data Loading Failed'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {isNetworkError 
                      ? 'Unable to connect to the server'
                      : 'An error occurred while loading data'
                    }
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <div className="ml-2">
                    <p className="text-sm font-mono break-all">
                      {this.state.error.message}
                    </p>
                  </div>
                </Alert>
              )}

              {this.state.retryCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Retry attempts: {this.state.retryCount}
                </p>
              )}

              <div className="flex gap-2">
                {this.props.retryable !== false && (
                  <Button 
                    onClick={this.handleRetry}
                    className="gap-2 flex-1"
                  >
                    <RefreshCw className="size-4" />
                    Try Again
                  </Button>
                )}
                <Button 
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="gap-2 flex-1"
                >
                  <Wifi className="size-4" />
                  Reload Page
                </Button>
              </div>

              {isNetworkError && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-semibold">Troubleshooting:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Check your internet connection</li>
                    <li>Verify the backend server is running</li>
                    <li>Check if firewall is blocking the connection</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
