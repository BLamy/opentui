import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import corePackageJson from "../../../core/package.json?raw"
import { EDITOR_MODEL_ROOT, createCoreExtraLibs, isCoreTypeSource } from "./example-editor-types"
import { mixColors, readPageTheme } from "./example-theme"

export interface ExampleEditor {
  getValue(): string
  setValue(value: string): void
  onChange(listener: (value: string) => void): void
  focus(): void
  dispose(): void
}

interface EditorOptions {
  code: string
  language: string
  label: string
  // Grow with the content instead of filling the host.
  autoHeight?: boolean
}

const THEME = "opentui-page"
const coreSources = import.meta.glob("../../../core/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

let configured = false
let modelSequence = 0

function hex(color: string): string {
  return color.replace(/^#/, "")
}

// Monochrome, like the site's code blocks: plain identifiers, bold keywords,
// gray literals, faint italic comments.
function applyTheme(): void {
  const { mode, background, foreground } = readPageTheme()
  const literal = mixColors(foreground, background, 0.7)
  const comment = mixColors(foreground, background, 0.5)
  monaco.editor.defineTheme(THEME, {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: false,
    rules: [
      { token: "", foreground: hex(foreground), background: hex(background) },
      { token: "comment", foreground: hex(comment), fontStyle: "italic" },
      { token: "keyword", fontStyle: "bold" },
      { token: "string", foreground: hex(literal) },
      { token: "number", foreground: hex(literal) },
      { token: "regexp", foreground: hex(literal) },
    ],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorCursor.foreground": foreground,
      "editor.selectionBackground": mixColors(foreground, background, 0.2),
      "editor.inactiveSelectionBackground": mixColors(foreground, background, 0.12),
      "editor.lineHighlightBackground": background,
      "editorLineNumber.foreground": comment,
      "editorWidget.background": background,
      "editorSuggestWidget.background": background,
      "editorSuggestWidget.selectedBackground": mixColors(foreground, background, 0.15),
      "scrollbarSlider.background": mixColors(foreground, background, 0.15),
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((level) => [`editorBracketHighlight.foreground${level}`, foreground]),
      ),
    },
  })
  monaco.editor.setTheme(THEME)
}

function configure(): void {
  applyTheme()
  if (configured) return
  configured = true

  self.MonacoEnvironment = {
    getWorker: (_id, label) => (label === "typescript" || label === "javascript" ? new tsWorker() : new editorWorker()),
  }

  const typescript = monaco.typescript
  const sources = Object.fromEntries(Object.entries(coreSources).filter(([path]) => isCoreTypeSource(path)))
  const extraLibs = createCoreExtraLibs(corePackageJson, sources)
  for (const defaults of [typescript.typescriptDefaults, typescript.javascriptDefaults]) {
    defaults.setCompilerOptions({
      allowImportingTsExtensions: true,
      allowJs: true,
      allowNonTsExtensions: true,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      target: typescript.ScriptTarget.ESNext,
      jsx: typescript.JsxEmit.Preserve,
    })
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
    defaults.setExtraLibs(extraLibs.map((lib) => ({ content: lib.content, filePath: lib.filePath })))
  }

  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme)
}

function languageOf(language: string): { id: string; extension: string } {
  const normalized = language.toLowerCase()
  if (normalized === "javascript" || normalized === "js") return { id: "javascript", extension: "js" }
  if (normalized === "jsx") return { id: "javascript", extension: "jsx" }
  if (normalized === "tsx") return { id: "typescript", extension: "tsx" }
  return { id: "typescript", extension: "ts" }
}

export function mountEditor(host: HTMLElement, options: EditorOptions): ExampleEditor {
  configure()

  const { id, extension } = languageOf(options.language)
  const uri = monaco.Uri.parse(`${EDITOR_MODEL_ROOT}/example-${++modelSequence}.${extension}`)
  const model = monaco.editor.createModel(options.code, id, uri)
  const style = getComputedStyle(host)
  const fontSize = Number.parseFloat(style.fontSize) || 13
  const editor = monaco.editor.create(host, {
    model,
    theme: THEME,
    ariaLabel: options.label,
    automaticLayout: true,
    fontFamily: style.fontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * 1.5),
    lineNumbers: "off",
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: "none",
    bracketPairColorization: { enabled: false },
    colorDecorators: false,
    guides: { indentation: false },
    matchBrackets: "never",
    occurrencesHighlight: "off",
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
      useShadows: false,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    padding: { top: 12, bottom: 12 },
    tabSize: 2,
    insertSpaces: true,
    fixedOverflowWidgets: true,
    unicodeHighlight: { ambiguousCharacters: false },
  })

  if (options.autoHeight) {
    const fit = () => {
      host.style.height = `${editor.getContentHeight()}px`
    }
    editor.onDidContentSizeChange(fit)
    fit()
  }

  return {
    getValue: () => editor.getValue(),
    setValue: (value) => editor.setValue(value),
    onChange: (listener) => {
      editor.onDidChangeModelContent(() => listener(editor.getValue()))
    },
    focus: () => editor.focus(),
    dispose: () => {
      editor.dispose()
      model.dispose()
    },
  }
}
