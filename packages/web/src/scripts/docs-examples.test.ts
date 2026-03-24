import { expect, test } from "bun:test"

import {
  DOC_EXAMPLE_BLOCK_SELECTOR,
  enhanceDocExamples,
  getDocExampleBlocks,
  shouldRestorePreviewEditorFocus,
} from "./docs-examples"

interface FakePreElement {
  dataset: Record<string, string | undefined>
}

function createFakeRoot(nodes: FakePreElement[]) {
  return {
    querySelectorAll(selector: string): FakePreElement[] {
      expect(selector).toBe(DOC_EXAMPLE_BLOCK_SELECTOR)

      return nodes.filter((node) => node.dataset.docExample === "true" && typeof node.dataset.code === "string")
    },
  }
}

test("finds only explicit example code blocks", () => {
  const exampleBlock = { dataset: { docExample: "true", docExampleLanguage: "ts", code: "const x = 1" } }
  const tsBlock = { dataset: { language: "typescript", code: "const x = 1" } }
  const missingCodeBlock = { dataset: { docExample: "true", docExampleLanguage: "ts" } }
  const blocks = getDocExampleBlocks(createFakeRoot([exampleBlock, tsBlock, missingCodeBlock]) as ParentNode)

  expect(blocks).toEqual([exampleBlock])
})

test("enhanceDocExamples only wraps explicit example fences", async () => {
  const exampleBlock = { dataset: { docExample: "true", docExampleLanguage: "ts", code: "const x = 1" } }
  const tsBlock = { dataset: { language: "typescript", code: "const x = 1" } }
  const enhanced: FakePreElement[] = []

  await enhanceDocExamples(createFakeRoot([exampleBlock, tsBlock]) as ParentNode, async (pre) => {
    enhanced.push(pre as unknown as FakePreElement)
  })

  expect(enhanced).toEqual([exampleBlock])
})

test("restores editor focus when the iframe became the active element", () => {
  const iframe = { tagName: "IFRAME" }

  expect(shouldRestorePreviewEditorFocus(iframe, iframe)).toBe(true)
})

test("restores editor focus when focus fell back to the document body", () => {
  expect(shouldRestorePreviewEditorFocus({ tagName: "BODY" }, { tagName: "IFRAME" })).toBe(true)
})

test("does not restore editor focus when the user moved to another control", () => {
  expect(shouldRestorePreviewEditorFocus({ tagName: "BUTTON" }, { tagName: "IFRAME" })).toBe(false)
})
