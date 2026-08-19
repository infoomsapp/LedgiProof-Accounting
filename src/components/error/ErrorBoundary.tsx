// PATH: src/components/error/ErrorBoundary.tsx
//
// React error boundary. Class component because error boundaries can ONLY
// be class components (React limitation — no hook equivalent exists).
//
// Catches render-time errors in children so one broken card/calculation
// doesn't white-screen the whole app.
//
// Usage:
//   <ErrorBoundary section="dashboard">
//     <SoloDashboard />
//   </ErrorBoundary>

import { Component, type ReactNode, type ErrorInfo } from 'react'
import ErrorFallback from './ErrorFallback'
import { reportError } from '../../lib/errorMonitor'

interface ErrorBoundaryProps {
  children:     ReactNode
  /** Section name shown in the fallback, e.g. "dashboard" */
  section?:     string
  /** Optional custom fallback render */
  fallback?:    (error: Error, reset: () => void) => ReactNode
  /** Called when an error is caught (for logging/telemetry) */
  onError?:     (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error:    Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console (and any telemetry hook the caller provides)
    console.error(
      `[ErrorBoundary${this.props.section ? ` · ${this.props.section}` : ''}]`,
      error,
      info.componentStack
    )
    this.props.onError?.(error, info)
    reportError(error, {
      ...(this.props.section !== undefined ? { section: this.props.section } : {}),
      extra: { componentStack: info.componentStack }
    })
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.reset)
      }
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.reset}
          showDetails={import.meta.env.DEV}
          {...(this.props.section !== undefined ? { section: this.props.section } : {})}
        />
      )
    }
    return this.props.children
  }
}
