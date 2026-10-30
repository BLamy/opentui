import { createBrowserTerminalSession } from "./browser-terminal-session"
import { runExample } from "./example-runtime"
import { fallbackTheme, isExampleTheme, mixColors } from "./example-theme"
import {
  MESSAGE,
  OPENTUI_ASSETS_URL,
  OPENTUI_WASM_URL,
  decodeExampleHash,
  exampleParentOrigin,
  type FrameMessage,
  type RunMessage,
} from "./example-protocol"

// Runs one example in this frame. A new run loads a new frame, so timers and
// globals from an earlier version of the program cannot leak into the next one.
const WASM_URL = new URL(OPENTUI_WASM_URL, location.href).href
const ASSETS_URL = new URL(OPENTUI_ASSETS_URL, location.href).href
const FONT_FAMILY = '"OpenTUI Mono", ui-monospace, monospace'
const FONT_SIZE = 13
const PARENT_ORIGIN = exampleParentOrigin(document.referrer, location.href)

const surface = document.querySelector<HTMLElement>("[data-example-terminal]")
let started = false
let currentRequest: string | undefined
let writeError: ((message: string) => void) | null = null

function post(message: FrameMessage): void {
  if (window.parent !== window) window.parent.postMessage(message, PARENT_ORIGIN)
}

function report(status: "rendered" | "error", message?: string): void {
  post({ type: MESSAGE.status, requestId: currentRequest, status, message })
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(error)
  writeError?.(message)
  report("error", message)
}

async function run({ code, language, theme, requestId }: Omit<RunMessage, "type">): Promise<void> {
  if (started || !surface) return
  started = true
  currentRequest = requestId
  document.body.style.background = theme.background

  await document.fonts.load(`${FONT_SIZE}px ${FONT_FAMILY}`).catch(() => [])
  const session = await createBrowserTerminalSession(
    {
      surface,
      themeMode: theme.mode,
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      scrollback: 0,
      cursorBlink: false,
      theme: {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.foreground,
        selectionBackground: mixColors(theme.foreground, theme.background, 0.25),
      },
    },
    // The posted theme, not the system preference, sets the renderer's theme mode.
    { matchMedia: () => ({ matches: theme.mode === "dark" }) },
  )
  writeError = (message) => session.term.write(`\x1b[0m\r\n${message.replace(/\n/g, "\r\n")}\r\n`)

  await runExample(code, language, {
    host: session.host,
    wasm: WASM_URL,
    assets: {
      treeSitterWasm: new URL("tree-sitter.wasm", ASSETS_URL).href,
      treeSitterWorker: new URL("parser.worker.browser.js", ASSETS_URL).href,
      treeSitterAssetBase: ASSETS_URL,
    },
    backgroundColor: theme.background,
  })
  report("rendered")
}

function start(message: Omit<RunMessage, "type">): void {
  run(message).catch(fail)
}

window.addEventListener("error", (event) => fail(event.error ?? event.message))
window.addEventListener("unhandledrejection", (event) => fail(event.reason))

window.addEventListener("message", (event: MessageEvent<FrameMessage>) => {
  if (event.origin !== PARENT_ORIGIN || event.source !== window.parent) return
  const message = event.data
  if (message?.type !== MESSAGE.run || !isExampleTheme(message.theme)) return
  if (typeof message.code !== "string" || message.code.length > 1_000_000 || typeof message.language !== "string")
    return
  start(message)
})

const linked = decodeExampleHash(location.hash)
if (linked) {
  start({ ...linked, theme: fallbackTheme("dark") })
} else {
  post({ type: MESSAGE.ready })
}
