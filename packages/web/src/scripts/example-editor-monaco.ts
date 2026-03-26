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
import {
  createDocsExampleMonacoCompilerOptions,
  createDocsExampleMonacoEditorOptions,
  resolveDocsExampleMonacoViewportHeight,
} from "./example-editor-monaco-config"
import { ensureDocsExampleMonacoTypes } from "./example-editor-monaco-types-source"
import { getEditorLanguage, getEditorModelExtension } from "./example-preview-languages"

interface EditorOptions {
  code: string
  language: string
  ariaLabel: string
  viewportElement?: HTMLElement | null
}

interface MonacoHostElement extends HTMLElement {
  __docExampleEditor?: Monaco.editor.IStandaloneCodeEditor
}

export interface DocExampleEditor {
  getValue(): string
  onDidChange(listener: (value: string) => void): () => void
  captureFocus(): { restore(): void } | null
  dispose(): void
}

type MonacoModule = typeof Monaco

let monacoPromise: Promise<MonacoModule> | null = null
let defaultsConfigured = false
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

function ensureDefaults(monaco: MonacoModule): void {
  applyTheme(monaco)

  if (defaultsConfigured) {
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

  const compilerOptions = createDocsExampleMonacoCompilerOptions(monaco.languages.typescript)

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

  ensureDocsExampleMonacoTypes(monaco)

  defaultsConfigured = true
}

function createEditorModelUri(monaco: MonacoModule, language: string): Monaco.Uri {
  modelSequence += 1

  return monaco.Uri.parse(`file:///opentui-doc-examples/example-${modelSequence}${getEditorModelExtension(language)}`)
}

export async function mountMonacoEditor(host: HTMLElement, options: EditorOptions): Promise<DocExampleEditor> {
  const monaco = await getMonaco()
  ensureDefaults(monaco)

  const target = host as MonacoHostElement
  const language = getEditorLanguage(options.language)
  const model = monaco.editor.createModel(
    options.code.replace(/\r\n?/g, "\n"),
    language,
    createEditorModelUri(monaco, options.language),
  )
  const editor = monaco.editor.create(
    target,
    createDocsExampleMonacoEditorOptions({
      ariaLabel: options.ariaLabel,
      fontFamily: getEditorFontFamily(),
      model,
      theme: DOCS_EXAMPLE_MONACO_THEME,
    }),
  )

  const viewportElement = options.viewportElement ?? host.parentElement

  const resize = () => {
    const nextHeight = resolveDocsExampleMonacoViewportHeight(
      editor.getContentHeight(),
      viewportElement?.clientHeight ?? 0,
    )
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
  const resizeObserver =
    viewportElement && typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          resize()
        })
      : null
  resizeObserver?.observe(viewportElement)
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
    captureFocus: () => {
      if (!editor.hasTextFocus()) {
        return null
      }

      const selection = editor.getSelection()
      const position = editor.getPosition()
      const scrollTop = editor.getScrollTop()
      const scrollLeft = editor.getScrollLeft()

      return {
        restore: () => {
          editor.focus()

          if (selection) {
            editor.setSelection(selection)
          } else if (position) {
            editor.setPosition(position)
          }

          editor.setScrollPosition({ scrollTop, scrollLeft })
        },
      }
    },
    dispose: () => {
      contentSizeListener.dispose()
      resizeObserver?.disconnect()
      editor.getModel()?.dispose()
      editor.dispose()
      delete target.__docExampleEditor
    },
  }
}
