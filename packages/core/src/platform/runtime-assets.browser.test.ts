import { expect, test } from "bun:test"
import {
  resolveDefaultParserAsset,
  resolveDefaultTreeSitterWorkerPath,
  resolveTreeSitterWasm,
  setBrowserRuntimeAssets,
  setDefaultBrowserRuntimeAssets,
} from "./runtime-assets.browser.js"

test("browser runtime assets keep explicit URLs over defaults", async () => {
  const fallback = new URL("https://example.test/chunks/parser.worker.js")
  expect(resolveDefaultTreeSitterWorkerPath(fallback)).toBe(fallback.href)
  await expect(resolveTreeSitterWasm()).rejects.toThrow("setBrowserRuntimeAssets")

  setBrowserRuntimeAssets({ treeSitterWorker: "https://cdn.test/worker.js" })
  setDefaultBrowserRuntimeAssets({
    treeSitterWorker: "https://pkg.test/parser.worker.browser.js",
    treeSitterWasm: "https://pkg.test/tree-sitter.wasm",
    treeSitterAssetBase: "https://pkg.test/",
  })

  expect(resolveDefaultTreeSitterWorkerPath(fallback)).toBe("https://cdn.test/worker.js")
  expect(await resolveTreeSitterWasm()).toBe("https://pkg.test/tree-sitter.wasm")
  expect(await resolveDefaultParserAsset("assets/zig/tree-sitter-zig.wasm", fallback)).toBe(
    "https://pkg.test/assets/zig/tree-sitter-zig.wasm",
  )
})
