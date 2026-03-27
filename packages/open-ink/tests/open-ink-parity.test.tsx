import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { PassThrough, Readable } from "node:stream"
import process from "node:process"
import React, { useEffect, useState } from "react"
import { createTextAttributes, type CliRenderer } from "@opentui/core"

import { Box, Text, Transform, renderToString, useInput } from "../src/index.js"
import { createHeadlessSession, getHeadlessOutput } from "../src/internal/session.js"

function createMockKeyEvent(input: Partial<Record<string, any>> = {}): any {
  return {
    name: input.name ?? "",
    ctrl: input.ctrl ?? false,
    meta: input.meta ?? false,
    shift: input.shift ?? false,
    option: input.option ?? false,
    sequence: input.sequence ?? "",
    raw: input.raw ?? input.sequence ?? "",
    eventType: input.eventType,
    repeated: input.repeated ?? false,
    super: input.super ?? false,
    hyper: input.hyper ?? false,
    capsLock: input.capsLock ?? false,
    numLock: input.numLock ?? false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.propagationStopped = true
    },
  }
}

function createTtyWriteStream(columns: number = 80, rows: number = 24): NodeJS.WriteStream {
  const stream = new PassThrough() as PassThrough &
    NodeJS.WriteStream & {
      columns: number
      rows: number
      isTTY: boolean
    }

  stream.columns = columns
  stream.rows = rows
  stream.isTTY = true
  return stream
}

function runSubprocess(script: string): string {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DEV: undefined,
    },
  })

  if (result.stdout.trim().length > 0) {
    return result.stdout.trim()
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `subprocess failed with status ${result.status}`)
  }

  return result.stdout.trim()
}

const originalInkScreenReader = process.env.INK_SCREEN_READER
const originalCI = process.env.CI

afterEach(() => {
  if (originalInkScreenReader === undefined) {
    delete process.env.INK_SCREEN_READER
  } else {
    process.env.INK_SCREEN_READER = originalInkScreenReader
  }

  if (originalCI === undefined) {
    delete process.env.CI
  } else {
    process.env.CI = originalCI
  }
})

describe("open-ink parity", () => {
  test("renderToString honors the columns option for each call", () => {
    const narrow = renderToString(<Text>1234567890</Text>, { columns: 5 })
    const wide = renderToString(<Text>1234567890</Text>, { columns: 10 })

    expect(narrow).toContain("\n")
    expect(wide).not.toContain("\n")
  })

  test("render onRender callback receives Ink-style renderTime metrics", () => {
    const output = runSubprocess(`
      import React from "react"
      import { writeSync } from "node:fs"
      import { PassThrough, Readable } from "node:stream"
      import { Text, render } from "./src/index.ts"

      function createTtyWriteStream(columns = 80, rows = 24) {
        const stream = new PassThrough()
        stream.columns = columns
        stream.rows = rows
        stream.isTTY = true
        return stream
      }

      const stdout = createTtyWriteStream()
      const stderr = createTtyWriteStream()
      const stdin = new Readable({ read() {} })
      let metrics

      const instance = render(React.createElement(Text, null, "Hello"), {
        stdout,
        stderr,
        stdin,
        interactive: false,
        patchConsole: false,
        onRender(nextMetrics) {
          metrics = nextMetrics
        },
      })

      instance.unmount()
      writeSync(1, JSON.stringify(metrics))
    `)
    const metrics = JSON.parse(output) as Record<string, unknown>

    expect(metrics).toBeDefined()
    expect(metrics).toHaveProperty("renderTime")
    expect(typeof metrics?.renderTime).toBe("number")
  })

  test("screen reader mode synthesizes aria role and state output", () => {
    process.env.INK_SCREEN_READER = "true"

    const output = renderToString(
      <Box aria-role="checkbox" aria-state={{ checked: true }}>
        <Text>Accept terms and conditions</Text>
      </Box>,
    )

    expect(output).toContain("(checked)")
    expect(output).toContain("checkbox")
    expect(output).toContain("Accept terms and conditions")
  })

  test("truncate wrap modes preserve distinct start middle and end truncation", () => {
    const end = renderToString(
      <Box width={7}>
        <Text wrap="truncate-end">Hello World</Text>
      </Box>,
    )
    const start = renderToString(
      <Box width={7}>
        <Text wrap="truncate-start">Hello World</Text>
      </Box>,
    )
    const middle = renderToString(
      <Box width={7}>
        <Text wrap="truncate-middle">Hello World</Text>
      </Box>,
    )

    expect(end).not.toBe(start)
    expect(end).not.toBe(middle)
    expect(start).not.toBe(middle)
  })

  test("Transform preserves text styling in the rendered spans", async () => {
    const session = createHeadlessSession(20)

    session.render(
      <Transform transform={(line) => line.toUpperCase()}>
        <Text bold>alpha</Text>
      </Transform>,
    )

    await Promise.resolve()
    await Promise.resolve()

    const buffer = (session.renderer as CliRenderer).currentRenderBuffer
    const firstTextSpan = buffer.getSpanLines()[0]?.spans.find((span) => span.text.trim().length > 0)

    expect(getHeadlessOutput(session)).toContain("ALPHA")
    expect(firstTextSpan?.attributes).toBe(createTextAttributes({ bold: true }))
  })

  test("interactive defaults to false in CI even when stdout is a TTY", () => {
    const output = runSubprocess(`
      import { PassThrough, Readable } from "node:stream"
      import { writeSync } from "node:fs"
      import process from "node:process"
      import { createCliSession } from "./src/internal/session.tsx"

      function createTtyWriteStream(columns = 80, rows = 24) {
        const stream = new PassThrough()
        stream.columns = columns
        stream.rows = rows
        stream.isTTY = true
        return stream
      }

      process.env.CI = "true"
      const session = createCliSession({
        stdout: createTtyWriteStream(),
        stderr: createTtyWriteStream(),
        stdin: new Readable({ read() {} }),
        patchConsole: false,
      })

      writeSync(1, String(session.interactive))
      session.destroy()
    `)

    expect(output).toBe("false")
  })

  test("kitty keyboard mode can be enabled through createCliSession", () => {
    const output = runSubprocess(`
      import { PassThrough, Readable } from "node:stream"
      import { writeSync } from "node:fs"
      import { createCliSession } from "./src/internal/session.tsx"

      function createTtyWriteStream(columns = 80, rows = 24) {
        const stream = new PassThrough()
        stream.columns = columns
        stream.rows = rows
        stream.isTTY = true
        return stream
      }

      const session = createCliSession({
        stdout: createTtyWriteStream(),
        stderr: createTtyWriteStream(),
        stdin: new Readable({ read() {} }),
        interactive: false,
        patchConsole: false,
        kittyKeyboard: {
          mode: "enabled",
          flags: ["disambiguateEscapeCodes", "reportEventTypes"],
        },
      })

      writeSync(1, String(session.renderer.useKittyKeyboard))
      session.destroy()
    `)

    expect(output).toBe("true")
  })

  test("useInput leaves eventType undefined when kitty keyboard mode is not active", async () => {
    const session = createHeadlessSession(20)

    function App() {
      const [value, setValue] = useState("idle")

      useInput((_input, key) => {
        setValue(String(key.eventType))
      })

      return <Text>{value}</Text>
    }

    session.render(<App />)
    await Promise.resolve()
    await Promise.resolve()

    session.stdinEventEmitter.emit("input", createMockKeyEvent({ name: "a", sequence: "a", eventType: undefined }))
    await Promise.resolve()
    await Promise.resolve()

    expect(getHeadlessOutput(session)).toContain("undefined")
  })

  test("setRawMode throws when stdin does not support raw mode", () => {
    const output = runSubprocess(`
      import { PassThrough, Readable } from "node:stream"
      import { writeSync } from "node:fs"
      import { createCliSession } from "./src/internal/session.tsx"

      function createTtyWriteStream(columns = 80, rows = 24) {
        const stream = new PassThrough()
        stream.columns = columns
        stream.rows = rows
        stream.isTTY = true
        return stream
      }

      const session = createCliSession({
        stdout: createTtyWriteStream(),
        stderr: createTtyWriteStream(),
        stdin: new Readable({ read() {} }),
        interactive: false,
        patchConsole: false,
      })

      try {
        session.setRawMode(true)
        writeSync(1, "did-not-throw")
      } catch {
        writeSync(1, "threw")
      } finally {
        session.destroy()
      }
    `)

    expect(output).toBe("threw")
  })
})
