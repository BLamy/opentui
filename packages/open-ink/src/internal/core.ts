import type * as OpenTUICore from "@opentui/core"

// The browser entry may only load @opentui/core after the wasm bindings are installed, so modules
// shared with it reach core values through this handle instead of importing them.
export type OpenTUICoreModule = typeof OpenTUICore

let loadedCore: OpenTUICoreModule | undefined

export function installCore(core: OpenTUICoreModule): void {
  loadedCore ??= core
}

export function getCore(): OpenTUICoreModule {
  if (!loadedCore) {
    throw new Error("open-ink: @opentui/core is not loaded. Render through open-ink's render() first.")
  }

  return loadedCore
}
