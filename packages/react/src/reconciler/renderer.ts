import { CliRenderer, CliRenderEvents, engine } from "@opentui/core"
import React, { type ReactNode } from "react"
import type { OpaqueRoot } from "react-reconciler"
import { AppContext } from "../components/app.js"
import { ErrorBoundary } from "../components/error-boundary.js"
import { runtime } from "./host-config.js"
import { createContainer } from "./reconciler.js"

const { createPortal, flushSync } = runtime

export type Root = {
  render: (node: ReactNode) => void
  unmount: () => void
}

/**
 * Creates a root for rendering a React tree with the given CLI renderer.
 * @param renderer The CLI renderer to use
 * @returns A root object with a `render` method
 * @example
 * ```tsx
 * const renderer = await createCliRenderer()
 * createRoot(renderer).render(<App />)
 * ```
 */
export function createRoot(renderer: CliRenderer): Root {
  let container: OpaqueRoot | null = null
  let renderVersion = 0
  const appContext = { keyHandler: renderer.keyInput, renderer }

  const cleanup = () => {
    const current = container
    if (!current) return
    container = null
    renderer.off(CliRenderEvents.DESTROY, cleanup)
    runtime.unmountContainer(current)
    runtime.flushSyncWork()
  }

  return {
    render: (node: ReactNode) => {
      if (renderer.isDestroyed) return
      engine.attach(renderer)
      if (!container) {
        container = createContainer(renderer.root)
        renderer.once(CliRenderEvents.DESTROY, cleanup)
      }
      const element = React.createElement(
        AppContext.Provider,
        { value: appContext },
        // Explicit renders retry failed trees without remounting healthy children.
        React.createElement(ErrorBoundary, { resetKey: ++renderVersion, children: node }),
      )
      runtime.updateContainer(element, container)
    },

    unmount: cleanup,
  }
}

export { createPortal, flushSync }
