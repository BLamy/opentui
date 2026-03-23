export type Pointer = number

type PointerInput = ArrayBuffer | ArrayBufferView | null | undefined
const FFI_RUNTIME_GLOBAL_KEY = "__OPENTUI_FFI_RUNTIME__"

interface FfiRuntime {
  ptr: (value: PointerInput) => Pointer | null
  toArrayBuffer: (pointer: Pointer, byteOffset?: number, byteLength?: number) => ArrayBuffer
}

let activeRuntime: FfiRuntime | null = null

export function setFfiRuntime(runtime: FfiRuntime): void {
  activeRuntime = runtime
  Object.defineProperty(globalThis, FFI_RUNTIME_GLOBAL_KEY, {
    value: runtime,
    writable: true,
    configurable: true,
  })
}

function getFfiRuntime(): FfiRuntime {
  if (!activeRuntime) {
    throw new Error("OpenTUI FFI runtime has not been initialized")
  }

  return activeRuntime
}

export function ptr(value: PointerInput): Pointer | null {
  if (value == null) {
    return null
  }

  return getFfiRuntime().ptr(value)
}

export function toArrayBuffer(pointer: Pointer, byteOffset: number = 0, byteLength?: number): ArrayBuffer {
  return getFfiRuntime().toArrayBuffer(pointer, byteOffset, byteLength)
}

export function getGlobalFfiRuntime(): FfiRuntime | null {
  return (globalThis as Record<string, unknown>)[FFI_RUNTIME_GLOBAL_KEY] as FfiRuntime | null
}
