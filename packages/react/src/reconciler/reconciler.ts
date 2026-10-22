import type { RootRenderable } from "@opentui/core"
import { runtime } from "./host-config.js"

export const reconciler = runtime.reconciler

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

// Inject into DevTools - this is safe to call even if devtools isn't connected
runtime.injectIntoDevTools()

export function createContainer(root: RootRenderable) {
  return runtime.createContainer(root)
}
