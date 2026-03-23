import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

import { build } from "esbuild"

import astroConfig from "../astro.config.mjs"

test("docs content collection is defined", () => {
  const contentConfig = readFileSync(path.resolve(import.meta.dir, "../src/content.config.ts"), "utf8")

  expect(contentConfig).toContain('defineCollection({')
  expect(contentConfig).toContain("const docs =")
  expect(contentConfig).toContain("export const collections =")
})

test("docs optimizer target can bundle yoga-layout", async () => {
  const target = astroConfig.vite?.optimizeDeps?.esbuildOptions?.target

  expect(target).toBe("es2022")
  expect(astroConfig.vite?.build?.target).toBe("es2022")

  const result = await build({
    absWorkingDir: path.resolve(import.meta.dir, ".."),
    bundle: true,
    format: "esm",
    platform: "browser",
    stdin: {
      contents: 'import Yoga from "yoga-layout"\nconsole.log(Boolean(Yoga))\n',
      resolveDir: path.resolve(import.meta.dir, ".."),
      sourcefile: "yoga-entry.ts",
    },
    target,
    write: false,
  })

  expect(result.outputFiles.length).toBeGreaterThan(0)
})

test("browser build aliases bun ffi for wasm-backed previews and prebundles interactive deps", () => {
  const alias = astroConfig.vite?.resolve?.alias
  const aliasEntries = Array.isArray(alias) ? alias : []
  const bunFfiAlias = aliasEntries.find((entry) => String(entry.find) === "/^bun:ffi$/")?.replacement
  const fsPromisesAlias = aliasEntries.find((entry) => String(entry.find) === "/^fs\\/promises$/")?.replacement
  const workerThreadsAlias = aliasEntries.find((entry) => String(entry.find) === "/^worker_threads$/")?.replacement
  const optimizeDepsInclude = astroConfig.vite?.optimizeDeps?.include ?? []

  expect(String(bunFfiAlias)).toContain("/packages/web/src/shims/bun-ffi.ts")
  expect(String(fsPromisesAlias)).toContain("/packages/web/src/shims/fs-promises.ts")
  expect(String(workerThreadsAlias)).toContain("/packages/web/src/shims/worker-threads.ts")
  expect(astroConfig.vite?.define?.["process.arch"]).toBe(JSON.stringify("x64"))
  expect(optimizeDepsInclude).toEqual(expect.arrayContaining(["@xterm/addon-fit", "@xterm/xterm", "monaco-editor", "typescript"]))
})

test("markdown remark plugin annotates ts example fences as opt-in docs examples", () => {
  const [annotateDocExampleFences] = astroConfig.markdown?.remarkPlugins ?? []

  expect(typeof annotateDocExampleFences).toBe("function")

  const tree = {
    type: "root",
    children: [
      { type: "code", lang: "ts", meta: "example", value: "const x = 1" },
      { type: "code", lang: "typescript", value: "const y = 1" },
    ],
  }

  annotateDocExampleFences?.()(tree)

  expect(tree.children).toHaveLength(4)
  expect(tree.children[0]).toEqual({
    type: "html",
    value: '<div data-doc-example="true" data-doc-example-language="ts">',
  })
  expect(tree.children[1]?.lang).toBe("ts")
  expect(tree.children[2]).toEqual({
    type: "html",
    value: "</div>",
  })
  expect(tree.children[3]?.lang).toBe("typescript")
})

test("shiki transformer preserves source code for docs examples", () => {
  const transformers = astroConfig.markdown?.shikiConfig?.transformers ?? []
  const copyButtonTransformer = transformers.find((transformer) => transformer.name === "copy-button")

  expect(copyButtonTransformer).toBeDefined()

  const exampleNode = { properties: {} as Record<string, unknown> }
  copyButtonTransformer?.pre?.call(
    {
      source: "const x = 1",
      options: {},
    },
    exampleNode,
  )

  expect(exampleNode.properties["data-code"]).toBe("const x = 1")
})
