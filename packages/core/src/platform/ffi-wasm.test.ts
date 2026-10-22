import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { instantiateOpenTUIWasm } from "../browser/wasm.js"
import { WASM_CALLBACK_SLOTS_EXHAUSTED, WASM_PTR_VALUE, createWasmBackend } from "./ffi-wasm.js"

const wasmPath = fileURLToPath(new URL("../../../native/lib/wasm32-wasi/opentui.wasm", import.meta.url))

describe.skipIf(!existsSync(wasmPath))("wasm FFI backend", () => {
  const load = async () => createWasmBackend(await instantiateOpenTUIWasm({ source: readFileSync(wasmPath) }))

  test("copies view arguments into linear memory and back after the call", async () => {
    const backend = await load()
    const library = backend.dlopen("opentui.wasm", { getBuildOptions: { args: ["ptr"], returns: "void" } })
    const options = new Uint8Array([0xff, 0xff])
    library.symbols.getBuildOptions(options)
    expect([...options]).toEqual([0, 0])
  })

  test("returns 64-bit integers as bigint", async () => {
    const backend = await load()
    const library = backend.dlopen("opentui.wasm", { getArenaAllocatedBytes: { args: [], returns: "u64" } })
    expect(typeof library.symbols.getArenaAllocatedBytes()).toBe("bigint")
  })

  test("installs callbacks in reserved function table slots", async () => {
    const host = await instantiateOpenTUIWasm({ source: readFileSync(wasmPath) })
    const library = createWasmBackend(host).dlopen("opentui.wasm", {})
    const calls: unknown[][] = []
    const callback = library.createCallback((...args: unknown[]) => calls.push(args), {
      args: ["u64", "u32", "f32", "ptr"],
      returns: "void",
    })
    const table = host.instance.exports.__indirect_function_table as WebAssembly.Table
    table.get(callback.ptr!)(5n, -1, 1.5, 64)
    expect(calls).toEqual([[5n, 0xffff_ffff, 1.5, 64]])
    callback.close()
    expect(callback.ptr).toBeNull()
  })

  test("reuses closed callback slots and reports exhaustion", async () => {
    const backend = await load()
    const library = backend.dlopen("opentui.wasm", {})
    const definition = { args: [], returns: "void" }
    const first = library.createCallback(() => {}, definition)
    const slot = first.ptr
    first.close()
    const reused = library.createCallback(() => {}, definition)
    expect(reused.ptr).toBe(slot)
    const open = [reused]
    expect(() => {
      for (;;) open.push(library.createCallback(() => {}, definition))
    }).toThrow(WASM_CALLBACK_SLOTS_EXHAUSTED)
    for (const callback of open) callback.close()
  })

  test("ptr() only accepts views of wasm memory", async () => {
    const backend = await load()
    expect(() => backend.ptr(new Uint8Array(4))).toThrow(WASM_PTR_VALUE)
    expect(backend.ptr(new Uint8Array(backend.memory.buffer, 64, 4))).toBe(64)
  })
})
