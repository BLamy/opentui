import { Ghostty, FitAddon, Terminal, type ITheme } from "ghostty-web"
import DEFAULT_GHOSTTY_WASM_URL from "ghostty-web/ghostty-vt.wasm?url"

import type { BrowserTerminalHost, BrowserTerminalKey } from "@opentui/core/browser"

export type ThemeMode = "dark" | "light"
export type BrowserTerminalTheme = ITheme

export interface TerminalDisposable {
  dispose(): void
}

export interface BrowserTerminalSurfaceLike {
  cols: number
  rows: number
  open(parent: HTMLElement): void
  loadAddon(addon: { dispose(): void }): void
  focus(): void
  write(data: string): void
  writeln?(data: string): void
  dispose(): void
  onData(handler: (data: string) => void): TerminalDisposable | (() => void)
  onResize(handler: (size: { cols: number; rows: number }) => void): TerminalDisposable | (() => void)
  hasMouseTracking?(): boolean
  getMode?(mode: number, isAnsi?: boolean): boolean
  attachCustomWheelEventHandler?(handler?: (event: WheelEvent) => boolean): void
}

export interface BrowserTerminalFitAddonLike {
  fit(): void
  observeResize?(): void
  dispose(): void
}

export interface BrowserTerminalSessionOptions {
  surface: HTMLElement
  themeMode: ThemeMode
  theme?: BrowserTerminalTheme
  fontFamily: string
  fontSize: number
  scrollback: number
  allowTransparency?: boolean
  cursorBlink?: boolean
  convertEol?: boolean
  autoFocus?: boolean
  ghosttyWasmUrl?: string
  themeQuery?: string
}

interface BrowserTerminalCreationOptions {
  ghostty: unknown
  allowTransparency: boolean
  cursorBlink: boolean
  fontFamily: string
  fontSize: number
  convertEol: boolean
  scrollback: number
  theme: BrowserTerminalTheme
}

export interface BrowserTerminalSessionDeps<
  TTerminal extends BrowserTerminalSurfaceLike = BrowserTerminalSurfaceLike,
  TFitAddon extends BrowserTerminalFitAddonLike = BrowserTerminalFitAddonLike,
> {
  loadGhostty?: (wasmUrl: string) => Promise<unknown>
  createTerminal?: (options: BrowserTerminalCreationOptions) => TTerminal
  createFitAddon?: () => TFitAddon
  matchMedia?: (query: string) => MediaQueryListLike
}

export interface BrowserTerminalSession<
  TTerminal extends BrowserTerminalSurfaceLike = BrowserTerminalSurfaceLike,
  TFitAddon extends BrowserTerminalFitAddonLike = BrowserTerminalFitAddonLike,
> {
  term: TTerminal
  fitAddon: TFitAddon
  host: GhosttyBrowserHost<TTerminal, TFitAddon>
  themeMode: ThemeMode
  destroy(): void
}

export interface MediaQueryListLike {
  matches: boolean
  addEventListener?: (type: "change", listener: (event: MediaQueryListEventLike) => void) => void
  removeEventListener?: (type: "change", listener: (event: MediaQueryListEventLike) => void) => void
  addListener?: (listener: (event: MediaQueryListEventLike) => void) => void
  removeListener?: (listener: (event: MediaQueryListEventLike) => void) => void
}

export interface MediaQueryListEventLike {
  matches: boolean
}

const DEFAULT_THEME_QUERY = "(prefers-color-scheme: dark)"
const sharedGhosttyLoads = new Map<string, Promise<unknown>>()
const DOM_TO_MOUSE_BUTTON = new Map<number, number>([
  [0, 0],
  [1, 1],
  [2, 2],
])
const DECSET_MOUSE_ANY_EVENT = 1003

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getMouseModifiers(event: MouseEvent | WheelEvent): number {
  let modifiers = 0
  if (event.shiftKey) modifiers |= 4
  if (event.altKey) modifiers |= 8
  if (event.ctrlKey) modifiers |= 16
  return modifiers
}

function encodeSgrMouseSequence(buttonCode: number, x: number, y: number, suffix: "M" | "m"): string {
  return `\x1b[<${buttonCode};${x + 1};${y + 1}${suffix}`
}

function disposeRegistration(registration: TerminalDisposable | (() => void)): TerminalDisposable {
  if (typeof registration === "function") {
    return {
      dispose: registration,
    }
  }

  return registration
}

function subscribeMediaQuery(
  mediaQuery: MediaQueryListLike,
  listener: (event: MediaQueryListEventLike) => void,
): () => void {
  if (typeof mediaQuery.addEventListener === "function" && typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.addEventListener("change", listener)
    return () => mediaQuery.removeEventListener?.("change", listener)
  }

  mediaQuery.addListener?.(listener)
  return () => mediaQuery.removeListener?.(listener)
}

function resolveThemeMode(matches: boolean): ThemeMode {
  return matches ? "dark" : "light"
}

function createCopyShortcutKey(event: KeyboardEvent): BrowserTerminalKey {
  const value = event.key.length === 1 ? event.key : "C"

  return {
    name: "c",
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: true,
    option: event.altKey,
    sequence: value,
    number: false,
    raw: value,
    eventType: "press",
    source: "raw",
    code: event.code,
    super: false,
    hyper: false,
    capsLock: event.getModifierState("CapsLock"),
    numLock: event.getModifierState("NumLock"),
    repeated: event.repeat,
  }
}

async function defaultLoadGhostty(wasmUrl: string): Promise<Ghostty> {
  return Ghostty.load(wasmUrl)
}

function defaultCreateTerminal(options: BrowserTerminalCreationOptions): Terminal {
  return new Terminal(options as ConstructorParameters<typeof Terminal>[0])
}

function defaultCreateFitAddon(): FitAddon {
  return new FitAddon()
}

async function getSharedGhostty(wasmUrl: string, loadGhostty: (wasmUrl: string) => Promise<unknown>): Promise<unknown> {
  const cached = sharedGhosttyLoads.get(wasmUrl)
  if (cached) {
    return cached
  }

  const pending = loadGhostty(wasmUrl).catch((error) => {
    sharedGhosttyLoads.delete(wasmUrl)
    throw error
  })

  sharedGhosttyLoads.set(wasmUrl, pending)
  return pending
}

export function resetSharedGhosttyCacheForTests(): void {
  sharedGhosttyLoads.clear()
}

export class GhosttyBrowserHost<
  TTerminal extends BrowserTerminalSurfaceLike = BrowserTerminalSurfaceLike,
  TFitAddon extends BrowserTerminalFitAddonLike = BrowserTerminalFitAddonLike,
> implements BrowserTerminalHost
{
  private readonly dataHandlers = new Set<(data: string) => void>()
  private readonly keyHandlers = new Set<(key: BrowserTerminalKey) => void>()
  private readonly resizeHandlers = new Set<(size: { cols: number; rows: number }) => void>()
  private readonly focusHandlers = new Set<(focused: boolean) => void>()
  private readonly themeHandlers = new Set<(mode: ThemeMode) => void>()
  private readonly disposables: TerminalDisposable[] = []
  private readonly mediaQuery: MediaQueryListLike
  private readonly removeMediaQueryListener: () => void
  private readonly focusInHandler: () => void
  private readonly focusOutHandler: (event: FocusEvent) => void
  private readonly keyDownHandler: (event: KeyboardEvent) => void
  private readonly mouseDownHandler: (event: MouseEvent) => void
  private readonly mouseMoveHandler: (event: MouseEvent) => void
  private readonly mouseUpHandler: (event: MouseEvent) => void
  private readonly contextMenuHandler: (event: MouseEvent) => void
  private readonly wheelHandler: (event: WheelEvent) => boolean
  private currentThemeMode: ThemeMode
  private readonly pressedMouseButtons = new Set<number>()
  private surfaceWheelHandler?: (event: WheelEvent) => void

  public constructor(
    private readonly term: TTerminal,
    private readonly fitAddon: TFitAddon,
    private readonly surface: HTMLElement,
    themeMode: ThemeMode,
    {
      themeQuery = DEFAULT_THEME_QUERY,
      matchMedia = (query: string) => window.matchMedia(query) as MediaQueryListLike,
    }: { themeQuery?: string; matchMedia?: (query: string) => MediaQueryListLike } = {},
  ) {
    this.currentThemeMode = themeMode
    this.mediaQuery = matchMedia(themeQuery)

    this.disposables.push(
      disposeRegistration(
        this.term.onData((data) => {
          this.emitData(data)
        }),
      ),
    )

    this.disposables.push(
      disposeRegistration(
        this.term.onResize(({ cols, rows }) => {
          const size = { cols, rows }
          for (const handler of this.resizeHandlers) {
            handler(size)
          }
        }),
      ),
    )

    this.focusInHandler = () => {
      for (const handler of this.focusHandlers) {
        handler(true)
      }
    }

    this.focusOutHandler = (event: FocusEvent) => {
      if (
        typeof Node !== "undefined" &&
        event.relatedTarget instanceof Node &&
        this.surface.contains(event.relatedTarget)
      ) {
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

        const key = createCopyShortcutKey(event)
        for (const handler of this.keyHandlers) {
          handler(key)
        }
      }
    }

    this.mouseDownHandler = (event: MouseEvent) => {
      if (!this.shouldCaptureMouseEvent()) {
        return
      }

      const position = this.getMouseCellPosition(event)
      const button = DOM_TO_MOUSE_BUTTON.get(event.button)
      if (!position || button === undefined) {
        return
      }

      this.pressedMouseButtons.add(button)
      this.term.focus()
      this.emitData(encodeSgrMouseSequence(button | getMouseModifiers(event), position.x, position.y, "M"))
      this.consumeMouseEvent(event)
    }

    this.mouseMoveHandler = (event: MouseEvent) => {
      if (!this.shouldCaptureMouseEvent()) {
        return
      }

      const position = this.getMouseCellPosition(event)
      if (!position) {
        return
      }

      const activeButton = this.getActiveMouseButton()
      const allowHoverMotion = this.isAnyEventMouseTrackingEnabled()
      if (activeButton === null && !allowHoverMotion) {
        return
      }

      const buttonCode = (activeButton ?? 3) | 32 | getMouseModifiers(event)
      this.emitData(encodeSgrMouseSequence(buttonCode, position.x, position.y, "m"))
      this.consumeMouseEvent(event)
    }

    this.mouseUpHandler = (event: MouseEvent) => {
      if (!this.shouldCaptureMouseEvent()) {
        this.pressedMouseButtons.clear()
        return
      }

      const position = this.getMouseCellPosition(event)
      const button = DOM_TO_MOUSE_BUTTON.get(event.button)
      if (!position || button === undefined) {
        this.pressedMouseButtons.delete(button ?? -1)
        return
      }

      this.pressedMouseButtons.delete(button)
      this.emitData(encodeSgrMouseSequence(button | getMouseModifiers(event), position.x, position.y, "m"))
      this.consumeMouseEvent(event)
    }

    this.contextMenuHandler = (event: MouseEvent) => {
      if (!this.shouldCaptureMouseEvent()) {
        return
      }

      this.consumeMouseEvent(event)
    }

    this.wheelHandler = (event: WheelEvent) => {
      if (!this.shouldCaptureMouseEvent()) {
        return false
      }

      const position = this.getMouseCellPosition(event)
      if (!position) {
        return false
      }

      const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y"
      const rawDelta = axis === "x" ? event.deltaX : event.deltaY
      if (rawDelta === 0) {
        return false
      }

      const stepUnit = this.getWheelStepUnit(position.height)
      const repeat = clamp(Math.max(1, Math.round(Math.abs(rawDelta) / stepUnit)), 1, 5)
      const baseButton =
        axis === "x"
          ? rawDelta < 0
            ? 66
            : 67
          : rawDelta < 0
            ? 64
            : 65
      const buttonCode = baseButton | getMouseModifiers(event)

      for (let index = 0; index < repeat; index += 1) {
        this.emitData(encodeSgrMouseSequence(buttonCode, position.x, position.y, "M"))
      }

      return true
    }

    this.surface.addEventListener("focusin", this.focusInHandler)
    this.surface.addEventListener("focusout", this.focusOutHandler)
    this.surface.addEventListener("keydown", this.keyDownHandler, true)
    this.surface.addEventListener("mousedown", this.mouseDownHandler, true)
    this.surface.addEventListener("mousemove", this.mouseMoveHandler, true)
    this.surface.addEventListener("mouseup", this.mouseUpHandler, true)
    this.surface.addEventListener("contextmenu", this.contextMenuHandler, true)

    if (typeof this.term.attachCustomWheelEventHandler === "function") {
      this.term.attachCustomWheelEventHandler(this.wheelHandler)
    } else {
      this.surfaceWheelHandler = (event) => {
        if (this.wheelHandler(event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
      this.surface.addEventListener("wheel", this.surfaceWheelHandler, true)
    }

    this.removeMediaQueryListener = subscribeMediaQuery(this.mediaQuery, (event) => {
      this.currentThemeMode = resolveThemeMode(event.matches)
      for (const handler of this.themeHandlers) {
        handler(this.currentThemeMode)
      }
    })
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

  private emitData(data: string): void {
    for (const handler of this.dataHandlers) {
      handler(data)
    }
  }

  private shouldCaptureMouseEvent(): boolean {
    return this.term.hasMouseTracking?.() ?? false
  }

  private isAnyEventMouseTrackingEnabled(): boolean {
    return this.term.getMode?.(DECSET_MOUSE_ANY_EVENT) ?? false
  }

  private getActiveMouseButton(): number | null {
    for (const button of this.pressedMouseButtons) {
      return button
    }

    return null
  }

  private getWheelStepUnit(cellHeight: number): number {
    return Math.max(1, cellHeight)
  }

  private getMouseCellPosition(event: MouseEvent | WheelEvent): { x: number; y: number; height: number } | null {
    const target =
      (typeof this.surface.querySelector === "function" ? this.surface.querySelector("canvas") : null) ?? this.surface
    if (typeof (target as Element).getBoundingClientRect !== "function") {
      return null
    }

    const rect = (target as Element).getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || this.term.cols <= 0 || this.term.rows <= 0) {
      return null
    }

    const relativeX = event.clientX - rect.left
    const relativeY = event.clientY - rect.top
    if (relativeX < 0 || relativeY < 0 || relativeX >= rect.width || relativeY >= rect.height) {
      return null
    }

    const cellWidth = rect.width / this.term.cols
    const cellHeight = rect.height / this.term.rows

    return {
      x: clamp(Math.floor(relativeX / cellWidth), 0, this.term.cols - 1),
      y: clamp(Math.floor(relativeY / cellHeight), 0, this.term.rows - 1),
      height: cellHeight,
    }
  }

  private consumeMouseEvent(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
  }

  public destroy(): void {
    for (const disposable of this.disposables) {
      disposable.dispose()
    }

    this.pressedMouseButtons.clear()
    this.term.attachCustomWheelEventHandler?.(undefined)
    this.removeMediaQueryListener()
    this.surface.removeEventListener("focusin", this.focusInHandler)
    this.surface.removeEventListener("focusout", this.focusOutHandler)
    this.surface.removeEventListener("keydown", this.keyDownHandler, true)
    this.surface.removeEventListener("mousedown", this.mouseDownHandler, true)
    this.surface.removeEventListener("mousemove", this.mouseMoveHandler, true)
    this.surface.removeEventListener("mouseup", this.mouseUpHandler, true)
    this.surface.removeEventListener("contextmenu", this.contextMenuHandler, true)
    if (this.surfaceWheelHandler) {
      this.surface.removeEventListener("wheel", this.surfaceWheelHandler, true)
      this.surfaceWheelHandler = undefined
    }
  }
}

export async function createBrowserTerminalSession<
  TTerminal extends BrowserTerminalSurfaceLike = BrowserTerminalSurfaceLike,
  TFitAddon extends BrowserTerminalFitAddonLike = BrowserTerminalFitAddonLike,
>(
  options: BrowserTerminalSessionOptions,
  deps: BrowserTerminalSessionDeps<TTerminal, TFitAddon> = {},
): Promise<BrowserTerminalSession<TTerminal, TFitAddon>> {
  const loadGhostty = deps.loadGhostty ?? defaultLoadGhostty
  const createTerminal =
    deps.createTerminal ??
    ((terminalOptions: BrowserTerminalCreationOptions) =>
      defaultCreateTerminal(terminalOptions) as unknown as TTerminal)
  const createFitAddon = deps.createFitAddon ?? (() => defaultCreateFitAddon() as unknown as TFitAddon)
  const ghosttyWasmUrl = options.ghosttyWasmUrl ?? DEFAULT_GHOSTTY_WASM_URL
  const ghostty = await getSharedGhostty(ghosttyWasmUrl, loadGhostty)

  const term = createTerminal({
    ghostty,
    allowTransparency: options.allowTransparency ?? true,
    cursorBlink: options.cursorBlink ?? true,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    convertEol: options.convertEol ?? false,
    scrollback: options.scrollback,
    theme: options.theme ?? {},
  })

  const fitAddon = createFitAddon()
  options.surface.innerHTML = ""

  term.loadAddon(fitAddon as { dispose(): void })
  term.open(options.surface)

  if (typeof fitAddon.observeResize === "function") {
    fitAddon.observeResize()
  }

  const host = new GhosttyBrowserHost(term, fitAddon, options.surface, options.themeMode, {
    themeQuery: options.themeQuery,
    matchMedia: deps.matchMedia,
  })

  host.fit()

  if (options.autoFocus) {
    term.focus()
  }

  return {
    term,
    fitAddon,
    host,
    themeMode: options.themeMode,
    destroy() {
      host.destroy()
      fitAddon.dispose()
      term.dispose()
      options.surface.innerHTML = ""
    },
  }
}
