import { expect, test } from "bun:test"

import {
  DOCS_EXAMPLE_MONACO_MIN_HEIGHT,
  createDocsExampleMonacoCompilerOptions,
  createDocsExampleMonacoEditorOptions,
  resolveDocsExampleMonacoViewportHeight,
} from "./example-editor-monaco-config"

const fakeTypeScriptEnums = {
  ScriptTarget: {
    ES2022: 99,
  },
  ModuleKind: {
    ESNext: 7,
  },
  ModuleResolutionKind: {
    Bundler: 100,
  },
  JsxEmit: {
    Preserve: 1,
  },
}

test("uses bundler-style Monaco compiler options for docs examples", () => {
  expect(createDocsExampleMonacoCompilerOptions(fakeTypeScriptEnums as any)).toEqual({
    allowImportingTsExtensions: true,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    jsx: 1,
    module: 7,
    moduleResolution: 100,
    target: 99,
  })
})

test("keeps Monaco overflow widgets inside the visible editor viewport", () => {
  const options = createDocsExampleMonacoEditorOptions({
    ariaLabel: "Editable example code",
    fontFamily: "monospace",
    model: {} as any,
    theme: "docs-example",
  })

  expect(options.allowOverflow).toBe(false)
  expect(options.fixedOverflowWidgets).toBe(false)
})

test("uses content height when the snippet fits within the visible pane", () => {
  expect(resolveDocsExampleMonacoViewportHeight(320, 640)).toBe(320)
})

test("caps the editor height to the visible pane when the snippet is taller", () => {
  expect(resolveDocsExampleMonacoViewportHeight(880, 500)).toBe(500)
})

test("preserves the minimum editor height when the visible pane is shorter", () => {
  expect(resolveDocsExampleMonacoViewportHeight(120, 160)).toBe(DOCS_EXAMPLE_MONACO_MIN_HEIGHT)
  expect(resolveDocsExampleMonacoViewportHeight(920, 160)).toBe(DOCS_EXAMPLE_MONACO_MIN_HEIGHT)
})
