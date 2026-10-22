import { afterEach, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import * as core from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import * as openInk from "open-ink/browser"
import * as react from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { compileExample } from "./example-compiler"

// Every docs fence tagged `example` runs in the browser. Run each one against a
// test renderer and check that it draws something.
const DOCS = join(import.meta.dir, "../content/docs")
const FENCE = /^(`{3,})(\w+)[^\S\n]+([^\n]*)\n([\s\S]*?)\n\1[^\S\n]*$/gm

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>

function docFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return docFiles(path)
    return /\.mdx?$/.test(entry.name) ? [path] : []
  })
}

const examples = docFiles(DOCS).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(FENCE)]
    .filter((match) => match[3]!.split(/\s+/).includes("example"))
    .map((match) => ({
      name: `${relative(DOCS, file)}:${readFileSync(file, "utf8").slice(0, match.index).split("\n").length}`,
      language: match[2]!,
      code: match[4]!,
    })),
)

let setups: TestRendererSetup[] = []

afterEach(() => {
  for (const setup of setups) setup.renderer.destroy()
  setups = []
})

test("docs have runnable examples", () => {
  expect(examples.length).toBeGreaterThan(10)
})

for (const example of examples) {
  test(`renders ${example.name}`, async () => {
    const compiled = compileExample(example.code, example.language)

    const createCliRenderer = async (config: core.CliRendererConfig = {}) => {
      const setup = await createTestRenderer({ ...config, width: 80, height: 24 })
      setups.push(setup)
      return setup.renderer
    }
    const renders: Promise<unknown>[] = []
    const modules: Record<string, unknown> =
      compiled.runtimeKind === "core"
        ? { "@opentui/core": { ...core, createCliRenderer } }
        : {
            "@opentui/core": core,
            react,
            "react/jsx-runtime": jsxRuntime,
            "open-ink": {
              ...openInk,
              render: (node: Parameters<typeof openInk.render>[0]) => {
                const rendered = createCliRenderer().then((renderer) => openInk.render(node, { renderer }))
                renders.push(rendered)
                return rendered
              },
            },
          }
    const require = (name: string) => {
      if (name in modules) return modules[name]
      throw new Error(`Examples cannot import ${name} in the browser`)
    }
    await new AsyncFunction("require", "exports", "module", compiled.code)(require, {}, { exports: {} })
    await Promise.all(renders)

    const setup = setups.find((candidate) => !candidate.renderer.isDestroyed)
    expect(setup).toBeDefined()
    await setup!.renderOnce()
    expect(setup!.renderer.root.getChildrenCount()).toBeGreaterThan(0)
    expect(setup!.captureCharFrame().trim().length).toBeGreaterThan(0)
  })
}
