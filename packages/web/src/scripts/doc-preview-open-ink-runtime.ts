import type { BrowserTerminalHost } from "@opentui/core/browser"
import type { ReactNode } from "react"

import * as openInkBrowser from "open-ink/browser"

type OpenInkInstance = ReturnType<typeof openInkBrowser.render>

export interface OpenInkPreviewModule extends Record<string, unknown> {
  __cleanup(): void
  __hasRendered(): boolean
}

export function createOpenInkPreviewModule(
  host: BrowserTerminalHost,
  defaults: Record<string, unknown> = {},
): OpenInkPreviewModule {
  const instances = new Set<OpenInkInstance>()

  const release = (instance: OpenInkInstance): void => {
    instances.delete(instance)
  }

  const render = (node: ReactNode, options: Record<string, unknown> = {}) => {
    const instance = openInkBrowser.render(node, {
      ...defaults,
      ...options,
      host,
    } as Parameters<typeof openInkBrowser.render>[1])

    instances.add(instance)

    return {
      ...instance,
      cleanup() {
        release(instance)
        instance.cleanup()
      },
      unmount() {
        release(instance)
        instance.unmount()
      },
    }
  }

  return {
    ...(openInkBrowser as Record<string, unknown>),
    render,
    __cleanup() {
      for (const instance of [...instances]) {
        release(instance)
        instance.cleanup()
      }
    },
    __hasRendered() {
      return instances.size > 0
    },
  }
}
