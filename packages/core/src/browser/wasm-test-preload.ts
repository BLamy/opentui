import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { installOpenTUIWasm } from "./wasm.js"

// Runs the core test suite against the wasm build: bun test --preload ./src/browser/wasm-test-preload.ts
const wasmPath = fileURLToPath(new URL("../../../native/lib/wasm32-wasi/opentui.wasm", import.meta.url))
await installOpenTUIWasm({ source: readFileSync(wasmPath), onWrite: (_fd, bytes) => process.stderr.write(bytes) })
