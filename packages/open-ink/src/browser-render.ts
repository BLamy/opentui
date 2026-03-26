import type { ReactNode } from "react"
import type { BrowserTerminalHost } from "@opentui/core/browser"
import { createBrowserSession, type RenderMetrics } from "./internal/browser-session.js"

export type BrowserRenderOptions = {
  host: BrowserTerminalHost
  autoFocus?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  backgroundColor?: string
  onRender?: (metrics: RenderMetrics) => void
  isScreenReaderEnabled?: boolean
  maxFps?: number
  concurrent?: boolean
}

export type BrowserInstance = {
  rerender: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<unknown>
  waitUntilRenderFlush: () => Promise<void>
  cleanup: () => void
  clear: () => void
}

export function render(node: ReactNode, options: BrowserRenderOptions): BrowserInstance {
  const session = createBrowserSession(options)
  session.render(node)

  return {
    rerender: session.rerender,
    unmount: session.unmount,
    waitUntilExit: session.waitUntilExit,
    waitUntilRenderFlush: session.waitUntilRenderFlush,
    cleanup: session.cleanup,
    clear: session.clear,
  }
}
