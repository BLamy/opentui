import { WASM_FFI_GLOBAL_KEY, type WasmFfiHost } from "../platform/ffi-wasm.js"

export interface OpenTUIWasmOptions {
  // The compiled opentui.wasm, as a URL, a fetch Response, raw bytes, or a compiled module.
  source: string | URL | Response | BufferSource | WebAssembly.Module
  // Receives bytes native code writes to stdout/stderr through WASI.
  onWrite?: (fd: number, bytes: Uint8Array) => void
}

const WASI_ESUCCESS = 0
const WASI_EBADF = 8
const WASI_ENOSYS = 52
const WASI_FILETYPE_CHARACTER_DEVICE = 2
const MA_ERROR = -1

class WasiExit extends Error {
  constructor(readonly code: number) {
    super(`OpenTUI wasm exited with code ${code}`)
  }
}

async function compile(source: OpenTUIWasmOptions["source"]): Promise<WebAssembly.Module> {
  if (source instanceof WebAssembly.Module) return source
  const response = typeof source === "string" || source instanceof URL ? await fetch(source) : source
  if (response instanceof Response) {
    if (!response.ok) throw new Error(`Failed to load OpenTUI wasm: ${response.status} ${response.statusText}`)
    return WebAssembly.compile(await response.arrayBuffer())
  }
  return WebAssembly.compile(response)
}

function createImports(module: WebAssembly.Module, getMemory: () => WebAssembly.Memory, options: OpenTUIWasmOptions) {
  const view = () => new DataView(getMemory().buffer)
  const origin = Date.now() - performance.now()

  const wasi: Record<string, (...args: any[]) => number | void> = {
    clock_res_get(_id: number, out: number) {
      view().setBigUint64(out, 1000n, true)
      return WASI_ESUCCESS
    },
    clock_time_get(id: number, _precision: bigint, out: number) {
      const ms = id === 0 ? origin + performance.now() : performance.now()
      view().setBigUint64(out, BigInt(Math.round(ms * 1_000_000)), true)
      return WASI_ESUCCESS
    },
    random_get(pointer: number, length: number) {
      const bytes = new Uint8Array(getMemory().buffer, pointer, length)
      for (let offset = 0; offset < length; offset += 65536) {
        crypto.getRandomValues(bytes.subarray(offset, offset + 65536))
      }
      return WASI_ESUCCESS
    },
    fd_write(fd: number, iovs: number, iovsLength: number, written: number) {
      if (fd !== 1 && fd !== 2) return WASI_EBADF
      const data = view()
      let total = 0
      for (let index = 0; index < iovsLength; index++) {
        const pointer = data.getUint32(iovs + index * 8, true)
        const length = data.getUint32(iovs + index * 8 + 4, true)
        if (length > 0) options.onWrite?.(fd, new Uint8Array(getMemory().buffer, pointer, length).slice())
        total += length
      }
      data.setUint32(written, total, true)
      return WASI_ESUCCESS
    },
    fd_fdstat_get(fd: number, out: number) {
      if (fd > 2) return WASI_EBADF
      const data = view()
      data.setUint8(out, WASI_FILETYPE_CHARACTER_DEVICE)
      data.setUint16(out + 2, 0, true)
      data.setBigUint64(out + 8, 0n, true)
      data.setBigUint64(out + 16, 0n, true)
      return WASI_ESUCCESS
    },
    fd_prestat_get() {
      return WASI_EBADF
    },
    fd_close() {
      return WASI_ESUCCESS
    },
    proc_exit(code: number) {
      throw new WasiExit(code)
    },
  }

  const imports: Record<string, Record<string, (...args: any[]) => number | void>> = {}
  for (const entry of WebAssembly.Module.imports(module)) {
    if (entry.kind !== "function") continue
    const namespace = (imports[entry.module] ??= {})
    if (entry.module === "wasi_snapshot_preview1") {
      namespace[entry.name] = wasi[entry.name] ?? (() => WASI_ENOSYS)
    } else {
      // Audio device I/O is compiled out of the wasm build; miniaudio calls fail.
      namespace[entry.name] = () => MA_ERROR
    }
  }
  return imports
}

export async function instantiateOpenTUIWasm(options: OpenTUIWasmOptions): Promise<WasmFfiHost> {
  const module = await compile(options.source)
  let memory: WebAssembly.Memory | undefined
  const imports = createImports(module, () => memory!, options)
  const instance = await WebAssembly.instantiate(module, imports)
  memory = instance.exports.memory as WebAssembly.Memory
  const initialize = instance.exports._initialize as (() => void) | undefined
  initialize?.()
  return { instance }
}

// Must run before any module that imports the native bindings is evaluated.
export async function installOpenTUIWasm(options: OpenTUIWasmOptions): Promise<WasmFfiHost> {
  const existing = (globalThis as Record<string, unknown>)[WASM_FFI_GLOBAL_KEY] as WasmFfiHost | undefined
  if (existing) return existing
  const host = await instantiateOpenTUIWasm(options)
  Object.defineProperty(globalThis, WASM_FFI_GLOBAL_KEY, { value: host, configurable: true })
  return host
}
