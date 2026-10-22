import { EventEmitter } from "./events.js"

type Callback = (error?: Error | null) => void
type WriteFn = (chunk: any, encoding: string, callback: Callback) => void

// Synchronous streams for browser hosts. Writes complete before write() returns,
// so these never buffer or need drain.
export class Stream extends EventEmitter {
  destroyed = false

  destroy(error?: Error): this {
    if (this.destroyed) return this
    this.destroyed = true
    if (error) this.emit("error", error)
    this.emit("close")
    return this
  }
}

export interface WritableOptions {
  decodeStrings?: boolean
  write?: WriteFn
}

export class Writable extends Stream {
  writable = true
  writableEnded = false
  writableFinished = false
  readonly writableNeedDrain = false
  readonly writableLength = 0
  readonly writableCorked = 0
  errored: Error | null = null
  private readonly writeImpl?: WriteFn

  constructor(options: WritableOptions = {}) {
    super()
    this.writeImpl = options.write
  }

  _write(chunk: any, encoding: string, callback: Callback): void {
    if (this.writeImpl) this.writeImpl.call(this, chunk, encoding, callback)
    else callback()
  }

  write(chunk: any, encoding?: string | Callback, callback?: Callback): boolean {
    if (typeof encoding === "function") {
      callback = encoding
      encoding = undefined
    }
    if (!this.writable) {
      const error = new Error("write after end")
      callback?.(error)
      return false
    }
    this._write(chunk, encoding ?? "utf8", (error) => {
      if (error) {
        this.errored = error
        this.emit("error", error)
      }
      callback?.(error)
    })
    return true
  }

  cork(): void {}

  uncork(): void {}

  end(chunk?: any, encoding?: string | Callback, callback?: Callback): this {
    if (typeof chunk === "function") callback = chunk
    else if (chunk !== undefined && chunk !== null) this.write(chunk, encoding as string)
    if (typeof encoding === "function") callback = encoding
    this.writable = false
    this.writableEnded = true
    this.writableFinished = true
    this.emit("finish")
    callback?.()
    return this
  }

  override destroy(error?: Error): this {
    this.writable = false
    return super.destroy(error)
  }
}

export class Readable extends Stream {
  readable = true
  private readonly queue: any[] = []
  private flowing = false

  get readableLength(): number {
    return this.queue.reduce((total, chunk) => total + (chunk?.length ?? 0), 0)
  }

  _read(_size?: number): void {}

  push(chunk: any): boolean {
    if (chunk === null) {
      this.readable = false
      this.emit("end")
      return false
    }
    if (this.flowing) this.emit("data", chunk)
    else this.queue.push(chunk)
    return true
  }

  read(_size?: number): any {
    return this.queue.length > 0 ? this.queue.shift() : null
  }

  resume(): this {
    this.flowing = true
    while (this.flowing && this.queue.length > 0) this.emit("data", this.queue.shift())
    return this
  }

  pause(): this {
    this.flowing = false
    return this
  }

  isPaused(): boolean {
    return !this.flowing
  }

  setEncoding(_encoding: string): this {
    return this
  }
}

export class PassThrough extends Writable {}

export default { PassThrough, Readable, Stream, Writable }
