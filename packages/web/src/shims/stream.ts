import { EventEmitter } from "./events"

export class Stream extends EventEmitter {}

export class Readable extends Stream {
  constructor(_options?: unknown) {
    super()
  }
}

export class Writable extends Stream {
  constructor(_options?: unknown) {
    super()
  }

  public _write(_chunk: unknown, _encoding?: string, callback?: (error?: Error | null) => void): void {
    callback?.()
  }

  public write(chunk: unknown, encoding?: string, callback?: (error?: Error | null) => void): boolean {
    this._write(chunk, encoding, callback)
    return true
  }
}

export class PassThrough extends Writable {
  public write(_chunk: unknown): boolean {
    return true
  }
}

const stream = {
  PassThrough,
  Readable,
  Stream,
  Writable,
}

export default stream
