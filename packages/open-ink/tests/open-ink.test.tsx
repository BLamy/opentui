import { describe, expect, test } from "bun:test"
import React, { useRef, useState } from "react"

import {
  Box,
  Newline,
  Spacer,
  Static,
  Text,
  Transform,
  measureElement,
  renderToString,
  useBoxMetrics,
  useFocus,
  useFocusManager,
  useInput,
} from "../src/index.js"
import { createHeadlessSession, getHeadlessOutput, type OpenInkSession } from "../src/internal/session.js"

const session: OpenInkSession = createHeadlessSession(30)

async function flushMicrotasks(times: number = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

function createMockKeyEvent(input: Partial<Record<string, any>> = {}): any {
  return {
    name: input.name ?? "",
    ctrl: input.ctrl ?? false,
    meta: input.meta ?? false,
    shift: input.shift ?? false,
    option: input.option ?? false,
    sequence: input.sequence ?? "",
    raw: input.raw ?? input.sequence ?? "",
    eventType: input.eventType ?? "press",
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

describe("open-ink", () => {
  test("renderToString renders Ink-style Box and Text output", () => {
    const output = renderToString(
      <Box border borderStyle="round" paddingX={1}>
        <Text bold>Hello</Text>
      </Box>,
      { columns: 20 },
    )

    expect(output).toContain("╭")
    expect(output).toContain("Hello")
  })

  test("renderToString prepends Static output above the live region", () => {
    const output = renderToString(
      <Box flexDirection="column">
        <Static items={["done 1", "done 2"]}>{(item) => <Text key={item}>{item}</Text>}</Static>
        <Text>live</Text>
      </Box>,
      { columns: 20 },
    )

    expect(output.indexOf("done 1")).toBeLessThan(output.indexOf("live"))
    expect(output.indexOf("done 2")).toBeLessThan(output.indexOf("live"))
  })

  test("renderToString supports Newline and Spacer layout helpers", () => {
    const output = renderToString(
      <Box border width={20} flexDirection="column">
        <Box>
          <Text>A</Text>
          <Spacer />
          <Text>B</Text>
        </Box>
        <Text>
          one
          <Newline />
          two
        </Text>
      </Box>,
      { columns: 20 },
    )

    const spacerLine = output
      .split("\n")
      .find((line) => line.includes("A") && line.includes("B"))

    expect(spacerLine).toBeTruthy()
    expect(spacerLine).toMatch(/A\s+B/)
    expect(output).toContain("one")
    expect(output).toContain("two")
  })

  test("Transform rewrites textual descendants", () => {
    const output = renderToString(
      <Transform transform={(line, index) => `${index + 1}. ${line.toUpperCase()}`}>
        alpha
        <Newline />
        bravo
      </Transform>,
      { columns: 20 },
    )

    expect(output).toContain("1. ALPHA")
    expect(output).toContain("2. BRAVO")
  })

  test("Transform rejects non-text descendants", () => {
    const output = renderToString(
      <Transform transform={(line) => line}>
        <Box />
      </Transform>,
      { columns: 20 },
    )

    expect(output).toContain("open-ink")
    expect(output).toContain("supports textual")
    expect(output).toContain("descendants.")
  })

  test("useInput receives synthesized input events in headless sessions", async () => {
    function App() {
      const [value, setValue] = useState("idle")
      useInput((input, key) => {
        if (key.return) {
          setValue("enter")
          return
        }

        if (input) {
          setValue(input)
        }
      })

      return <Text>{value}</Text>
    }

    session.clear()
    session.render(<App />)
    await flushMicrotasks()

    session.stdinEventEmitter.emit("input", createMockKeyEvent({ name: "a", sequence: "a" }))
    await flushMicrotasks()

    expect(getHeadlessOutput(session)).toContain("a")
  })

  test("useFocus and useFocusManager expose the active focus target", async () => {
    function App() {
      const first = useFocus({ id: "first", autoFocus: true })
      useFocus({ id: "second" })
      const { activeId } = useFocusManager()
      return <Text>{first.isFocused ? activeId : "none"}</Text>
    }

    session.clear()
    session.render(<App />)
    await flushMicrotasks(5)

    expect(getHeadlessOutput(session)).toContain("first")
  })

  test("measureElement and useBoxMetrics expose computed layout dimensions", async () => {
    function App() {
      const ref = useRef<any>(null)
      const metrics = useBoxMetrics(ref)
      const [measured, setMeasured] = useState("pending")

      React.useLayoutEffect(() => {
        if (!ref.current) {
          return
        }

        const { width, height } = measureElement(ref.current)
        setMeasured(`${width}x${height}`)
      }, [])

      return (
        <Box flexDirection="column">
          <Box ref={ref} width={5}>
            <Text>hello</Text>
          </Box>
          <Text>{measured}</Text>
          <Text>{metrics.hasMeasured ? `${metrics.width}x${metrics.height}` : "waiting"}</Text>
        </Box>
      )
    }

    session.clear()
    session.render(<App />)
    await flushMicrotasks(5)

    const output = getHeadlessOutput(session)
    expect(output).toContain("5x1")
  })
})
