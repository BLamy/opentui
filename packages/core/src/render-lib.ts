import type { RenderLib as NativeRenderLib, CursorState } from "./zig.js"

export type { CursorState }

export interface BrowserRenderLibExtensions {
  drainOutput?: (renderer: number) => string
  setupTerminalForBrowser?: (renderer: number, useAlternateScreen: boolean) => void
  setTerminalThemeMode?: (renderer: number, mode: "light" | "dark") => void
}

export type RenderLib = NativeRenderLib & BrowserRenderLibExtensions

let renderLib: RenderLib | null = null

export function setRenderLib(lib: RenderLib): void {
  renderLib = lib
}

export function clearRenderLib(): void {
  renderLib = null
}

export function resolveRenderLib(): RenderLib {
  if (!renderLib) {
    throw new Error("OpenTUI render library has not been initialized")
  }

  return renderLib
}
