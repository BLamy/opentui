import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

import { compileExample } from "../src/scripts/example-preview-compiler"

const OPEN_INK_DOC_PATH = path.resolve(import.meta.dir, "../src/content/docs/bindings/open-ink.mdx")
const CODE_FENCE_PATTERN = /(?<fence>`{3,})(?<info>[^\n`]*)\n(?<code>[\s\S]*?)\n\k<fence>/g

interface ExtractedExample {
  code: string
  language: string
}

function getOpenInkExamples(): ExtractedExample[] {
  const source = readFileSync(OPEN_INK_DOC_PATH, "utf8")
  const examples: ExtractedExample[] = []

  for (const match of source.matchAll(CODE_FENCE_PATTERN)) {
    const rawInfo = match.groups?.info?.trim() ?? ""
    const infoTokens = rawInfo.toLowerCase().split(/\s+/).filter(Boolean)
    const language = infoTokens[0] ?? ""
    const isExample = infoTokens.slice(1).includes("example")

    if (!isExample) {
      continue
    }

    examples.push({
      code: match.groups?.code ?? "",
      language,
    })
  }

  return examples
}

test("open-ink docs examples cover the exported components", () => {
  const combinedSource = getOpenInkExamples()
    .map((example) => example.code)
    .join("\n")

  expect(getOpenInkExamples().length).toBeGreaterThanOrEqual(5)
  expect(combinedSource).toContain("Box")
  expect(combinedSource).toContain("Text")
  expect(combinedSource).toContain("Newline")
  expect(combinedSource).toContain("Spacer")
  expect(combinedSource).toContain("Static")
  expect(combinedSource).toContain("Transform")
})

test("open-ink docs examples compile for the browser preview runtime", async () => {
  for (const example of getOpenInkExamples()) {
    const result = await compileExample(example.code, example.language)
    expect(result.runtimeKind).toBe("open-ink")
    expect(result.compiled).toContain('__modules["open-ink"]["render"]')
  }
})
