// Browser entry point. The native bindings select their FFI backend when they are
// first evaluated, so this module only imports the wasm loader statically and
// loads everything that touches the bindings after the wasm is installed.
import { installNodeGlobals } from "./browser/shims/process.js"
import { installOpenTUIWasm, type OpenTUIWasmOptions } from "./browser/wasm.js"
import {
  setBrowserRuntimeAssets,
  setDefaultBrowserRuntimeAssets,
  type BrowserRuntimeAssets,
} from "./platform/runtime-assets.browser.js"
import type { BrowserRendererConfig, BrowserTerminalHost } from "./browser/renderer.js"
import type { CliRenderer } from "./renderer.js"
import type { RenderLib } from "./zig.js"

export { installOpenTUIWasm, instantiateOpenTUIWasm, type OpenTUIWasmOptions } from "./browser/wasm.js"
export type { BrowserRendererConfig, BrowserTerminalHost, BrowserTerminalKey } from "./browser/renderer.js"

export { setBrowserRuntimeAssets, type BrowserRuntimeAssets } from "./platform/runtime-assets.browser.js"

export interface BrowserLoadOptions {
  // Where to load opentui.wasm from. Defaults to the file next to this module.
  wasm?: OpenTUIWasmOptions["source"]
  onWrite?: OpenTUIWasmOptions["onWrite"]
  assets?: BrowserRuntimeAssets
}

// The published package ships these files next to this module. Hosts that bundle
// core from source pass their own URLs.
function defaultWasmSource(): URL {
  return new URL(/* @vite-ignore */ "./opentui.wasm", import.meta.url)
}

function defaultAssets(): BrowserRuntimeAssets {
  return {
    treeSitterWasm: new URL(/* @vite-ignore */ "./tree-sitter.wasm", import.meta.url).href,
    treeSitterWorker: new URL(/* @vite-ignore */ "./parser.worker.browser.js", import.meta.url).href,
    treeSitterAssetBase: new URL("./", import.meta.url).href,
  }
}

export async function loadBrowserRenderLib(options: BrowserLoadOptions = {}): Promise<RenderLib> {
  installNodeGlobals()
  if (options.assets) setBrowserRuntimeAssets(options.assets)
  setDefaultBrowserRuntimeAssets(defaultAssets())
  await installOpenTUIWasm({ source: options.wasm ?? defaultWasmSource(), onWrite: options.onWrite })
  const { resolveRenderLib } = await import("./zig.js")
  return resolveRenderLib()
}

// Resolves to the @opentui/core module, loaded against the wasm bindings.
export async function loadOpenTUI(options: BrowserLoadOptions = {}): Promise<typeof import("./index.js")> {
  await loadBrowserRenderLib(options)
  return import("./index.js")
}

export async function createBrowserRenderer(
  host: BrowserTerminalHost,
  config: BrowserRendererConfig & BrowserLoadOptions = {},
): Promise<CliRenderer> {
  const { wasm, onWrite, assets, ...rendererConfig } = config
  await loadBrowserRenderLib({ wasm, onWrite, assets })
  const { createBrowserRenderer } = await import("./browser/renderer.js")
  return createBrowserRenderer(host, rendererConfig)
}
