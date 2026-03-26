import type * as Monaco from "monaco-editor"

import { createCoreMonacoExtraLibs } from "./example-editor-monaco-types"
import { createPreviewRuntimeMonacoExtraLibs } from "./example-editor-monaco-preview-types"

import corePackageJsonText from "../../../core/package.json?raw"

const coreSourceFiles = import.meta.glob(["../../../core/src/**/*.ts", "../../../core/src/**/*.d.ts"], {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>

const coreMonacoExtraLibs = createCoreMonacoExtraLibs(corePackageJsonText, coreSourceFiles)
const previewRuntimeMonacoExtraLibs = createPreviewRuntimeMonacoExtraLibs()

let docsExampleTypesConfigured = false

export function ensureDocsExampleMonacoTypes(monaco: typeof Monaco): void {
  if (docsExampleTypesConfigured) {
    return
  }

  for (const defaults of [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]) {
    for (const lib of [...coreMonacoExtraLibs, ...previewRuntimeMonacoExtraLibs]) {
      defaults.addExtraLib(lib.content, lib.filePath)
    }
  }

  docsExampleTypesConfigured = true
}
