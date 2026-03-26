import type * as Monaco from "monaco-editor"

export const DOCS_EXAMPLE_MONACO_MIN_HEIGHT = 280

interface MonacoTypeScriptEnums {
  ScriptTarget: {
    ES2022: number
  }
  ModuleKind: {
    ESNext: number
  }
  ModuleResolutionKind: {
    Bundler: number
  }
  JsxEmit: {
    Preserve: number
  }
}

interface DocsExampleMonacoEditorOptions {
  ariaLabel: string
  fontFamily: string
  model: Monaco.editor.ITextModel
  theme: string
}

export function createDocsExampleMonacoCompilerOptions(
  typescript: MonacoTypeScriptEnums,
): Monaco.languages.typescript.CompilerOptions {
  return {
    allowImportingTsExtensions: true,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    jsx: typescript.JsxEmit.Preserve,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    target: typescript.ScriptTarget.ES2022,
  }
}

export function createDocsExampleMonacoEditorOptions(
  options: DocsExampleMonacoEditorOptions,
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    allowOverflow: false,
    ariaLabel: options.ariaLabel,
    automaticLayout: true,
    fixedOverflowWidgets: false,
    folding: false,
    fontFamily: options.fontFamily,
    fontSize: 13,
    glyphMargin: false,
    hideCursorInOverviewRuler: true,
    insertSpaces: true,
    lineHeight: 22,
    lineNumbers: "off",
    minimap: { enabled: false },
    model: options.model,
    overviewRulerLanes: 0,
    padding: { top: 18, bottom: 18 },
    renderLineHighlight: "none",
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
      horizontalScrollbarSize: 10,
      useShadows: false,
      verticalScrollbarSize: 10,
    },
    smoothScrolling: true,
    tabSize: 2,
    theme: options.theme,
    unicodeHighlight: {
      ambiguousCharacters: false,
    },
    wordWrap: "off",
  }
}

export function resolveDocsExampleMonacoViewportHeight(
  contentHeight: number,
  visibleCodePaneHeight: number,
  minimumHeight: number = DOCS_EXAMPLE_MONACO_MIN_HEIGHT,
): number {
  const safeContentHeight = Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : minimumHeight
  const safeVisiblePaneHeight =
    Number.isFinite(visibleCodePaneHeight) && visibleCodePaneHeight > 0 ? visibleCodePaneHeight : safeContentHeight

  return Math.max(minimumHeight, Math.min(safeContentHeight, safeVisiblePaneHeight))
}
