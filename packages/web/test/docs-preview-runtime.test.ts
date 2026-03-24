import { afterEach, expect, test } from "bun:test"

import { destroySingleton, hasSingleton } from "../../core/src/lib/singleton.js"
import { getTreeSitterClient } from "../../core/src/lib/tree-sitter/index.js"
import { createTestRenderer } from "../../core/src/testing/test-renderer.js"
import { ensureBrowserProcessShim } from "../src/scripts/browser-process"
import * as docPreviewRuntime from "../src/scripts/doc-preview-runtime"
import { compileExample } from "../src/scripts/example-preview-compiler"

async function cleanupTreeSitterSingleton(): Promise<void> {
  if (hasSingleton("tree-sitter-client")) {
    await getTreeSitterClient().destroy()
    destroySingleton("tree-sitter-client")
  }

  destroySingleton("data-paths-opentui")
}

afterEach(async () => {
  await cleanupTreeSitterSingleton()
})

async function runActualPreviewExample(code: string): Promise<number> {
  const { compiled } = await compileExample(code, "example")
  const { renderer } = await createTestRenderer({ width: 80, height: 24 })
  const originalProcess = globalThis.process
  const originalDocument = (globalThis as Record<string, unknown>).document
  ;(globalThis as Record<string, unknown>).process = {
    cwd: () => "/",
    env: undefined,
    exit: () => {
      throw new Error("process.exit() is not available in the docs example test runtime.")
    },
  }
  const browserProcess = ensureBrowserProcessShim()
  const runtimeModule = {
    ...docPreviewRuntime,
    createCliRenderer: async () => renderer,
  }
  const runtime = {
    modules: {
      "@opentui/core": runtimeModule,
      "@opentui/core/browser": runtimeModule,
    },
    scope: {
      process: browserProcess,
      ...runtimeModule,
    },
  }

  ;(globalThis as Record<string, unknown>).document = {}

  try {
    const execute = new Function("runtime", `return (async () => { ${compiled} })()`)
    await execute(runtime)
    return renderer.root.getChildrenCount()
  } finally {
    if (originalDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document
    } else {
      ;(globalThis as Record<string, unknown>).document = originalDocument
    }

    globalThis.process = originalProcess
    renderer.destroy()
    await cleanupTreeSitterSingleton()
  }
}

test("browser-like preview runtime executes CodeRenderable examples", async () => {
  const childCount = await runActualPreviewExample(`
    import { CodeRenderable, createCliRenderer, RGBA, SyntaxStyle } from "@opentui/core"

    const renderer = await createCliRenderer()
    const syntaxStyle = SyntaxStyle.fromStyles({
      default: { fg: RGBA.fromHex("#ffffff") },
    })

    const code = new CodeRenderable(renderer, {
      content: "const x = 1",
      filetype: "typescript",
      syntaxStyle,
    })

    renderer.root.add(code)
  `)

  expect(childCount).toBeGreaterThan(0)
})

test("browser-like preview runtime executes MarkdownRenderable examples", async () => {
  const childCount = await runActualPreviewExample(String.raw`
    import { MarkdownRenderable, createCliRenderer, RGBA, SyntaxStyle } from "@opentui/core"

    const renderer = await createCliRenderer()
    const syntaxStyle = SyntaxStyle.fromStyles({
      "markup.heading.1": { fg: RGBA.fromHex("#58A6FF"), bold: true },
      "markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
      default: { fg: RGBA.fromHex("#E6EDF3") },
    })

    const markdown = new MarkdownRenderable(renderer, {
      content: "# Hello\n\n\`\`\`ts\nconst x = 1\n\`\`\`",
      syntaxStyle,
    })

    renderer.root.add(markdown)
  `)

  expect(childCount).toBeGreaterThan(0)
})

test("browser-like preview runtime shims process.nextTick for ScrollBoxRenderable examples", async () => {
  const childCount = await runActualPreviewExample(`
    import { ScrollBoxRenderable, BoxRenderable, createCliRenderer } from "@opentui/core"

    const renderer = await createCliRenderer()
    const scrollbox = new ScrollBoxRenderable(renderer, {
      id: "scrollbox",
      width: 40,
      height: 20,
    })

    for (let i = 0; i < 8; i++) {
      scrollbox.add(
        new BoxRenderable(renderer, {
          id: \`item-\${i}\`,
          width: "100%",
          height: 2,
        }),
      )
    }

    renderer.root.add(scrollbox)
  `)

  expect(childCount).toBeGreaterThan(0)
})

test("browser-like preview runtime executes MarkdownRenderable table examples", async () => {
  const childCount = await runActualPreviewExample(String.raw`
    import { MarkdownRenderable, createCliRenderer, RGBA, SyntaxStyle } from "@opentui/core"

    const renderer = await createCliRenderer()
    const syntaxStyle = SyntaxStyle.fromStyles({
      default: { fg: RGBA.fromHex("#E6EDF3") },
      "markup.table": { fg: RGBA.fromHex("#58A6FF") },
    })

    const markdown = new MarkdownRenderable(renderer, {
      content: "| Service | Status |\n| --- | --- |\n| api | ok |",
      syntaxStyle,
      tableOptions: {
        widthMode: "full",
        columnFitter: "balanced",
        wrapMode: "word",
        cellPadding: 1,
        borders: true,
        outerBorder: true,
        borderStyle: "rounded",
        borderColor: "#6b7280",
        selectable: true,
      },
    })

    renderer.root.add(markdown)
  `)

  expect(childCount).toBeGreaterThan(0)
})
