import type { ReactNode } from "react"
import { createHeadlessSession, getHeadlessOutput } from "./internal/session.js"

export type RenderToStringOptions = {
  columns?: number
}

const retainedHeadlessSessions: ReturnType<typeof createHeadlessSession>[] = []

export default function renderToString(node: ReactNode, options?: RenderToStringOptions): string {
  const columns = options?.columns ?? 80
  const headlessSession = createHeadlessSession(columns)
  retainedHeadlessSessions.push(headlessSession)

  headlessSession.render(node)
  return getHeadlessOutput(headlessSession)
}
