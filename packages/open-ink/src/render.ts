import { Stream } from "node:stream"
import process from "node:process"
import type { ReactNode } from "react"
import { createCliSession, type CreateCliSessionOptions, type RenderMetrics } from "./internal/session.js"

export type RenderOptions = CreateCliSessionOptions & {
  onRender?: (metrics: RenderMetrics) => void
}

export type Instance = {
  rerender: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<unknown>
  waitUntilRenderFlush: () => Promise<void>
  cleanup: () => void
  clear: () => void
}

const instances = new Map<NodeJS.WriteStream, ReturnType<typeof createCliSession>>()

function getOptions(stdout: NodeJS.WriteStream | RenderOptions | undefined = {}): RenderOptions {
  if (stdout instanceof Stream) {
    return {
      stdout,
      stdin: process.stdin,
    }
  }

  return stdout
}

export default function render(node: ReactNode, options?: NodeJS.WriteStream | RenderOptions): Instance {
  const resolvedOptions: RenderOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    concurrent: false,
    alternateScreen: false,
    interactive: undefined,
    ...getOptions(options),
  }

  const stdout = resolvedOptions.stdout ?? process.stdout
  let session = instances.get(stdout)
  if (!session) {
    session = createCliSession(resolvedOptions)
    instances.set(stdout, session)
  } else {
    process.stderr.write(
      "Warning: render() was called again for the same stdout before the previous open-ink instance was unmounted. Call unmount() first.\n",
    )
  }

  session.render(node)

  return {
    rerender: session.rerender,
    unmount() {
      session.unmount()
      instances.delete(stdout)
    },
    waitUntilExit: session.waitUntilExit,
    waitUntilRenderFlush: session.waitUntilRenderFlush,
    cleanup() {
      session.unmount()
      instances.delete(stdout)
    },
    clear: session.clear,
  }
}
