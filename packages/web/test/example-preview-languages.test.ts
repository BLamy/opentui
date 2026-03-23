import { expect, test } from "bun:test"

import {
  getEditorLanguage,
  getEditorModelExtension,
  isPreviewLanguage,
  normalizePreviewLanguage,
} from "../src/scripts/example-preview-languages"

test("maps TypeScript-flavored snippets to the Monaco TypeScript language", () => {
  expect(normalizePreviewLanguage("example")).toBe("typescript")
  expect(getEditorLanguage("example")).toBe("typescript")
  expect(getEditorLanguage("typescript")).toBe("typescript")
  expect(getEditorLanguage("ts")).toBe("typescript")
  expect(getEditorLanguage("tsx")).toBe("typescript")
})

test("maps JavaScript-flavored snippets to the Monaco JavaScript language", () => {
  expect(getEditorLanguage("javascript")).toBe("javascript")
  expect(getEditorLanguage("js")).toBe("javascript")
  expect(getEditorLanguage("jsx")).toBe("javascript")
})

test("uses typed model filenames so Monaco parses annotations with the right script kind", () => {
  expect(getEditorModelExtension("example")).toBe(".ts")
  expect(getEditorModelExtension("typescript")).toBe(".ts")
  expect(getEditorModelExtension("ts")).toBe(".ts")
  expect(getEditorModelExtension("tsx")).toBe(".tsx")
  expect(getEditorModelExtension("javascript")).toBe(".js")
  expect(getEditorModelExtension("js")).toBe(".js")
  expect(getEditorModelExtension("jsx")).toBe(".jsx")
})

test("falls back to plaintext for unsupported editor languages", () => {
  expect(getEditorLanguage("rust")).toBe("plaintext")
  expect(getEditorLanguage("")).toBe("plaintext")
  expect(getEditorModelExtension("rust")).toBe(".txt")
  expect(getEditorModelExtension("")).toBe(".txt")
})

test("keeps browser preview support limited to JavaScript and TypeScript", () => {
  expect(isPreviewLanguage("example")).toBe(true)
  expect(isPreviewLanguage("typescript")).toBe(true)
  expect(isPreviewLanguage("js")).toBe(true)
  expect(isPreviewLanguage("tsx")).toBe(false)
  expect(isPreviewLanguage("bash")).toBe(false)
})
