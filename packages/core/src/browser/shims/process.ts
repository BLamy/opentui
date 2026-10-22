import { Buffer } from "./buffer.js"
import { EventEmitter } from "./events.js"

class ProcessStream extends EventEmitter {
  isTTY = false
  columns = 80
  rows = 24
  fd = -1

  write(_value: unknown, callback?: () => void): boolean {
    callback?.()
    return true
  }

  setRawMode(_value: boolean): this {
    return this
  }

  resume(): this {
    return this
  }

  pause(): this {
    return this
  }
}

class BrowserProcess extends EventEmitter {
  readonly env: Record<string, string | undefined> = {}
  readonly platform = "browser"
  readonly arch = "wasm32"
  readonly argv: string[] = []
  readonly versions: Record<string, string> = {}
  readonly pid = 0
  readonly stdout = new ProcessStream()
  readonly stderr = new ProcessStream()
  readonly stdin = new ProcessStream()
  exitCode: number | undefined

  cwd(): string {
    return "/"
  }

  nextTick(callback: (...args: any[]) => void, ...args: any[]): void {
    queueMicrotask(() => callback(...args))
  }

  memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number } {
    return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }
  }

  hrtime = Object.assign(
    (previous?: [number, number]): [number, number] => {
      const now = performance.now()
      const seconds = Math.floor(now / 1000)
      const nanoseconds = Math.floor((now % 1000) * 1e6)
      if (!previous) return [seconds, nanoseconds]
      return [seconds - previous[0], nanoseconds - previous[1]]
    },
    { bigint: (): bigint => BigInt(Math.round(performance.now() * 1e6)) },
  )

  exit(code?: number): never {
    this.exitCode = code
    throw new Error(`process.exit(${code ?? 0}) is not supported in the browser`)
  }

  kill(): boolean {
    return false
  }
}

const browserProcess = new BrowserProcess()

// setImmediate runs callbacks as macrotasks, after pending I/O and microtasks.
function createImmediateQueue() {
  const callbacks = new Map<number, () => void>()
  const channel = new MessageChannel()
  let nextId = 1
  channel.port1.onmessage = (event: MessageEvent<number>) => {
    const callback = callbacks.get(event.data)
    callbacks.delete(event.data)
    callback?.()
  }
  return {
    setImmediate(callback: (...args: any[]) => void, ...args: any[]): number {
      const id = nextId++
      callbacks.set(id, () => callback(...args))
      channel.port2.postMessage(id)
      return id
    },
    clearImmediate(id: number): void {
      callbacks.delete(id)
    },
  }
}

function defineGlobal(name: string, value: unknown): void {
  if (typeof (globalThis as Record<string, unknown>)[name] === "undefined") {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
}

// Core reads `global`, `process`, `Buffer` and `setImmediate` as globals; install them when the page has none.
export function installNodeGlobals(): void {
  defineGlobal("global", globalThis)
  defineGlobal("process", browserProcess)
  defineGlobal("Buffer", Buffer)
  if (typeof (globalThis as Record<string, unknown>).setImmediate === "undefined") {
    const queue = createImmediateQueue()
    defineGlobal("setImmediate", queue.setImmediate)
    defineGlobal("clearImmediate", queue.clearImmediate)
  }
}

export const env = browserProcess.env
export const nextTick = browserProcess.nextTick.bind(browserProcess)
export default browserProcess
