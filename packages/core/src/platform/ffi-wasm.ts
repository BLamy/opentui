// WebAssembly backend for the FFI surface in ffi.ts. Native code runs in a
// wasm32 instance, so JS views cannot be passed by address. Views are copied
// into linear memory for the duration of a call and copied back afterwards;
// every pointer policy in the native ABI borrows views only for the call.

export const WASM_FFI_GLOBAL_KEY = "__OPENTUI_WASM_FFI__"

export interface WasmFfiHost {
  instance: WebAssembly.Instance
}

interface WasmExports {
  memory: WebAssembly.Memory
  __indirect_function_table: WebAssembly.Table
  ot_wasm_alloc(len: number): number
  ot_wasm_free(ptr: number, len: number): void
  ot_wasm_callback_slots(out: number, capacity: number): number
  [name: string]: unknown
}

interface WasmFunctionDefinition {
  readonly args?: readonly string[]
  readonly returns?: string
}

interface WasmCallbackInstance {
  readonly ptr: number | null
  readonly threadsafe: boolean
  close(): void
}

export interface WasmFfiBackend {
  dlopen(
    path: string | URL,
    symbols: Record<string, WasmFunctionDefinition>,
  ): {
    symbols: Record<string, (...args: any[]) => any>
    createCallback(callback: (...args: any[]) => any, definition: WasmFunctionDefinition): WasmCallbackInstance
    close(): void
  }
  ptr(value: ArrayBufferLike | ArrayBufferView): number
  suffix: string
  toArrayBuffer(pointer: number, offset: number | undefined, length: number): ArrayBuffer
  memory: WebAssembly.Memory
}

export const WASM_PTR_VALUE = "wasm ptr() only supports views of the OpenTUI wasm memory"
export const WASM_SCRATCH_EXHAUSTED = "OpenTUI wasm scratch allocation failed"
export const WASM_CALLBACK_SLOTS_EXHAUSTED = "OpenTUI wasm callback slots are exhausted"

const KIND_NUMBER = 0
const KIND_U32 = 1
const KIND_BIGINT = 2
const KIND_U64 = 3
const KIND_BOOL = 4
const KIND_POINTER = 5
const KIND_VOID = 6

function toKind(type: string | undefined): number {
  switch (type) {
    case undefined:
    case "void":
      return KIND_VOID
    case "u32":
    case "uint32_t":
      return KIND_U32
    case "i64":
    case "int64_t":
      return KIND_BIGINT
    case "u64":
    case "uint64_t":
      return KIND_U64
    case "bool":
      return KIND_BOOL
    case "ptr":
    case "pointer":
    case "buffer":
    case "cstring":
    case "function":
    case "callback":
      return KIND_POINTER
    case "napi_env":
    case "napi_value":
      throw new Error(`Unsupported FFIType for wasm: ${type}`)
    default:
      return KIND_NUMBER
  }
}

function toValType(type: string | undefined): number | null {
  switch (toKind(type)) {
    case KIND_VOID:
      return null
    case KIND_BIGINT:
    case KIND_U64:
      return 0x7e
    default:
      if (type === "f32" || type === "float") return 0x7d
      if (type === "f64" || type === "double") return 0x7c
      return 0x7f
  }
}

const SCRATCH_INITIAL_BYTES = 64 * 1024
const SCRATCH_ALIGN = 16

interface PendingCopy {
  view: Uint8Array
  address: number
}

export function createWasmBackend(host: WasmFfiHost): WasmFfiBackend {
  const exports = host.instance.exports as unknown as WasmExports
  const memory = exports.memory
  const table = exports.__indirect_function_table

  let scratchBase = 0
  let scratchSize = 0
  let scratchTop = 0
  const oversized: Array<{ address: number; length: number }> = []
  const copies: PendingCopy[] = []

  function ensureScratch(): void {
    if (scratchSize > 0) return
    scratchBase = exports.ot_wasm_alloc(SCRATCH_INITIAL_BYTES)
    if (!scratchBase) throw new Error(WASM_SCRATCH_EXHAUSTED)
    scratchSize = SCRATCH_INITIAL_BYTES
  }

  function allocScratch(length: number): number {
    ensureScratch()
    const start = (scratchTop + SCRATCH_ALIGN - 1) & ~(SCRATCH_ALIGN - 1)
    if (start + length <= scratchSize) {
      scratchTop = start + length
      return scratchBase + start
    }
    const address = exports.ot_wasm_alloc(length)
    if (!address) throw new Error(WASM_SCRATCH_EXHAUSTED)
    oversized.push({ address, length })
    return address
  }

  function toBytes(value: ArrayBufferLike | ArrayBufferView): Uint8Array {
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return new Uint8Array(value)
  }

  function toAddress(value: unknown): number {
    if (value == null) return 0
    if (typeof value === "number") return value
    if (typeof value === "bigint") return Number(value)
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
      const bytes = toBytes(value as ArrayBufferView)
      if (bytes.buffer === memory.buffer) return bytes.byteOffset
      if (bytes.byteLength === 0) return 0
      const address = allocScratch(bytes.byteLength)
      new Uint8Array(memory.buffer, address, bytes.byteLength).set(bytes)
      copies.push({ view: bytes, address })
      return address
    }
    if (typeof value === "object" && value !== null && "ptr" in value) return toAddress((value as { ptr: unknown }).ptr)
    throw new TypeError("wasm FFI pointer arguments must be a pointer, ArrayBuffer, or ArrayBufferView")
  }

  function toArgument(value: unknown, kind: number): unknown {
    switch (kind) {
      case KIND_POINTER:
        return toAddress(value)
      case KIND_BIGINT:
      case KIND_U64:
        return typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value ?? 0)))
      case KIND_BOOL:
        return value ? 1 : 0
      default:
        return value
    }
  }

  function fromResult(value: unknown, kind: number): unknown {
    switch (kind) {
      case KIND_U32:
        return (value as number) >>> 0
      case KIND_U64:
        return BigInt.asUintN(64, value as bigint)
      case KIND_BOOL:
        return value !== 0
      case KIND_POINTER:
        return (value as number) >>> 0 || null
      case KIND_VOID:
        return undefined
      default:
        return value
    }
  }

  function wrapSymbol(name: string, definition: WasmFunctionDefinition): (...args: any[]) => any {
    const fn = exports[name]
    if (typeof fn !== "function") throw new Error(`OpenTUI wasm module does not export ${name}`)
    const kinds = (definition.args ?? []).map(toKind)
    const resultKind = toKind(definition.returns)
    const native = fn as (...args: unknown[]) => unknown

    return (...args: unknown[]) => {
      const savedTop = scratchTop
      const savedCopies = copies.length
      const savedOversized = oversized.length
      try {
        const converted = new Array(kinds.length)
        for (let index = 0; index < kinds.length; index++) {
          converted[index] = toArgument(args[index], kinds[index]!)
        }
        return fromResult(native(...converted), resultKind)
      } finally {
        if (copies.length > savedCopies) {
          const source = memory.buffer
          for (let index = savedCopies; index < copies.length; index++) {
            const copy = copies[index]!
            copy.view.set(new Uint8Array(source, copy.address, copy.view.byteLength))
          }
          copies.length = savedCopies
        }
        while (oversized.length > savedOversized) {
          const block = oversized.pop()!
          exports.ot_wasm_free(block.address, block.length)
        }
        scratchTop = savedTop
      }
    }
  }

  const trampolineModules = new Map<string, WebAssembly.Module>()

  function trampolineModule(definition: WasmFunctionDefinition): WebAssembly.Module {
    const params = (definition.args ?? []).map((type) => toValType(type) ?? 0x7f)
    const result = toValType(definition.returns)
    const key = `${params.join(",")}:${result ?? ""}`
    let module = trampolineModules.get(key)
    if (!module) {
      module = new WebAssembly.Module(encodeTrampoline(params, result))
      trampolineModules.set(key, module)
    }
    return module
  }

  let freeSlots: number[] | null = null

  // The native module reserves table slots for callbacks because its table cannot grow.
  function takeSlot(): number {
    if (!freeSlots) {
      const capacity = 256
      const address = exports.ot_wasm_alloc(capacity * 4)
      if (!address) throw new Error(WASM_SCRATCH_EXHAUSTED)
      const count = exports.ot_wasm_callback_slots(address, capacity)
      freeSlots = Array.from(new Uint32Array(memory.buffer, address, count)).reverse()
      exports.ot_wasm_free(address, capacity * 4)
    }
    const slot = freeSlots.pop()
    if (slot === undefined) throw new Error(WASM_CALLBACK_SLOTS_EXHAUSTED)
    return slot
  }

  function createCallback(callback: (...args: any[]) => any, definition: WasmFunctionDefinition): WasmCallbackInstance {
    const kinds = (definition.args ?? []).map(toKind)
    const resultKind = toKind(definition.returns)
    const adapted = (...args: unknown[]) => {
      for (let index = 0; index < kinds.length; index++) {
        const kind = kinds[index]!
        if (kind === KIND_POINTER) args[index] = (args[index] as number) >>> 0
        else if (kind === KIND_U32) args[index] = (args[index] as number) >>> 0
        else if (kind === KIND_U64) args[index] = BigInt.asUintN(64, args[index] as bigint)
        else if (kind === KIND_BOOL) args[index] = args[index] !== 0
      }
      const value = callback(...args)
      if (resultKind === KIND_VOID) return undefined
      return toArgument(value, resultKind)
    }
    const instance = new WebAssembly.Instance(trampolineModule(definition), { e: { f: adapted } })
    const slot = takeSlot()
    table.set(slot, instance.exports.f as Function)
    let ptr: number | null = slot
    return {
      get ptr() {
        return ptr
      },
      threadsafe: false,
      close() {
        if (ptr === null) return
        freeSlots!.push(ptr)
        ptr = null
      },
    }
  }

  return {
    dlopen(_path, symbols) {
      const wrapped: Record<string, (...args: any[]) => any> = {}
      for (const [name, definition] of Object.entries(symbols)) {
        wrapped[name] = wrapSymbol(name, definition)
      }
      return {
        symbols: wrapped,
        createCallback,
        close() {},
      }
    },
    ptr(value) {
      const bytes = toBytes(value)
      if (bytes.buffer !== memory.buffer) throw new TypeError(WASM_PTR_VALUE)
      return bytes.byteOffset
    },
    suffix: "wasm",
    toArrayBuffer(pointer, offset, length) {
      const start = Number(pointer) + (offset ?? 0)
      return memory.buffer.slice(start, start + length) as ArrayBuffer
    },
    memory,
  }
}

function uleb(value: number): number[] {
  const bytes: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return bytes
}

function section(id: number, body: number[]): number[] {
  return [id, ...uleb(body.length), ...body]
}

function name(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)]
  return [...uleb(bytes.length), ...bytes]
}

// A module that imports a JS function with the given signature and re-exports
// it, so the export can be stored in the native module's function table.
function encodeTrampoline(params: number[], result: number | null): Uint8Array<ArrayBuffer> {
  const type = [0x01, 0x60, ...uleb(params.length), ...params, ...(result === null ? [0x00] : [0x01, result])]
  const imports = [0x01, ...name("e"), ...name("f"), 0x00, 0x00]
  const exports = [0x01, ...name("f"), 0x00, 0x00]
  return new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...section(1, type),
    ...section(2, imports),
    ...section(7, exports),
  ])
}
