import {
  BoxRenderable,
  BrowserRenderEvents,
  BrowserRenderer,
  MouseButton,
  RGBA,
  TextAttributes,
  createBrowserRenderer,
  loadBrowserRenderLib,
  type KeyEvent,
} from "@opentui/core/browser"

import {
  createBrowserTerminalSession,
  type BrowserTerminalSession,
  type BrowserTerminalTheme,
} from "./browser-terminal-session"
import { getWorkbenchEditorCursorPosition } from "./workbench-cursor"

type ThemeMode = "dark" | "light"
type LogTone = "info" | "accent" | "success" | "warn" | "error"
type RenderableMouseEvent = Parameters<BoxRenderable["onMouseEvent"]>[0]

interface WorkbenchAction {
  label: string
  keyHint: string
  description: string
  run: () => void
}

interface LogEntry {
  tone: LogTone
  text: string
}

interface Palette {
  shellBg: RGBA
  panelBg: RGBA
  panelAlt: RGBA
  panelMuted: RGBA
  border: RGBA
  borderFocus: RGBA
  text: RGBA
  textMuted: RGBA
  accent: RGBA
  accentSoft: RGBA
  cyan: RGBA
  green: RGBA
  gold: RGBA
  red: RGBA
  selectionBg: RGBA
  selectionFg: RGBA
  chipBg: RGBA
  chipFg: RGBA
  cursor: RGBA
}

declare global {
  interface Window {
    __OPENTUI_BROWSER_WORKBENCH__?: {
      term: BrowserTerminalSession["term"]
      fitAddon: BrowserTerminalSession["fitAddon"]
      host: BrowserTerminalSession["host"]
      renderer: BrowserRenderer
      model: WorkbenchModel
    }
  }
}

const STATUS_TEXT = {
  loading: "Loading browser runtime...",
  ready: "Ghostty Web browser renderer live. Click into the terminal to interact.",
  error:
    "Browser wasm could not be loaded. Run `cd packages/core && bun run build:wasm`, then `cd packages/web && bun run sync:core-wasm`.",
} as const

const LOG_TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const rgba = (hex: string): RGBA => RGBA.fromHex(hex)

function createPalette(mode: ThemeMode): Palette {
  if (mode === "light") {
    return {
      shellBg: rgba("#f8f1e4"),
      panelBg: rgba("#fffaf1"),
      panelAlt: rgba("#f1e8d9"),
      panelMuted: rgba("#eadfcd"),
      border: rgba("#c28f4d"),
      borderFocus: rgba("#0b7285"),
      text: rgba("#1b2225"),
      textMuted: rgba("#6f5e4c"),
      accent: rgba("#b85b13"),
      accentSoft: rgba("#f0dabc"),
      cyan: rgba("#0a7d84"),
      green: rgba("#2d7b47"),
      gold: rgba("#896111"),
      red: rgba("#b14333"),
      selectionBg: rgba("#0a7d84"),
      selectionFg: rgba("#fef8ef"),
      chipBg: rgba("#0a7d84"),
      chipFg: rgba("#fef8ef"),
      cursor: rgba("#0a7d84"),
    }
  }

  return {
    shellBg: rgba("#0b1318"),
    panelBg: rgba("#14232b"),
    panelAlt: rgba("#192c36"),
    panelMuted: rgba("#10212a"),
    border: rgba("#345868"),
    borderFocus: rgba("#a8dcff"),
    text: rgba("#edf7fa"),
    textMuted: rgba("#8aa6b4"),
    accent: rgba("#ffb357"),
    accentSoft: rgba("#3e2b17"),
    cyan: rgba("#55d4cd"),
    green: rgba("#8bdb6f"),
    gold: rgba("#f0d56d"),
    red: rgba("#ff8c70"),
    selectionBg: rgba("#ffb357"),
    selectionFg: rgba("#091216"),
    chipBg: rgba("#ffd166"),
    chipFg: rgba("#162127"),
    cursor: rgba("#ffd166"),
  }
}

function createTerminalTheme(mode: ThemeMode, palette: Palette): BrowserTerminalTheme {
  return {
    background: toCssColor(palette.shellBg),
    foreground: toCssColor(palette.text),
    cursor: toCssColor(palette.cursor),
    cursorAccent: toCssColor(palette.shellBg),
    selectionBackground: toCssColor(palette.selectionBg),
    black: mode === "dark" ? "#10171b" : "#2f2924",
    red: toCssColor(palette.red),
    green: toCssColor(palette.green),
    yellow: toCssColor(palette.gold),
    blue: mode === "dark" ? "#73b7ff" : "#2f71a0",
    magenta: mode === "dark" ? "#f4a3ff" : "#9856af",
    cyan: toCssColor(palette.cyan),
    white: toCssColor(palette.text),
    brightBlack: toCssColor(palette.textMuted),
    brightRed: "#ffb6a3",
    brightGreen: "#c2f19f",
    brightYellow: "#ffe799",
    brightBlue: "#a3d0ff",
    brightMagenta: "#ffc1ff",
    brightCyan: "#9df0ea",
    brightWhite: "#ffffff",
  }
}

function toCssColor(color: RGBA): string {
  const [r, g, b, a] = color.toInts()
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a / 255))})`
}

function toCells(text: string): string[] {
  return Array.from(text)
}

function cellLength(text: string): number {
  return toCells(text).length
}

function sliceCells(text: string, start: number, end?: number): string {
  return toCells(text).slice(start, end).join("")
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function truncateCells(text: string, width: number): string {
  if (width <= 0) {
    return ""
  }

  return sliceCells(text, 0, width)
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return []
  }

  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return [""]
  }

  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (cellLength(word) > width) {
      if (current) {
        lines.push(current)
        current = ""
      }

      const cells = toCells(word)
      while (cells.length > 0) {
        lines.push(cells.splice(0, width).join(""))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (cellLength(candidate) <= width) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) {
    lines.push(current)
  }

  return lines
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n")
}

function timestampLabel(): string {
  return LOG_TIME.format(new Date())
}

function isPrintableKey(key: KeyEvent): boolean {
  if (key.ctrl || key.meta || key.super || key.hyper) {
    return false
  }

  if (key.name === "space") {
    return true
  }

  if (!key.sequence) {
    return false
  }

  const firstCharCode = key.sequence.charCodeAt(0)
  return firstCharCode >= 32 && firstCharCode !== 127
}

class WorkbenchModel {
  public renderer: BrowserRenderer | null = null
  public themeMode: ThemeMode
  public palette: Palette
  public actions: WorkbenchAction[] = []
  public editorLines: string[] = [
    "OpenTUI browser workbench",
    "Type here, paste text, or drag the token in the right-hand pad.",
    "",
    "Unicode sample: lambda λ, braille ⠿, CJK 端末, emoji 🙂",
    "Mouse, resize, cursor, alt-screen, and clipboard hooks should all stay visible here.",
  ]
  public cursorRow = 0
  public cursorCol = 0
  public preferredCursorCol = 0
  public editorScrollTop = 0
  public editorViewportHeight = 1
  public logViewportHeight = 1
  public logs: LogEntry[] = []
  public logScrollTop = 0
  public autoFollowLog = true
  public dragToken = { x: 2, y: 2, width: 10, height: 1 }
  public dragStatus = "Idle. Drag the amber token to prove pointer capture."
  public runtimeState: "loading" | "ready" | "error" = "loading"
  public lastCopyMessage = "Clipboard idle"
  public terminalTitle = "OpenTUI Browser Workbench"
  public focusEditor: (() => void) | null = null
  public workbenchSize = { cols: 0, rows: 0 }

  constructor(themeMode: ThemeMode) {
    this.themeMode = themeMode
    this.palette = createPalette(themeMode)
    this.cursorRow = this.editorLines.length - 1
    this.cursorCol = cellLength(this.editorLines[this.cursorRow] ?? "")
    this.preferredCursorCol = this.cursorCol
    this.seedLogs()
  }

  public attachRenderer(renderer: BrowserRenderer): void {
    this.renderer = renderer
    this.workbenchSize = { cols: renderer.width, rows: renderer.height }
  }

  public setThemeMode(mode: ThemeMode): void {
    this.themeMode = mode
    this.palette = createPalette(mode)
    this.requestRender()
  }

  public setRuntimeState(state: "loading" | "ready" | "error"): void {
    this.runtimeState = state
    this.requestRender()
  }

  public requestRender(): void {
    this.renderer?.requestRender()
  }

  public getEditorText(): string {
    return this.editorLines.join("\n")
  }

  public async copyPreferred(): Promise<void> {
    if (!this.renderer) {
      return
    }

    const selectedText = this.renderer.getSelection()?.getSelectedText().trim()
    const payload = selectedText || this.getEditorText()

    try {
      await this.renderer.copy(payload)
      this.lastCopyMessage = selectedText ? "Copied current selection to the clipboard." : "Copied editor buffer."
      this.log(this.lastCopyMessage, "success")
    } catch {
      this.lastCopyMessage = "Clipboard API unavailable in this browser context."
      this.log(this.lastCopyMessage, "warn")
    }

    this.requestRender()
  }

  public log(message: string, tone: LogTone = "info"): void {
    this.logs.push({
      tone,
      text: `${timestampLabel()}  ${message}`,
    })

    if (this.autoFollowLog) {
      this.logScrollTop = Math.max(0, this.logs.length - this.logViewportHeight)
    }

    this.requestRender()
  }

  public pushLogBurst(): void {
    this.log("Keyboard path confirmed: editor input routed through Ghostty Web.", "accent")
    this.log("Mouse path confirmed: Ghostty Web SGR mouse data reached the OpenTUI host.", "info")
    this.log("Resize path confirmed: Ghostty fit dimensions propagated back into the renderer.", "success")
  }

  public insertUnicodeSample(): void {
    this.insertText("Unicode pulse: 端末  λ  ⠿  🙂\n")
    this.log("Inserted Unicode sample into the editor.", "accent")
  }

  public setEditorViewportHeight(height: number): void {
    this.editorViewportHeight = Math.max(1, height)
    this.ensureCursorVisible()
  }

  public setLogViewportHeight(height: number): void {
    this.logViewportHeight = Math.max(1, height)
    if (this.autoFollowLog) {
      this.logScrollTop = Math.max(0, this.logs.length - this.logViewportHeight)
    } else {
      this.logScrollTop = clamp(this.logScrollTop, 0, Math.max(0, this.logs.length - this.logViewportHeight))
    }
  }

  public scrollEditor(delta: number): void {
    const maxTop = Math.max(0, this.editorLines.length - this.editorViewportHeight)
    this.editorScrollTop = clamp(this.editorScrollTop + delta, 0, maxTop)
    this.requestRender()
  }

  public scrollLogs(delta: number): void {
    const maxTop = Math.max(0, this.logs.length - this.logViewportHeight)
    const nextTop = clamp(this.logScrollTop + delta, 0, maxTop)
    this.logScrollTop = nextTop
    this.autoFollowLog = nextTop >= maxTop
    this.requestRender()
  }

  public ensureCursorVisible(): void {
    const maxTop = Math.max(0, this.editorLines.length - this.editorViewportHeight)

    if (this.cursorRow < this.editorScrollTop) {
      this.editorScrollTop = this.cursorRow
    } else if (this.cursorRow >= this.editorScrollTop + this.editorViewportHeight) {
      this.editorScrollTop = this.cursorRow - this.editorViewportHeight + 1
    }

    this.editorScrollTop = clamp(this.editorScrollTop, 0, maxTop)
  }

  public moveCursorTo(row: number, col: number): void {
    const nextRow = clamp(row, 0, this.editorLines.length - 1)
    const lineLength = cellLength(this.editorLines[nextRow] ?? "")
    this.cursorRow = nextRow
    this.cursorCol = clamp(col, 0, lineLength)
    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  public moveCursorHorizontal(delta: number): void {
    if (delta < 0) {
      if (this.cursorCol > 0) {
        this.cursorCol -= 1
      } else if (this.cursorRow > 0) {
        this.cursorRow -= 1
        this.cursorCol = cellLength(this.editorLines[this.cursorRow] ?? "")
      }
    } else if (delta > 0) {
      const lineLength = cellLength(this.editorLines[this.cursorRow] ?? "")
      if (this.cursorCol < lineLength) {
        this.cursorCol += 1
      } else if (this.cursorRow < this.editorLines.length - 1) {
        this.cursorRow += 1
        this.cursorCol = 0
      }
    }

    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  public moveCursorVertical(delta: number): void {
    const nextRow = clamp(this.cursorRow + delta, 0, this.editorLines.length - 1)
    const nextLineLength = cellLength(this.editorLines[nextRow] ?? "")
    this.cursorRow = nextRow
    this.cursorCol = clamp(this.preferredCursorCol, 0, nextLineLength)
    this.ensureCursorVisible()
    this.requestRender()
  }

  public moveCursorLineEdge(edge: "start" | "end"): void {
    this.cursorCol = edge === "start" ? 0 : cellLength(this.editorLines[this.cursorRow] ?? "")
    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  public insertText(input: string): void {
    const normalized = normalizeNewlines(input)
    const parts = normalized.split("\n")
    const line = this.editorLines[this.cursorRow] ?? ""
    const before = sliceCells(line, 0, this.cursorCol)
    const after = sliceCells(line, this.cursorCol)

    if (parts.length === 1) {
      this.editorLines[this.cursorRow] = `${before}${parts[0]}${after}`
      this.cursorCol += cellLength(parts[0] ?? "")
    } else {
      const nextLines = [`${before}${parts[0] ?? ""}`]
      for (let index = 1; index < parts.length - 1; index += 1) {
        nextLines.push(parts[index] ?? "")
      }
      nextLines.push(`${parts[parts.length - 1] ?? ""}${after}`)
      this.editorLines.splice(this.cursorRow, 1, ...nextLines)
      this.cursorRow += parts.length - 1
      this.cursorCol = cellLength(parts[parts.length - 1] ?? "")
    }

    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  public insertNewLine(): void {
    this.insertText("\n")
  }

  public deleteBackward(): void {
    if (this.cursorCol > 0) {
      const line = this.editorLines[this.cursorRow] ?? ""
      const chars = toCells(line)
      chars.splice(this.cursorCol - 1, 1)
      this.editorLines[this.cursorRow] = chars.join("")
      this.cursorCol -= 1
    } else if (this.cursorRow > 0) {
      const current = this.editorLines[this.cursorRow] ?? ""
      const previous = this.editorLines[this.cursorRow - 1] ?? ""
      this.cursorCol = cellLength(previous)
      this.editorLines.splice(this.cursorRow - 1, 2, `${previous}${current}`)
      this.cursorRow -= 1
    }

    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  public deleteForward(): void {
    const line = this.editorLines[this.cursorRow] ?? ""
    const lineLength = cellLength(line)

    if (this.cursorCol < lineLength) {
      const chars = toCells(line)
      chars.splice(this.cursorCol, 1)
      this.editorLines[this.cursorRow] = chars.join("")
    } else if (this.cursorRow < this.editorLines.length - 1) {
      const next = this.editorLines[this.cursorRow + 1] ?? ""
      this.editorLines.splice(this.cursorRow, 2, `${line}${next}`)
    }

    this.preferredCursorCol = this.cursorCol
    this.ensureCursorVisible()
    this.requestRender()
  }

  private seedLogs(): void {
    this.logs = [
      { tone: "accent", text: `${timestampLabel()}  Browser host boot sequence armed.` },
      { tone: "info", text: `${timestampLabel()}  Waiting for Zig wasm and Ghostty Web to handshake.` },
    ]
    this.logScrollTop = Math.max(0, this.logs.length - this.logViewportHeight)
  }
}

abstract class PanelRenderable extends BoxRenderable {
  constructor(
    protected readonly model: WorkbenchModel,
    options: ConstructorParameters<typeof BoxRenderable>[1],
  ) {
    super(model.renderer as BrowserRenderer, {
      border: true,
      borderStyle: "single",
      borderColor: model.palette.border,
      focusedBorderColor: model.palette.borderFocus,
      backgroundColor: model.palette.panelBg,
      ...options,
    })
  }

  protected get contentX(): number {
    return this.x + 1
  }

  protected get contentY(): number {
    return this.y + 1
  }

  protected get contentWidth(): number {
    return Math.max(0, this.width - 2)
  }

  protected get contentHeight(): number {
    return Math.max(0, this.height - 2)
  }

  protected override renderSelf(buffer: any): void {
    this.backgroundColor = this.focused ? this.model.palette.panelAlt : this.model.palette.panelBg
    this.borderColor = this.model.palette.border
    this.focusedBorderColor = this.model.palette.borderFocus
    super.renderSelf(buffer)
    this.renderContent(buffer)
  }

  protected drawLine(
    buffer: any,
    row: number,
    text: string,
    fg: RGBA,
    bg?: RGBA,
    attributes: number = 0,
    selection?: { start: number; end: number; bgColor?: RGBA; fgColor?: RGBA } | null,
  ): void {
    if (row < 0 || row >= this.contentHeight || this.contentWidth <= 0) {
      return
    }

    const clipped = truncateCells(text, this.contentWidth)
    if (bg) {
      buffer.fillRect(this.contentX, this.contentY + row, this.contentWidth, 1, bg)
    }
    buffer.drawText(clipped, this.contentX, this.contentY + row, fg, bg, attributes, selection)
  }

  protected drawLabelValue(buffer: any, row: number, label: string, value: string, valueColor: RGBA): void {
    if (row < 0 || row >= this.contentHeight || this.contentWidth <= 0) {
      return
    }

    const labelText = truncateCells(`${label}:`, Math.min(cellLength(label) + 1, this.contentWidth))
    buffer.drawText(labelText, this.contentX, this.contentY + row, this.model.palette.textMuted)
    const offset = Math.min(this.contentWidth - 1, cellLength(labelText) + 1)
    if (offset < this.contentWidth) {
      buffer.drawText(
        truncateCells(value, this.contentWidth - offset),
        this.contentX + offset,
        this.contentY + row,
        valueColor,
      )
    }
  }

  protected renderContent(_buffer: any): void {}
}

class HeaderPanelRenderable extends PanelRenderable {
  constructor(model: WorkbenchModel) {
    super(model, { title: "Runtime", height: 5, shouldFill: true })
  }

  protected override renderContent(buffer: any): void {
    this.drawLine(buffer, 0, "OpenTUI browser workbench", this.model.palette.accent, undefined, TextAttributes.BOLD)
    this.drawLine(
      buffer,
      1,
      `zig wasm -> VT stream -> ghostty-web | ${this.model.workbenchSize.cols}x${this.model.workbenchSize.rows} | theme ${this.model.themeMode}`,
      this.model.palette.text,
    )
    this.drawLine(
      buffer,
      2,
      `${this.model.runtimeState} | alt-screen on | TERM xterm-256color | TERM_PROGRAM ghostty-web`,
      this.model.runtimeState === "error" ? this.model.palette.red : this.model.palette.cyan,
    )
  }
}

class SidebarPanelRenderable extends PanelRenderable {
  private hoverIndex = -1
  private pressedIndex = -1

  constructor(model: WorkbenchModel) {
    super(model, { title: "Controls", width: 30, shouldFill: true })
  }

  protected override renderContent(buffer: any): void {
    this.drawLine(buffer, 0, "Click an action or use the shortcuts.", this.model.palette.textMuted)

    const actionsStart = 2
    for (let index = 0; index < this.model.actions.length; index += 1) {
      const action = this.model.actions[index]!
      const row = actionsStart + index * 2
      if (row >= this.contentHeight) {
        break
      }

      const isHovered = index === this.hoverIndex
      const isPressed = index === this.pressedIndex
      const rowBg = isPressed ? this.model.palette.accentSoft : isHovered ? this.model.palette.panelMuted : undefined

      this.drawLine(
        buffer,
        row,
        action.label,
        isHovered || isPressed ? this.model.palette.accent : this.model.palette.text,
        rowBg,
        isHovered ? TextAttributes.BOLD : 0,
      )
      this.drawLine(buffer, row + 1, `${action.keyHint}  ${action.description}`, this.model.palette.textMuted, rowBg)
    }

    const infoStart = actionsStart + this.model.actions.length * 2 + 1
    this.drawLabelValue(buffer, infoStart, "clipboard", this.model.lastCopyMessage, this.model.palette.green)
    this.drawLabelValue(
      buffer,
      infoStart + 1,
      "selection",
      this.model.renderer?.hasSelection ? "active" : "idle",
      this.model.renderer?.hasSelection ? this.model.palette.accent : this.model.palette.textMuted,
    )
    this.drawLabelValue(
      buffer,
      infoStart + 2,
      "focus",
      this.model.renderer?.currentFocusedRenderable?.id ?? "none",
      this.model.palette.cyan,
    )
  }

  protected override onMouseEvent(event: RenderableMouseEvent): void {
    if (event.type === "out") {
      this.hoverIndex = -1
      this.pressedIndex = -1
      this.ctx.setMousePointer("default")
      this.requestRender()
      return
    }

    const rowIndex = this.getActionIndex(event.x, event.y)
    this.hoverIndex = rowIndex
    this.ctx.setMousePointer(rowIndex >= 0 ? "pointer" : "default")

    if (event.type === "down" && event.button === MouseButton.LEFT) {
      this.pressedIndex = rowIndex
    }

    if (event.type === "up" && event.button === MouseButton.LEFT) {
      const selected = rowIndex >= 0 && rowIndex === this.pressedIndex ? this.model.actions[rowIndex] : null
      this.pressedIndex = -1
      if (selected) {
        selected.run()
      }
    }

    if (event.type === "move" || event.type === "over" || event.type === "down" || event.type === "up") {
      this.requestRender()
    }
  }

  private getActionIndex(absX: number, absY: number): number {
    if (absX < this.contentX || absX >= this.contentX + this.contentWidth) {
      return -1
    }

    const localRow = absY - this.contentY
    const relative = localRow - 2
    if (relative < 0) {
      return -1
    }

    const index = Math.floor(relative / 2)
    return index >= 0 && index < this.model.actions.length ? index : -1
  }
}

class EditorPanelRenderable extends PanelRenderable {
  private readonly gutterWidth = 5

  constructor(model: WorkbenchModel) {
    super(model, {
      id: "editor",
      title: "Draft pad",
      focusable: true,
      flexGrow: 1,
      shouldFill: true,
    })
  }

  protected override onResize(_width: number, height: number): void {
    super.onResize(_width, height)
    this.model.setEditorViewportHeight(Math.max(1, height - 2))
  }

  protected override renderContent(buffer: any): void {
    this.model.setEditorViewportHeight(this.contentHeight)

    for (let row = 0; row < this.contentHeight; row += 1) {
      const lineIndex = this.model.editorScrollTop + row
      const line = this.model.editorLines[lineIndex] ?? ""
      const isCurrentLine = lineIndex === this.model.cursorRow
      const rowBg = isCurrentLine ? this.model.palette.panelMuted : undefined

      if (rowBg) {
        buffer.fillRect(this.contentX, this.contentY + row, this.contentWidth, 1, rowBg)
      }

      const lineLabel = `${String(lineIndex + 1).padStart(3, " ")} `
      buffer.drawText(lineLabel, this.contentX, this.contentY + row, this.model.palette.textMuted)
      buffer.drawText(
        truncateCells(line, Math.max(0, this.contentWidth - this.gutterWidth)),
        this.contentX + this.gutterWidth,
        this.contentY + row,
        this.model.palette.text,
        rowBg,
      )
    }

    if (this.focused) {
      const cursorPosition = getWorkbenchEditorCursorPosition({
        contentX: this.contentX,
        contentY: this.contentY,
        gutterWidth: this.gutterWidth,
        cursorCol: this.model.cursorCol,
        cursorRow: this.model.cursorRow,
        editorScrollTop: this.model.editorScrollTop,
        contentHeight: this.contentHeight,
      })

      if (cursorPosition) {
        this.ctx.setCursorStyle({ style: "line", blinking: true, color: this.model.palette.cursor, cursor: "text" })
        this.ctx.setCursorPosition(cursorPosition.x, cursorPosition.y, true)
      }
    }
  }

  public override handlePaste(event: any): void {
    const decoder = new TextDecoder()
    this.model.insertText(decoder.decode(event.bytes))
    this.model.log("Pasted text into the editor.", "success")
  }

  public override handleKeyPress(key: KeyEvent): boolean {
    if ((key.ctrl || key.meta || key.super) && key.shift && key.name === "c") {
      void this.model.copyPreferred()
      return true
    }

    if ((key.ctrl || key.meta || key.super) && key.name === "l") {
      this.model.pushLogBurst()
      return true
    }

    if ((key.ctrl || key.meta || key.super) && key.name === "u") {
      this.model.insertUnicodeSample()
      return true
    }

    switch (key.name) {
      case "left":
        this.model.moveCursorHorizontal(-1)
        return true
      case "right":
        this.model.moveCursorHorizontal(1)
        return true
      case "up":
        this.model.moveCursorVertical(-1)
        return true
      case "down":
        this.model.moveCursorVertical(1)
        return true
      case "home":
        this.model.moveCursorLineEdge("start")
        return true
      case "end":
        this.model.moveCursorLineEdge("end")
        return true
      case "pageup":
        this.model.scrollEditor(-Math.max(1, this.contentHeight - 1))
        return true
      case "pagedown":
        this.model.scrollEditor(Math.max(1, this.contentHeight - 1))
        return true
      case "return":
      case "enter":
        this.model.insertNewLine()
        return true
      case "backspace":
        this.model.deleteBackward()
        return true
      case "delete":
        this.model.deleteForward()
        return true
      case "tab":
        this.model.insertText("  ")
        return true
      case "space":
        this.model.insertText(" ")
        return true
    }

    if (isPrintableKey(key) && key.sequence) {
      this.model.insertText(key.sequence)
      return true
    }

    return false
  }

  protected override onMouseEvent(event: RenderableMouseEvent): void {
    if (event.type === "over" || event.type === "move") {
      this.ctx.setMousePointer("text")
    }

    if (event.type === "out") {
      this.ctx.setMousePointer("default")
      return
    }

    if (event.type === "scroll") {
      const direction = event.scroll?.direction
      this.model.scrollEditor(direction === "up" ? -1 : direction === "down" ? 1 : 0)
      return
    }

    if (event.type === "down" && event.button === MouseButton.LEFT) {
      const localX = event.x - this.contentX
      const localY = event.y - this.contentY
      const lineIndex = clamp(this.model.editorScrollTop + localY, 0, this.model.editorLines.length - 1)
      const lineLength = cellLength(this.model.editorLines[lineIndex] ?? "")
      const cursorCol = clamp(localX - this.gutterWidth, 0, lineLength)
      this.focus()
      this.model.moveCursorTo(lineIndex, cursorCol)
    }
  }
}

class LogPanelRenderable extends PanelRenderable {
  public selectable = true
  private localSelection: { startRow: number; endRow: number; startCol: number; endCol: number } | null = null

  constructor(model: WorkbenchModel) {
    super(model, {
      id: "log",
      title: "Event log",
      flexGrow: 1,
      shouldFill: true,
    })
  }

  protected override onResize(_width: number, height: number): void {
    super.onResize(_width, height)
    this.model.setLogViewportHeight(Math.max(1, height - 2))
  }

  public override shouldStartSelection(absX: number, absY: number): boolean {
    if (absX < this.contentX || absX >= this.contentX + this.contentWidth) {
      return false
    }

    const row = absY - this.contentY
    return row >= 0 && row < this.contentHeight
  }

  public override hasSelection(): boolean {
    return this.localSelection != null
  }

  public override getSelectedText(): string {
    if (!this.localSelection) {
      return ""
    }

    const visible = this.getVisibleLogs()
    const selected: string[] = []
    for (let row = this.localSelection.startRow; row <= this.localSelection.endRow; row += 1) {
      const line = visible[row] ?? ""
      if (row < 0 || row >= visible.length) {
        continue
      }

      const start = row === this.localSelection.startRow ? clamp(this.localSelection.startCol, 0, cellLength(line)) : 0
      const end =
        row === this.localSelection.endRow ? clamp(this.localSelection.endCol, 0, cellLength(line)) : cellLength(line)

      selected.push(sliceCells(line, start, Math.max(start, end)))
    }

    return selected.join("\n")
  }

  public override onSelectionChanged(selection: any): boolean {
    const nextSelection = this.selectionFromGlobal(selection)
    const changed = JSON.stringify(nextSelection) !== JSON.stringify(this.localSelection)
    this.localSelection = nextSelection
    if (changed) {
      this.requestRender()
    }
    return nextSelection != null
  }

  protected override renderContent(buffer: any): void {
    this.model.setLogViewportHeight(this.contentHeight)
    const visible = this.getVisibleLogs()

    for (let row = 0; row < this.contentHeight; row += 1) {
      const line = visible[row]
      if (line == null) {
        continue
      }

      const tone = this.model.logs[this.model.logScrollTop + row]?.tone ?? "info"
      const fg = this.colorForTone(tone)
      this.drawLine(buffer, row, line, fg, undefined, 0, this.selectionForRow(row, line))
    }
  }

  protected override onMouseEvent(event: RenderableMouseEvent): void {
    if (event.type === "over" || event.type === "move") {
      this.ctx.setMousePointer("text")
    }

    if (event.type === "out") {
      this.ctx.setMousePointer("default")
      return
    }

    if (event.type === "scroll") {
      const direction = event.scroll?.direction
      this.model.scrollLogs(direction === "up" ? -1 : direction === "down" ? 1 : 0)
    }
  }

  private getVisibleLogs(): string[] {
    return this.model.logs
      .slice(this.model.logScrollTop, this.model.logScrollTop + this.contentHeight)
      .map((entry) => entry.text)
  }

  private selectionFromGlobal(
    selection: any,
  ): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
    if (!selection?.isActive) {
      return null
    }

    const anchor = {
      row: selection.anchor.y - this.contentY,
      col: selection.anchor.x - this.contentX,
    }
    const focus = {
      row: selection.focus.y - this.contentY,
      col: selection.focus.x - this.contentX,
    }

    let start = anchor
    let end = focus
    if (start.row > end.row || (start.row === end.row && start.col > end.col)) {
      start = focus
      end = anchor
    }

    if (end.row < 0 || start.row >= this.contentHeight) {
      return null
    }

    return {
      startRow: start.row,
      endRow: end.row,
      startCol: start.col,
      endCol: end.col + 1,
    }
  }

  private selectionForRow(
    row: number,
    line: string,
  ): { start: number; end: number; bgColor?: RGBA; fgColor?: RGBA } | null {
    if (!this.localSelection || row < this.localSelection.startRow || row > this.localSelection.endRow) {
      return null
    }

    const lineLength = cellLength(line)
    const start = row === this.localSelection.startRow ? clamp(this.localSelection.startCol, 0, lineLength) : 0
    const end = row === this.localSelection.endRow ? clamp(this.localSelection.endCol, 0, lineLength) : lineLength

    if (end < start) {
      return null
    }

    return {
      start,
      end,
      bgColor: this.model.palette.selectionBg,
      fgColor: this.model.palette.selectionFg,
    }
  }

  private colorForTone(tone: LogTone): RGBA {
    switch (tone) {
      case "accent":
        return this.model.palette.accent
      case "success":
        return this.model.palette.green
      case "warn":
        return this.model.palette.gold
      case "error":
        return this.model.palette.red
      default:
        return this.model.palette.text
    }
  }
}

class DragPadRenderable extends PanelRenderable {
  private dragging = false
  private dragOffset = { x: 0, y: 0 }

  constructor(model: WorkbenchModel) {
    super(model, {
      id: "drag-pad",
      title: "Drag pad",
      height: 12,
      shouldFill: true,
    })
  }

  protected override renderContent(buffer: any): void {
    for (let row = 0; row < this.contentHeight; row += 1) {
      const pattern = truncateCells(
        row % 2 === 0 ? "· · · · · · · · · · · · · · · · ·" : "  ·   ·   ·   ·   ·   ·   ·   ·",
        this.contentWidth,
      )
      this.drawLine(buffer, row, pattern, this.model.palette.textMuted)
    }

    const tokenX = this.contentX + this.model.dragToken.x
    const tokenY = this.contentY + this.model.dragToken.y
    const tokenLabel = truncateCells("[ drag me ]", this.model.dragToken.width)
    buffer.fillRect(
      tokenX,
      tokenY,
      Math.max(tokenLabel.length, this.model.dragToken.width),
      1,
      this.model.palette.chipBg,
    )
    buffer.drawText(
      tokenLabel,
      tokenX,
      tokenY,
      this.model.palette.chipFg,
      this.model.palette.chipBg,
      TextAttributes.BOLD,
    )

    this.drawLine(buffer, Math.max(0, this.contentHeight - 2), this.model.dragStatus, this.model.palette.cyan)
    this.drawLine(
      buffer,
      Math.max(0, this.contentHeight - 1),
      `token ${this.model.dragToken.x},${this.model.dragToken.y} | left click to move | drag to capture`,
      this.model.palette.textMuted,
    )
  }

  protected override onMouseEvent(event: RenderableMouseEvent): void {
    if (event.type === "out") {
      this.ctx.setMousePointer("default")
      return
    }

    const insideToken = this.isInsideToken(event.x, event.y)
    this.ctx.setMousePointer(insideToken || this.dragging ? "move" : "crosshair")

    if (event.type === "down" && event.button === MouseButton.LEFT) {
      if (insideToken) {
        this.dragging = true
        this.dragOffset = {
          x: event.x - (this.contentX + this.model.dragToken.x),
          y: event.y - (this.contentY + this.model.dragToken.y),
        }
        this.model.dragStatus = "Pointer captured. Drag outside the token and keep moving."
      } else {
        this.moveToken(event.x - this.contentX - Math.floor(this.model.dragToken.width / 2), event.y - this.contentY)
        this.model.dragStatus = "Token snapped under the pointer."
      }
      this.requestRender()
      return
    }

    if (event.type === "drag" && this.dragging) {
      this.moveToken(event.x - this.contentX - this.dragOffset.x, event.y - this.contentY - this.dragOffset.y)
      this.model.dragStatus = `Dragging through ${event.x},${event.y}.`
      this.requestRender()
      return
    }

    if ((event.type === "up" || event.type === "drag-end") && this.dragging) {
      this.dragging = false
      this.model.dragStatus = `Drag complete at ${this.model.dragToken.x},${this.model.dragToken.y}.`
      this.model.log(this.model.dragStatus, "accent")
      this.requestRender()
    }
  }

  private isInsideToken(absX: number, absY: number): boolean {
    const tokenX = this.contentX + this.model.dragToken.x
    const tokenY = this.contentY + this.model.dragToken.y
    return (
      absX >= tokenX &&
      absX < tokenX + this.model.dragToken.width &&
      absY >= tokenY &&
      absY < tokenY + this.model.dragToken.height
    )
  }

  private moveToken(x: number, y: number): void {
    const maxX = Math.max(0, this.contentWidth - this.model.dragToken.width)
    const maxY = Math.max(0, this.contentHeight - this.model.dragToken.height - 2)
    this.model.dragToken.x = clamp(x, 0, maxX)
    this.model.dragToken.y = clamp(y, 0, maxY)
  }
}

class FooterPanelRenderable extends PanelRenderable {
  constructor(
    model: WorkbenchModel,
    private readonly wasmUrl: string,
  ) {
    super(model, { title: "Notes", height: 5, shouldFill: true })
  }

  protected override renderContent(buffer: any): void {
    const lines = [
      "Focus the editor, wheel the log pane, drag the token, then drag-select log text to copy through the host clipboard hook.",
      `Shortcuts: Ctrl/Cmd+Shift+C copy | Ctrl/Cmd+U inject Unicode | Ctrl/Cmd+L burst logs | wasm ${this.wasmUrl}`,
    ]

    let row = 0
    for (const line of lines) {
      for (const wrapped of wrapText(line, this.contentWidth)) {
        if (row >= this.contentHeight) {
          return
        }
        this.drawLine(buffer, row, wrapped, row === 0 ? this.model.palette.text : this.model.palette.textMuted)
        row += 1
      }
    }
  }
}

type WorkbenchRuntimeSession = BrowserTerminalSession & {
  renderer: BrowserRenderer
}

let renderLibPromise: Promise<void> | null = null

function setStatus(statusElement: HTMLElement, state: "loading" | "ready" | "error", detail?: string): void {
  statusElement.dataset.state = state
  statusElement.textContent = detail ?? STATUS_TEXT[state]
}

async function ensureRenderLib(wasmUrl: string): Promise<void> {
  if (!renderLibPromise) {
    renderLibPromise = loadBrowserRenderLib({ wasmUrl }).then(() => undefined)
  }

  await renderLibPromise
}

function destroyWorkbenchSession(session: WorkbenchRuntimeSession | null): void {
  if (!session) {
    return
  }

  session.renderer.destroy()
  session.destroy()
}

function mountWorkbenchTree(
  model: WorkbenchModel,
  renderer: BrowserRenderer,
  wasmUrl: string,
): { editor: EditorPanelRenderable } {
  const shell = new BoxRenderable(renderer, {
    id: "workbench-shell",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    gap: 1,
    padding: 1,
    backgroundColor: model.palette.shellBg,
    shouldFill: true,
  })
  shell.renderBefore = function () {
    renderer.setCursorPosition(0, 0, false)
  }

  const header = new HeaderPanelRenderable(model)
  const body = new BoxRenderable(renderer, {
    id: "workbench-body",
    flexGrow: 1,
    flexDirection: "row",
    gap: 1,
    backgroundColor: RGBA.fromValues(0, 0, 0, 0),
  })
  const center = new BoxRenderable(renderer, {
    id: "workbench-center",
    flexGrow: 1,
    flexDirection: "column",
    gap: 1,
    backgroundColor: RGBA.fromValues(0, 0, 0, 0),
  })
  const right = new BoxRenderable(renderer, {
    id: "workbench-right",
    width: 36,
    flexDirection: "column",
    gap: 1,
    backgroundColor: RGBA.fromValues(0, 0, 0, 0),
  })

  const sidebar = new SidebarPanelRenderable(model)
  const editor = new EditorPanelRenderable(model)
  const dragPad = new DragPadRenderable(model)
  const logPanel = new LogPanelRenderable(model)
  const footer = new FooterPanelRenderable(model, wasmUrl)

  model.actions = [
    {
      label: "Focus editor",
      keyHint: "click / tab",
      description: "Route keyboard input into the text pad.",
      run: () => {
        editor.focus()
        model.log("Editor focused from the control pane.", "info")
      },
    },
    {
      label: "Copy current buffer",
      keyHint: "ctrl+shift+c",
      description: "Copy the selection, or the full editor text if none exists.",
      run: () => void model.copyPreferred(),
    },
    {
      label: "Inject Unicode",
      keyHint: "ctrl+u",
      description: "Append a mixed-width sample to the editor.",
      run: () => model.insertUnicodeSample(),
    },
    {
      label: "Burst log events",
      keyHint: "ctrl+l",
      description: "Push a small browser-host telemetry burst into the log.",
      run: () => model.pushLogBurst(),
    },
  ]

  model.focusEditor = () => editor.focus()

  shell.add(header)
  shell.add(body)
  shell.add(footer)
  body.add(sidebar)
  body.add(center)
  body.add(right)
  center.add(editor)
  right.add(dragPad)
  right.add(logPanel)
  renderer.root.add(shell)

  return { editor }
}

async function createWorkbenchSession(
  terminalElement: HTMLElement,
  wasmUrl: string,
  themeMode: ThemeMode,
  palette: Palette,
  autoFocus: boolean,
): Promise<WorkbenchRuntimeSession> {
  const terminalSession = await createBrowserTerminalSession({
    surface: terminalElement,
    themeMode,
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 14,
    scrollback: 1500,
    theme: createTerminalTheme(themeMode, palette),
    autoFocus,
  })

  try {
    await ensureRenderLib(wasmUrl)

    const renderer = await createBrowserRenderer(terminalSession.host, {
      useAlternateScreen: true,
      backgroundColor: palette.shellBg,
    })

    return {
      ...terminalSession,
      renderer,
    }
  } catch (error) {
    terminalSession.destroy()
    throw error
  }
}

async function bootstrapWorkbench(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-workbench-root]")
  const terminalElement = document.querySelector<HTMLElement>("[data-workbench-terminal]")
  const statusElement = document.querySelector<HTMLElement>("[data-workbench-status]")

  if (!root || !terminalElement || !statusElement) {
    return
  }

  const initialThemeMode: ThemeMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  const model = new WorkbenchModel(initialThemeMode)
  const wasmUrl = root.dataset.wasmUrl ?? "/opentui/opentui.wasm"
  let currentSession: WorkbenchRuntimeSession | null = null
  let mountCounter = 0

  const applyWorkbenchSession = (session: WorkbenchRuntimeSession, reason: "initial" | "theme"): void => {
    model.attachRenderer(session.renderer)
    model.setThemeMode(session.themeMode)
    model.setRuntimeState("ready")

    session.renderer.setTerminalTitle(model.terminalTitle)
    session.renderer.setBackgroundColor(model.palette.shellBg)

    const { editor } = mountWorkbenchTree(model, session.renderer, wasmUrl)
    model.focusEditor = () => editor.focus()

    session.renderer.on(BrowserRenderEvents.RESIZE, (width: number, height: number) => {
      model.workbenchSize = { cols: width, rows: height }
      model.log(`Resize ${width}x${height}.`, "info")
    })

    session.renderer.on(BrowserRenderEvents.FOCUS, () => {
      model.log("Terminal focus restored.", "success")
    })

    session.renderer.on(BrowserRenderEvents.BLUR, () => {
      model.log("Terminal lost focus.", "warn")
    })

    session.renderer.on(BrowserRenderEvents.THEME_MODE, (mode: ThemeMode) => {
      if (mode === session.themeMode) {
        return
      }

      model.log(`Theme mode changed to ${mode}. Reconnecting Ghostty Web.`, "accent")
      void mount(mode, "theme").catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown Ghostty remount error."
        model.log(`Ghostty remount failed: ${message}`, "error")
        setStatus(statusElement, "error", `Ghostty theme refresh failed. (${message})`)
      })
    })

    session.renderer.on(BrowserRenderEvents.SELECTION, () => {
      const selection = session.renderer.getSelection()?.getSelectedText().trim()
      if (selection) {
        model.log(`Selection updated (${cellLength(selection)} cells).`, "accent")
      }
    })

    if (import.meta.env.DEV) {
      window.__OPENTUI_BROWSER_WORKBENCH__ = {
        term: session.term,
        fitAddon: session.fitAddon,
        host: session.host,
        renderer: session.renderer,
        model,
      }
    }

    model.log(
      reason === "theme"
        ? "Ghostty Web surface refreshed for the new theme."
        : "Browser renderer mounted on the Ghostty Web alternate screen.",
      "success",
    )
    setStatus(statusElement, "ready")
    editor.focus()
    session.term.focus()
  }

  const mount = async (themeMode: ThemeMode, reason: "initial" | "theme"): Promise<void> => {
    const mountId = ++mountCounter
    const palette = createPalette(themeMode)
    const autoFocus =
      reason === "initial" ? true : document.hasFocus() && terminalElement.contains(document.activeElement)

    setStatus(
      statusElement,
      "loading",
      reason === "theme" ? `Refreshing Ghostty Web for ${themeMode} mode…` : STATUS_TEXT.loading,
    )

    const nextSession = await createWorkbenchSession(terminalElement, wasmUrl, themeMode, palette, autoFocus)

    if (mountId !== mountCounter) {
      destroyWorkbenchSession(nextSession)
      return
    }

    const previousSession = currentSession
    currentSession = nextSession
    applyWorkbenchSession(nextSession, reason)
    destroyWorkbenchSession(previousSession)
  }

  try {
    await mount(initialThemeMode, "initial")
  } catch (error) {
    model.setRuntimeState("error")
    const message = error instanceof Error ? error.message : STATUS_TEXT.error
    setStatus(statusElement, "error", `${STATUS_TEXT.error} (${message})`)
  }

  window.addEventListener(
    "beforeunload",
    () => {
      destroyWorkbenchSession(currentSession)
    },
    { once: true },
  )
}

void bootstrapWorkbench()
