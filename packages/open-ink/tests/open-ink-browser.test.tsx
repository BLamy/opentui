import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import React, { useState } from "react"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"

import { Box, Text, render, useInput } from "../src/browser.js"

let setup: TestRendererSetup | undefined

afterEach(async () => {
  await setup?.dispose()
  setup = undefined
})

describe("open-ink browser entry", () => {
  test("does not statically import @opentui/core before the wasm bindings load", async () => {
    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, "../src/browser.ts")],
      target: "browser",
      format: "esm",
      external: ["@opentui/core", "@opentui/core/*", "react", "react-reconciler", "react-reconciler/*", "node:*"],
    })
    expect(result.success).toBe(true)

    const output = await result.outputs[0]!.text()
    expect(output).not.toMatch(/from\s*["']@opentui\/core["']/)
    expect(output).toContain('import("@opentui/core")')
  })

  test("renders into a supplied renderer and leaves it running on unmount", async () => {
    setup = await createTestRenderer({ width: 30, height: 6 })

    function App() {
      const [value, setValue] = useState("idle")
      useInput((input) => setValue(`got ${input}`))
      return (
        <Box borderStyle="round" paddingX={1}>
          <Text>{value}</Text>
        </Box>
      )
    }

    const instance = await render(<App />, { renderer: setup.renderer })
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("idle")

    setup.mockInput.pressKey("x")
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("got x")

    instance.unmount()
    await instance.waitUntilExit()
    expect(setup.renderer.isDestroyed).toBe(false)
  })
})
