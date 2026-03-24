import { scheduleNextMicrotask } from "../../../core/src/lib/schedule.js"

type BrowserProcessListener = (...args: unknown[]) => void

export interface BrowserProcessLike extends Record<string, unknown> {
  env: Record<string, string | boolean | number>
  cwd: () => string
  exit: (code?: number) => never
  nextTick: typeof scheduleNextMicrotask
  on: (event: string, listener: BrowserProcessListener) => BrowserProcessLike
  off: (event: string, listener: BrowserProcessListener) => BrowserProcessLike
  addListener: (event: string, listener: BrowserProcessListener) => BrowserProcessLike
  removeListener: (event: string, listener: BrowserProcessListener) => BrowserProcessLike
  once: (event: string, listener: BrowserProcessListener) => BrowserProcessLike
}

const DEFAULT_EXIT_ERROR = "process.exit() is not available in the browser preview runtime."

function createNoopEmitterMethod(
  processLike: BrowserProcessLike,
): (event: string, listener: BrowserProcessListener) => BrowserProcessLike {
  return (_event: string, _listener: BrowserProcessListener) => processLike
}

export function ensureBrowserProcessShim(): BrowserProcessLike {
  const globalScope = globalThis as typeof globalThis & { process?: unknown }
  const processLike =
    globalScope.process && typeof globalScope.process === "object"
      ? (globalScope.process as BrowserProcessLike)
      : ({} as BrowserProcessLike)

  if (!processLike.env || typeof processLike.env !== "object") {
    processLike.env = {}
  }

  if (typeof processLike.cwd !== "function") {
    processLike.cwd = () => "/"
  }

  if (typeof processLike.exit !== "function") {
    processLike.exit = () => {
      throw new Error(DEFAULT_EXIT_ERROR)
    }
  }

  if (typeof processLike.nextTick !== "function") {
    processLike.nextTick = scheduleNextMicrotask
  }

  if (typeof processLike.on !== "function") {
    processLike.on = createNoopEmitterMethod(processLike)
  }

  if (typeof processLike.off !== "function") {
    processLike.off = createNoopEmitterMethod(processLike)
  }

  if (typeof processLike.addListener !== "function") {
    processLike.addListener = processLike.on
  }

  if (typeof processLike.removeListener !== "function") {
    processLike.removeListener = processLike.off
  }

  if (typeof processLike.once !== "function") {
    processLike.once = processLike.on
  }

  globalScope.process = processLike
  return processLike
}
