import * as React from 'react'

/** Last line of defence: an unexpected render error shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Logged to the browser console only; no record contents are sent anywhere.
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="max-w-sm">
          <p className="text-2xl font-semibold">Something went wrong on this screen</p>
          <p className="mt-2 text-sm text-muted-foreground">Your saved records are safe. Reload the page to continue.</p>
          <button type="button" className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.location.assign('/')}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
