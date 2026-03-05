/**
 * Main Entry Point
 * Version: 2025-12-10-v2
 * Context providers are now handled inside App.tsx
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './components/ui/sonner'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
    <Toaster position="top-right" />
  </ErrorBoundary>
)