import { expect, test } from "bun:test"

import {
  createDocsExampleMonacoTheme,
  createDocsExampleXtermTheme,
  getDocsExampleRendererBackground,
  resolveThemeMode,
  type CssVarReader,
} from "./docs-example-theme"

function createReader(overrides: Record<string, string> = {}): CssVarReader {
  return (name, fallback) => overrides[name] ?? fallback
}

test("resolves theme mode from prefers-color-scheme matches", () => {
  expect(resolveThemeMode(true)).toBe("dark")
  expect(resolveThemeMode(false)).toBe("light")
})

test("builds a light Monaco theme from docs example CSS vars", () => {
  const theme = createDocsExampleMonacoTheme(
    "light",
    createReader({
      "--doc-example-code-bg": "#fefaf2",
      "--doc-example-code-selection": "#12345678",
      "--doc-example-code-token-keyword": "#abcdef",
    }),
  )

  expect(theme.base).toBe("vs")
  expect(theme.colors["editor.background"]).toBe("#fefaf2")
  expect(theme.colors["editor.selectionBackground"]).toBe("#12345678")
  expect(theme.rules.find((rule) => rule.token === "keyword")?.foreground).toBe("abcdef")
})

test("uses dark terminal fallbacks when CSS vars are not provided", () => {
  const theme = createDocsExampleXtermTheme("dark", createReader())

  expect(theme.background).toBe("#0d1417")
  expect(theme.foreground).toBe("#edf7fa")
  expect(theme.blue).toBe("#73b7ff")
})

test("uses the terminal background token for the renderer surface", () => {
  const background = getDocsExampleRendererBackground(
    "light",
    createReader({
      "--doc-example-terminal-bg": "#e7dcc8",
    }),
  )

  expect(background).toBe("#e7dcc8")
})
