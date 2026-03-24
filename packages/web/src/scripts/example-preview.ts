import { BrowserRenderEvents, RGBA, createBrowserRenderer, loadBrowserRenderLib } from "@opentui/core/browser"

import {
  type BrowserTerminalSession,
  createBrowserTerminalSession,
  type ThemeMode as TerminalThemeMode,
} from "./browser-terminal-session"
import { ensureBrowserProcessShim } from "./browser-process"
import {
  DOCS_EXAMPLE_THEME_QUERY,
  createDocsExampleCssVarReader,
  createDocsExampleTerminalTheme,
  getDocsExampleRendererBackground,
  getPreferredThemeMode,
  type ThemeMode,
} from "./docs-example-theme"
import { compileExample } from "./example-preview-compiler"
import { shouldAutoFocusPreview } from "./example-preview-focus"
import { withBase } from "../utils/base-path"

interface PreviewMessage {
  type: "opentui-doc-example"
  code: string
  language: string
  path?: string
  requestId?: string
}

interface PreviewRuntime {
  modules: Record<string, Record<string, unknown>>
  scope: Record<string, unknown>
}

interface PreviewFocusSnapshot {
  activeWithinPreview: boolean
  documentHasFocus: boolean
}

type PreviewSession = BrowserTerminalSession & {
  renderer: Awaited<ReturnType<typeof createBrowserRenderer>>
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...inner: unknown[]) => Promise<unknown>

const STATUS_TEXT = {
  waiting: "Waiting for example…",
  loading: "Loading browser preview…",
  error: "Preview failed.",
} as const
const PREVIEW_STATUS_MESSAGE = "opentui-doc-example-status"

let currentSession: PreviewSession | null = null
let latestPayload: PreviewMessage | null = null
let browserCoreModulePromise: Promise<Record<string, unknown>> | null = null
let browserModulePromise: Promise<Record<string, unknown>> | null = null
let renderLibPromise: Promise<unknown> | null = null
let runCounter = 0

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

function destroyPreviewSession(session: PreviewSession | null): void {
  if (!session) {
    return
  }

  session.renderer.destroy()
  session.destroy()
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

function isThemeMode(mode: TerminalThemeMode): mode is ThemeMode {
  return mode === "dark" || mode === "light"
}

function wirePreviewThemeRemount(session: PreviewSession): void {
  session.renderer.on(BrowserRenderEvents.THEME_MODE, (mode: TerminalThemeMode) => {
    if (!isThemeMode(mode) || mode === session.themeMode) {
      return
    }

    void rerenderLatestPreview(mode)
  })
}

async function createSession(themeMode: ThemeMode, autoFocus: boolean): Promise<PreviewSession> {
  if (!root || !terminalElement) {
    throw new Error("Preview surface is missing.")
  }

  const read = () => createDocsExampleCssVarReader()
  const terminalSession = await createBrowserTerminalSession({
    surface: terminalElement,
    themeMode,
    themeQuery: DOCS_EXAMPLE_THEME_QUERY,
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 13,
    scrollback: 400,
    theme: createDocsExampleTerminalTheme(themeMode, read()),
    autoFocus,
  })

  try {
    const wasmUrl = root.dataset.wasmUrl ?? withBase("/opentui/opentui.wasm")
    await ensureRenderLib(wasmUrl)

    const renderer = await createBrowserRenderer(terminalSession.host, {
      useAlternateScreen: true,
      backgroundColor: RGBA.fromHex(getDocsExampleRendererBackground(themeMode, read())),
    })

    const session: PreviewSession = {
      ...terminalSession,
      renderer,
    }

    wirePreviewThemeRemount(session)

    return session
  } catch (error) {
    terminalSession.destroy()
    throw error
  }
}

async function resetSession(themeMode: ThemeMode, autoFocus: boolean): Promise<PreviewSession> {
  destroyPreviewSession(currentSession)
  currentSession = await createSession(themeMode, autoFocus)
  return currentSession
}

async function renderPreview(
  payload: PreviewMessage,
  options: { themeMode?: ThemeMode; loadingText?: string } = {},
): Promise<void> {
  ensureBunPolyfill()
  latestPayload = payload
  setStatus("loading", options.loadingText)

  const runId = ++runCounter
  const focusSnapshot = capturePreviewFocusSnapshot(terminalElement)
  const session = await resetSession(
    options.themeMode ?? getPreferredThemeMode(),
    shouldAutoFocusPreview(focusSnapshot),
  )

  if (runId !== runCounter) {
    return
  }

  const runtime = await createRuntime(session)
  const { compiled } = await compileExample(payload.code, payload.language)

  if (runId !== runCounter) {
    return
  }

  const runner = new AsyncFunction("runtime", "console", compiled)
  await runner(runtime, console)

  if (runId !== runCounter) {
    return
  }

  if (session.renderer.root.getChildrenCount() === 0) {
    throw new Error("The snippet ran, but it did not add anything to the renderer root.")
  }

  session.renderer.requestRender()
  clearStatus()
}

async function rerenderLatestPreview(themeMode: ThemeMode): Promise<void> {
  if (!latestPayload) {
    return
  }

  try {
    await renderPreview(latestPayload, {
      themeMode,
      loadingText: `Refreshing preview for ${themeMode} mode…`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview error."
    setStatus("error", message)
    writeTerminalError(message)
  }
}

function writeTerminalError(message: string): void {
  currentSession?.term.writeln?.("OpenTUI example preview")
  currentSession?.term.writeln?.("")
  currentSession?.term.writeln?.(message)
}

function notifyParentPreviewStatus(requestId: string | undefined, status: "rendered" | "error"): void {
  if (!requestId || window.parent === window) {
    return
  }

  window.parent.postMessage(
    {
      type: PREVIEW_STATUS_MESSAGE,
      requestId,
      status,
    },
    window.location.origin,
  )
}

async function handleExampleMessage(event: MessageEvent<PreviewMessage>): Promise<void> {
  if (event.origin !== window.location.origin) {
    return
  }

  if (event.data?.type !== "opentui-doc-example") {
    return
  }

  try {
    await renderPreview(event.data)
    notifyParentPreviewStatus(event.data.requestId, "rendered")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview error."
    setStatus("error", message)
    writeTerminalError(message)
    notifyParentPreviewStatus(event.data.requestId, "error")
  }
}

if (root && terminalElement) {
  removeStatusElement()
  window.addEventListener("message", (event) => {
    void handleExampleMessage(event as MessageEvent<PreviewMessage>)
  })
}
