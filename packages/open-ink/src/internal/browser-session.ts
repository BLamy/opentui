import type { CliRenderer } from "@opentui/core"
import {
  createBrowserRenderer,
  loadOpenTUI,
  type BrowserLoadOptions,
  type BrowserTerminalHost,
} from "@opentui/core/browser"
import { installCore } from "./core.js"
import { defaultScreenReaderEnabled } from "./options.js"
import {
  OpenInkSession,
  createReadStreamLike,
  createStreamLike,
  trackRendererSize,
  type RenderMetrics,
} from "./session.js"

// Core and the renderer load only through dynamic imports here: the FFI backend is chosen when core
// is first evaluated, which must happen after the wasm bindings are installed.
export interface CreateBrowserSessionOptions extends BrowserLoadOptions {
  // The in-page terminal to render into. Ignored when `renderer` is given.
  host?: BrowserTerminalHost
  // A renderer created with createBrowserRenderer(). The session leaves it running on unmount.
  renderer?: CliRenderer
  autoFocus?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  backgroundColor?: string
  exitOnCtrlC?: boolean
  onRender?: (metrics: RenderMetrics) => void
  isScreenReaderEnabled?: boolean
  maxFps?: number
  concurrent?: boolean
}

export async function createBrowserSession(options: CreateBrowserSessionOptions): Promise<OpenInkSession> {
  const { wasm, onWrite, assets } = options
  let renderer = options.renderer
  // A supplied renderer means the bindings are installed, so core can load without the wasm options.
  installCore(renderer ? await import("@opentui/core") : await loadOpenTUI({ wasm, onWrite, assets }))

  if (!renderer) {
    if (!options.host) {
      throw new Error("open-ink: render() in the browser needs a `host` or a `renderer`")
    }

    renderer = await createBrowserRenderer(options.host, {
      wasm,
      onWrite,
      assets,
      autoFocus: options.autoFocus,
      useMouse: options.useMouse,
      enableMouseMovement: options.enableMouseMovement,
      backgroundColor: options.backgroundColor,
      targetFps: options.maxFps,
      maxFps: options.maxFps,
      consoleMode: "disabled",
    })
  }

  const stdout = createStreamLike(renderer.width, renderer.height)
  const stderr = createStreamLike(renderer.width, renderer.height)
  const stdin = createReadStreamLike()
  trackRendererSize(renderer, stdout)

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive: true,
    debug: false,
    patchConsole: false,
    exitOnCtrlC: options.exitOnCtrlC ?? true,
    isScreenReaderEnabled: options.isScreenReaderEnabled ?? defaultScreenReaderEnabled(),
    concurrent: options.concurrent ?? false,
    ownsRenderer: options.renderer === undefined,
    onRender: options.onRender,
  })
}
