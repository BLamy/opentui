import type { ReactNode } from "react"
import { createHeadlessSession, getHeadlessOutput } from "./internal/session.js"

export type RenderToStringOptions = {
  columns?: number
}

let headlessSession: ReturnType<typeof createHeadlessSession> | null = null

export default function renderToString(node: ReactNode, options?: RenderToStringOptions): string {
  if (!headlessSession) {
    headlessSession = createHeadlessSession(options?.columns ?? 80)
  }

  headlessSession.clear()
  headlessSession.render(node)
  const output = getHeadlessOutput(headlessSession)
  return output
}
