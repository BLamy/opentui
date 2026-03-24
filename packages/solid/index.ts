import { BrowserRenderer } from "@opentui/core/browser"
import { engine } from "../core/src/animation/Timeline.js"
import type { JSX } from "./jsx-runtime"
import { RendererContext } from "./src/elements/index.js"
import { _render as renderInternal, createComponent } from "./src/reconciler.js"

type DisposeFn = () => void
export type SolidRenderer = BrowserRenderer | import("@opentui/core").CliRenderer

function isMountedRenderer(value: unknown): value is SolidRenderer {
  return (
    typeof value === "object" &&
    value !== null &&
    "root" in value &&
    "destroy" in value &&
    typeof (value as { destroy?: unknown }).destroy === "function"
  )
}

const mountSolidRoot = (renderer: SolidRenderer, node: () => JSX.Element) => {
  let dispose: DisposeFn | undefined
  let disposeRequested = false
  let disposed = false
  let mounting = true
  let destroyRequested = false

  const originalDestroy = renderer.destroy.bind(renderer)

  const runDispose = () => {
    if (disposed) {
      return
    }

    if (!dispose) {
      disposeRequested = true
      return
    }

    disposed = true
    dispose()
  }

  renderer.once("destroy", runDispose)

  renderer.destroy = () => {
    if (mounting) {
      destroyRequested = true
      return
    }

    originalDestroy()
  }

  try {
    dispose = renderInternal(
      () =>
        createComponent(RendererContext.Provider, {
          get value() {
            return renderer
          },
          get children() {
            return createComponent(node, {})
          },
        }),
      renderer.root,
    )
  } finally {
    mounting = false
    renderer.destroy = originalDestroy
  }

  if (disposeRequested) {
    runDispose()
  }

  if (destroyRequested) {
    originalDestroy()
  }
}

export const render = async (
  node: () => JSX.Element,
  rendererOrConfig: SolidRenderer | import("@opentui/core").CliRendererConfig = {},
) => {
  const renderer =
    rendererOrConfig instanceof BrowserRenderer || isMountedRenderer(rendererOrConfig)
      ? rendererOrConfig
      : await (
          await import("@opentui/core")
        ).createCliRenderer({
          ...rendererOrConfig,
          onDestroy: () => {
            rendererOrConfig.onDestroy?.()
          },
        })

  engine.attach(renderer as any)
  mountSolidRoot(renderer, node)
}

export const testRender = async (
  node: () => JSX.Element,
  renderConfig: import("@opentui/core/testing").TestRendererOptions = {},
) => {
  const { createTestRenderer } = await import("@opentui/core/testing")
  const testSetup = await createTestRenderer({
    ...renderConfig,
    onDestroy: () => {
      renderConfig.onDestroy?.()
    },
  })

  engine.attach(testSetup.renderer)
  mountSolidRoot(testSetup.renderer, node)

  return testSetup
}

export * from "./src/reconciler.js"
export * from "./src/elements/index.js"
export * from "./src/time-to-first-draw.js"
export * from "./src/plugins/slot.js"
export * from "./src/types/elements.js"
export { type JSX }
