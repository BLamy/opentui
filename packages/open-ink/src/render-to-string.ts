import type { ReactNode } from "react"
import { createHeadlessSession, getHeadlessOutput } from "./internal/cli-session.js"

export type RenderToStringOptions = {
  columns?: number
}

export default function renderToString(node: ReactNode, options?: RenderToStringOptions): string {
  const headlessSession = createHeadlessSession(options?.columns ?? 80)

  try {
    headlessSession.render(node)
    return getHeadlessOutput(headlessSession)
  } finally {
    headlessSession.unmount()
  }
}
