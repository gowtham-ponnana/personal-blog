import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('=== ErrorBoundary caught an error ===')
    console.error('Message:', error?.message)
    console.error('Stack:', error?.stack)
    console.error('Component stack:', errorInfo?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl mx-auto p-8">
          <h1 style={{ color: 'red', fontSize: '24px' }}>Something went wrong</h1>
          <pre style={{ background: '#fee', padding: '1rem', borderRadius: '8px', overflow: 'auto', whiteSpace: 'pre-wrap', color: '#333' }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}
