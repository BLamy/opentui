import { afterEach, beforeEach, expect, test } from "bun:test"

import { OptimizedBuffer } from "../buffer.js"
import { EditBuffer } from "../edit-buffer.js"
import { EditorView } from "../editor-view.js"
import { loadBrowserRenderLib } from "../browser.js"
import { BorderCharArrays } from "../lib/border.js"
import { RGBA } from "../lib/RGBA.js"
import { TextBuffer } from "../text-buffer.js"
import { TextBufferView } from "../text-buffer-view.js"

const WASM_TEST_URL = "/test/opentui.wasm"
const wasmFile = Bun.file(new URL("../zig/lib/wasm32-freestanding/opentui.wasm", import.meta.url))
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (url === WASM_TEST_URL) {
      return new Response(wasmFile, {
        headers: {
          "Content-Type": "application/wasm",
        },
      })
    }

    return originalFetch(input as RequestInfo | URL, init)
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function readCharGrid(buffer: OptimizedBuffer): string {
  const chars = buffer.buffers.char
  const rows: string[] = []

  for (let y = 0; y < buffer.height; y += 1) {
    let row = ""

    for (let x = 0; x < buffer.width; x += 1) {
      const codePoint = chars[y * buffer.width + x] ?? 0
      row += codePoint === 0 ? " " : String.fromCodePoint(codePoint)
    }

    rows.push(row)
  }

  return rows.join("\n")
}

test("browser wasm text buffers accept styled text", async () => {
  await loadBrowserRenderLib({ wasmUrl: WASM_TEST_URL })

  const buffer = TextBuffer.create("unicode")

  try {
    buffer.setStyledText({
      chunks: [
        { __isChunk: true, text: "Open", attributes: 0 },
        { __isChunk: true, text: "Code", attributes: 1, link: { url: "https://example.com/opencode" } },
      ],
    })

    expect(buffer.getPlainText()).toBe("OpenCode")
    expect(buffer.length).toBe(8)
    expect(buffer.byteSize).toBe(8)
  } finally {
    buffer.destroy()
  }
})

test("browser wasm text and editor views expose line info and draw without trapping", async () => {
  await loadBrowserRenderLib({ wasmUrl: WASM_TEST_URL })

  const frameBuffer = OptimizedBuffer.create(80, 24, "unicode")
  const textBuffer = TextBuffer.create("unicode")
  const textView = TextBufferView.create(textBuffer)
  const editBuffer = EditBuffer.create("unicode")
  const editorView = EditorView.create(editBuffer, 24, 6)

  try {
    textBuffer.setStyledText({
      chunks: [
        { __isChunk: true, text: "OpenCode", attributes: 0 },
        { __isChunk: true, text: "\n", attributes: 0 },
        { __isChunk: true, text: "browser bridge", attributes: 1 },
      ],
    })

    textView.setWrapMode("word")
    textView.setViewport(0, 0, 8, 4)

    expect(textView.lineInfo.lineWidthColsMax).toBe(8)
    expect(textView.lineInfo.lineStartCols).toEqual([0, 9, 17])
    expect(textView.lineInfo.lineWidthCols).toEqual([8, 8, 6])
    expect(textView.lineInfo.lineSources).toEqual([0, 1, 1])
    expect(textView.lineInfo.lineWraps).toEqual([0, 0, 1])

    expect(() => frameBuffer.drawTextBuffer(textView, 0, 0)).not.toThrow()

    editBuffer.setText("")
    editorView.setPlaceholderStyledText([{ text: "Type a prompt" }])
    editorView.setWrapMode("word")

    expect(editorView.getLineInfo()).toEqual({
      lineStartCols: [0],
      lineWidthCols: [13],
      lineSources: [0],
      lineWraps: [0],
      lineWidthColsMax: 13,
    })
    expect(() => frameBuffer.drawEditorView(editorView, 0, 0)).not.toThrow()
  } finally {
    editorView.destroy()
    editBuffer.destroy()
    textView.destroy()
    textBuffer.destroy()
    frameBuffer.destroy()
  }
})

test("browser wasm buffers draw table grids", async () => {
  await loadBrowserRenderLib({ wasmUrl: WASM_TEST_URL })

  const frameBuffer = OptimizedBuffer.create(9, 5, "unicode")

  try {
    expect(() =>
      frameBuffer.drawGrid({
        borderChars: BorderCharArrays.single,
        borderFg: RGBA.fromHex("#ffffff"),
        borderBg: RGBA.fromHex("#000000"),
        columnOffsets: new Int32Array([0, 4, 8]),
        rowOffsets: new Int32Array([0, 2, 4]),
        drawInner: true,
        drawOuter: true,
      }),
    ).not.toThrow()

    expect(readCharGrid(frameBuffer)).toBe(["┌───┬───┐", "│   │   │", "├───┼───┤", "│   │   │", "└───┴───┘"].join("\n"))
  } finally {
    frameBuffer.destroy()
  }
})

test("browser wasm views treat cleared selections as null", async () => {
  await loadBrowserRenderLib({ wasmUrl: WASM_TEST_URL })

  const textBuffer = TextBuffer.create("unicode")
  const textView = TextBufferView.create(textBuffer)
  const editBuffer = EditBuffer.create("unicode")
  const editorView = EditorView.create(editBuffer, 24, 6)

  try {
    textBuffer.setText("OpenCode")
    editBuffer.setText("OpenCode")

    expect(textView.getSelection()).toBeNull()
    expect(editorView.getSelection()).toBeNull()

    textView.setSelection(0, 4)
    editorView.setSelection(0, 4)

    expect(textView.getSelection()).toEqual({ start: 0, end: 4 })
    expect(editorView.getSelection()).toEqual({ start: 0, end: 4 })

    textView.resetSelection()
    editorView.resetSelection()

    expect(textView.getSelection()).toBeNull()
    expect(editorView.getSelection()).toBeNull()
  } finally {
    editorView.destroy()
    editBuffer.destroy()
    textView.destroy()
    textBuffer.destroy()
  }
})

test("browser wasm edit buffers emit native-style change events", async () => {
  await loadBrowserRenderLib({ wasmUrl: WASM_TEST_URL })

  const editBuffer = EditBuffer.create("unicode")

  try {
    let contentChanged = 0
    let cursorChanged = 0

    editBuffer.on("content-changed", () => {
      contentChanged += 1
    })
    editBuffer.on("cursor-changed", () => {
      cursorChanged += 1
    })

    editBuffer.setText("h")
    expect(contentChanged).toBe(1)
    expect(cursorChanged).toBe(1)

    editBuffer.insertText("i")
    expect(contentChanged).toBe(2)
    expect(cursorChanged).toBe(2)

    editBuffer.moveCursorLeft()
    expect(contentChanged).toBe(2)
    expect(cursorChanged).toBe(3)

    editBuffer.deleteChar()
    expect(contentChanged).toBe(3)
    expect(cursorChanged).toBe(4)
  } finally {
    editBuffer.destroy()
  }
})
