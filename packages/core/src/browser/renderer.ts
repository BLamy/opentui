import { Renderable, RootRenderable } from "../Renderable.js"
import { OptimizedBuffer } from "../buffer.js"
import { EventEmitter } from "../lib/EventEmitter.js"
import { InternalKeyHandler, KeyHandler, type KeyEvent, type PasteEvent } from "../lib/KeyHandler.js"
import { getObjectsInViewport } from "../lib/objects-in-viewport.js"
import { type RawMouseEvent, type ScrollInfo, type MouseEventType } from "../lib/parse.mouse.js"
import type { ParsedKey } from "../lib/parse.keypress.js"
import { Selection } from "../lib/selection.js"
import { StdinParser, type StdinEvent } from "../lib/stdin-parser.js"
import { parseColor, type ColorInput, RGBA } from "../lib/RGBA.js"
import { type Pointer } from "../lib/ffi-runtime.js"
import { resolveRenderLib, type RenderLib } from "../render-lib.js"
import type { GetPaletteOptions, TerminalColors } from "../lib/terminal-palette.js"
import {
  DebugOverlayCorner,
  type CursorStyleOptions,
  type MousePointerStyle,
  type RenderContext,
  type ThemeMode,
  type ViewportBounds,
  type WidthMethod,
} from "../types.js"

export type BrowserTerminalKey = ParsedKey

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

export interface BrowserRendererConfig {
  renderLib?: RenderLib
  useAlternateScreen?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  autoFocus?: boolean
  backgroundColor?: ColorInput
  prependInputHandlers?: ((sequence: string) => boolean)[]
  onDestroy?: () => void
}

export enum BrowserRenderEvents {
  RESIZE = "resize",
  FOCUS = "focus",
  BLUR = "blur",
  THEME_MODE = "theme_mode",
  DESTROY = "destroy",
  SELECTION = "selection",
}

export class MouseEvent {
  public readonly type: MouseEventType
  public readonly button: number
  public readonly x: number
  public readonly y: number
  public readonly source?: Renderable
  public readonly modifiers: {
    shift: boolean
    alt: boolean
    ctrl: boolean
  }
  public readonly scroll?: ScrollInfo
  public readonly target: Renderable | null
  public readonly isDragging?: boolean
  private _propagationStopped = false
  private _defaultPrevented = false

  public get propagationStopped(): boolean {
    return this._propagationStopped
  }

  public get defaultPrevented(): boolean {
    return this._defaultPrevented
  }

  constructor(target: Renderable | null, attributes: RawMouseEvent & { source?: Renderable; isDragging?: boolean }) {
    this.target = target
    this.type = attributes.type
    this.button = attributes.button
    this.x = attributes.x
    this.y = attributes.y
    this.source = attributes.source
    this.modifiers = attributes.modifiers
    this.scroll = attributes.scroll
    this.isDragging = attributes.isDragging
  }

  public stopPropagation(): void {
    this._propagationStopped = true
  }

  public preventDefault(): void {
    this._defaultPrevented = true
  }
}

export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  WHEEL_UP = 4,
  WHEEL_DOWN = 5,
}

const DARK_BROWSER_PALETTE = [
  "#0d1117",
  "#ff7b72",
  "#3fb950",
  "#d29922",
  "#58a6ff",
  "#bc8cff",
  "#39c5cf",
  "#c9d1d9",
  "#8b949e",
  "#ffa198",
  "#56d364",
  "#e3b341",
  "#79c0ff",
  "#d2a8ff",
  "#56d4dd",
  "#f0f6fc",
] as const

const LIGHT_BROWSER_PALETTE = [
  "#24292f",
  "#cf222e",
  "#1a7f37",
  "#9a6700",
  "#0969da",
  "#8250df",
  "#1b7c83",
  "#6e7781",
  "#57606a",
  "#a40e26",
  "#2da44e",
  "#bf8700",
  "#218bff",
  "#a475f9",
  "#3192aa",
  "#ffffff",
] as const

interface BrowserConsoleSurface {
  toggle(): void
  onCopySelection?: (text: string) => void
}

function createBrowserPalette(mode: ThemeMode | null, size: number = 16): TerminalColors {
  const palette = mode === "light" ? LIGHT_BROWSER_PALETTE : DARK_BROWSER_PALETTE
  const requested = Math.max(size, 16)
  const colors = Array.from({ length: requested }, (_, index) => palette[index] ?? null)
  return {
    palette: colors,
    defaultForeground: mode === "light" ? "#24292f" : "#c9d1d9",
    defaultBackground: mode === "light" ? "#ffffff" : "#0d1117",
    cursorColor: mode === "light" ? "#0969da" : "#58a6ff",
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: mode === "light" ? "#dbeafe" : "#264f78",
    highlightForeground: mode === "light" ? "#0f172a" : "#f0f6fc",
  }
}

export class BrowserRenderer extends EventEmitter implements RenderContext {
  private readonly lib: RenderLib
  private readonly host: BrowserTerminalHost
  public readonly rendererPtr: Pointer
  public readonly root: RootRenderable
  public readonly keyInput: KeyHandler
  public readonly _internalKeyInput: InternalKeyHandler

  public width: number
  public height: number
  public nextRenderBuffer: OptimizedBuffer
  public currentRenderBuffer: OptimizedBuffer
  public readonly console: BrowserConsoleSurface = {
    toggle: () => {},
    onCopySelection: undefined,
  }

  private readonly encoder = new TextEncoder()
  private readonly stdinParser: StdinParser
  private readonly lifecyclePasses = new Set<Renderable>()
  private readonly unsubscribers: Array<() => void> = []
  private readonly prependedInputHandlers: Array<(sequence: string) => boolean>
  private readonly frameCallbacks: Array<(deltaTime: number) => Promise<void> | void> = []

  private renderScheduled = false
  private animationFrameId: number | null = null
  private lastFrameTime = performance.now()
  private liveRequestCounter = 0
  private isDestroyed = false
  private useMouseTracking: boolean
  private enableMouseMovement: boolean
  private autoFocus: boolean
  private backgroundColor = RGBA.fromValues(0, 0, 0, 0)
  private _capabilities: any
  private _themeMode: ThemeMode | null = null
  private _currentFocusedRenderable: Renderable | null = null
  private _latestPointer = { x: 0, y: 0 }
  private _hasPointer = false
  private _lastPointerModifiers: RawMouseEvent["modifiers"] = { shift: false, alt: false, ctrl: false }
  private capturedRenderable?: Renderable
  private lastOverRenderableNum = 0
  private lastOverRenderable?: Renderable
  private currentSelection: Selection | null = null
  private selectionContainers: Renderable[] = []
  private _currentMousePointerStyle: MousePointerStyle | undefined = undefined
  private onDestroy?: () => void
  private sequenceHandlers: Array<(sequence: string) => boolean> = []
  private shouldRestoreModesOnNextFocus = false
  private debugOverlayEnabled = false
  private debugOverlayCorner = DebugOverlayCorner.topRight
  private cachedPalette: TerminalColors | null = null

  constructor(host: BrowserTerminalHost, config: BrowserRendererConfig = {}) {
    super()

    this.lib = config.renderLib ?? resolveRenderLib()
    this.host = host
    this.prependedInputHandlers = config.prependInputHandlers ?? []
    this.useMouseTracking = config.useMouse ?? true
    this.enableMouseMovement = config.enableMouseMovement ?? true
    this.autoFocus = config.autoFocus ?? true
    this.onDestroy = config.onDestroy

    const size = host.getSize()
    this.width = size.cols
    this.height = size.rows

    const rendererPtr = this.lib.createRenderer(this.width, this.height, { remote: false, testing: false })
    if (!rendererPtr) {
      throw new Error("Failed to create browser renderer")
    }

    this.rendererPtr = rendererPtr
    this.lib.setUseThread(this.rendererPtr, false)
    this.seedEnvironment()
    this.lib.setupTerminalForBrowser?.(this.rendererPtr, config.useAlternateScreen ?? true)
    this._capabilities = this.lib.getTerminalCapabilities(this.rendererPtr)
    this.nextRenderBuffer = this.lib.getNextBuffer(this.rendererPtr)
    this.currentRenderBuffer = this.lib.getCurrentBuffer(this.rendererPtr)
    this._internalKeyInput = new InternalKeyHandler()
    this.keyInput = this._internalKeyInput
    this.stdinParser = new StdinParser({
      timeoutMs: 10,
      useKittyKeyboard: false,
      protocolContext: {
        kittyKeyboardEnabled: false,
        privateCapabilityRepliesActive: false,
        pixelResolutionQueryActive: false,
        explicitWidthCprActive: false,
      },
    })
    this.root = new RootRenderable(this)

    if (config.backgroundColor) {
      this.setBackgroundColor(config.backgroundColor)
    }

    this.setupInput()
    this.requestRender()
  }

  private seedEnvironment(): void {
    this.lib.setTerminalEnvVar(this.rendererPtr, "TERM", "xterm-256color")
    this.lib.setTerminalEnvVar(this.rendererPtr, "COLORTERM", "truecolor")
    this.lib.setTerminalEnvVar(this.rendererPtr, "TERM_PROGRAM", "xterm.js")
    this.lib.setTerminalEnvVar(this.rendererPtr, "TERM_PROGRAM_VERSION", "browser")
  }

  private setupInput(): void {
    for (const handler of this.prependedInputHandlers) {
      this.sequenceHandlers.push(handler)
    }

    this.unsubscribers.push(
      this.host.onData((data) => {
        if (this.isDestroyed) return
        this.stdinParser.push(this.encoder.encode(data))
        this.stdinParser.drain((event) => this.handleStdinEvent(event))
      }),
    )

    this.unsubscribers.push(
      this.host.onResize((size) => {
        this.processResize(size.cols, size.rows)
      }),
    )

    if (this.host.onKey) {
      this.unsubscribers.push(
        this.host.onKey((key) => {
          if (this.isDestroyed) return
          this._internalKeyInput.processParsedKey(key)
        }),
      )
    }

    if (this.host.onFocusChange) {
      this.unsubscribers.push(
        this.host.onFocusChange((focused) => {
          if (focused) {
            if (this.shouldRestoreModesOnNextFocus) {
              this.lib.restoreTerminalModes(this.rendererPtr)
              this.shouldRestoreModesOnNextFocus = false
            }
            this.emit(BrowserRenderEvents.FOCUS)
          } else {
            this.shouldRestoreModesOnNextFocus = true
            this.emit(BrowserRenderEvents.BLUR)
          }
        }),
      )
    }

    if (this.host.onThemeModeChange) {
      this.unsubscribers.push(
        this.host.onThemeModeChange((mode) => {
          this._themeMode = mode
          this.lib.setTerminalThemeMode?.(this.rendererPtr, mode)
          this.emit(BrowserRenderEvents.THEME_MODE, mode)
        }),
      )
    }

    if (this.useMouseTracking) {
      this.lib.enableMouse(this.rendererPtr, this.enableMouseMovement)
    }
  }

  private handleStdinEvent(event: StdinEvent): void {
    switch (event.type) {
      case "key":
        if (this.dispatchSequenceHandlers(event.raw)) {
          return
        }
        this._internalKeyInput.processParsedKey(event.key)
        return
      case "mouse":
        this.processSingleMouseEvent(event.event)
        return
      case "paste":
        this._internalKeyInput.processPaste(event.bytes, event.metadata)
        return
      case "response":
        this.dispatchSequenceHandlers(event.sequence)
        return
    }
  }

  private dispatchSequenceHandlers(sequence: string): boolean {
    for (const handler of this.sequenceHandlers) {
      if (handler(sequence)) {
        return true
      }
    }

    return false
  }

  public get widthMethod(): WidthMethod {
    return this._capabilities?.unicode === "wcwidth" ? "wcwidth" : "unicode"
  }

  public get capabilities(): any | null {
    return this._capabilities
  }

  public get currentFocusedRenderable(): Renderable | null {
    return this._currentFocusedRenderable
  }

  public focusRenderable(renderable: Renderable): void {
    if (this._currentFocusedRenderable === renderable) {
      return
    }

    this._currentFocusedRenderable?.blur()
    this._currentFocusedRenderable = renderable
  }

  public registerLifecyclePass(renderable: Renderable): void {
    this.lifecyclePasses.add(renderable)
  }

  public unregisterLifecyclePass(renderable: Renderable): void {
    this.lifecyclePasses.delete(renderable)
  }

  public getLifecyclePasses(): Set<Renderable> {
    return this.lifecyclePasses
  }

  public addToHitGrid(x: number, y: number, width: number, height: number, id: number): void {
    if (id !== this.capturedRenderable?.num) {
      this.lib.addToHitGrid(this.rendererPtr, x, y, width, height, id)
    }
  }

  public pushHitGridScissorRect(x: number, y: number, width: number, height: number): void {
    this.lib.hitGridPushScissorRect(this.rendererPtr, x, y, width, height)
  }

  public popHitGridScissorRect(): void {
    this.lib.hitGridPopScissorRect(this.rendererPtr)
  }

  public clearHitGridScissorRects(): void {
    this.lib.hitGridClearScissorRects(this.rendererPtr)
  }

  public setCursorPosition(x: number, y: number, visible: boolean): void {
    this.lib.setCursorPosition(this.rendererPtr, x, y, visible)
  }

  public setCursorStyle(options: CursorStyleOptions): void {
    if (options.cursor) {
      this._currentMousePointerStyle = options.cursor
    }

    this.lib.setCursorStyleOptions(this.rendererPtr, options)
  }

  public setCursorColor(color: RGBA): void {
    this.lib.setCursorColor(this.rendererPtr, color)
  }

  public setMousePointer(shape: MousePointerStyle): void {
    this._currentMousePointerStyle = shape
    this.lib.setCursorStyleOptions(this.rendererPtr, { cursor: shape })
  }

  public requestLive(): void {
    this.liveRequestCounter += 1
    this.ensureAnimationLoop()
  }

  public dropLive(): void {
    this.liveRequestCounter = Math.max(0, this.liveRequestCounter - 1)
  }

  public requestRender(): void {
    if (this.isDestroyed) {
      return
    }

    if (this.liveRequestCounter > 0) {
      this.ensureAnimationLoop()
      return
    }

    if (this.renderScheduled) {
      return
    }

    this.renderScheduled = true
    queueMicrotask(() => {
      this.renderScheduled = false
      this.renderFrame()
    })
  }

  private ensureAnimationLoop(): void {
    if (this.animationFrameId != null || this.isDestroyed) {
      return
    }

    this.animationFrameId = window.requestAnimationFrame(() => {
      this.animationFrameId = null
      this.renderFrame()
      if (this.liveRequestCounter > 0) {
        this.ensureAnimationLoop()
      }
    })
  }

  private renderFrame(): void {
    if (this.isDestroyed) {
      return
    }

    const now = performance.now()
    const deltaTime = now - this.lastFrameTime
    this.lastFrameTime = now

    for (const frameCallback of this.frameCallbacks) {
      try {
        void frameCallback(deltaTime)
      } catch (error) {
        console.error("Error in browser frame callback:", error)
      }
    }

    this.root.render(this.nextRenderBuffer, deltaTime)
    this.lib.render(this.rendererPtr, false)

    const output = this.lib.drainOutput?.(this.rendererPtr)
    if (output) {
      this.host.write(output)
    }

    if (this.useMouseTracking && this.lib.getHitGridDirty(this.rendererPtr)) {
      this.recheckHoverState()
    }
  }

  private dispatchMouseEvent(
    target: Renderable,
    attributes: RawMouseEvent & { source?: Renderable; isDragging?: boolean },
  ): MouseEvent {
    const event = new MouseEvent(target, attributes)
    target.processMouseEvent(event as any)

    if (this.autoFocus && event.type === "down" && event.button === MouseButton.LEFT && !event.defaultPrevented) {
      let current: Renderable | null = target
      while (current) {
        if (current.focusable) {
          current.focus()
          break
        }
        current = current.parent
      }
    }

    return event
  }

  private processSingleMouseEvent(mouseEvent: RawMouseEvent): boolean {
    this._latestPointer = { x: mouseEvent.x, y: mouseEvent.y }
    this._hasPointer = true
    this._lastPointerModifiers = mouseEvent.modifiers

    if (mouseEvent.type === "scroll") {
      const maybeRenderableId = this.hitTest(mouseEvent.x, mouseEvent.y)
      const maybeRenderable = Renderable.renderablesByNumber.get(maybeRenderableId)
      const fallbackTarget =
        this._currentFocusedRenderable && !this._currentFocusedRenderable.isDestroyed && this._currentFocusedRenderable.focused
          ? this._currentFocusedRenderable
          : null
      const scrollTarget = maybeRenderable ?? fallbackTarget

      if (scrollTarget) {
        const event = new MouseEvent(scrollTarget, mouseEvent)
        scrollTarget.processMouseEvent(event as any)
      }
      return true
    }

    const maybeRenderableId = this.hitTest(mouseEvent.x, mouseEvent.y)
    const sameElement = maybeRenderableId === this.lastOverRenderableNum
    this.lastOverRenderableNum = maybeRenderableId
    const maybeRenderable = Renderable.renderablesByNumber.get(maybeRenderableId)

    if (
      mouseEvent.type === "down" &&
      mouseEvent.button === MouseButton.LEFT &&
      !this.currentSelection?.isDragging &&
      !mouseEvent.modifiers.ctrl &&
      maybeRenderable?.selectable &&
      maybeRenderable.shouldStartSelection(mouseEvent.x, mouseEvent.y)
    ) {
      this.startSelection(maybeRenderable, mouseEvent.x, mouseEvent.y)
      this.dispatchMouseEvent(maybeRenderable, mouseEvent)
      return true
    }

    if (mouseEvent.type === "drag" && this.currentSelection?.isDragging) {
      this.updateSelection(maybeRenderable, mouseEvent.x, mouseEvent.y)
      if (maybeRenderable) {
        const event = new MouseEvent(maybeRenderable, { ...mouseEvent, isDragging: true })
        maybeRenderable.processMouseEvent(event as any)
      }
      return true
    }

    if (mouseEvent.type === "up" && this.currentSelection?.isDragging) {
      if (maybeRenderable) {
        const event = new MouseEvent(maybeRenderable, { ...mouseEvent, isDragging: true })
        maybeRenderable.processMouseEvent(event as any)
      }

      this.finishSelection()
      return true
    }

    if (!sameElement && (mouseEvent.type === "drag" || mouseEvent.type === "move")) {
      if (this.lastOverRenderable && this.lastOverRenderable !== this.capturedRenderable && !this.lastOverRenderable.isDestroyed) {
        const event = new MouseEvent(this.lastOverRenderable, { ...mouseEvent, type: "out" })
        this.lastOverRenderable.processMouseEvent(event as any)
      }

      this.lastOverRenderable = maybeRenderable
      if (maybeRenderable) {
        const event = new MouseEvent(maybeRenderable, {
          ...mouseEvent,
          type: "over",
          source: this.capturedRenderable,
        })
        maybeRenderable.processMouseEvent(event as any)
      }
    }

    if (this.capturedRenderable && mouseEvent.type !== "up") {
      const event = new MouseEvent(this.capturedRenderable, mouseEvent)
      this.capturedRenderable.processMouseEvent(event as any)
      return true
    }

    if (this.capturedRenderable && mouseEvent.type === "up") {
      const event = new MouseEvent(this.capturedRenderable, { ...mouseEvent, type: "drag-end" })
      this.capturedRenderable.processMouseEvent(event as any)
      this.capturedRenderable.processMouseEvent(new MouseEvent(this.capturedRenderable, mouseEvent) as any)
      if (maybeRenderable) {
        const dropEvent = new MouseEvent(maybeRenderable, {
          ...mouseEvent,
          type: "drop",
          source: this.capturedRenderable,
        })
        maybeRenderable.processMouseEvent(dropEvent as any)
      }
      this.lastOverRenderable = this.capturedRenderable
      this.lastOverRenderableNum = this.capturedRenderable.num
      this.capturedRenderable = undefined
      this.requestRender()
    }

    let event: MouseEvent | undefined
    if (maybeRenderable) {
      if (mouseEvent.type === "drag" && mouseEvent.button === MouseButton.LEFT) {
        this.capturedRenderable = maybeRenderable
      } else {
        this.capturedRenderable = undefined
      }
      event = this.dispatchMouseEvent(maybeRenderable, mouseEvent)
    } else {
      this.capturedRenderable = undefined
      this.lastOverRenderable = undefined
    }

    if (!event?.defaultPrevented && mouseEvent.type === "down" && this.currentSelection) {
      this.clearSelection()
    }

    return true
  }

  private recheckHoverState(): void {
    if (this.isDestroyed || !this._hasPointer || this.capturedRenderable) {
      return
    }

    const hitId = this.hitTest(this._latestPointer.x, this._latestPointer.y)
    const hitRenderable = Renderable.renderablesByNumber.get(hitId)
    const lastOver = this.lastOverRenderable

    if (lastOver?.num === hitId) {
      this.lastOverRenderableNum = hitId
      return
    }

    const baseEvent: RawMouseEvent = {
      type: "move",
      button: 0,
      x: this._latestPointer.x,
      y: this._latestPointer.y,
      modifiers: this._lastPointerModifiers,
    }

    if (lastOver && !lastOver.isDestroyed) {
      lastOver.processMouseEvent(new MouseEvent(lastOver, { ...baseEvent, type: "out" }) as any)
    }

    this.lastOverRenderable = hitRenderable
    this.lastOverRenderableNum = hitId

    if (hitRenderable) {
      hitRenderable.processMouseEvent(new MouseEvent(hitRenderable, { ...baseEvent, type: "over" }) as any)
    }
  }

  public hitTest(x: number, y: number): number {
    return this.lib.checkHit(this.rendererPtr, x, y)
  }

  private processResize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return
    }

    this.width = width
    this.height = height
    this.lib.resizeRenderer(this.rendererPtr, width, height)
    this.nextRenderBuffer = this.lib.getNextBuffer(this.rendererPtr)
    this.currentRenderBuffer = this.lib.getCurrentBuffer(this.rendererPtr)
    this.root.resize(width, height)
    this.emit(BrowserRenderEvents.RESIZE, width, height)
    this.requestRender()
  }

  public setBackgroundColor(color: ColorInput): void {
    const parsedColor = parseColor(color)
    this.backgroundColor = parsedColor
    this.lib.setBackgroundColor(this.rendererPtr, parsedColor)
    this.nextRenderBuffer.clear(parsedColor)
    this.requestRender()
  }

  public clearSelection(): void {
    if (this.currentSelection) {
      for (const renderable of this.currentSelection.touchedRenderables) {
        if (renderable.selectable && !renderable.isDestroyed) {
          renderable.onSelectionChanged(null)
        }
      }
    }

    this.currentSelection = null
    this.selectionContainers = []
  }

  public getSelection(): Selection | null {
    return this.currentSelection
  }

  public get hasSelection(): boolean {
    return this.currentSelection != null
  }

  public startSelection(renderable: Renderable, x: number, y: number): void {
    if (!renderable.selectable) {
      return
    }

    this.clearSelection()
    this.selectionContainers.push(renderable.parent || this.root)
    this.currentSelection = new Selection(renderable, { x, y }, { x, y })
    this.currentSelection.isStart = true
    this.notifySelectablesOfSelectionChange()
  }

  public updateSelection(
    currentRenderable: Renderable | undefined,
    x: number,
    y: number,
    options?: { finishDragging?: boolean },
  ): void {
    if (!this.currentSelection) {
      return
    }

    this.currentSelection.isStart = false
    this.currentSelection.focus = { x, y }

    if (options?.finishDragging) {
      this.currentSelection.isDragging = false
    }

    if (this.selectionContainers.length > 0) {
      const currentContainer = this.selectionContainers[this.selectionContainers.length - 1]
      if (!currentRenderable || !this.isWithinContainer(currentRenderable, currentContainer)) {
        const parentContainer = currentContainer.parent || this.root
        this.selectionContainers.push(parentContainer)
      }
    }

    this.notifySelectablesOfSelectionChange()
  }

  public requestSelectionUpdate(): void {
    if (!this.currentSelection?.isDragging) {
      return
    }

    const pointer = this._latestPointer
    const maybeRenderableId = this.hitTest(pointer.x, pointer.y)
    const maybeRenderable = Renderable.renderablesByNumber.get(maybeRenderableId)
    this.updateSelection(maybeRenderable, pointer.x, pointer.y)
  }

  private finishSelection(): void {
    if (!this.currentSelection) {
      return
    }

    this.currentSelection.isDragging = false
    this.emit(BrowserRenderEvents.SELECTION, this.currentSelection)
    this.notifySelectablesOfSelectionChange()
  }

  private isWithinContainer(renderable: Renderable, container: Renderable): boolean {
    let current: Renderable | null = renderable
    while (current) {
      if (current === container) {
        return true
      }
      current = current.parent
    }
    return false
  }

  private notifySelectablesOfSelectionChange(): void {
    const selectedRenderables: Renderable[] = []
    const touchedRenderables: Renderable[] = []
    const currentContainer =
      this.selectionContainers.length > 0 ? this.selectionContainers[this.selectionContainers.length - 1] : this.root

    if (!this.currentSelection) {
      return
    }

    this.walkSelectableRenderables(currentContainer, this.currentSelection.bounds, selectedRenderables, touchedRenderables)

    for (const renderable of this.currentSelection.touchedRenderables) {
      if (!touchedRenderables.includes(renderable) && !renderable.isDestroyed) {
        renderable.onSelectionChanged(null)
      }
    }

    this.currentSelection.updateSelectedRenderables(selectedRenderables)
    this.currentSelection.updateTouchedRenderables(touchedRenderables)
  }

  private walkSelectableRenderables(
    container: Renderable,
    selectionBounds: ViewportBounds,
    selectedRenderables: Renderable[],
    touchedRenderables: Renderable[],
  ): void {
    const children = getObjectsInViewport<Renderable>(
      selectionBounds,
      container.getChildrenSortedByPrimaryAxis(),
      container.primaryAxis,
      0,
      0,
    )

    for (const child of children) {
      if (child.selectable) {
        const hasSelection = child.onSelectionChanged(this.currentSelection)
        if (hasSelection) {
          selectedRenderables.push(child)
        }
        touchedRenderables.push(child)
      }

      if (child.getChildrenCount() > 0) {
        this.walkSelectableRenderables(child, selectionBounds, selectedRenderables, touchedRenderables)
      }
    }
  }

  public setTerminalTitle(title: string): void {
    this.host.setTitle?.(title)
    this.lib.setTerminalTitle(this.rendererPtr, title)
  }

  public disableStdoutInterception(): void {}

  public toggleDebugOverlay(corner: DebugOverlayCorner = this.debugOverlayCorner): void {
    this.debugOverlayEnabled = !this.debugOverlayEnabled
    this.debugOverlayCorner = corner
    this.lib.setDebugOverlay?.(this.rendererPtr, this.debugOverlayEnabled, corner)
    this.emit("debugOverlay:toggle", this.debugOverlayEnabled)
    this.requestRender()
  }

  public suspend(): void {}

  public resume(): void {
    this.requestRender()
  }

  public clearPaletteCache(): void {
    this.cachedPalette = null
  }

  public async getPalette(options?: GetPaletteOptions): Promise<TerminalColors> {
    const requestedSize = options?.size ?? 16
    if (this.cachedPalette && this.cachedPalette.palette.length === requestedSize) {
      return this.cachedPalette
    }

    this.cachedPalette = createBrowserPalette(this._themeMode, requestedSize)
    return this.cachedPalette
  }

  public setFrameCallback(callback: (deltaTime: number) => Promise<void> | void): void {
    this.frameCallbacks.push(callback)
  }

  public removeFrameCallback(callback: (deltaTime: number) => Promise<void> | void): void {
    const index = this.frameCallbacks.indexOf(callback)
    if (index >= 0) {
      this.frameCallbacks.splice(index, 1)
    }
  }

  public clearFrameCallbacks(): void {
    this.frameCallbacks.length = 0
  }

  public async copy(text: string): Promise<void> {
    await this.host.copy?.(text)
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true

    if (this.animationFrameId != null) {
      window.cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    for (const unsubscribe of this.unsubscribers) {
      unsubscribe()
    }

    this.root.destroyRecursively()
    this.lib.destroyRenderer(this.rendererPtr)
    this.emit(BrowserRenderEvents.DESTROY)
    this.onDestroy?.()
  }
}

export async function createBrowserRenderer(
  host: BrowserTerminalHost,
  config: BrowserRendererConfig = {},
): Promise<BrowserRenderer> {
  return new BrowserRenderer(host, config)
}
