import { format } from "./util.js"

interface ConsoleStream {
  write?(value: string): unknown
}

export class Console {
  private readonly stdout?: ConsoleStream
  private readonly stderr?: ConsoleStream

  constructor(options: { stdout?: ConsoleStream; stderr?: ConsoleStream; write?: never } | ConsoleStream = {}) {
    if (typeof options.write === "function") {
      this.stdout = options
      this.stderr = options
    } else {
      const streams = options as { stdout?: ConsoleStream; stderr?: ConsoleStream }
      this.stdout = streams.stdout
      this.stderr = streams.stderr ?? streams.stdout
    }
  }

  log(...args: unknown[]): void {
    this.stdout?.write?.(format(...args) + "\n")
  }

  info(...args: unknown[]): void {
    this.log(...args)
  }

  debug(...args: unknown[]): void {
    this.log(...args)
  }

  warn(...args: unknown[]): void {
    this.stderr?.write?.(format(...args) + "\n")
  }

  error(...args: unknown[]): void {
    this.warn(...args)
  }

  trace(...args: unknown[]): void {
    this.warn(...args)
  }
}

export default { Console }
