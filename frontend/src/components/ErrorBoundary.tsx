import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Error caught by boundary:', error)
    console.error('Component stack:', errorInfo.componentStack)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="text-center max-w-2xl">
            {/* Error Icon */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full">
                <AlertTriangle className="h-10 w-10 text-red-600" />
              </div>
            </div>

            {/* Error Message */}
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Something went wrong
            </h1>
            <p className="text-lg text-muted-foreground mb-6">
              An unexpected error occurred in the monitoring system
            </p>

            {/* Error Details */}
            {this.state.error && (
              <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                <div className="font-semibold text-red-900 mb-2">Error Details:</div>
                <div className="text-sm text-red-800 font-mono break-all">
                  {this.state.error.message}
                </div>
                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-red-700 hover:text-red-900">
                      View component stack
                    </summary>
                    <pre className="mt-2 text-xs text-red-700 overflow-x-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3">
              <Button onClick={this.handleReload} size="lg" className="gap-2">
                <RefreshCw className="h-5 w-5" />
                Reload Application
              </Button>
              <Button onClick={this.handleReset} variant="outline" size="lg" className="gap-2">
                <Home className="h-5 w-5" />
                Try to Recover
              </Button>
            </div>

            {/* Help Text */}
            <p className="mt-6 text-sm text-muted-foreground">
              If this problem persists, please contact your system administrator
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
