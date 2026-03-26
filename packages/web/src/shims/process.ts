import { EventEmitter } from "./events"

class ProcessStream extends EventEmitter {
  public isTTY = true
  public columns = 80
  public rows = 24

  public write(_value: string): boolean {
    return true
  }

  public setRawMode(_value: boolean): this {
    return this
  }
}

const emitter = new EventEmitter()
const stdout = new ProcessStream()
const stderr = new ProcessStream()
const stdin = new ProcessStream()

export const env: Record<string, string> = {}
export const platform = "browser"
export const arch = "x64"
export const stdoutStream = stdout
export const stderrStream = stderr
export const stdinStream = stdin

export function cwd(): string {
  return "/"
}

export function on(event: string | symbol, listener: (...args: any[]) => void): typeof processShim {
  emitter.on(event, listener)
  return processShim
}

export function off(event: string | symbol, listener: (...args: any[]) => void): typeof processShim {
  emitter.off(event, listener)
  return processShim
}

export function emit(event: string | symbol, ...args: any[]): boolean {
  return emitter.emit(event, ...args)
}

const processShim = {
  env,
  platform,
  arch,
  stdout,
  stderr,
  stdin,
  cwd,
  on,
  off,
  emit,
}

export default processShim
