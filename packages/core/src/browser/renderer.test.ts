import { afterEach, describe, expect, test } from "bun:test"
import { BoxRenderable } from "../renderables/Box.js"
import { TextRenderable } from "../renderables/Text.js"
import type { CliRenderer } from "../renderer.js"
import { createBrowserRenderer, type BrowserTerminalHost } from "./renderer.js"

class FakeHost implements BrowserTerminalHost {
  output = ""
  title = ""
  copied: string[] = []
  private dataHandlers = new Set<(data: string) => void>()
  private resizeHandlers = new Set<(size: { cols: number; rows: number }) => void>()

  constructor(private size = { cols: 40, rows: 10 }) {}

  getSize() {
    return this.size
  }

  write(data: string) {
    this.output += data
  }

  onData(handler: (data: string) => void) {
    this.dataHandlers.add(handler)
    return () => this.dataHandlers.delete(handler)
  }

  onResize(handler: (size: { cols: number; rows: number }) => void) {
    this.resizeHandlers.add(handler)
    return () => this.resizeHandlers.delete(handler)
  }

  setTitle(title: string) {
    this.title = title
  }

  copy(text: string) {
    this.copied.push(text)
  }

  type(data: string) {
    for (const handler of this.dataHandlers) handler(data)
  }

  resize(cols: number, rows: number) {
    this.size = { cols, rows }
    for (const handler of this.resizeHandlers) handler(this.size)
  }

  get listenerCount() {
    return this.dataHandlers.size + this.resizeHandlers.size
  }
}

describe("createBrowserRenderer", () => {
  let renderer: CliRenderer | undefined

  afterEach(() => {
    renderer?.destroy()
    renderer = undefined
  })

  test("writes rendered frames to the host terminal", async () => {
    const host = new FakeHost()
    renderer = await createBrowserRenderer(host)
    const box = new BoxRenderable(renderer, { border: true, width: 20, height: 3 })
    box.add(new TextRenderable(renderer, { content: "browser frame" }))
    renderer.root.add(box)
    await renderer.idle()
    renderer.requestRender()
    await renderer.idle()
    expect(host.output).toContain("browser frame")
  })

  test("delivers host input as key events", async () => {
    const host = new FakeHost()
    renderer = await createBrowserRenderer(host)
    const keys: string[] = []
    renderer.keyInput.on("keypress", (key) => keys.push(key.name))
    host.type("a")
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(keys).toContain("a")
  })

  test("follows host resizes and routes title and clipboard to the host", async () => {
    const host = new FakeHost()
    renderer = await createBrowserRenderer(host)
    host.resize(50, 12)
    expect(renderer.width).toBe(50)
    expect(renderer.height).toBe(12)
    renderer.setTerminalTitle("demo")
    expect(host.title).toBe("demo")
    expect(renderer.copyToClipboardOSC52("copied")).toBe(true)
    expect(host.copied).toEqual(["copied"])
  })

  test("detaches from the host on destroy", async () => {
    const host = new FakeHost()
    renderer = await createBrowserRenderer(host)
    expect(host.listenerCount).toBe(2)
    renderer.destroy()
    renderer = undefined
    expect(host.listenerCount).toBe(0)
  })
})
