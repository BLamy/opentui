import type { ReactNode } from "react"
import { createBrowserSession, type CreateBrowserSessionOptions } from "./internal/browser-session.js"
import type { RenderMetrics } from "./internal/session.js"

export type BrowserRenderOptions = CreateBrowserSessionOptions

export type BrowserInstance = {
  rerender: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<unknown>
  waitUntilRenderFlush: () => Promise<void>
  cleanup: () => void
  clear: () => void
}

export type { RenderMetrics }

export async function render(node: ReactNode, options: BrowserRenderOptions): Promise<BrowserInstance> {
  const session = await createBrowserSession(options)
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
