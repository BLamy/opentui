import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { OptimizedBuffer } from "../buffer.js"
import { BrowserRenderEvents, createBrowserRenderer, type BrowserTerminalHost, type BrowserTerminalKey } from "./renderer.js"

type ThemeMode = "dark" | "light"

class MockHost implements BrowserTerminalHost {
  public readonly writes: string[] = []
  private readonly dataHandlers = new Set<(data: string) => void>()
  private readonly keyHandlers = new Set<(key: BrowserTerminalKey) => void>()
  private readonly resizeHandlers = new Set<(size: { cols: number; rows: number }) => void>()
  private readonly focusHandlers = new Set<(focused: boolean) => void>()
  private readonly themeHandlers = new Set<(mode: ThemeMode) => void>()

  constructor(
    private cols: number = 80,
    private rows: number = 24,
    private readonly themeMode: ThemeMode = "dark",
  ) {}

  public getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows }
  }

  public write(data: string): void {
    this.writes.push(data)
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
    handler(this.themeMode)
    return () => this.themeHandlers.delete(handler)
  }

  public emitData(data: string): void {
    for (const handler of this.dataHandlers) {
      handler(data)
    }
  }

  public emitResize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    for (const handler of this.resizeHandlers) {
      handler({ cols, rows })
    }
  }

  public emitFocus(focused: boolean): void {
    for (const handler of this.focusHandlers) {
      handler(focused)
    }
  }

  public emitTheme(mode: ThemeMode): void {
    for (const handler of this.themeHandlers) {
      handler(mode)
    }
  }

  public emitKey(key: BrowserTerminalKey): void {
    for (const handler of this.keyHandlers) {
      handler(key)
    }
  }
}

function createSyntheticKey(
  key: Pick<BrowserTerminalKey, "name" | "sequence" | "raw" | "ctrl" | "meta" | "shift" | "code">,
): BrowserTerminalKey {
  return {
    name: key.name,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
    option: false,
    sequence: key.sequence,
    number: false,
    raw: key.raw,
    eventType: "press",
    source: "raw",
    code: key.code,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    repeated: false,
  }
}

function createMockRenderLib() {
  const env = new Map<string, string>()
  let nextBufferPtr = 10
  let frameCount = 0
  let pendingOutput = ""
  let restoreCount = 0

  const nextBuffer = new OptimizedBuffer({} as any, nextBufferPtr++, 80, 24, { id: "next", widthMethod: "unicode" })
  const currentBuffer = new OptimizedBuffer({} as any, nextBufferPtr++, 80, 24, {
    id: "current",
    widthMethod: "unicode",
  })

  const lib = {
    encoder: new TextEncoder(),
    decoder: new TextDecoder(),
    createRenderer: () => 1,
    destroyRenderer: () => {},
    setTerminalEnvVar: (_renderer: number, key: string, value: string) => {
      env.set(key, value)
      return true
    },
    setUseThread: () => {},
    setBackgroundColor: () => {},
    setRenderOffset: () => {},
    updateStats: () => {},
    updateMemoryStats: () => {},
    render: () => {
      frameCount += 1
      pendingOutput += `frame:${frameCount}`
    },
    drainOutput: () => {
      const output = pendingOutput
      pendingOutput = ""
      return output
    },
    getNextBuffer: () => nextBuffer,
    getCurrentBuffer: () => currentBuffer,
    resizeRenderer: () => {},
    getTerminalCapabilities: () => ({ unicode: "unicode" }),
    setupTerminalForBrowser: () => {},
    enableMouse: () => {},
    disableMouse: () => {},
    restoreTerminalModes: () => {
      restoreCount += 1
    },
    addToHitGrid: () => {},
    hitGridPushScissorRect: () => {},
    hitGridPopScissorRect: () => {},
    hitGridClearScissorRects: () => {},
    clearCurrentHitGrid: () => {},
    checkHit: () => 0,
    getHitGridDirty: () => false,
    setCursorPosition: () => {},
    setCursorStyleOptions: () => {},
    setCursorColor: () => {},
    setTerminalTitle: () => {},
    setTerminalThemeMode: () => {},
  }

  nextBuffer.lib = lib as any
  currentBuffer.lib = lib as any

  return {
    env,
    getRestoreCount: () => restoreCount,
    lib,
  }
}

const originalWindow = globalThis.window

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  ;(globalThis as any).window = {
    requestAnimationFrame(callback: (time: number) => void) {
      return setTimeout(() => callback(performance.now()), 0)
    },
    cancelAnimationFrame(id: ReturnType<typeof setTimeout>) {
      clearTimeout(id)
    },
  }
})

afterEach(() => {
  ;(globalThis as any).window = originalWindow
})

describe("BrowserRenderer", () => {
  test("seeds terminal env and drains the initial render output", async () => {
    const host = new MockHost()
    const { lib, env } = createMockRenderLib()

    const renderer = await createBrowserRenderer(host, { renderLib: lib as any })
    await flushMicrotasks()

    expect(env.get("TERM")).toBe("xterm-256color")
    expect(env.get("COLORTERM")).toBe("truecolor")
    expect(host.writes).toEqual(["frame:1"])

    renderer.destroy()
  })

  test("routes keyboard and paste input through the shared stdin parser", async () => {
    const host = new MockHost()
    const { lib } = createMockRenderLib()

    const renderer = await createBrowserRenderer(host, { renderLib: lib as any })

    const keys: string[] = []
    const pastes: string[] = []

    renderer.keyInput.on("keypress", (event) => {
      keys.push(event.sequence || event.name)
    })
    renderer.keyInput.on("paste", (event) => {
      pastes.push(new TextDecoder().decode(event.bytes))
    })

    host.emitData("a")
    host.emitData("\x1b[200~hello from paste\x1b[201~")

    expect(keys).toContain("a")
    expect(pastes).toEqual(["hello from paste"])

    renderer.destroy()
  })

  test("accepts host-synthesized control keys and browser-only shortcuts", async () => {
    const host = new MockHost()
    const { lib } = createMockRenderLib()

    const renderer = await createBrowserRenderer(host, { renderLib: lib as any })

    const keys: Array<{ name: string; ctrl: boolean; meta: boolean; shift: boolean }> = []
    renderer.keyInput.on("keypress", (event) => {
      keys.push({ name: event.name, ctrl: event.ctrl, meta: event.meta, shift: event.shift })
    })

    host.emitKey(createSyntheticKey({ name: "backspace", ctrl: false, meta: false, shift: false, sequence: "\x7f", raw: "\x7f", code: "Backspace" }))
    host.emitKey(createSyntheticKey({ name: "return", ctrl: false, meta: false, shift: false, sequence: "\r", raw: "\r", code: "Enter" }))
    host.emitKey(createSyntheticKey({ name: "c", ctrl: true, meta: false, shift: true, sequence: "C", raw: "C", code: "KeyC" }))

    expect(keys).toEqual([
      { name: "backspace", ctrl: false, meta: false, shift: false },
      { name: "return", ctrl: false, meta: false, shift: false },
      { name: "c", ctrl: true, meta: false, shift: true },
    ])

    renderer.destroy()
  })

  test("propagates resize, theme, and focus restore events", async () => {
    const host = new MockHost()
    const { lib, getRestoreCount } = createMockRenderLib()

    const renderer = await createBrowserRenderer(host, { renderLib: lib as any })

    const resizeEvents: Array<[number, number]> = []
    const themeEvents: ThemeMode[] = []

    renderer.on(BrowserRenderEvents.RESIZE, (width: number, height: number) => {
      resizeEvents.push([width, height])
    })
    renderer.on(BrowserRenderEvents.THEME_MODE, (mode: ThemeMode) => {
      themeEvents.push(mode)
    })

    host.emitFocus(false)
    host.emitFocus(true)
    host.emitResize(100, 30)
    host.emitTheme("light")
    await flushMicrotasks()

    expect(getRestoreCount()).toBe(1)
    expect(renderer.width).toBe(100)
    expect(renderer.height).toBe(30)
    expect(resizeEvents).toEqual([[100, 30]])
    expect(themeEvents).toEqual(["light"])

    renderer.destroy()
  })
})
