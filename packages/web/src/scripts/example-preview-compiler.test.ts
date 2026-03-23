import { expect, test } from "bun:test"

import { compileExample, isPreviewLanguage } from "./example-preview-compiler"

test("treats bare example fences as previewable TypeScript snippets", () => {
  expect(isPreviewLanguage("example")).toBe(true)
  expect(isPreviewLanguage("typescript")).toBe(true)
  expect(isPreviewLanguage("tsx")).toBe(false)
})

test("auto-mounts standalone core construct snippets", async () => {
  const result = await compileExample(
    `
      import { Input } from "@opentui/core"

      const input = Input({
        placeholder: "Name",
        width: 24,
      })
    `,
    "example",
  )

  expect(result.compiled).toContain("const renderer = await createCliRenderer()")
  expect(result.compiled).toContain("renderer.root.add(input)")
})

test("bootstraps renderer creation for standalone root.add snippets", async () => {
  const result = await compileExample(
    `
      const statusBar = Box({
        width: "100%",
      })

      renderer.root.add(statusBar)
    `,
    "example",
  )

  expect(result.compiled).toContain("const renderer = await createCliRenderer()")
  expect(result.compiled).toContain("renderer.root.add(statusBar)")
})

test("rejects browser-incompatible imports", async () => {
  await expect(
    compileExample(
      `
        import { plugin } from "bun"
        plugin({})
      `,
      "example",
    ),
  ).rejects.toThrow('Imports from "bun" are not previewable')
})
