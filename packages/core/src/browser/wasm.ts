import { OptimizedBuffer } from "../buffer.js"
import { setFfiRuntime, type Pointer } from "../lib/ffi-runtime.js"
import { RGBA } from "../lib/RGBA.js"
import { setRenderLib } from "../render-lib.js"
import type { CursorState, RenderLib } from "../render-lib.js"
import { TextBuffer } from "../text-buffer.js"
import {
  CursorStyleOptionsStruct,
  GridDrawOptionsStruct,
  HighlightStruct,
  LogicalCursorStruct,
  MeasureResultStruct,
  VisualCursorStruct,
} from "../zig-structs.js"
import {
  type CursorStyleOptions,
  type Highlight,
  type LineInfo,
  type TargetChannel,
  type WidthMethod,
} from "../types.js"

const CURSOR_STYLE_TO_ID = { block: 0, line: 1, underline: 2, default: 3 } as const
const MOUSE_STYLE_TO_ID = { default: 0, pointer: 1, text: 2, crosshair: 3, move: 4, "not-allowed": 5 } as const
const WASM32_STYLED_CHUNK_SIZE = 28
const WASM32_LINE_INFO_SIZE = 36

const DEFAULT_CAPABILITIES = {
  kitty_keyboard: false,
  kitty_graphics: false,
  rgb: true,
  unicode: "unicode",
  sgr_pixels: false,
  color_scheme_updates: false,
  explicit_width: false,
  scaled_text: false,
  sixel: false,
  focus_tracking: true,
  sync: true,
  bracketed_paste: true,
  hyperlinks: true,
  osc52: false,
  explicit_cursor_positioning: true,
  terminal: {
    name: "ghostty-web",
    version: "browser",
    fromXtVersion: false,
  },
} as const

interface WasmExports {
  [key: string]: any
  memory: WebAssembly.Memory
  wasmAlloc: (len: number) => number
  wasmFree: (ptr: number, len: number) => void
  createRenderer: (width: number, height: number, testing: boolean, remote: boolean) => number
  destroyRenderer: (renderer: number) => void
  setTerminalEnvVar: (renderer: number, keyPtr: number, keyLen: number, valuePtr: number, valueLen: number) => number
  setUseThread: (renderer: number, useThread: boolean) => void
  setBackgroundColor: (renderer: number, colorPtr: number) => void
  setRenderOffset: (renderer: number, offset: number) => void
  updateStats: (renderer: number, time: number, fps: number, frameCallbackTime: number) => void
  updateMemoryStats: (renderer: number, heapUsed: number, heapTotal: number, arrayBuffers: number) => void
  render: (renderer: number, force: boolean) => void
  getNextBuffer: (renderer: number) => number
  getCurrentBuffer: (renderer: number) => number
  createOptimizedBuffer: (
    width: number,
    height: number,
    respectAlpha: boolean,
    widthMethod: number,
    idPtr: number,
    idLen: number,
  ) => number
  destroyOptimizedBuffer: (buffer: number) => void
  drawFrameBuffer: (
    targetBuffer: number,
    destX: number,
    destY: number,
    sourceBuffer: number,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ) => void
  getBufferWidth: (buffer: number) => number
  getBufferHeight: (buffer: number) => number
  bufferClear: (buffer: number, bgPtr: number) => void
  bufferGetCharPtr: (buffer: number) => number
  bufferGetFgPtr: (buffer: number) => number
  bufferGetBgPtr: (buffer: number) => number
  bufferGetAttributesPtr: (buffer: number) => number
  bufferGetRespectAlpha: (buffer: number) => boolean
  bufferSetRespectAlpha: (buffer: number, respectAlpha: boolean) => void
  bufferGetId: (buffer: number, outPtr: number, maxLen: number) => number
  bufferGetRealCharSize: (buffer: number) => number
  bufferWriteResolvedChars: (buffer: number, outPtr: number, outLen: number, addLineBreaks: boolean) => number
  bufferDrawText: (
    buffer: number,
    textPtr: number,
    textLen: number,
    x: number,
    y: number,
    fgPtr: number,
    bgPtr: number,
    attributes: number,
  ) => void
  bufferSetCellWithAlphaBlending: (
    buffer: number,
    x: number,
    y: number,
    char: number,
    fgPtr: number,
    bgPtr: number,
    attributes: number,
  ) => void
  bufferSetCell: (
    buffer: number,
    x: number,
    y: number,
    char: number,
    fgPtr: number,
    bgPtr: number,
    attributes: number,
  ) => void
  bufferFillRect: (buffer: number, x: number, y: number, width: number, height: number, bgPtr: number) => void
  bufferColorMatrix: (
    buffer: number,
    matrixPtr: number,
    cellMaskPtr: number,
    cellMaskCount: number,
    strength: number,
    target: TargetChannel,
  ) => void
  bufferColorMatrixUniform: (buffer: number, matrixPtr: number, strength: number, target: TargetChannel) => void
  bufferDrawPackedBuffer: (
    buffer: number,
    dataPtr: number,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ) => void
  bufferDrawGrayscaleBuffer: (
    buffer: number,
    posX: number,
    posY: number,
    intensitiesPtr: number,
    srcWidth: number,
    srcHeight: number,
    fgPtr: number,
    bgPtr: number,
  ) => void
  bufferDrawGrayscaleBufferSupersampled: (
    buffer: number,
    posX: number,
    posY: number,
    intensitiesPtr: number,
    srcWidth: number,
    srcHeight: number,
    fgPtr: number,
    bgPtr: number,
  ) => void
  bufferDrawGrid: (
    buffer: number,
    borderCharsPtr: number,
    borderFgPtr: number,
    borderBgPtr: number,
    columnOffsetsPtr: number,
    columnCount: number,
    rowOffsetsPtr: number,
    rowCount: number,
    optionsPtr: number,
  ) => void
  bufferPushScissorRect: (buffer: number, x: number, y: number, width: number, height: number) => void
  bufferPopScissorRect: (buffer: number) => void
  bufferClearScissorRects: (buffer: number) => void
  bufferPushOpacity: (buffer: number, opacity: number) => void
  bufferPopOpacity: (buffer: number) => void
  bufferGetCurrentOpacity: (buffer: number) => number
  bufferClearOpacity: (buffer: number) => void
  bufferDrawBox: (
    buffer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    borderCharsPtr: number,
    packedOptions: number,
    borderColorPtr: number,
    backgroundColorPtr: number,
    titlePtr: number,
    titleLen: number,
  ) => void
  bufferResize: (buffer: number, width: number, height: number) => void
  resizeRenderer: (renderer: number, width: number, height: number) => void
  setCursorPosition: (renderer: number, x: number, y: number, visible: boolean) => void
  setCursorColor: (renderer: number, colorPtr: number) => void
  setCursorStyleOptionsFlat: (
    renderer: number,
    style: number,
    blinking: number,
    colorPtr: number,
    cursor: number,
  ) => void
  setDebugOverlay: (renderer: number, enabled: boolean, corner: number) => void
  clearTerminal: (renderer: number) => void
  setTerminalTitle: (renderer: number, titlePtr: number, titleLen: number) => void
  addToHitGrid: (renderer: number, x: number, y: number, width: number, height: number, id: number) => void
  clearCurrentHitGrid: (renderer: number) => void
  hitGridPushScissorRect: (renderer: number, x: number, y: number, width: number, height: number) => void
  hitGridPopScissorRect: (renderer: number) => void
  hitGridClearScissorRects: (renderer: number) => void
  addToCurrentHitGridClipped: (
    renderer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => void
  checkHit: (renderer: number, x: number, y: number) => number
  getHitGridDirty: (renderer: number) => boolean
  restoreTerminalModes: (renderer: number) => void
  enableMouse: (renderer: number, enableMovement: boolean) => void
  disableMouse: (renderer: number) => void
  setKittyKeyboardFlags: (renderer: number, flags: number) => void
  getKittyKeyboardFlags: (renderer: number) => number
  queryPixelResolution: (renderer: number) => void
  writeOut: (renderer: number, dataPtr: number, dataLen: number) => void
  getPendingOutputLen: (renderer: number) => number
  drainPendingOutput: (renderer: number, outPtr: number, maxLen: number) => number
  setupTerminalForBrowser?: (renderer: number, useAlternateScreen: boolean) => void
  setupTerminal?: (renderer: number, useAlternateScreen: boolean) => void
}

interface StyledChunkInput {
  text: string
  fg?: RGBA | null
  bg?: RGBA | null
  attributes?: number | null
  link?: { url: string } | string | null
}

export interface LoadBrowserRenderLibOptions {
  wasmUrl?: string | URL
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  return new Uint8Array(value)
}

class BrowserRenderLib {
  public readonly encoder = new TextEncoder()
  public readonly decoder = new TextDecoder()
  private readonly exports: WasmExports
  private readonly capabilities = new Map<Pointer, any>()
  private readonly cursorStates = new Map<Pointer, CursorState>()
  private readonly anyNativeEventHandlers: Array<(name: string, data: ArrayBuffer) => void> = []

  constructor(exports: WasmExports) {
    this.exports = exports

    setFfiRuntime({
      ptr: (value) => {
        if (value == null) {
          return null
        }

        return this.copyIntoWasm(toUint8Array(value))
      },
      toArrayBuffer: (pointer, byteOffset = 0, byteLength) => {
        const start = pointer + byteOffset
        const end = byteLength === undefined ? this.exports.memory.buffer.byteLength : start + byteLength
        return this.exports.memory.buffer.slice(start, end)
      },
    })
  }

  private createDefaultCursorState(): CursorState {
    return {
      x: 1,
      y: 1,
      visible: true,
      style: "default",
      blinking: false,
      color: RGBA.fromValues(1, 1, 1, 1),
    }
  }

  private copyIntoWasm(bytes: Uint8Array): Pointer {
    if (bytes.length === 0) {
      return 0
    }

    const ptr = this.exports.wasmAlloc(bytes.length)
    if (!ptr) {
      throw new Error("Failed to allocate browser wasm memory")
    }

    new Uint8Array(this.exports.memory.buffer, ptr, bytes.length).set(bytes)
    return ptr
  }

  private withBytes<T>(bytes: Uint8Array, fn: (ptr: Pointer, len: number) => T): T {
    if (bytes.length === 0) {
      return fn(0, 0)
    }

    const ptr = this.copyIntoWasm(bytes)
    try {
      return fn(ptr, bytes.length)
    } finally {
      this.exports.wasmFree(ptr, bytes.length)
    }
  }

  private adoptBytes<T>(bytes: Uint8Array, fn: (ptr: Pointer, len: number) => T): T {
    if (bytes.length === 0) {
      return fn(0, 0)
    }

    const ptr = this.copyIntoWasm(bytes)
    return fn(ptr, bytes.length)
  }

  private withString<T>(text: string | null | undefined, fn: (ptr: Pointer, len: number) => T): T {
    if (!text) {
      return fn(0, 0)
    }

    return this.withBytes(this.encoder.encode(text), fn)
  }

  private withOptionalBytes<T>(bytes: Uint8Array | null | undefined, fn: (ptr: Pointer) => T): T {
    if (!bytes || bytes.length === 0) {
      return fn(0)
    }

    const ptr = this.copyIntoWasm(bytes)
    try {
      return fn(ptr)
    } finally {
      this.exports.wasmFree(ptr, bytes.length)
    }
  }

  private withOptionalColor<T>(color: RGBA | null | undefined, fn: (ptr: Pointer) => T): T {
    if (!color) {
      return fn(0)
    }

    return this.withOptionalBytes(
      new Uint8Array(color.buffer.buffer, color.buffer.byteOffset, color.buffer.byteLength),
      fn,
    )
  }

  private withRequiredColor<T>(color: RGBA, fn: (ptr: Pointer) => T): T {
    return this.withOptionalColor(color, fn)
  }

  private withArray<T>(value: ArrayBuffer | ArrayBufferView, fn: (ptr: Pointer) => T): T {
    return this.withOptionalBytes(toUint8Array(value), fn)
  }

  private withStyledChunks<T>(chunks: StyledChunkInput[], fn: (chunksPtr: Pointer, chunkCount: number) => T): T {
    if (chunks.length === 0) {
      return fn(0, 0)
    }

    const allocations: Array<{ ptr: Pointer; len: number }> = []
    const allocate = (bytes: Uint8Array | null | undefined): Pointer => {
      if (!bytes || bytes.length === 0) {
        return 0
      }

      const ptr = this.copyIntoWasm(bytes)
      allocations.push({ ptr, len: bytes.length })
      return ptr
    }

    const descriptors = chunks.map((chunk) => {
      const textBytes = this.encoder.encode(chunk.text)
      const linkValue = typeof chunk.link === "string" ? chunk.link : chunk.link?.url
      const linkBytes = linkValue ? this.encoder.encode(linkValue) : undefined

      return {
        textPtr: allocate(textBytes),
        textLen: textBytes.length,
        fgPtr: chunk.fg
          ? allocate(new Uint8Array(chunk.fg.buffer.buffer, chunk.fg.buffer.byteOffset, chunk.fg.buffer.byteLength))
          : 0,
        bgPtr: chunk.bg
          ? allocate(new Uint8Array(chunk.bg.buffer.buffer, chunk.bg.buffer.byteOffset, chunk.bg.buffer.byteLength))
          : 0,
        attributes: chunk.attributes ?? 0,
        linkPtr: allocate(linkBytes),
        linkLen: linkBytes?.length ?? 0,
      }
    })

    const structsLen = descriptors.length * WASM32_STYLED_CHUNK_SIZE
    const structsPtr = this.exports.wasmAlloc(structsLen)
    if (!structsPtr) {
      throw new Error("Failed to allocate browser styled chunk buffer")
    }

    allocations.push({ ptr: structsPtr, len: structsLen })

    const view = new DataView(this.exports.memory.buffer, structsPtr, structsLen)
    descriptors.forEach((chunk, index) => {
      const offset = index * WASM32_STYLED_CHUNK_SIZE
      view.setUint32(offset, chunk.textPtr, true)
      view.setUint32(offset + 4, chunk.textLen, true)
      view.setUint32(offset + 8, chunk.fgPtr, true)
      view.setUint32(offset + 12, chunk.bgPtr, true)
      view.setUint32(offset + 16, chunk.attributes, true)
      view.setUint32(offset + 20, chunk.linkPtr, true)
      view.setUint32(offset + 24, chunk.linkLen, true)
    })

    try {
      return fn(structsPtr, chunks.length)
    } finally {
      for (let index = allocations.length - 1; index >= 0; index -= 1) {
        const allocation = allocations[index]
        this.exports.wasmFree(allocation.ptr, allocation.len)
      }
    }
  }

  private copyOutputBuffer(ptr: Pointer, byteLength: number): ArrayBuffer {
    return this.exports.memory.buffer.slice(ptr, ptr + byteLength)
  }

  private copyOutputBytes(ptr: Pointer, byteLength: number): Uint8Array {
    return new Uint8Array(this.copyOutputBuffer(ptr, byteLength))
  }

  private emitAnyNativeEvent(name: string, data: ArrayBuffer): void {
    for (const handler of this.anyNativeEventHandlers) {
      try {
        handler(name, data)
      } catch (error) {
        console.error("Error in browser native event callback:", error)
      }
    }
  }

  private emitEditBufferNativeEvent(buffer: Pointer, eventName: string): void {
    const data = new Uint16Array([this.exports.editBufferGetId(buffer)])
    this.emitAnyNativeEvent(`eb_${eventName}`, data.buffer.slice(0))
  }

  private copyU32Array(ptr: Pointer, length: number): number[] {
    if (!ptr || length === 0) {
      return []
    }

    const buffer = this.copyOutputBuffer(ptr, length * Uint32Array.BYTES_PER_ELEMENT)
    return Array.from(new Uint32Array(buffer))
  }

  private unpackLineInfo(ptr: Pointer): LineInfo {
    const view = new DataView(this.copyOutputBuffer(ptr, WASM32_LINE_INFO_SIZE))
    const startColsPtr = view.getUint32(0, true)
    const startColsLen = view.getUint32(4, true)
    const widthColsPtr = view.getUint32(8, true)
    const widthColsLen = view.getUint32(12, true)
    const sourcesPtr = view.getUint32(16, true)
    const sourcesLen = view.getUint32(20, true)
    const wrapsPtr = view.getUint32(24, true)
    const wrapsLen = view.getUint32(28, true)

    return {
      lineStartCols: this.copyU32Array(startColsPtr, startColsLen),
      lineWidthCols: this.copyU32Array(widthColsPtr, widthColsLen),
      lineSources: this.copyU32Array(sourcesPtr, sourcesLen),
      lineWraps: this.copyU32Array(wrapsPtr, wrapsLen),
      lineWidthColsMax: view.getUint32(32, true),
    }
  }

  private withOutputBuffer<T>(byteLength: number, fn: (ptr: Pointer) => T): T {
    const ptr = this.exports.wasmAlloc(byteLength)
    if (!ptr) {
      throw new Error("Failed to allocate browser wasm output buffer")
    }

    try {
      return fn(ptr)
    } finally {
      this.exports.wasmFree(ptr, byteLength)
    }
  }

  public createRenderer(
    width: number,
    height: number,
    options: { testing?: boolean; remote?: boolean } = {},
  ): Pointer | null {
    const renderer = this.exports.createRenderer(width, height, options.testing ?? false, options.remote ?? false)
    if (!renderer) {
      return null
    }

    this.capabilities.set(renderer, {
      ...DEFAULT_CAPABILITIES,
      terminal: { ...DEFAULT_CAPABILITIES.terminal },
    })
    this.cursorStates.set(renderer, this.createDefaultCursorState())
    return renderer
  }

  public destroyRenderer(renderer: Pointer): void {
    this.capabilities.delete(renderer)
    this.cursorStates.delete(renderer)
    this.exports.destroyRenderer(renderer)
  }

  public setTerminalEnvVar(renderer: Pointer, key: string, value: string): boolean {
    return this.withString(key, (keyPtr, keyLen) =>
      this.withString(value, (valuePtr, valueLen) =>
        Boolean(this.exports.setTerminalEnvVar(renderer, keyPtr, keyLen, valuePtr, valueLen)),
      ),
    )
  }

  public setUseThread(renderer: Pointer, useThread: boolean): void {
    this.exports.setUseThread(renderer, useThread)
  }

  public setBackgroundColor(renderer: Pointer, color: RGBA): void {
    this.withRequiredColor(color, (colorPtr) => this.exports.setBackgroundColor(renderer, colorPtr))
  }

  public setRenderOffset(renderer: Pointer, offset: number): void {
    this.exports.setRenderOffset(renderer, offset)
  }

  public updateStats(renderer: Pointer, time: number, fps: number, frameCallbackTime: number): void {
    this.exports.updateStats(renderer, time, fps, frameCallbackTime)
  }

  public updateMemoryStats(renderer: Pointer, heapUsed: number, heapTotal: number, arrayBuffers: number): void {
    this.exports.updateMemoryStats(renderer, heapUsed, heapTotal, arrayBuffers)
  }

  public render(renderer: Pointer, force: boolean): void {
    this.exports.render(renderer, force)
  }

  public drainOutput(renderer: Pointer): string {
    const pendingLen = this.exports.getPendingOutputLen(renderer)
    if (pendingLen === 0) {
      return ""
    }

    const outputPtr = this.exports.wasmAlloc(pendingLen)
    if (!outputPtr) {
      throw new Error("Failed to allocate wasm output buffer")
    }

    try {
      const written = this.exports.drainPendingOutput(renderer, outputPtr, pendingLen)
      const bytes = new Uint8Array(this.exports.memory.buffer, outputPtr, written)
      return this.decoder.decode(bytes.slice())
    } finally {
      this.exports.wasmFree(outputPtr, pendingLen)
    }
  }

  public getNextBuffer(renderer: Pointer): OptimizedBuffer {
    const bufferPtr = this.exports.getNextBuffer(renderer)
    return new OptimizedBuffer(
      this as unknown as RenderLib,
      bufferPtr,
      this.getBufferWidth(bufferPtr),
      this.getBufferHeight(bufferPtr),
      {
        id: "next buffer",
        widthMethod: "unicode",
      },
    )
  }

  public getCurrentBuffer(renderer: Pointer): OptimizedBuffer {
    const bufferPtr = this.exports.getCurrentBuffer(renderer)
    return new OptimizedBuffer(
      this as unknown as RenderLib,
      bufferPtr,
      this.getBufferWidth(bufferPtr),
      this.getBufferHeight(bufferPtr),
      {
        id: "current buffer",
        widthMethod: "unicode",
      },
    )
  }

  public createOptimizedBuffer(
    width: number,
    height: number,
    widthMethod: WidthMethod,
    respectAlpha: boolean = false,
    id?: string,
  ): OptimizedBuffer {
    return this.withString(id ?? "unnamed buffer", (idPtr, idLen) => {
      const ptr = this.exports.createOptimizedBuffer(
        width,
        height,
        respectAlpha,
        widthMethod === "wcwidth" ? 0 : 1,
        idPtr,
        idLen,
      )
      if (!ptr) {
        throw new Error(`Failed to create browser optimized buffer: ${width}x${height}`)
      }

      return new OptimizedBuffer(this as unknown as RenderLib, ptr, width, height, {
        respectAlpha,
        id,
        widthMethod,
      })
    })
  }

  public destroyOptimizedBuffer(bufferPtr: Pointer): void {
    this.exports.destroyOptimizedBuffer(bufferPtr)
  }

  public drawFrameBuffer(
    targetBufferPtr: Pointer,
    destX: number,
    destY: number,
    bufferPtr: Pointer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ): void {
    this.exports.drawFrameBuffer(
      targetBufferPtr,
      destX,
      destY,
      bufferPtr,
      sourceX ?? 0,
      sourceY ?? 0,
      sourceWidth ?? 0,
      sourceHeight ?? 0,
    )
  }

  public getBufferWidth(buffer: Pointer): number {
    return this.exports.getBufferWidth(buffer)
  }

  public getBufferHeight(buffer: Pointer): number {
    return this.exports.getBufferHeight(buffer)
  }

  public bufferClear(buffer: Pointer, color: RGBA): void {
    this.withRequiredColor(color, (colorPtr) => this.exports.bufferClear(buffer, colorPtr))
  }

  public bufferGetCharPtr(buffer: Pointer): Pointer {
    return this.exports.bufferGetCharPtr(buffer)
  }

  public bufferGetFgPtr(buffer: Pointer): Pointer {
    return this.exports.bufferGetFgPtr(buffer)
  }

  public bufferGetBgPtr(buffer: Pointer): Pointer {
    return this.exports.bufferGetBgPtr(buffer)
  }

  public bufferGetAttributesPtr(buffer: Pointer): Pointer {
    return this.exports.bufferGetAttributesPtr(buffer)
  }

  public bufferGetRespectAlpha(buffer: Pointer): boolean {
    return this.exports.bufferGetRespectAlpha(buffer)
  }

  public bufferSetRespectAlpha(buffer: Pointer, respectAlpha: boolean): void {
    this.exports.bufferSetRespectAlpha(buffer, respectAlpha)
  }

  public bufferGetId(buffer: Pointer): string {
    const tempLen = 1024
    const outPtr = this.exports.wasmAlloc(tempLen)
    if (!outPtr) {
      throw new Error("Failed to allocate wasm buffer id output")
    }

    try {
      const written = this.exports.bufferGetId(buffer, outPtr, tempLen)
      return this.decoder.decode(new Uint8Array(this.exports.memory.buffer, outPtr, written).slice())
    } finally {
      this.exports.wasmFree(outPtr, tempLen)
    }
  }

  public bufferGetRealCharSize(buffer: Pointer): number {
    return this.exports.bufferGetRealCharSize(buffer)
  }

  public bufferWriteResolvedChars(buffer: Pointer, outputBuffer: Uint8Array, addLineBreaks: boolean): number {
    return this.withOptionalBytes(outputBuffer, (outPtr) => {
      const written = this.exports.bufferWriteResolvedChars(buffer, outPtr, outputBuffer.length, addLineBreaks)
      if (written > 0) {
        outputBuffer.set(new Uint8Array(this.exports.memory.buffer, outPtr, written))
      }
      return written
    })
  }

  public bufferDrawText(
    buffer: Pointer,
    text: string,
    x: number,
    y: number,
    color: RGBA,
    bgColor?: RGBA,
    attributes: number = 0,
  ): void {
    this.withString(text, (textPtr, textLen) =>
      this.withRequiredColor(color, (fgPtr) =>
        this.withOptionalColor(bgColor, (bgPtr) =>
          this.exports.bufferDrawText(buffer, textPtr, textLen, x, y, fgPtr, bgPtr, attributes),
        ),
      ),
    )
  }

  public bufferSetCellWithAlphaBlending(
    buffer: Pointer,
    x: number,
    y: number,
    char: string,
    color: RGBA,
    bgColor: RGBA,
    attributes: number = 0,
  ): void {
    const codePoint = char.codePointAt(0) ?? 32
    this.withRequiredColor(color, (fgPtr) =>
      this.withRequiredColor(bgColor, (bgPtr) =>
        this.exports.bufferSetCellWithAlphaBlending(buffer, x, y, codePoint, fgPtr, bgPtr, attributes),
      ),
    )
  }

  public bufferSetCell(
    buffer: Pointer,
    x: number,
    y: number,
    char: string,
    color: RGBA,
    bgColor: RGBA,
    attributes: number = 0,
  ): void {
    const codePoint = char.codePointAt(0) ?? 32
    this.withRequiredColor(color, (fgPtr) =>
      this.withRequiredColor(bgColor, (bgPtr) =>
        this.exports.bufferSetCell(buffer, x, y, codePoint, fgPtr, bgPtr, attributes),
      ),
    )
  }

  public bufferFillRect(buffer: Pointer, x: number, y: number, width: number, height: number, color: RGBA): void {
    this.withRequiredColor(color, (bgPtr) => this.exports.bufferFillRect(buffer, x, y, width, height, bgPtr))
  }

  public bufferColorMatrix(
    buffer: Pointer,
    matrixPtr: Pointer,
    cellMaskPtr: Pointer,
    cellMaskCount: number,
    strength: number,
    target: TargetChannel,
  ): void {
    this.exports.bufferColorMatrix(buffer, matrixPtr, cellMaskPtr, cellMaskCount, strength, target)
  }

  public bufferColorMatrixUniform(buffer: Pointer, matrixPtr: Pointer, strength: number, target: TargetChannel): void {
    this.exports.bufferColorMatrixUniform(buffer, matrixPtr, strength, target)
  }

  public bufferDrawSuperSampleBuffer(
    _buffer: Pointer,
    _x: number,
    _y: number,
    _pixelDataPtr: Pointer,
    _pixelDataLength: number,
    _format: "bgra8unorm" | "rgba8unorm",
    _alignedBytesPerRow: number,
  ): never {
    throw new Error("bufferDrawSuperSampleBuffer is not implemented in the browser runtime yet")
  }

  public bufferDrawPackedBuffer(
    buffer: Pointer,
    dataPtr: Pointer,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ): void {
    this.exports.bufferDrawPackedBuffer(buffer, dataPtr, dataLen, posX, posY, terminalWidthCells, terminalHeightCells)
  }

  public bufferDrawGrayscaleBuffer(
    buffer: Pointer,
    posX: number,
    posY: number,
    intensitiesPtr: Pointer,
    srcWidth: number,
    srcHeight: number,
    fg: RGBA | null,
    bg: RGBA | null,
  ): void {
    this.withOptionalColor(fg, (fgPtr) =>
      this.withOptionalColor(bg, (bgPtr) =>
        this.exports.bufferDrawGrayscaleBuffer(buffer, posX, posY, intensitiesPtr, srcWidth, srcHeight, fgPtr, bgPtr),
      ),
    )
  }

  public bufferDrawGrayscaleBufferSupersampled(
    buffer: Pointer,
    posX: number,
    posY: number,
    intensitiesPtr: Pointer,
    srcWidth: number,
    srcHeight: number,
    fg: RGBA | null,
    bg: RGBA | null,
  ): void {
    this.withOptionalColor(fg, (fgPtr) =>
      this.withOptionalColor(bg, (bgPtr) =>
        this.exports.bufferDrawGrayscaleBufferSupersampled(
          buffer,
          posX,
          posY,
          intensitiesPtr,
          srcWidth,
          srcHeight,
          fgPtr,
          bgPtr,
        ),
      ),
    )
  }

  public bufferDrawGrid(
    buffer: Pointer,
    borderChars: Uint32Array,
    borderFg: RGBA,
    borderBg: RGBA,
    columnOffsets: Int32Array,
    columnCount: number,
    rowOffsets: Int32Array,
    rowCount: number,
    options: { drawInner: boolean; drawOuter: boolean },
  ): void {
    const packedOptions = GridDrawOptionsStruct.pack({
      drawInner: options.drawInner,
      drawOuter: options.drawOuter,
    })

    this.withArray(borderChars, (borderCharsPtr) =>
      this.withRequiredColor(borderFg, (borderFgPtr) =>
        this.withRequiredColor(borderBg, (borderBgPtr) =>
          this.withArray(columnOffsets, (columnOffsetsPtr) =>
            this.withArray(rowOffsets, (rowOffsetsPtr) =>
              this.withArray(packedOptions, (optionsPtr) =>
                this.exports.bufferDrawGrid(
                  buffer,
                  borderCharsPtr,
                  borderFgPtr,
                  borderBgPtr,
                  columnOffsetsPtr,
                  columnCount,
                  rowOffsetsPtr,
                  rowCount,
                  optionsPtr,
                ),
              ),
            ),
          ),
        ),
      ),
    )
  }

  public bufferDrawBox(
    buffer: Pointer,
    x: number,
    y: number,
    width: number,
    height: number,
    borderChars: Uint32Array,
    packedOptions: number,
    borderColor: RGBA,
    backgroundColor: RGBA,
    title: string | null,
  ): void {
    this.withArray(borderChars, (borderCharsPtr) =>
      this.withRequiredColor(borderColor, (borderColorPtr) =>
        this.withRequiredColor(backgroundColor, (backgroundColorPtr) =>
          this.withString(title, (titlePtr, titleLen) =>
            this.exports.bufferDrawBox(
              buffer,
              x,
              y,
              width,
              height,
              borderCharsPtr,
              packedOptions,
              borderColorPtr,
              backgroundColorPtr,
              titlePtr,
              titleLen,
            ),
          ),
        ),
      ),
    )
  }

  public bufferResize(buffer: Pointer, width: number, height: number): void {
    this.exports.bufferResize(buffer, width, height)
  }

  public bufferPushScissorRect(buffer: Pointer, x: number, y: number, width: number, height: number): void {
    this.exports.bufferPushScissorRect(buffer, x, y, width, height)
  }

  public bufferPopScissorRect(buffer: Pointer): void {
    this.exports.bufferPopScissorRect(buffer)
  }

  public bufferClearScissorRects(buffer: Pointer): void {
    this.exports.bufferClearScissorRects(buffer)
  }

  public bufferPushOpacity(buffer: Pointer, opacity: number): void {
    this.exports.bufferPushOpacity(buffer, opacity)
  }

  public bufferPopOpacity(buffer: Pointer): void {
    this.exports.bufferPopOpacity(buffer)
  }

  public bufferGetCurrentOpacity(buffer: Pointer): number {
    return this.exports.bufferGetCurrentOpacity(buffer)
  }

  public bufferClearOpacity(buffer: Pointer): void {
    this.exports.bufferClearOpacity(buffer)
  }

  public resizeRenderer(renderer: Pointer, width: number, height: number): void {
    this.exports.resizeRenderer(renderer, width, height)
  }

  public setCursorPosition(renderer: Pointer, x: number, y: number, visible: boolean): void {
    const current = this.cursorStates.get(renderer) ?? this.createDefaultCursorState()
    this.cursorStates.set(renderer, { ...current, x, y, visible })
    this.exports.setCursorPosition(renderer, x, y, visible)
  }

  public setCursorColor(renderer: Pointer, color: RGBA): void {
    const current = this.cursorStates.get(renderer) ?? this.createDefaultCursorState()
    this.cursorStates.set(renderer, { ...current, color })
    this.withRequiredColor(color, (colorPtr) => this.exports.setCursorColor(renderer, colorPtr))
  }

  public getCursorState(renderer: Pointer): CursorState {
    return this.cursorStates.get(renderer) ?? this.createDefaultCursorState()
  }

  public setCursorStyleOptions(renderer: Pointer, options: CursorStyleOptions): void {
    const current = this.cursorStates.get(renderer) ?? this.createDefaultCursorState()
    this.cursorStates.set(renderer, {
      ...current,
      style: options.style ?? current.style,
      blinking: options.blinking ?? current.blinking,
      color: options.color ?? current.color,
    })

    const style = options.style === undefined ? -1 : CURSOR_STYLE_TO_ID[options.style]
    const blinking = options.blinking === undefined ? -1 : options.blinking ? 1 : 0
    const cursor = options.cursor === undefined ? -1 : MOUSE_STYLE_TO_ID[options.cursor]

    this.withOptionalColor(options.color, (colorPtr) =>
      this.exports.setCursorStyleOptionsFlat(renderer, style, blinking, colorPtr, cursor),
    )
  }

  public setDebugOverlay(renderer: Pointer, enabled: boolean, corner: number): void {
    this.exports.setDebugOverlay(renderer, enabled, corner)
  }

  public clearTerminal(renderer: Pointer): void {
    this.exports.clearTerminal(renderer)
  }

  public setTerminalTitle(renderer: Pointer, title: string): void {
    this.withString(title, (titlePtr, titleLen) => this.exports.setTerminalTitle(renderer, titlePtr, titleLen))
  }

  public addToHitGrid(renderer: Pointer, x: number, y: number, width: number, height: number, id: number): void {
    this.exports.addToHitGrid(renderer, x, y, width, height, id)
  }

  public clearCurrentHitGrid(renderer: Pointer): void {
    this.exports.clearCurrentHitGrid(renderer)
  }

  public hitGridPushScissorRect(renderer: Pointer, x: number, y: number, width: number, height: number): void {
    this.exports.hitGridPushScissorRect(renderer, x, y, width, height)
  }

  public hitGridPopScissorRect(renderer: Pointer): void {
    this.exports.hitGridPopScissorRect(renderer)
  }

  public hitGridClearScissorRects(renderer: Pointer): void {
    this.exports.hitGridClearScissorRects(renderer)
  }

  public addToCurrentHitGridClipped(
    renderer: Pointer,
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ): void {
    this.exports.addToCurrentHitGridClipped(renderer, x, y, width, height, id)
  }

  public checkHit(renderer: Pointer, x: number, y: number): number {
    return this.exports.checkHit(renderer, x, y)
  }

  public getHitGridDirty(renderer: Pointer): boolean {
    return this.exports.getHitGridDirty(renderer)
  }

  public restoreTerminalModes(renderer: Pointer): void {
    this.exports.restoreTerminalModes(renderer)
  }

  public enableMouse(renderer: Pointer, enableMovement: boolean): void {
    this.exports.enableMouse(renderer, enableMovement)
  }

  public disableMouse(renderer: Pointer): void {
    this.exports.disableMouse(renderer)
  }

  public setKittyKeyboardFlags(renderer: Pointer, flags: number): void {
    this.exports.setKittyKeyboardFlags(renderer, flags)
  }

  public getKittyKeyboardFlags(renderer: Pointer): number {
    return this.exports.getKittyKeyboardFlags(renderer)
  }

  public queryPixelResolution(renderer: Pointer): void {
    this.exports.queryPixelResolution(renderer)
  }

  public writeOut(renderer: Pointer, data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? this.encoder.encode(data) : data
    this.withBytes(bytes, (dataPtr, dataLen) => this.exports.writeOut(renderer, dataPtr, dataLen))
  }

  public createTextBuffer(widthMethod: WidthMethod): TextBuffer {
    const ptr = this.exports.createTextBuffer(widthMethod === "wcwidth" ? 0 : 1)
    if (!ptr) {
      throw new Error("Failed to create TextBuffer")
    }

    return new TextBuffer(this as unknown as RenderLib, ptr)
  }

  public destroyTextBuffer(buffer: Pointer): void {
    this.exports.destroyTextBuffer(buffer)
  }

  public textBufferGetLength(buffer: Pointer): number {
    return this.exports.textBufferGetLength(buffer)
  }

  public textBufferGetByteSize(buffer: Pointer): number {
    return this.exports.textBufferGetByteSize(buffer)
  }

  public textBufferReset(buffer: Pointer): void {
    this.exports.textBufferReset(buffer)
  }

  public textBufferClear(buffer: Pointer): void {
    this.exports.textBufferClear(buffer)
  }

  public textBufferSetDefaultFg(buffer: Pointer, fg: RGBA | null): void {
    this.withOptionalColor(fg, (fgPtr) => this.exports.textBufferSetDefaultFg(buffer, fgPtr))
  }

  public textBufferSetDefaultBg(buffer: Pointer, bg: RGBA | null): void {
    this.withOptionalColor(bg, (bgPtr) => this.exports.textBufferSetDefaultBg(buffer, bgPtr))
  }

  public textBufferSetDefaultAttributes(buffer: Pointer, attributes: number | null): void {
    if (attributes == null) {
      this.exports.textBufferSetDefaultAttributes(buffer, 0)
      return
    }

    const packed = new Uint32Array([attributes])
    this.withArray(new Uint8Array(packed.buffer), (attrPtr) =>
      this.exports.textBufferSetDefaultAttributes(buffer, attrPtr),
    )
  }

  public textBufferResetDefaults(buffer: Pointer): void {
    this.exports.textBufferResetDefaults(buffer)
  }

  public textBufferGetTabWidth(buffer: Pointer): number {
    return this.exports.textBufferGetTabWidth(buffer)
  }

  public textBufferSetTabWidth(buffer: Pointer, width: number): void {
    this.exports.textBufferSetTabWidth(buffer, width)
  }

  public textBufferRegisterMemBuffer(buffer: Pointer, bytes: Uint8Array, owned: boolean = false): number {
    if (owned) {
      return this.adoptBytes(bytes, (bytesPtr, bytesLen) =>
        this.exports.textBufferRegisterMemBuffer(buffer, bytesPtr, bytesLen, true),
      )
    }

    // Browser callers can't safely hand Zig borrowed JS-backed slices because the
    // wrapper allocates temporary wasm memory for the call. Promote mem buffers to
    // wasm-owned allocations so TextBuffer views never keep dangling pointers.
    return this.adoptBytes(bytes, (bytesPtr, bytesLen) =>
      this.exports.textBufferRegisterMemBuffer(buffer, bytesPtr, bytesLen, true),
    )
  }

  public textBufferReplaceMemBuffer(
    buffer: Pointer,
    memId: number,
    bytes: Uint8Array,
    owned: boolean = false,
  ): boolean {
    if (owned) {
      return this.adoptBytes(bytes, (bytesPtr, bytesLen) =>
        this.exports.textBufferReplaceMemBuffer(buffer, memId, bytesPtr, bytesLen, true),
      )
    }

    return this.adoptBytes(bytes, (bytesPtr, bytesLen) =>
      this.exports.textBufferReplaceMemBuffer(buffer, memId, bytesPtr, bytesLen, true),
    )
  }

  public textBufferClearMemRegistry(buffer: Pointer): void {
    this.exports.textBufferClearMemRegistry(buffer)
  }

  public textBufferSetTextFromMem(buffer: Pointer, memId: number): void {
    this.exports.textBufferSetTextFromMem(buffer, memId)
  }

  public textBufferAppend(buffer: Pointer, bytes: Uint8Array): void {
    this.withBytes(bytes, (bytesPtr, bytesLen) => this.exports.textBufferAppend(buffer, bytesPtr, bytesLen))
  }

  public textBufferAppendFromMemId(buffer: Pointer, memId: number): void {
    this.exports.textBufferAppendFromMemId(buffer, memId)
  }

  public textBufferLoadFile(buffer: Pointer, path: string): boolean {
    return this.withString(path, (pathPtr, pathLen) => this.exports.textBufferLoadFile(buffer, pathPtr, pathLen))
  }

  public textBufferSetStyledText(buffer: Pointer, chunks: StyledChunkInput[]): void {
    if (chunks.length === 0) {
      this.textBufferClear(buffer)
      return
    }

    this.withStyledChunks(chunks, (chunksPtr, chunkCount) =>
      this.exports.textBufferSetStyledText(buffer, chunksPtr, chunkCount),
    )
  }

  public textBufferGetLineCount(buffer: Pointer): number {
    return this.exports.textBufferGetLineCount(buffer)
  }

  public getPlainTextBytes(buffer: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.textBufferGetPlainText(buffer, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public textBufferGetTextRange(
    buffer: Pointer,
    startOffset: number,
    endOffset: number,
    maxLength: number,
  ): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.textBufferGetTextRange(buffer, startOffset, endOffset, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public textBufferAddHighlightByCharRange(buffer: Pointer, highlight: Highlight): void {
    const packed = HighlightStruct.pack(highlight)
    this.withArray(packed, (highlightPtr) => this.exports.textBufferAddHighlightByCharRange(buffer, highlightPtr))
  }

  public textBufferAddHighlight(buffer: Pointer, lineIdx: number, highlight: Highlight): void {
    const packed = HighlightStruct.pack(highlight)
    this.withArray(packed, (highlightPtr) => this.exports.textBufferAddHighlight(buffer, lineIdx, highlightPtr))
  }

  public textBufferRemoveHighlightsByRef(buffer: Pointer, hlRef: number): void {
    this.exports.textBufferRemoveHighlightsByRef(buffer, hlRef)
  }

  public textBufferClearLineHighlights(buffer: Pointer, lineIdx: number): void {
    this.exports.textBufferClearLineHighlights(buffer, lineIdx)
  }

  public textBufferClearAllHighlights(buffer: Pointer): void {
    this.exports.textBufferClearAllHighlights(buffer)
  }

  public textBufferSetSyntaxStyle(buffer: Pointer, style: Pointer | null): void {
    this.exports.textBufferSetSyntaxStyle(buffer, style ?? 0)
  }

  public textBufferGetLineHighlights(buffer: Pointer, lineIdx: number): Array<Highlight> {
    return this.withOutputBuffer(8, (countPtr) => {
      const nativePtr = this.exports.textBufferGetLineHighlightsPtr(buffer, lineIdx, countPtr)
      if (!nativePtr) {
        return []
      }

      const count = Number(new BigUint64Array(this.copyOutputBuffer(countPtr, 8))[0])
      const raw = this.copyOutputBuffer(nativePtr, count * HighlightStruct.size)
      const result = HighlightStruct.unpackList(raw, count)
      this.exports.textBufferFreeLineHighlights(nativePtr, count)
      return result
    })
  }

  public textBufferGetHighlightCount(buffer: Pointer): number {
    return this.exports.textBufferGetHighlightCount(buffer)
  }

  public createTextBufferView(textBuffer: Pointer): Pointer {
    const ptr = this.exports.createTextBufferView(textBuffer)
    if (!ptr) {
      throw new Error("Failed to create TextBufferView")
    }
    return ptr
  }

  public destroyTextBufferView(view: Pointer): void {
    this.exports.destroyTextBufferView(view)
  }

  public textBufferViewSetSelection(
    view: Pointer,
    start: number,
    end: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ): void {
    this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) =>
        this.exports.textBufferViewSetSelection(view, start, end, bgPtr, fgPtr),
      ),
    )
  }

  public textBufferViewResetSelection(view: Pointer): void {
    this.exports.textBufferViewResetSelection(view)
  }

  public textBufferViewGetSelection(view: Pointer): { start: number; end: number } | null {
    const packedInfo = BigInt(this.exports.textBufferViewGetSelectionInfo(view))
    if (packedInfo === 0xffff_ffff_ffff_ffffn || packedInfo === -1n) {
      return null
    }

    return {
      start: Number(packedInfo >> 32n),
      end: Number(packedInfo & 0xffff_ffffn),
    }
  }

  public textBufferViewSetLocalSelection(
    view: Pointer,
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ): boolean {
    return this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) =>
        this.exports.textBufferViewSetLocalSelection(view, anchorX, anchorY, focusX, focusY, bgPtr, fgPtr),
      ),
    )
  }

  public textBufferViewUpdateSelection(view: Pointer, end: number, bgColor: RGBA | null, fgColor: RGBA | null): void {
    this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) => this.exports.textBufferViewUpdateSelection(view, end, bgPtr, fgPtr)),
    )
  }

  public textBufferViewUpdateLocalSelection(
    view: Pointer,
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ): boolean {
    return this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) =>
        this.exports.textBufferViewUpdateLocalSelection(view, anchorX, anchorY, focusX, focusY, bgPtr, fgPtr),
      ),
    )
  }

  public textBufferViewResetLocalSelection(view: Pointer): void {
    this.exports.textBufferViewResetLocalSelection(view)
  }

  public textBufferViewSetWrapWidth(view: Pointer, width: number): void {
    this.exports.textBufferViewSetWrapWidth(view, width)
  }

  public textBufferViewSetWrapMode(view: Pointer, mode: "none" | "char" | "word"): void {
    this.exports.textBufferViewSetWrapMode(view, mode === "none" ? 0 : mode === "char" ? 1 : 2)
  }

  public textBufferViewSetViewportSize(view: Pointer, width: number, height: number): void {
    this.exports.textBufferViewSetViewportSize(view, width, height)
  }

  public textBufferViewSetViewport(view: Pointer, x: number, y: number, width: number, height: number): void {
    this.exports.textBufferViewSetViewport(view, x, y, width, height)
  }

  public textBufferViewGetLineInfo(view: Pointer): LineInfo {
    return this.withOutputBuffer(WASM32_LINE_INFO_SIZE, (outPtr) => {
      this.exports.textBufferViewGetLineInfoDirect(view, outPtr)
      return this.unpackLineInfo(outPtr)
    })
  }

  public textBufferViewGetLogicalLineInfo(view: Pointer): LineInfo {
    return this.withOutputBuffer(WASM32_LINE_INFO_SIZE, (outPtr) => {
      this.exports.textBufferViewGetLogicalLineInfoDirect(view, outPtr)
      return this.unpackLineInfo(outPtr)
    })
  }

  public textBufferViewGetVirtualLineCount(view: Pointer): number {
    return this.exports.textBufferViewGetVirtualLineCount(view)
  }

  public textBufferViewGetSelectedTextBytes(view: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.textBufferViewGetSelectedText(view, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public textBufferViewGetPlainTextBytes(view: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.textBufferViewGetPlainText(view, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public textBufferViewSetTabIndicator(view: Pointer, indicator: number): void {
    this.exports.textBufferViewSetTabIndicator(view, indicator)
  }

  public textBufferViewSetTabIndicatorColor(view: Pointer, color: RGBA): void {
    this.withRequiredColor(color, (colorPtr) => this.exports.textBufferViewSetTabIndicatorColor(view, colorPtr))
  }

  public textBufferViewSetTruncate(view: Pointer, truncate: boolean): void {
    this.exports.textBufferViewSetTruncate(view, truncate)
  }

  public textBufferViewMeasureForDimensions(
    view: Pointer,
    width: number,
    height: number,
  ): { lineCount: number; widthColsMax: number } | null {
    return this.withOutputBuffer(MeasureResultStruct.size, (outPtr) => {
      const success = this.exports.textBufferViewMeasureForDimensions(view, width, height, outPtr)
      if (!success) {
        return null
      }

      const result = MeasureResultStruct.unpack(this.copyOutputBuffer(outPtr, MeasureResultStruct.size))
      return result
    })
  }

  public createEditBuffer(widthMethod: WidthMethod): Pointer {
    const ptr = this.exports.createEditBuffer(widthMethod === "wcwidth" ? 0 : 1)
    if (!ptr) {
      throw new Error("Failed to create EditBuffer")
    }
    return ptr
  }

  public destroyEditBuffer(buffer: Pointer): void {
    this.exports.destroyEditBuffer(buffer)
  }

  public editBufferGetTextBuffer(buffer: Pointer): Pointer {
    return this.exports.editBufferGetTextBuffer(buffer)
  }

  public editBufferInsertText(buffer: Pointer, text: string): void {
    this.withString(text, (textPtr, textLen) => this.exports.editBufferInsertText(buffer, textPtr, textLen))
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferDeleteRange(
    buffer: Pointer,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): void {
    this.exports.editBufferDeleteRange(buffer, startRow, startCol, endRow, endCol)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferDeleteCharBackward(buffer: Pointer): void {
    this.exports.editBufferDeleteCharBackward(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferDeleteChar(buffer: Pointer): void {
    this.exports.editBufferDeleteChar(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferMoveCursorLeft(buffer: Pointer): void {
    this.exports.editBufferMoveCursorLeft(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferMoveCursorRight(buffer: Pointer): void {
    this.exports.editBufferMoveCursorRight(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferMoveCursorUp(buffer: Pointer): void {
    this.exports.editBufferMoveCursorUp(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferMoveCursorDown(buffer: Pointer): void {
    this.exports.editBufferMoveCursorDown(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferGetCursorPosition(buffer: Pointer): { row: number; col: number; offset: number } {
    return this.withOutputBuffer(LogicalCursorStruct.size, (outPtr) => {
      this.exports.editBufferGetCursorPosition(buffer, outPtr)
      return LogicalCursorStruct.unpack(this.copyOutputBuffer(outPtr, LogicalCursorStruct.size))
    })
  }

  public editBufferSetCursor(buffer: Pointer, row: number, col: number): void {
    this.exports.editBufferSetCursor(buffer, row, col)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferSetCursorToLineCol(buffer: Pointer, row: number, col: number): void {
    this.exports.editBufferSetCursorToLineCol(buffer, row, col)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferSetCursorByOffset(buffer: Pointer, offset: number): void {
    this.exports.editBufferSetCursorByOffset(buffer, offset)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferGetNextWordBoundary(buffer: Pointer): { row: number; col: number; offset: number } {
    return this.withOutputBuffer(LogicalCursorStruct.size, (outPtr) => {
      this.exports.editBufferGetNextWordBoundary(buffer, outPtr)
      return LogicalCursorStruct.unpack(this.copyOutputBuffer(outPtr, LogicalCursorStruct.size))
    })
  }

  public editBufferGetPrevWordBoundary(buffer: Pointer): { row: number; col: number; offset: number } {
    return this.withOutputBuffer(LogicalCursorStruct.size, (outPtr) => {
      this.exports.editBufferGetPrevWordBoundary(buffer, outPtr)
      return LogicalCursorStruct.unpack(this.copyOutputBuffer(outPtr, LogicalCursorStruct.size))
    })
  }

  public editBufferGetEOL(buffer: Pointer): { row: number; col: number; offset: number } {
    return this.withOutputBuffer(LogicalCursorStruct.size, (outPtr) => {
      this.exports.editBufferGetEOL(buffer, outPtr)
      return LogicalCursorStruct.unpack(this.copyOutputBuffer(outPtr, LogicalCursorStruct.size))
    })
  }

  public editBufferOffsetToPosition(
    buffer: Pointer,
    offset: number,
  ): { row: number; col: number; offset: number } | null {
    return this.withOutputBuffer(LogicalCursorStruct.size, (outPtr) => {
      const success = this.exports.editBufferOffsetToPosition(buffer, offset, outPtr)
      return success ? LogicalCursorStruct.unpack(this.copyOutputBuffer(outPtr, LogicalCursorStruct.size)) : null
    })
  }

  public editBufferPositionToOffset(buffer: Pointer, row: number, col: number): number {
    return this.exports.editBufferPositionToOffset(buffer, row, col)
  }

  public editBufferGetLineStartOffset(buffer: Pointer, row: number): number {
    return this.exports.editBufferGetLineStartOffset(buffer, row)
  }

  public editBufferGetTextRange(
    buffer: Pointer,
    startOffset: number,
    endOffset: number,
    maxLength: number,
  ): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editBufferGetTextRange(buffer, startOffset, endOffset, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public editBufferGetTextRangeByCoords(
    buffer: Pointer,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    maxLength: number,
  ): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editBufferGetTextRangeByCoords(
        buffer,
        startRow,
        startCol,
        endRow,
        endCol,
        outPtr,
        maxLength,
      )
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public editBufferSetText(buffer: Pointer, textBytes: Uint8Array): void {
    this.withBytes(textBytes, (textPtr, textLen) => this.exports.editBufferSetText(buffer, textPtr, textLen))
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferSetTextFromMem(buffer: Pointer, memId: number): void {
    this.exports.editBufferSetTextFromMem(buffer, memId)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferReplaceText(buffer: Pointer, textBytes: Uint8Array): void {
    this.withBytes(textBytes, (textPtr, textLen) => this.exports.editBufferReplaceText(buffer, textPtr, textLen))
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferReplaceTextFromMem(buffer: Pointer, memId: number): void {
    this.exports.editBufferReplaceTextFromMem(buffer, memId)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferGetText(buffer: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editBufferGetText(buffer, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public editBufferInsertChar(buffer: Pointer, char: string): void {
    this.withString(char, (charPtr, charLen) => this.exports.editBufferInsertChar(buffer, charPtr, charLen))
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferNewLine(buffer: Pointer): void {
    this.exports.editBufferNewLine(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferDeleteLine(buffer: Pointer): void {
    this.exports.editBufferDeleteLine(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public editBufferGotoLine(buffer: Pointer, line: number): void {
    this.exports.editBufferGotoLine(buffer, line)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
  }

  public editBufferGetId(buffer: Pointer): number {
    return this.exports.editBufferGetId(buffer)
  }

  public editBufferDebugLogRope(buffer: Pointer): void {
    this.exports.editBufferDebugLogRope(buffer)
  }

  public editBufferUndo(buffer: Pointer, maxLength: number): Uint8Array | null {
    const result = this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editBufferUndo(buffer, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
    return result
  }

  public editBufferRedo(buffer: Pointer, maxLength: number): Uint8Array | null {
    const result = this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editBufferRedo(buffer, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
    return result
  }

  public editBufferCanUndo(buffer: Pointer): boolean {
    return this.exports.editBufferCanUndo(buffer)
  }

  public editBufferCanRedo(buffer: Pointer): boolean {
    return this.exports.editBufferCanRedo(buffer)
  }

  public editBufferClearHistory(buffer: Pointer): void {
    this.exports.editBufferClearHistory(buffer)
  }

  public editBufferClear(buffer: Pointer): void {
    this.exports.editBufferClear(buffer)
    this.emitEditBufferNativeEvent(buffer, "cursor-changed")
    this.emitEditBufferNativeEvent(buffer, "content-changed")
  }

  public bufferDrawTextBufferView(buffer: Pointer, view: Pointer, x: number, y: number): void {
    this.exports.bufferDrawTextBufferView(buffer, view, x, y)
  }

  public bufferDrawEditorView(buffer: Pointer, view: Pointer, x: number, y: number): void {
    this.exports.bufferDrawEditorView(buffer, view, x, y)
  }

  public createEditorView(editBufferPtr: Pointer, viewportWidth: number, viewportHeight: number): Pointer {
    const ptr = this.exports.createEditorView(editBufferPtr, viewportWidth, viewportHeight)
    if (!ptr) {
      throw new Error("Failed to create EditorView")
    }
    return ptr
  }

  public destroyEditorView(view: Pointer): void {
    this.exports.destroyEditorView(view)
  }

  public editorViewSetViewportSize(view: Pointer, width: number, height: number): void {
    this.exports.editorViewSetViewportSize(view, width, height)
  }

  public editorViewSetViewport(
    view: Pointer,
    x: number,
    y: number,
    width: number,
    height: number,
    moveCursor: boolean,
  ): void {
    this.exports.editorViewSetViewport(view, x, y, width, height, moveCursor)
  }

  public editorViewGetViewport(view: Pointer): { offsetY: number; offsetX: number; height: number; width: number } {
    return this.withOutputBuffer(16, (outPtr) => {
      this.exports.editorViewGetViewport(view, outPtr, outPtr + 4, outPtr + 8, outPtr + 12)
      const values = new Uint32Array(this.copyOutputBuffer(outPtr, 16))
      return {
        offsetX: values[0] ?? 0,
        offsetY: values[1] ?? 0,
        width: values[2] ?? 0,
        height: values[3] ?? 0,
      }
    })
  }

  public editorViewSetScrollMargin(view: Pointer, margin: number): void {
    this.exports.editorViewSetScrollMargin(view, margin)
  }

  public editorViewSetWrapMode(view: Pointer, mode: "none" | "char" | "word"): void {
    this.exports.editorViewSetWrapMode(view, mode === "none" ? 0 : mode === "char" ? 1 : 2)
  }

  public editorViewGetVirtualLineCount(view: Pointer): number {
    return this.exports.editorViewGetVirtualLineCount(view)
  }

  public editorViewGetTotalVirtualLineCount(view: Pointer): number {
    return this.exports.editorViewGetTotalVirtualLineCount(view)
  }

  public editorViewGetTextBufferView(view: Pointer): Pointer {
    return this.exports.editorViewGetTextBufferView(view)
  }

  public editorViewGetLineInfo(view: Pointer): LineInfo {
    return this.withOutputBuffer(WASM32_LINE_INFO_SIZE, (outPtr) => {
      this.exports.editorViewGetLineInfoDirect(view, outPtr)
      return this.unpackLineInfo(outPtr)
    })
  }

  public editorViewGetLogicalLineInfo(view: Pointer): LineInfo {
    return this.withOutputBuffer(WASM32_LINE_INFO_SIZE, (outPtr) => {
      this.exports.editorViewGetLogicalLineInfoDirect(view, outPtr)
      return this.unpackLineInfo(outPtr)
    })
  }

  public editorViewSetSelection(
    view: Pointer,
    start: number,
    end: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ): void {
    this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) => this.exports.editorViewSetSelection(view, start, end, bgPtr, fgPtr)),
    )
  }

  public editorViewResetSelection(view: Pointer): void {
    this.exports.editorViewResetSelection(view)
  }

  public editorViewGetSelection(view: Pointer): { start: number; end: number } | null {
    const packedInfo = BigInt(this.exports.editorViewGetSelection(view))
    if (packedInfo === 0xffff_ffff_ffff_ffffn || packedInfo === -1n) {
      return null
    }

    return { start: Number(packedInfo >> 32n), end: Number(packedInfo & 0xffff_ffffn) }
  }

  public editorViewSetLocalSelection(
    view: Pointer,
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
    updateCursor: boolean,
    followCursor: boolean,
  ): boolean {
    return this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) =>
        this.exports.editorViewSetLocalSelection(
          view,
          anchorX,
          anchorY,
          focusX,
          focusY,
          bgPtr,
          fgPtr,
          updateCursor,
          followCursor,
        ),
      ),
    )
  }

  public editorViewUpdateSelection(view: Pointer, end: number, bgColor: RGBA | null, fgColor: RGBA | null): void {
    this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) => this.exports.editorViewUpdateSelection(view, end, bgPtr, fgPtr)),
    )
  }

  public editorViewUpdateLocalSelection(
    view: Pointer,
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
    updateCursor: boolean,
    followCursor: boolean,
  ): boolean {
    return this.withOptionalColor(bgColor, (bgPtr) =>
      this.withOptionalColor(fgColor, (fgPtr) =>
        this.exports.editorViewUpdateLocalSelection(
          view,
          anchorX,
          anchorY,
          focusX,
          focusY,
          bgPtr,
          fgPtr,
          updateCursor,
          followCursor,
        ),
      ),
    )
  }

  public editorViewResetLocalSelection(view: Pointer): void {
    this.exports.editorViewResetLocalSelection(view)
  }

  public editorViewGetSelectedTextBytes(view: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editorViewGetSelectedTextBytes(view, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public editorViewGetCursor(view: Pointer): { row: number; col: number } {
    return this.withOutputBuffer(8, (outPtr) => {
      this.exports.editorViewGetCursor(view, outPtr, outPtr + 4)
      const values = new Uint32Array(this.copyOutputBuffer(outPtr, 8))
      return { row: values[0] ?? 0, col: values[1] ?? 0 }
    })
  }

  public editorViewGetText(view: Pointer, maxLength: number): Uint8Array | null {
    return this.withOutputBuffer(maxLength, (outPtr) => {
      const actualLen = this.exports.editorViewGetText(view, outPtr, maxLength)
      const len = typeof actualLen === "bigint" ? Number(actualLen) : actualLen
      return len === 0 ? null : this.copyOutputBytes(outPtr, len)
    })
  }

  public editorViewGetVisualCursor(view: Pointer): { row: number; col: number; x: number; y: number; line: number } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetVisualCursor(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewMoveUpVisual(view: Pointer): void {
    this.exports.editorViewMoveUpVisual(view)
  }

  public editorViewMoveDownVisual(view: Pointer): void {
    this.exports.editorViewMoveDownVisual(view)
  }

  public editorViewDeleteSelectedText(view: Pointer): void {
    this.exports.editorViewDeleteSelectedText(view)
  }

  public editorViewSetCursorByOffset(view: Pointer, offset: number): void {
    this.exports.editorViewSetCursorByOffset(view, offset)
  }

  public editorViewGetNextWordBoundary(view: Pointer): {
    row: number
    col: number
    x: number
    y: number
    line: number
  } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetNextWordBoundary(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewGetPrevWordBoundary(view: Pointer): {
    row: number
    col: number
    x: number
    y: number
    line: number
  } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetPrevWordBoundary(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewGetEOL(view: Pointer): { row: number; col: number; x: number; y: number; line: number } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetEOL(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewGetVisualSOL(view: Pointer): { row: number; col: number; x: number; y: number; line: number } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetVisualSOL(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewGetVisualEOL(view: Pointer): { row: number; col: number; x: number; y: number; line: number } {
    return this.withOutputBuffer(VisualCursorStruct.size, (outPtr) => {
      this.exports.editorViewGetVisualEOL(view, outPtr)
      return VisualCursorStruct.unpack(this.copyOutputBuffer(outPtr, VisualCursorStruct.size))
    })
  }

  public editorViewSetPlaceholderStyledText(view: Pointer, chunks: StyledChunkInput[]): void {
    if (chunks.length === 0) {
      this.exports.editorViewSetPlaceholderStyledText(view, 0, 0)
      return
    }

    this.withStyledChunks(chunks, (chunksPtr, chunkCount) =>
      this.exports.editorViewSetPlaceholderStyledText(view, chunksPtr, chunkCount),
    )
  }

  public editorViewSetTabIndicator(view: Pointer, indicator: number): void {
    this.exports.editorViewSetTabIndicator(view, indicator)
  }

  public editorViewSetTabIndicatorColor(view: Pointer, color: RGBA): void {
    this.withRequiredColor(color, (colorPtr) => this.exports.editorViewSetTabIndicatorColor(view, colorPtr))
  }

  public createSyntaxStyle(): Pointer {
    const ptr = this.exports.createSyntaxStyle()
    if (!ptr) {
      throw new Error("Failed to create SyntaxStyle")
    }
    return ptr
  }

  public destroySyntaxStyle(style: Pointer): void {
    this.exports.destroySyntaxStyle(style)
  }

  public syntaxStyleRegister(
    style: Pointer,
    name: string,
    fg: RGBA | null,
    bg: RGBA | null,
    attributes: number,
  ): number {
    return this.withString(name, (namePtr, nameLen) =>
      this.withOptionalColor(fg, (fgPtr) =>
        this.withOptionalColor(bg, (bgPtr) =>
          this.exports.syntaxStyleRegister(style, namePtr, nameLen, fgPtr, bgPtr, attributes),
        ),
      ),
    )
  }

  public syntaxStyleResolveByName(style: Pointer, name: string): number | null {
    const result = this.withString(name, (namePtr, nameLen) =>
      this.exports.syntaxStyleResolveByName(style, namePtr, nameLen),
    )
    return result === 0 ? null : result
  }

  public syntaxStyleGetStyleCount(style: Pointer): number {
    return this.exports.syntaxStyleGetStyleCount(style)
  }

  public onAnyNativeEvent(handler: (name: string, data: ArrayBuffer) => void): void {
    this.anyNativeEventHandlers.push(handler)
  }

  public getTerminalCapabilities(renderer: Pointer): any {
    return this.capabilities.get(renderer) ?? DEFAULT_CAPABILITIES
  }

  public setupTerminalForBrowser(renderer: Pointer, useAlternateScreen: boolean): void {
    if (this.exports.setupTerminalForBrowser) {
      this.exports.setupTerminalForBrowser(renderer, useAlternateScreen)
      return
    }

    this.exports.setupTerminal?.(renderer, useAlternateScreen)
  }
}

export async function loadBrowserRenderLib(options: LoadBrowserRenderLibOptions = {}): Promise<RenderLib> {
  const wasmUrl = options.wasmUrl ?? "/opentui/opentui.wasm"
  const url = typeof wasmUrl === "string" ? wasmUrl : wasmUrl.toString()

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load OpenTUI wasm from ${url}: ${response.status} ${response.statusText}`)
  }

  let instance: WebAssembly.Instance
  try {
    const result = await WebAssembly.instantiateStreaming(response.clone(), {})
    instance = result.instance
  } catch {
    const bytes = await response.arrayBuffer()
    const result = await WebAssembly.instantiate(bytes, {})
    instance = result.instance
  }

  const lib = new BrowserRenderLib(instance.exports as unknown as WasmExports)
  setRenderLib(lib as unknown as RenderLib)
  return lib as unknown as RenderLib
}
