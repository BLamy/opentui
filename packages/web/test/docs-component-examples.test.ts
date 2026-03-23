import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parsePatch } from "diff"

import * as docPreviewRuntime from "../src/scripts/doc-preview-runtime"
import { compileExample } from "../src/scripts/example-preview-compiler"

const COMPONENT_DOCS_DIR = path.resolve(import.meta.dir, "../src/content/docs/components")
const CODE_FENCE_PATTERN = /(?<fence>`{3,})(?<info>[^\n`]*)\n(?<code>[\s\S]*?)\n\k<fence>/g

interface DocExample {
  code: string
  filePath: string
  index: number
  language: string
  summary: string
}

let fakeRenderableId = 0

class FakeRenderable {
  public id: string
  public focused = false
  public options: Array<Record<string, unknown>>
  public selectedIndex = 0
  public value = ""
  public plainText = ""
  public children: FakeRenderable[] = []
  public wrapper = { id: "wrapper" }
  public viewport = { id: "viewport" }
  public content = { id: "content" }
  public horizontalScrollBar = { id: "horizontal-scrollbar" }
  public verticalScrollBar = { id: "vertical-scrollbar" }
  public frameBuffer = {
    drawFrameBuffer: () => {},
    drawText: () => {},
    fillRect: () => {},
    setCell: () => {},
    setCellWithAlphaBlending: () => {},
  }

  public constructor(_renderer?: unknown, options?: Record<string, unknown>, children: FakeRenderable[] = []) {
    this.id = String(options?.id ?? `fake-renderable-${(fakeRenderableId += 1)}`)
    this.options = Array.isArray(options?.options) ? [...(options?.options as Array<Record<string, unknown>>)] : []
    this.selectedIndex = typeof options?.selectedIndex === "number" ? options.selectedIndex : 0
    this.value = typeof options?.value === "string" ? options.value : ""
    this.plainText = typeof options?.content === "string" ? options.content : this.value
    this.children = [...children]
  }

  public add(...children: Array<FakeRenderable | null | undefined>): this {
    this.children.push(...children.filter((child): child is FakeRenderable => Boolean(child)))
    return this
  }

  public remove(id: string): this {
    this.children = this.children.filter((child) => child.id !== id)
    return this
  }

  public focus(): this {
    this.focused = true
    return this
  }

  public on(_eventName: string, _handler: (...args: unknown[]) => void): () => void {
    return () => {}
  }

  public getSelectedIndex(): number {
    return this.selectedIndex
  }

  public setSelectedIndex(index: number): this {
    this.selectedIndex = index
    return this
  }

  public getSelectedOption(): Record<string, unknown> | null {
    return this.options[this.selectedIndex] ?? this.options[0] ?? null
  }

  public setOptions(options: Array<Record<string, unknown>>): this {
    this.options = [...options]
    return this
  }

  public moveUp(step = 1): this {
    this.selectedIndex = Math.max(0, this.selectedIndex - step)
    return this
  }

  public moveDown(step = 1): this {
    this.selectedIndex = Math.min(Math.max(this.options.length - 1, 0), this.selectedIndex + step)
    return this
  }

  public selectCurrent(): Record<string, unknown> | null {
    return this.getSelectedOption()
  }

  public scrollBy(_amount: unknown, _mode?: unknown): this {
    return this
  }

  public scrollTo(_position: unknown): this {
    return this
  }

  public setLineColor(_line: number, _color: unknown): this {
    return this
  }

  public setLineSign(_line: number, _sign: unknown): this {
    return this
  }
}

class FakeRGBA {
  public static fromInts(red: number, green: number, blue: number, alpha: number): string {
    return `${red},${green},${blue},${alpha}`
  }

  public static fromHex(value: string): string {
    return value
  }
}

class FakeSyntaxStyle {
  public static fromStyles(styles: Record<string, unknown>): Record<string, unknown> {
    return styles
  }
}

function createFakeRenderer(): Record<string, unknown> {
  return {
    keyInput: {
      on:
        (_eventName: string, _handler: (...args: unknown[]) => void): (() => void) =>
        () => {},
    },
    root: new FakeRenderable(undefined, { id: "root" }),
  }
}

function createConstruct(name: string) {
  return (...args: unknown[]) => {
    const [propsOrChild, ...rest] = args
    const props =
      propsOrChild &&
      typeof propsOrChild === "object" &&
      !Array.isArray(propsOrChild) &&
      !(propsOrChild instanceof FakeRenderable)
        ? (propsOrChild as Record<string, unknown>)
        : {}
    const children = [propsOrChild, ...rest].filter((child): child is FakeRenderable => child instanceof FakeRenderable)

    return new FakeRenderable(
      undefined,
      { ...props, id: props.id ?? `${name.toLowerCase()}-${fakeRenderableId + 1}` },
      children,
    )
  }
}

function createPreviewModule(): Record<string, unknown> {
  const previewModule: Record<string, unknown> = { ...docPreviewRuntime }

  for (const exportName of Object.keys(docPreviewRuntime)) {
    if (exportName === "createCliRenderer") {
      previewModule[exportName] = async () => createFakeRenderer()
      continue
    }

    if (exportName === "delegate") {
      previewModule[exportName] = (_props: Record<string, unknown>, child?: FakeRenderable) =>
        child ?? new FakeRenderable(undefined, { id: "delegated" })
      continue
    }

    if (exportName === "RGBA") {
      previewModule[exportName] = FakeRGBA
      continue
    }

    if (exportName === "SyntaxStyle") {
      previewModule[exportName] = FakeSyntaxStyle
      continue
    }

    if (exportName.endsWith("Renderable") || exportName === "Renderable" || exportName === "RootRenderable") {
      previewModule[exportName] = FakeRenderable
      continue
    }

    if (exportName.endsWith("Events")) {
      previewModule[exportName] = new Proxy(
        {},
        {
          get: (_target, property) => String(property),
        },
      )
      continue
    }

    if (
      ["ASCIIFont", "Box", "Code", "FrameBuffer", "Input", "ScrollBox", "Select", "TabSelect", "Text", "Textarea"].includes(
        exportName,
      )
    ) {
      previewModule[exportName] = createConstruct(exportName)
      continue
    }

    previewModule[exportName] ??= () => undefined
  }

  previewModule.createCliRenderer = async () => createFakeRenderer()
  return previewModule
}

function createPreviewScope(modules: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return {
    process: {
      cwd: () => "/",
      env: {},
      exit: () => {
        throw new Error("process.exit() is not available in the docs example test runtime.")
      },
    },
    ...modules["@opentui/core"],
    ...modules["@opentui/core/browser"],
  }
}

function getComponentDocFiles(): string[] {
  return readdirSync(COMPONENT_DOCS_DIR)
    .filter((fileName) => fileName.endsWith(".mdx"))
    .sort()
}

function getDocExamples(fileName: string): DocExample[] {
  const filePath = path.join(COMPONENT_DOCS_DIR, fileName)
  const source = readFileSync(filePath, "utf8")
  const examples: DocExample[] = []

  for (const [index, match] of Array.from(source.matchAll(CODE_FENCE_PATTERN)).entries()) {
    const rawInfo = match.groups?.info?.trim() ?? ""
    const infoTokens = rawInfo.toLowerCase().split(/\s+/).filter(Boolean)
    const language = infoTokens[0] ?? ""
    const isExample = infoTokens.slice(1).includes("example")

    if (!isExample) {
      continue
    }

    const code = match.groups?.code ?? ""
    const summary = code
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)

    examples.push({
      code,
      filePath,
      index,
      language,
      summary: summary ?? "(empty example)",
    })
  }

  return examples
}

function getInlineDiffLiterals(code: string): string[] {
  return Array.from(code.matchAll(/\bdiff:\s*`(?<diff>[\s\S]*?)`/g), (match) => match.groups?.diff ?? "").filter(Boolean)
}

async function runCompiledExample(compiled: string): Promise<void> {
  const previewModule = createPreviewModule()
  const runtime = {
    modules: {
      "@opentui/core": previewModule,
      "@opentui/core/browser": previewModule,
    },
    scope: createPreviewScope({
      "@opentui/core": previewModule,
      "@opentui/core/browser": previewModule,
    }),
  }

  const execute = new Function("runtime", `return (async () => { ${compiled} })()`)
  await execute(runtime)
}

test("doc preview runtime exposes the construct helpers used by component examples", () => {
  expect(docPreviewRuntime).toHaveProperty("ASCIIFont")
  expect(docPreviewRuntime).toHaveProperty("Box")
  expect(docPreviewRuntime).toHaveProperty("Code")
  expect(docPreviewRuntime).toHaveProperty("Input")
  expect(docPreviewRuntime).toHaveProperty("ScrollBox")
  expect(docPreviewRuntime).toHaveProperty("Select")
  expect(docPreviewRuntime).toHaveProperty("TabSelect")
  expect(docPreviewRuntime).toHaveProperty("Text")
})

test("component docs examples execute in isolation", async () => {
  const failures: string[] = []

  for (const fileName of getComponentDocFiles()) {
    const examples = getDocExamples(fileName)

    for (const example of examples) {
      try {
        const { compiled } = await compileExample(example.code, example.language)
        await runCompiledExample(compiled)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(
          `${path.basename(example.filePath)} example ${example.index + 1} (${example.summary}): ${message}`,
        )
      }
    }
  }

  expect(failures).toEqual([])
})

test("component docs inline diff literals are valid unified diffs", () => {
  const failures: string[] = []

  for (const fileName of getComponentDocFiles()) {
    const examples = getDocExamples(fileName)

    for (const example of examples) {
      for (const diffLiteral of getInlineDiffLiterals(example.code)) {
        try {
          parsePatch(diffLiteral)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${path.basename(example.filePath)} example ${example.index + 1}: ${message}`)
        }
      }
    }
  }

  expect(failures).toEqual([])
})
