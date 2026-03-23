import "monaco-editor/min/vs/editor/editor.main.css"

import type * as Monaco from "monaco-editor"

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

import {
  DOCS_EXAMPLE_MONACO_THEME,
  DOCS_EXAMPLE_THEME_QUERY,
  createDocsExampleCssVarReader,
  createDocsExampleMonacoTheme,
  getPreferredThemeMode,
  resolveThemeMode,
} from "./docs-example-theme"
import { getEditorLanguage, getEditorModelExtension } from "./example-preview-languages"

interface EditorOptions {
  code: string
  language: string
  ariaLabel: string
}

interface MonacoHostElement extends HTMLElement {
  __docExampleEditor?: Monaco.editor.IStandaloneCodeEditor
}

export interface DocExampleEditor {
  getValue(): string
  onDidChange(listener: (value: string) => void): () => void
  dispose(): void
}

type MonacoModule = typeof Monaco

let monacoPromise: Promise<MonacoModule> | null = null
let themeConfigured = false
let modelSequence = 0

function getMonaco(): Promise<MonacoModule> {
  if (!monacoPromise) {
    const target = globalThis as typeof globalThis & {
      MonacoEnvironment?: {
        getWorker: (_moduleId: string, label: string) => Worker
      }
    }

    if (!target.MonacoEnvironment) {
      target.MonacoEnvironment = {
        getWorker: (_moduleId, label) => {
          if (label === "typescript" || label === "javascript") {
            return new tsWorker()
          }

          return new editorWorker()
        },
      }
    }

    monacoPromise = import("monaco-editor")
  }

  return monacoPromise
}

function getEditorFontFamily(): string {
  const fontFamily = window.getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim()
  return fontFamily || '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
}

function applyTheme(monaco: MonacoModule): void {
  const mode = getPreferredThemeMode()
  const read = createDocsExampleCssVarReader()

  monaco.editor.defineTheme(DOCS_EXAMPLE_MONACO_THEME, createDocsExampleMonacoTheme(mode, read))
  monaco.editor.setTheme(DOCS_EXAMPLE_MONACO_THEME)
}

function ensureTheme(monaco: MonacoModule): void {
  applyTheme(monaco)

  if (themeConfigured) {
    return
  }

  const mediaQuery = window.matchMedia(DOCS_EXAMPLE_THEME_QUERY)
  mediaQuery.addEventListener("change", (event) => {
    const mode = resolveThemeMode(event.matches)
    window.requestAnimationFrame(() => {
      const read = createDocsExampleCssVarReader()
      monaco.editor.defineTheme(DOCS_EXAMPLE_MONACO_THEME, createDocsExampleMonacoTheme(mode, read))
      monaco.editor.setTheme(DOCS_EXAMPLE_MONACO_THEME)
    })
  })

  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  }

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  })
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  })

  themeConfigured = true
}

function createEditorModelUri(monaco: MonacoModule, language: string): Monaco.Uri {
  modelSequence += 1

  return monaco.Uri.parse(`file:///opentui-doc-examples/example-${modelSequence}${getEditorModelExtension(language)}`)
}

export async function mountMonacoEditor(host: HTMLElement, options: EditorOptions): Promise<DocExampleEditor> {
  const monaco = await getMonaco()
  ensureTheme(monaco)

  const target = host as MonacoHostElement
  const language = getEditorLanguage(options.language)
  const model = monaco.editor.createModel(
    options.code.replace(/\r\n?/g, "\n"),
    language,
    createEditorModelUri(monaco, options.language),
  )
  const editor = monaco.editor.create(target, {
    model,
    theme: DOCS_EXAMPLE_MONACO_THEME,
    ariaLabel: options.ariaLabel,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    lineNumbers: "off",
    glyphMargin: false,
    folding: false,
    renderLineHighlight: "none",
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    wordWrap: "off",
    fontFamily: getEditorFontFamily(),
    fontSize: 13,
    lineHeight: 22,
    padding: { top: 18, bottom: 18 },
    tabSize: 2,
    insertSpaces: true,
    scrollbar: {
      useShadows: false,
      alwaysConsumeMouseWheel: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
    unicodeHighlight: {
      ambiguousCharacters: false,
    },
  })

  const resize = () => {
    const nextHeight = Math.max(editor.getContentHeight(), 280)
    if (host.style.height !== `${nextHeight}px`) {
      host.style.height = `${nextHeight}px`
    }

    editor.layout({
      width: host.clientWidth,
      height: nextHeight,
    })
  }

  resize()
  target.__docExampleEditor = editor

  const contentSizeListener = editor.onDidContentSizeChange(() => resize())
  window.requestAnimationFrame(() => resize())

  return {
    getValue: () => editor.getValue(),
    onDidChange: (listener) => {
      const subscription = editor.onDidChangeModelContent(() => {
        resize()
        listener(editor.getValue())
      })

      return () => subscription.dispose()
    },
    dispose: () => {
      contentSizeListener.dispose()
      editor.getModel()?.dispose()
      editor.dispose()
      delete target.__docExampleEditor
    },
  }
}
