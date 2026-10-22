// Browser bundles serve assets by URL. Bundlers rewrite the literal
// `new URL(..., import.meta.url)` fallbacks; hosts can override any of them.
export interface BrowserRuntimeAssets {
  treeSitterWasm?: string
  treeSitterWorker?: string
}

const assets: BrowserRuntimeAssets = {}

export function setBrowserRuntimeAssets(overrides: BrowserRuntimeAssets): void {
  Object.assign(assets, overrides)
}

export function resolveDefaultParserAsset(_relativePath: string, fallbackPath: URL): Promise<string> {
  return Promise.resolve(fallbackPath.href)
}

export function resolveDefaultTreeSitterWorkerPath(fallbackPath: URL): string {
  return assets.treeSitterWorker ?? fallbackPath.href
}

export function resolveTreeSitterWasm(): Promise<string> {
  if (!assets.treeSitterWasm) {
    return Promise.reject(new Error("Set the tree-sitter wasm URL with setBrowserRuntimeAssets() before highlighting"))
  }
  return Promise.resolve(assets.treeSitterWasm)
}

export function resolveNativeLibraryPath(): Promise<string> {
  return Promise.reject(new Error("The browser build loads OpenTUI from opentui.wasm"))
}
