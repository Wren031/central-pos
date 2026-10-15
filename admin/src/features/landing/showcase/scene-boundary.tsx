import * as React from 'react'

interface Props {
  fallback: React.ReactNode
  children: React.ReactNode
}

interface State {
  failed: boolean
}

/**
 * Keeps a WebGL/three.js failure (driver quirks, context limits, blocked
 * canvas) from taking down the landing page — the 2D preview takes over.
 */
export class SceneBoundary extends React.Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
