import { ptr as runtimePtr, toArrayBuffer as runtimeToArrayBuffer, type Pointer } from "../../../core/src/lib/ffi-runtime.ts"

type PointerInput = ArrayBuffer | ArrayBufferView | null | undefined

export { type Pointer }

export function ptr(value: PointerInput): Pointer | null {
  return runtimePtr(value)
}

export function toArrayBuffer(pointer: Pointer, byteOffset: number = 0, byteLength?: number): ArrayBuffer {
  return runtimeToArrayBuffer(pointer, byteOffset, byteLength)
}

export function dlopen(): never {
  throw new Error("bun:ffi.dlopen is not available in browser builds")
}

export class JSCallback {
  constructor() {
    throw new Error("bun:ffi.JSCallback is not available in browser builds")
  }
}

export const suffix = ""
export const FFIType = {}
