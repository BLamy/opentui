import { expect, test } from "bun:test"
import { compileExample, findImports, isRunnableLanguage } from "./example-compiler"

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>

async function run(source: string, modules: Record<string, unknown>, language = "typescript") {
  const { code } = compileExample(source, language)
  const require = (name: string) => {
    if (!(name in modules)) throw new Error(`missing ${name}`)
    return modules[name]
  }
  const module = { exports: {} }
  await new AsyncFunction("require", "exports", "module", code)(require, module.exports, module)
  return module.exports
}

test("finds static, side-effect, re-export, and dynamic imports", () => {
  const code = [
    'import { Box, type BoxOptions } from "@opentui/core"',
    'import type { CliRenderer } from "@opentui/core/browser"',
    'import "./setup"',
    'export { t } from "@opentui/core"',
    'const lazy = await import("open-ink")',
  ].join("\n")

  expect(findImports(code)).toEqual(["@opentui/core", "@opentui/core/browser", "./setup", "open-ink"])
})

test("strips types and resolves imports through require", async () => {
  const created: string[] = []
  const exports = await run(
    [
      'import { createCliRenderer, type CliRenderer } from "@opentui/core"',
      "const renderer: CliRenderer = await createCliRenderer()",
      "export const name: string = renderer",
    ].join("\n"),
    {
      "@opentui/core": {
        createCliRenderer: async () => {
          created.push("renderer")
          return "renderer"
        },
      },
    },
  )

  expect(created).toEqual(["renderer"])
  expect(exports).toEqual({ name: "renderer" })
})

test("selects the runtime from imports and language", () => {
  expect(compileExample('import { Box } from "@opentui/core"\nBox()', "ts").runtimeKind).toBe("core")
  expect(compileExample('import { render } from "open-ink"\nrender(null)', "ts").runtimeKind).toBe("react")
  expect(compileExample("const node = <box />", "tsx").runtimeKind).toBe("react")
})

test("rejects code that cannot run by itself", () => {
  expect(() => compileExample("", "ts")).toThrow("empty")
  expect(() => compileExample('{\n  borderStyle: "single"\n}', "ts")).toThrow("fragment")
  expect(() => compileExample("echo hi", "bash")).toThrow("do not run")
  expect(isRunnableLanguage("TypeScript")).toBe(true)
  expect(isRunnableLanguage("text")).toBe(false)
})
