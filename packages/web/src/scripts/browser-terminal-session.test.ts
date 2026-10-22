import { afterEach, expect, mock, test } from "bun:test"

import {
  createBrowserTerminalSession,
  GhosttyBrowserHost,
  resetSharedGhosttyCacheForTests,
  type BrowserTerminalFitAddonLike,
  type BrowserTerminalSurfaceLike,
  type MediaQueryListLike,
} from "./browser-terminal-session"

class FakeMediaQueryList implements MediaQueryListLike {
  public readonly listeners = new Set<(event: { matches: boolean }) => void>()

  public constructor(public matches: boolean) {}

  public addEventListener(_type: "change", listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: "change", listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener)
  }

  public dispatch(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) {
      listener({ matches })
    }
  }
}

class FakeSurface {
  public innerHTML = ""
  public readonly canvas = {
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    }),
  }
  private readonly listeners = new Map<string, Set<(event: any) => void>>()

  public addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }

    this.listeners.get(type)?.add(listener)
  }

  public removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  public contains(node: unknown): boolean {
    return node === this || node === this.canvas
  }

  public querySelector(selector: string): unknown {
    return selector === "canvas" ? this.canvas : null
  }

  public dispatch(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

class FakeFitAddon implements BrowserTerminalFitAddonLike {
  public fitCalls = 0
  public observeResizeCalls = 0
  public disposeCalls = 0

  public fit(): void {
    this.fitCalls += 1
  }

  public observeResize(): void {
    this.observeResizeCalls += 1
  }

  public dispose(): void {
    this.disposeCalls += 1
  }
}

class FakeTerminal implements BrowserTerminalSurfaceLike {
  public cols = 80
  public rows = 24
  public openedOn: HTMLElement | null = null
  public focusCalls = 0
  public disposeCalls = 0
  public readonly writes: string[] = []
  public readonly addons: Array<{ dispose(): void }> = []
  public mouseTrackingEnabled = false
  public privateModes = new Map<number, boolean>()
  public customWheelEventHandler?: (event: WheelEvent) => boolean
  private readonly dataHandlers = new Set<(data: string) => void>()
  private readonly resizeHandlers = new Set<(size: { cols: number; rows: number }) => void>()

  public open(parent: HTMLElement): void {
    this.openedOn = parent
  }

  public loadAddon(addon: { dispose(): void }): void {
    this.addons.push(addon)
  }

  public focus(): void {
    this.focusCalls += 1
  }

  public write(data: string): void {
    this.writes.push(data)
  }

  public dispose(): void {
    this.disposeCalls += 1
  }

  public hasMouseTracking(): boolean {
    return this.mouseTrackingEnabled
  }

  public getMode(mode: number): boolean {
    return this.privateModes.get(mode) ?? false
  }

  public attachCustomWheelEventHandler(handler?: (event: WheelEvent) => boolean): void {
    this.customWheelEventHandler = handler
  }

  public onData(handler: (data: string) => void): { dispose(): void } {
    this.dataHandlers.add(handler)
    return {
      dispose: () => this.dataHandlers.delete(handler),
    }
  }

  public onResize(handler: (size: { cols: number; rows: number }) => void): { dispose(): void } {
    this.resizeHandlers.add(handler)
    return {
      dispose: () => this.resizeHandlers.delete(handler),
    }
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
}

afterEach(() => {
  resetSharedGhosttyCacheForTests()
})

test("reuses shared Ghostty initialization across terminal sessions", async () => {
  const loadGhostty = mock(async () => ({ id: "ghostty" }))
  const createTerminal = mock(() => new FakeTerminal())

  const sessionA = await createBrowserTerminalSession(
    {
      surface: new FakeSurface() as unknown as HTMLElement,
      themeMode: "dark",
      ghosttyWasmUrl: "/ghostty-vt.wasm",
      fontFamily: "monospace",
      fontSize: 14,
      scrollback: 50,
    },
    {
      loadGhostty,
      createTerminal,
      createFitAddon: () => new FakeFitAddon(),
      matchMedia: () => new FakeMediaQueryList(true),
    },
  )

  const sessionB = await createBrowserTerminalSession(
    {
      surface: new FakeSurface() as unknown as HTMLElement,
      themeMode: "dark",
      ghosttyWasmUrl: "/ghostty-vt.wasm",
      fontFamily: "monospace",
      fontSize: 14,
      scrollback: 50,
    },
    {
      loadGhostty,
      createTerminal,
      createFitAddon: () => new FakeFitAddon(),
      matchMedia: () => new FakeMediaQueryList(true),
    },
  )

  expect(loadGhostty).toHaveBeenCalledTimes(1)
  expect(createTerminal).toHaveBeenCalledTimes(2)

  sessionA.destroy()
  sessionB.destroy()
})

test("forwards resize, focus, key, and theme events through the shared browser host", () => {
  const surface = new FakeSurface()
  const term = new FakeTerminal()
  const fitAddon = new FakeFitAddon()
  const mediaQuery = new FakeMediaQueryList(false)
  const host = new GhosttyBrowserHost(term, fitAddon, surface as unknown as HTMLElement, "light", {
    matchMedia: () => mediaQuery,
  })

  const resizeEvents: Array<{ cols: number; rows: number }> = []
  const focusEvents: boolean[] = []
  const themeEvents: string[] = []
  const dataEvents: string[] = []
  const keyEvents: string[] = []

  host.onResize((size) => resizeEvents.push(size))
  host.onFocusChange((focused) => focusEvents.push(focused))
  host.onThemeModeChange((mode) => themeEvents.push(mode))
  host.onData((data) => dataEvents.push(data))
  host.onKey((key) => keyEvents.push(`${key.ctrl}:${key.shift}:${key.name}`))

  term.emitData("hello")
  term.emitResize(132, 44)
  surface.dispatch("focusin")
  surface.dispatch("focusout", { relatedTarget: null })
  surface.dispatch("keydown", {
    target: surface,
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    key: "c",
    code: "KeyC",
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
    getModifierState() {
      return false
    },
  })
  mediaQuery.dispatch(true)

  expect(dataEvents).toEqual(["hello"])
  expect(resizeEvents).toEqual([{ cols: 132, rows: 44 }])
  expect(focusEvents).toEqual([true, false])
  expect(themeEvents).toEqual(["light", "dark"])
  expect(keyEvents).toEqual(["true:true:c"])

  host.destroy()
})

test("disposing and recreating a session removes old listeners while reusing the shared Ghostty instance", async () => {
  const surface = new FakeSurface()
  const loadGhostty = mock(async () => ({ id: "ghostty" }))
  const terms: FakeTerminal[] = []
  const mediaQueries = [new FakeMediaQueryList(true), new FakeMediaQueryList(false)]

  const createSession = async (themeMode: "dark" | "light") =>
    createBrowserTerminalSession(
      {
        surface: surface as unknown as HTMLElement,
        themeMode,
        ghosttyWasmUrl: "/ghostty-vt.wasm",
        fontFamily: "monospace",
        fontSize: 14,
        scrollback: 50,
      },
      {
        loadGhostty,
        createTerminal: () => {
          const term = new FakeTerminal()
          terms.push(term)
          return term
        },
        createFitAddon: () => new FakeFitAddon(),
        matchMedia: () => mediaQueries.shift() ?? new FakeMediaQueryList(false),
      },
    )

  const sessionA = await createSession("dark")
  const resizeEvents: Array<{ cols: number; rows: number }> = []
  sessionA.host.onResize((size) => resizeEvents.push(size))

  terms[0]?.emitResize(90, 30)
  expect(resizeEvents).toEqual([{ cols: 90, rows: 30 }])

  sessionA.destroy()
  terms[0]?.emitResize(120, 40)
  expect(resizeEvents).toEqual([{ cols: 90, rows: 30 }])

  const sessionB = await createSession("light")
  const themeEvents: string[] = []
  sessionB.host.onThemeModeChange((mode) => themeEvents.push(mode))

  expect(loadGhostty).toHaveBeenCalledTimes(1)
  expect(terms).toHaveLength(2)
  expect(themeEvents).toEqual(["light"])

  sessionB.destroy()
})

test("synthesizes SGR mouse input for clicks and drags when Ghostty mouse tracking is active", () => {
  const surface = new FakeSurface()
  const term = new FakeTerminal()
  term.cols = 10
  term.rows = 5
  term.mouseTrackingEnabled = true
  term.privateModes.set(1003, true)

  const host = new GhosttyBrowserHost(term, new FakeFitAddon(), surface as unknown as HTMLElement, "dark", {
    matchMedia: () => new FakeMediaQueryList(true),
  })

  const events: string[] = []
  host.onData((data) => events.push(data))

  const consumed = {
    down: 0,
    move: 0,
    up: 0,
  }

  surface.dispatch("mousedown", {
    target: surface.canvas,
    button: 0,
    clientX: 15,
    clientY: 25,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    preventDefault() {
      consumed.down += 1
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  })

  surface.dispatch("mousemove", {
    target: surface.canvas,
    buttons: 1,
    clientX: 35,
    clientY: 25,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    preventDefault() {
      consumed.move += 1
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  })

  surface.dispatch("mouseup", {
    target: surface.canvas,
    button: 0,
    clientX: 35,
    clientY: 25,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    preventDefault() {
      consumed.up += 1
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  })

  expect(events).toEqual(["\x1b[<0;1;1M", "\x1b[<32;3;1m", "\x1b[<0;3;1m"])
  expect(term.focusCalls).toBe(1)
  expect(consumed).toEqual({ down: 1, move: 1, up: 1 })

  host.destroy()
})

test("uses Ghostty custom wheel hook to emit SGR scroll input when mouse tracking is active", () => {
  const surface = new FakeSurface()
  const term = new FakeTerminal()
  term.cols = 10
  term.rows = 5
  term.mouseTrackingEnabled = true

  const host = new GhosttyBrowserHost(term, new FakeFitAddon(), surface as unknown as HTMLElement, "dark", {
    matchMedia: () => new FakeMediaQueryList(true),
  })

  const events: string[] = []
  host.onData((data) => events.push(data))

  const handled = term.customWheelEventHandler?.({
    clientX: 25,
    clientY: 35,
    deltaX: 0,
    deltaY: 10,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent)

  expect(handled).toBe(true)
  expect(events).toEqual(["\x1b[<65;2;2M"])

  host.destroy()
  expect(term.customWheelEventHandler).toBeUndefined()
})
