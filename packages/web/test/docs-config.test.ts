import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

import astroConfig from "../astro.config.mjs"

test("docs content collection is defined", () => {
  const contentConfig = readFileSync(path.resolve(import.meta.dir, "../src/content.config.ts"), "utf8")

  expect(contentConfig).toContain("defineCollection({")
  expect(contentConfig).toContain("const docs =")
  expect(contentConfig).toContain("export const collections =")
})

test("docs optimizer target stays on es2022 for yoga-layout compatibility", () => {
  const target = astroConfig.vite?.optimizeDeps?.esbuildOptions?.target

  expect(target).toBe("es2022")
  expect(astroConfig.vite?.build?.target).toBe("es2022")
  expect(astroConfig.base).toBe("/")
  expect(astroConfig.site).toBe("https://opentui.com")
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
  expect(optimizeDepsInclude).toEqual(expect.arrayContaining(["ghostty-web", "monaco-editor", "typescript"]))
})

test("markdown remark plugins rewrite root-relative links and annotate opt-in docs examples", () => {
  const [rewriteRootRelativeMarkdownLinks, annotateDocExampleFences] = (astroConfig.markdown?.remarkPlugins ??
    []) as unknown as Array<(() => (tree: Record<string, unknown>) => void) | undefined>

  expect(typeof rewriteRootRelativeMarkdownLinks).toBe("function")
  expect(typeof annotateDocExampleFences).toBe("function")

  const linkTree: Record<string, any> = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "link", url: "/docs/getting-started", children: [] }] },
      { type: "paragraph", children: [{ type: "link", url: "https://example.com", children: [] }] },
    ],
  }

  rewriteRootRelativeMarkdownLinks?.()(linkTree)

  expect(linkTree.children[0]?.children?.[0]?.url).toBe("/docs/getting-started")
  expect(linkTree.children[1]?.children?.[0]?.url).toBe("https://example.com")

  const tree: Record<string, any> = {
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
  const transformers = (astroConfig.markdown?.shikiConfig?.transformers ?? []) as Array<Record<string, any>>
  const copyButtonTransformer = transformers.find((transformer) => transformer.name === "copy-button")

  expect(copyButtonTransformer).toBeDefined()

  const exampleNode = { properties: {} as Record<string, unknown> }
  copyButtonTransformer?.pre?.call(
    {
      source: "const x = 1",
      options: {} as any,
    },
    exampleNode,
  )

  expect(exampleNode.properties["data-code"]).toBe("const x = 1")
})
