import React from "react"
import { Text } from "./text.js"

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; error: Error } {
    return { hasError: true, error }
  }

  override render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return <Text color="red">{this.state.error.stack || this.state.error.message}</Text>
    }

    return this.props.children
  }
}
