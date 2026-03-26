import React from "react"
import type { RootRenderable } from "@opentui/core"
import { runtime, reconciler } from "./runtime.js"

if (process.env["DEV"] === "true") {
  try {
    await import("./devtools.js")
  } catch (error: any) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      console.warn(
        `
The environment variable DEV is set to true, so opentui tried to import \`react-devtools-core\`,
but this failed as it was not installed. Debugging with React DevTools requires it.

To install use this command:

$ bun add react-devtools-core@7 -d
        `.trim() + "\n",
      )
    } else {
      throw error
    }
  }
}

runtime.injectIntoDevTools()

export function _render(element: React.ReactNode, root: RootRenderable) {
  const container = runtime.createContainer(root)
  runtime.updateContainer(element, container)
  return container
}
