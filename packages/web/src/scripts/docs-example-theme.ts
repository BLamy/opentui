import type * as Monaco from "monaco-editor"

import type { ITheme } from "@xterm/xterm"

export type ThemeMode = "dark" | "light"
export type CssVarReader = (name: string, fallback: string) => string

export const DOCS_EXAMPLE_MONACO_THEME = "opentui-docs"
export const DOCS_EXAMPLE_THEME_QUERY = "(prefers-color-scheme: dark)"

interface ThemeDefaults {
  codeBg: string
  codeText: string
  codeLineNumber: string
  codeLineNumberActive: string
  codeSelection: string
  codeSelectionInactive: string
  codeCursor: string
  codeIndent: string
  codeIndentActive: string
  codeWhitespace: string
  codeScrollbar: string
  codeScrollbarHover: string
  codeScrollbarActive: string
  codeTokenComment: string
  codeTokenKeyword: string
  codeTokenString: string
  codeTokenNumber: string
  codeTokenType: string
  codeTokenDelimiter: string
  terminalBg: string
  terminalFg: string
  terminalCursor: string
  terminalSelection: string
  terminalBlack: string
  terminalRed: string
  terminalGreen: string
  terminalYellow: string
  terminalBlue: string
  terminalMagenta: string
  terminalCyan: string
  terminalWhite: string
  terminalBrightBlack: string
  terminalBrightRed: string
  terminalBrightGreen: string
  terminalBrightYellow: string
  terminalBrightBlue: string
  terminalBrightMagenta: string
  terminalBrightCyan: string
  terminalBrightWhite: string
}

const THEME_DEFAULTS: Record<ThemeMode, ThemeDefaults> = {
  light: {
    codeBg: "#fcf7ef",
    codeText: "#2b2118",
    codeLineNumber: "#947f6b",
    codeLineNumberActive: "#5b4a3b",
    codeSelection: "#0a7d842e",
    codeSelectionInactive: "#0a7d841c",
    codeCursor: "#0a7d84",
    codeIndent: "#e4d7c4",
    codeIndentActive: "#cfbea7",
    codeWhitespace: "#d9cab4",
    codeScrollbar: "#8c70513d",
    codeScrollbarHover: "#8c705157",
    codeScrollbarActive: "#8c705175",
    codeTokenComment: "#8c7a67",
    codeTokenKeyword: "#b35f13",
    codeTokenString: "#236a42",
    codeTokenNumber: "#8b6418",
    codeTokenType: "#0d7281",
    codeTokenDelimiter: "#7a6959",
    terminalBg: "#f4ede1",
    terminalFg: "#1b2225",
    terminalCursor: "#0a7d84",
    terminalSelection: "#0a7d8438",
    terminalBlack: "#2f2924",
    terminalRed: "#b14333",
    terminalGreen: "#2d7b47",
    terminalYellow: "#896111",
    terminalBlue: "#2f71a0",
    terminalMagenta: "#9856af",
    terminalCyan: "#0a7d84",
    terminalWhite: "#1b2225",
    terminalBrightBlack: "#6f5e4c",
    terminalBrightRed: "#d56f61",
    terminalBrightGreen: "#4f9d67",
    terminalBrightYellow: "#ad8a38",
    terminalBrightBlue: "#4f8cc0",
    terminalBrightMagenta: "#b47ccb",
    terminalBrightCyan: "#37a4ab",
    terminalBrightWhite: "#ffffff",
  },
  dark: {
    codeBg: "#1d1715",
    codeText: "#f4ede6",
    codeLineNumber: "#8e7f70",
    codeLineNumberActive: "#c8baac",
    codeSelection: "#ffb35733",
    codeSelectionInactive: "#ffb3571f",
    codeCursor: "#ffd166",
    codeIndent: "#3b3128",
    codeIndentActive: "#5a4c40",
    codeWhitespace: "#473a2e",
    codeScrollbar: "#6c5a4766",
    codeScrollbarHover: "#7a675266",
    codeScrollbarActive: "#8d785f88",
    codeTokenComment: "#8e7f70",
    codeTokenKeyword: "#f8c27d",
    codeTokenString: "#d8f3c1",
    codeTokenNumber: "#f3e0a3",
    codeTokenType: "#88d9d2",
    codeTokenDelimiter: "#d6c8b7",
    terminalBg: "#0d1417",
    terminalFg: "#edf7fa",
    terminalCursor: "#ffd166",
    terminalSelection: "#ffb35742",
    terminalBlack: "#10171b",
    terminalRed: "#ff8c70",
    terminalGreen: "#8bdb6f",
    terminalYellow: "#f0d56d",
    terminalBlue: "#73b7ff",
    terminalMagenta: "#f4a3ff",
    terminalCyan: "#55d4cd",
    terminalWhite: "#edf7fa",
    terminalBrightBlack: "#8aa6b4",
    terminalBrightRed: "#ffb6a3",
    terminalBrightGreen: "#c2f19f",
    terminalBrightYellow: "#ffe799",
    terminalBrightBlue: "#a3d0ff",
    terminalBrightMagenta: "#ffc1ff",
    terminalBrightCyan: "#9df0ea",
    terminalBrightWhite: "#ffffff",
  },
}

export function resolveThemeMode(prefersDark: boolean): ThemeMode {
  return prefersDark ? "dark" : "light"
}

export function getPreferredThemeMode(): ThemeMode {
  return resolveThemeMode(window.matchMedia(DOCS_EXAMPLE_THEME_QUERY).matches)
}

export function createDocsExampleCssVarReader(
  styles: { getPropertyValue(name: string): string } = window.getComputedStyle(document.documentElement),
): CssVarReader {
  return (name, fallback) => {
    const value = styles.getPropertyValue(name).trim()
    return value || fallback
  }
}

function stripHash(value: string): string {
  return value.startsWith("#") ? value.slice(1) : value
}

function readColor(read: CssVarReader, name: string, fallback: string): string {
  return read(name, fallback).trim() || fallback
}

export function createDocsExampleMonacoTheme(mode: ThemeMode, read: CssVarReader): Monaco.editor.IStandaloneThemeData {
  const defaults = THEME_DEFAULTS[mode]

  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      {
        token: "comment",
        foreground: stripHash(readColor(read, "--doc-example-code-token-comment", defaults.codeTokenComment)),
      },
      {
        token: "keyword",
        foreground: stripHash(readColor(read, "--doc-example-code-token-keyword", defaults.codeTokenKeyword)),
      },
      {
        token: "string",
        foreground: stripHash(readColor(read, "--doc-example-code-token-string", defaults.codeTokenString)),
      },
      {
        token: "number",
        foreground: stripHash(readColor(read, "--doc-example-code-token-number", defaults.codeTokenNumber)),
      },
      {
        token: "type.identifier",
        foreground: stripHash(readColor(read, "--doc-example-code-token-type", defaults.codeTokenType)),
      },
      {
        token: "delimiter",
        foreground: stripHash(readColor(read, "--doc-example-code-token-delimiter", defaults.codeTokenDelimiter)),
      },
    ],
    colors: {
      "editor.background": readColor(read, "--doc-example-code-bg", defaults.codeBg),
      "editor.foreground": readColor(read, "--doc-example-code-text", defaults.codeText),
      "editor.lineHighlightBackground": readColor(read, "--doc-example-code-bg", defaults.codeBg),
      "editorLineNumber.foreground": readColor(read, "--doc-example-code-line-number", defaults.codeLineNumber),
      "editorLineNumber.activeForeground": readColor(
        read,
        "--doc-example-code-line-number-active",
        defaults.codeLineNumberActive,
      ),
      "editor.selectionBackground": readColor(read, "--doc-example-code-selection", defaults.codeSelection),
      "editor.inactiveSelectionBackground": readColor(
        read,
        "--doc-example-code-selection-inactive",
        defaults.codeSelectionInactive,
      ),
      "editorCursor.foreground": readColor(read, "--doc-example-code-cursor", defaults.codeCursor),
      "editorIndentGuide.background1": readColor(read, "--doc-example-code-indent", defaults.codeIndent),
      "editorIndentGuide.activeBackground1": readColor(
        read,
        "--doc-example-code-indent-active",
        defaults.codeIndentActive,
      ),
      "editorWhitespace.foreground": readColor(read, "--doc-example-code-whitespace", defaults.codeWhitespace),
      "scrollbarSlider.background": readColor(read, "--doc-example-code-scrollbar", defaults.codeScrollbar),
      "scrollbarSlider.hoverBackground": readColor(
        read,
        "--doc-example-code-scrollbar-hover",
        defaults.codeScrollbarHover,
      ),
      "scrollbarSlider.activeBackground": readColor(
        read,
        "--doc-example-code-scrollbar-active",
        defaults.codeScrollbarActive,
      ),
    },
  }
}

export function createDocsExampleXtermTheme(mode: ThemeMode, read: CssVarReader): ITheme {
  const defaults = THEME_DEFAULTS[mode]

  return {
    background: readColor(read, "--doc-example-terminal-bg", defaults.terminalBg),
    foreground: readColor(read, "--doc-example-terminal-fg", defaults.terminalFg),
    cursor: readColor(read, "--doc-example-terminal-cursor", defaults.terminalCursor),
    cursorAccent: readColor(read, "--doc-example-terminal-bg", defaults.terminalBg),
    selectionBackground: readColor(read, "--doc-example-terminal-selection", defaults.terminalSelection),
    black: readColor(read, "--doc-example-terminal-black", defaults.terminalBlack),
    red: readColor(read, "--doc-example-terminal-red", defaults.terminalRed),
    green: readColor(read, "--doc-example-terminal-green", defaults.terminalGreen),
    yellow: readColor(read, "--doc-example-terminal-yellow", defaults.terminalYellow),
    blue: readColor(read, "--doc-example-terminal-blue", defaults.terminalBlue),
    magenta: readColor(read, "--doc-example-terminal-magenta", defaults.terminalMagenta),
    cyan: readColor(read, "--doc-example-terminal-cyan", defaults.terminalCyan),
    white: readColor(read, "--doc-example-terminal-white", defaults.terminalWhite),
    brightBlack: readColor(read, "--doc-example-terminal-bright-black", defaults.terminalBrightBlack),
    brightRed: readColor(read, "--doc-example-terminal-bright-red", defaults.terminalBrightRed),
    brightGreen: readColor(read, "--doc-example-terminal-bright-green", defaults.terminalBrightGreen),
    brightYellow: readColor(read, "--doc-example-terminal-bright-yellow", defaults.terminalBrightYellow),
    brightBlue: readColor(read, "--doc-example-terminal-bright-blue", defaults.terminalBrightBlue),
    brightMagenta: readColor(read, "--doc-example-terminal-bright-magenta", defaults.terminalBrightMagenta),
    brightCyan: readColor(read, "--doc-example-terminal-bright-cyan", defaults.terminalBrightCyan),
    brightWhite: readColor(read, "--doc-example-terminal-bright-white", defaults.terminalBrightWhite),
  }
}

export function getDocsExampleRendererBackground(mode: ThemeMode, read: CssVarReader): string {
  return readColor(read, "--doc-example-terminal-bg", THEME_DEFAULTS[mode].terminalBg)
}
