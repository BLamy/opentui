import "@xterm/xterm/css/xterm.css"

import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  BrowserRenderEvents,
  RGBA,
  createBrowserRenderer,
  loadBrowserRenderLib,
  type BrowserTerminalHost,
  type BrowserTerminalKey,
} from "@opentui/core/browser"

import {
  DOCS_EXAMPLE_THEME_QUERY,
  createDocsExampleCssVarReader,
  createDocsExampleXtermTheme,
  getDocsExampleRendererBackground,
  getPreferredThemeMode,
  resolveThemeMode,
  type ThemeMode,
} from "./docs-example-theme"
import { ensureBrowserProcessShim } from "./browser-process"
import { shouldAutoFocusPreview } from "./example-preview-focus"
import { compileExample } from "./example-preview-compiler"

interface PreviewMessage {
  type: "opentui-doc-example"
  code: string
  language: string
  path?: string
}

interface PreviewRuntime {
  modules: Record<string, Record<string, unknown>>
  scope: Record<string, unknown>
}

interface PreviewSession {
  term: Terminal
  host: PreviewHost
  renderer: Awaited<ReturnType<typeof createBrowserRenderer>>
}

interface PreviewFocusSnapshot {
  activeWithinPreview: boolean
  documentHasFocus: boolean
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...inner: unknown[]) => Promise<unknown>

const STATUS_TEXT = {
  waiting: "Waiting for example…",
  loading: "Loading browser preview…",
  error: "Preview failed.",
} as const

let currentSession: PreviewSession | null = null
let browserCoreModulePromise: Promise<Record<string, unknown>> | null = null
let browserModulePromise: Promise<Record<string, unknown>> | null = null
let renderLibPromise: Promise<unknown> | null = null

const root = document.querySelector<HTMLElement>("[data-preview-root]")
const terminalElement = document.querySelector<HTMLElement>("[data-preview-terminal]")
const statusElement = document.querySelector<HTMLElement>("[data-preview-status]")

function ensureBunPolyfill(): void {
  const bunLike = (window as unknown as { Bun?: Record<string, unknown> }).Bun ?? {}
  if (typeof bunLike.stringWidth !== "function") {
    bunLike.stringWidth = (value: string) => Array.from(value).length
  }

  if (typeof bunLike.sleep !== "function") {
    bunLike.sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  ;(window as unknown as { Bun: Record<string, unknown> }).Bun = bunLike
}

function setStatus(state: "waiting" | "loading" | "error", detail?: string): void {
  if (!statusElement) {
    return
  }

  statusElement.dataset.state = state
  statusElement.textContent = detail ?? STATUS_TEXT[state]
}

function clearStatus(): void {
  if (!statusElement) {
    return
  }

  delete statusElement.dataset.state
  statusElement.textContent = ""
}

function removeStatusElement(): void {
  statusElement?.remove()
}

function capturePreviewFocusSnapshot(surface: HTMLElement | null): PreviewFocusSnapshot {
  return {
    documentHasFocus: document.hasFocus(),
    activeWithinPreview: surface?.contains(document.activeElement) ?? false,
  }
}

class PreviewHost implements BrowserTerminalHost {
  private readonly dataHandlers = new Set<(data: string) => void>()
  private readonly keyHandlers = new Set<(key: BrowserTerminalKey) => void>()
  private readonly resizeHandlers = new Set<(size: { cols: number; rows: number }) => void>()
  private readonly focusHandlers = new Set<(focused: boolean) => void>()
  private readonly themeHandlers = new Set<(mode: ThemeMode) => void>()
  private readonly resizeObserver: ResizeObserver
  private readonly mediaQuery = window.matchMedia(DOCS_EXAMPLE_THEME_QUERY)
  private readonly disposables: Array<{ dispose(): void }> = []
  private currentThemeMode: ThemeMode
  private readonly focusInHandler: () => void
  private readonly focusOutHandler: (event: FocusEvent) => void
  private readonly keyDownHandler: (event: KeyboardEvent) => void
  private readonly themeChangeHandler: (event: MediaQueryListEvent) => void

  constructor(
    private readonly term: Terminal,
    private readonly fitAddon: FitAddon,
    private readonly surface: HTMLElement,
    themeMode: ThemeMode,
  ) {
    this.currentThemeMode = themeMode

    this.disposables.push(
      this.term.onData((data) => {
        for (const handler of this.dataHandlers) {
          handler(data)
        }
      }),
    )

    this.disposables.push(
      this.term.onResize(({ cols, rows }) => {
        for (const handler of this.resizeHandlers) {
          handler({ cols, rows })
        }
      }),
    )

    this.focusInHandler = () => {
      for (const handler of this.focusHandlers) {
        handler(true)
      }
    }

    this.focusOutHandler = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && this.surface.contains(event.relatedTarget)) {
        return
      }

      for (const handler of this.focusHandlers) {
        handler(false)
      }
    }

    this.keyDownHandler = (event: KeyboardEvent) => {
      if (!this.surface.contains(event.target as Node | null)) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault()
        event.stopPropagation()

        const key: BrowserTerminalKey = {
          name: "c",
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: true,
          option: event.altKey,
          sequence: event.key.length === 1 ? event.key : "C",
          number: false,
          raw: event.key.length === 1 ? event.key : "C",
          eventType: "press",
          source: "raw",
          code: event.code,
          super: false,
          hyper: false,
          capsLock: event.getModifierState("CapsLock"),
          numLock: event.getModifierState("NumLock"),
          repeated: event.repeat,
        }

        for (const handler of this.keyHandlers) {
          handler(key)
        }
      }
    }

    this.themeChangeHandler = (event: MediaQueryListEvent) => {
      this.currentThemeMode = resolveThemeMode(event.matches)
      for (const handler of this.themeHandlers) {
        handler(this.currentThemeMode)
      }
    }

    this.surface.addEventListener("focusin", this.focusInHandler)
    this.surface.addEventListener("focusout", this.focusOutHandler)
    this.surface.addEventListener("keydown", this.keyDownHandler, true)
    this.mediaQuery.addEventListener("change", this.themeChangeHandler)

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(this.surface)
  }

  public fit(): void {
    this.fitAddon.fit()
  }

  public getSize(): { cols: number; rows: number } {
    return { cols: this.term.cols, rows: this.term.rows }
  }

  public write(data: string): void {
    this.term.write(data)
  }

  public onData(handler: (data: string) => void): () => void {
    this.dataHandlers.add(handler)
    return () => this.dataHandlers.delete(handler)
  }

  public onResize(handler: (size: { cols: number; rows: number }) => void): () => void {
    this.resizeHandlers.add(handler)
    return () => this.resizeHandlers.delete(handler)
  }

  public onKey(handler: (key: BrowserTerminalKey) => void): () => void {
    this.keyHandlers.add(handler)
    return () => this.keyHandlers.delete(handler)
  }

  public onFocusChange(handler: (focused: boolean) => void): () => void {
    this.focusHandlers.add(handler)
    return () => this.focusHandlers.delete(handler)
  }

  public onThemeModeChange(handler: (mode: ThemeMode) => void): () => void {
    this.themeHandlers.add(handler)
    handler(this.currentThemeMode)
    return () => this.themeHandlers.delete(handler)
  }

  public copy(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      return Promise.reject(new Error("Clipboard API unavailable"))
    }

    return navigator.clipboard.writeText(text)
  }

  public setTitle(title: string): void {
    document.title = title
  }

  public destroy(): void {
    for (const disposable of this.disposables) {
      disposable.dispose()
    }
    this.resizeObserver.disconnect()
    this.surface.removeEventListener("focusin", this.focusInHandler)
    this.surface.removeEventListener("focusout", this.focusOutHandler)
    this.surface.removeEventListener("keydown", this.keyDownHandler, true)
    this.mediaQuery.removeEventListener("change", this.themeChangeHandler)
  }
}

async function ensureBrowserCore(): Promise<Record<string, unknown>> {
  if (!browserCoreModulePromise) {
    browserCoreModulePromise = import("./doc-preview-runtime")
  }

  return browserCoreModulePromise
}

async function ensureBrowserModule(): Promise<Record<string, unknown>> {
  if (!browserModulePromise) {
    browserModulePromise = import("../../../core/src/browser.ts")
  }

  return browserModulePromise
}

async function ensureRenderLib(wasmUrl: string): Promise<void> {
  if (!renderLibPromise) {
    renderLibPromise = loadBrowserRenderLib({ wasmUrl })
  }

  await renderLibPromise
}

function createPreviewScope(
  modules: Record<string, Record<string, unknown>>,
  browserProcess: ReturnType<typeof ensureBrowserProcessShim>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    process: browserProcess,
  }

  for (const moduleExports of Object.values(modules)) {
    Object.assign(scope, moduleExports)
  }

  return scope
}

async function createRuntime(session: PreviewSession): Promise<PreviewRuntime> {
  const browserProcess = ensureBrowserProcessShim()
  const [coreRuntime, browserRuntime] = await Promise.all([ensureBrowserCore(), ensureBrowserModule()])

  const coreModule = {
    ...coreRuntime,
    createCliRenderer: async () => session.renderer,
  }

  const browserModule = {
    ...browserRuntime,
    createCliRenderer: async () => session.renderer,
  }

  const modules: Record<string, Record<string, unknown>> = {
    "@opentui/core": coreModule,
    "@opentui/core/browser": browserModule,
  }

  return {
    modules,
    scope: createPreviewScope(modules, browserProcess),
  }
}

async function createSession(autoFocus: boolean): Promise<PreviewSession> {
  if (!root || !terminalElement) {
    throw new Error("Preview surface is missing.")
  }

  const themeMode = getPreferredThemeMode()
  const read = () => createDocsExampleCssVarReader()
  const fitAddon = new FitAddon()
  const term = new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 13,
    lineHeight: 1.18,
    convertEol: false,
    scrollback: 400,
    theme: createDocsExampleXtermTheme(themeMode, read()),
  })

  terminalElement.innerHTML = ""
  term.loadAddon(fitAddon)
  term.open(terminalElement)

  const host = new PreviewHost(term, fitAddon, terminalElement, themeMode)
  host.fit()

  const wasmUrl = root.dataset.wasmUrl ?? "/opentui/opentui.wasm"
  await ensureRenderLib(wasmUrl)

  const renderer = await createBrowserRenderer(host, {
    useAlternateScreen: true,
    backgroundColor: RGBA.fromHex(getDocsExampleRendererBackground(themeMode, read())),
    onDestroy: () => host.destroy(),
  })

  renderer.on(BrowserRenderEvents.THEME_MODE, (mode: ThemeMode) => {
    const colors = read()
    term.options.theme = createDocsExampleXtermTheme(mode, colors)
    renderer.setBackgroundColor(RGBA.fromHex(getDocsExampleRendererBackground(mode, colors)))
  })

  if (autoFocus) {
    term.focus()
  }

  return { term, host, renderer }
}

async function resetSession(autoFocus: boolean): Promise<PreviewSession> {
  if (currentSession) {
    currentSession.renderer.destroy()
    currentSession.term.dispose()
    currentSession = null
  }

  currentSession = await createSession(autoFocus)
  return currentSession
}

async function executeExample(payload: PreviewMessage): Promise<void> {
  ensureBunPolyfill()
  setStatus("loading")

  const focusSnapshot = capturePreviewFocusSnapshot(terminalElement)
  const session = await resetSession(shouldAutoFocusPreview(focusSnapshot))
  const runtime = await createRuntime(session)
  const { compiled } = await compileExample(payload.code, payload.language)

  const runner = new AsyncFunction("runtime", "console", compiled)

  await runner(runtime, console)

  if (session.renderer.root.getChildrenCount() === 0) {
    throw new Error("The snippet ran, but it did not add anything to the renderer root.")
  }

  session.renderer.requestRender()
  clearStatus()
}

function writeTerminalError(message: string): void {
  currentSession?.term.writeln("OpenTUI example preview")
  currentSession?.term.writeln("")
  currentSession?.term.writeln(message)
}

async function handleExampleMessage(event: MessageEvent<PreviewMessage>): Promise<void> {
  if (event.origin !== window.location.origin) {
    return
  }

  if (event.data?.type !== "opentui-doc-example") {
    return
  }

  try {
    await executeExample(event.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview error."
    setStatus("error", message)
    writeTerminalError(message)
  }
}

if (root && terminalElement) {
  removeStatusElement()
  window.addEventListener("message", (event) => {
    void handleExampleMessage(event as MessageEvent<PreviewMessage>)
  })
}
