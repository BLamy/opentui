import { Readable, Writable } from "node:stream"
import type { ParsedKey } from "../lib/parse.keypress.js"
import { CliRenderEvents, createCliRenderer, type CliRenderer, type CliRendererConfig } from "../renderer.js"
import type { ThemeMode } from "../types.js"

export type BrowserTerminalKey = ParsedKey

// A terminal emulator running in the page, such as ghostty-web or xterm.js.
export interface BrowserTerminalHost {
  getSize(): { cols: number; rows: number }
  write(data: string): void
  onData(handler: (data: string) => void): () => void
  onResize(handler: (size: { cols: number; rows: number }) => void): () => void
  onKey?(handler: (key: ParsedKey) => void): () => void
  copy?(text: string): void | Promise<void>
  setTitle?(title: string): void
  onFocusChange?(handler: (focused: boolean) => void): () => void
  onThemeModeChange?(handler: (mode: ThemeMode) => void): () => void
}

export interface BrowserRendererConfig extends Omit<
  CliRendererConfig,
  "stdin" | "stdout" | "width" | "height" | "exitSignals" | "exitOnCtrlC" | "bufferedOutput" | "nativeSession"
> {
  exitOnCtrlC?: boolean
}

const FOCUS_IN = "\x1b[I"
const FOCUS_OUT = "\x1b[O"
const THEME_DARK = "\x1b[?997;1n"
const THEME_LIGHT = "\x1b[?997;2n"

class HostOutput extends Writable {
  readonly isTTY = true
  columns: number
  rows: number
  private readonly decoder = new TextDecoder()

  constructor(private readonly host: BrowserTerminalHost) {
    super({ decodeStrings: false })
    const size = host.getSize()
    this.columns = size.cols
    this.rows = size.rows
  }

  override _write(chunk: string | Uint8Array, _encoding: string, callback: (error?: Error | null) => void): void {
    this.host.write(typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true }))
    callback()
  }
}

class HostInput extends Readable {
  readonly isTTY = true
  isRaw = false
  private readonly encoder = new TextEncoder()

  setRawMode(mode: boolean): this {
    this.isRaw = mode
    return this
  }

  pushText(data: string): void {
    this.push(this.encoder.encode(data))
  }

  override _read(): void {}
}

export async function createBrowserRenderer(
  host: BrowserTerminalHost,
  config: BrowserRendererConfig = {},
): Promise<CliRenderer> {
  const stdout = new HostOutput(host)
  const stdin = new HostInput()
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    ...config,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    width: stdout.columns,
    height: stdout.rows,
    remote: config.remote ?? true,
    exitSignals: [],
  })

  const unsubscribers = [
    host.onData((data) => stdin.pushText(data)),
    host.onResize(({ cols, rows }) => {
      stdout.columns = cols
      stdout.rows = rows
      renderer.resize(cols, rows)
    }),
  ]
  if (host.onKey) unsubscribers.push(host.onKey((key) => renderer._internalKeyInput.processParsedKey(key)))
  if (host.onFocusChange) {
    unsubscribers.push(host.onFocusChange((focused) => stdin.pushText(focused ? FOCUS_IN : FOCUS_OUT)))
  }
  if (host.onThemeModeChange) {
    unsubscribers.push(host.onThemeModeChange((mode) => stdin.pushText(mode === "dark" ? THEME_DARK : THEME_LIGHT)))
  }
  if (host.setTitle) {
    const setTitle = host.setTitle.bind(host)
    renderer.setTerminalTitle = (title: string) => setTitle(title)
  }
  if (host.copy) {
    const copy = host.copy.bind(host)
    renderer.copyToClipboardOSC52 = (text: string) => {
      void copy(text)
      return true
    }
  }

  renderer.once(CliRenderEvents.DESTROY, () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  })

  return renderer
}
