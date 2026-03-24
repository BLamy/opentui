import ts from "typescript"

import { isPreviewLanguage, normalizePreviewLanguage } from "./example-preview-languages"

export { isPreviewLanguage } from "./example-preview-languages"

export interface CompiledExample {
  compiled: string
}

interface ImportBinding {
  source: string
  kind: "default" | "named" | "namespace" | "side-effect"
  importedName?: string
  localName?: string
  isTypeOnly: boolean
}

interface ParsedImports {
  bindings: ImportBinding[]
  body: string
}

const CORE_IMPORT_SOURCES = new Set(["@opentui/core", "@opentui/core/browser"])
const CORE_RENDERABLE_CALLS = new Set([
  "ASCIIFont",
  "Box",
  "FrameBuffer",
  "Input",
  "ScrollBox",
  "Select",
  "TabSelect",
  "Text",
  "Textarea",
  "delegate",
])

function getFileName(language: string): string {
  const normalized = normalizePreviewLanguage(language)
  if (normalized === "javascript" || normalized === "js") {
    return "example.js"
  }

  return "example.ts"
}

function removeRanges(source: string, ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) {
    return source
  }

  let cursor = 0
  let output = ""

  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    output += source.slice(cursor, range.start)
    cursor = range.end
  }

  output += source.slice(cursor)
  return output
}

function parseImports(code: string, language: string): ParsedImports {
  const sourceFile = ts.createSourceFile(getFileName(language), code, ts.ScriptTarget.Latest, true)
  const bindings: ImportBinding[] = []
  const importRanges: Array<{ start: number; end: number }> = []

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue
    }

    importRanges.push({ start: statement.getFullStart(), end: statement.getEnd() })

    const source = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : ""
    const clause = statement.importClause

    if (!clause) {
      bindings.push({
        source,
        kind: "side-effect",
        isTypeOnly: false,
      })
      continue
    }

    if (clause.name) {
      bindings.push({
        source,
        kind: "default",
        localName: clause.name.text,
        isTypeOnly: clause.isTypeOnly,
      })
    }

    if (!clause.namedBindings) {
      continue
    }

    if (ts.isNamespaceImport(clause.namedBindings)) {
      bindings.push({
        source,
        kind: "namespace",
        localName: clause.namedBindings.name.text,
        isTypeOnly: clause.isTypeOnly,
      })
      continue
    }

    for (const element of clause.namedBindings.elements) {
      bindings.push({
        source,
        kind: "named",
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
        isTypeOnly: clause.isTypeOnly || element.isTypeOnly,
      })
    }
  }

  return {
    bindings,
    body: removeRanges(code, importRanges).trim(),
  }
}

function isPropertyFragment(code: string): boolean {
  const trimmed = code.trim()
  return trimmed.startsWith("{") && !trimmed.includes("const ") && !trimmed.includes("function ")
}

function stripEmptyModuleExport(code: string): string {
  return code.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "").trim()
}

function isStandaloneCoreSnippet(code: string): boolean {
  return /\b\w+\.root\.add\s*\(/.test(code)
}

function definesIdentifier(code: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b(?:function|const|let|var|class)\\s+${escaped}\\b`).test(code)
}

function isRenderableInitializer(initializerText: string): boolean {
  const trimmed = initializerText.trim()

  if (/^new\s+[A-Z]\w*Renderable\b/.test(trimmed)) {
    return true
  }

  const match = trimmed.match(/^([A-Za-z_]\w*)\s*\(/)
  if (!match) {
    return false
  }

  return CORE_RENDERABLE_CALLS.has(match[1] ?? "")
}

function findCorePreviewTarget(code: string, language: string): string | null {
  const sourceFile = ts.createSourceFile(getFileName(language), code, ts.ScriptTarget.Latest, true)

  for (let index = sourceFile.statements.length - 1; index >= 0; index -= 1) {
    const statement = sourceFile.statements[index]

    if (!ts.isVariableStatement(statement)) {
      continue
    }

    for (
      let declarationIndex = statement.declarationList.declarations.length - 1;
      declarationIndex >= 0;
      declarationIndex -= 1
    ) {
      const declaration = statement.declarationList.declarations[declarationIndex]
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue
      }

      const initializerText = declaration.initializer.getText(sourceFile)
      if (!isRenderableInitializer(initializerText)) {
        continue
      }

      return declaration.name.text
    }
  }

  return null
}

function addCoreBootstrap(code: string, language: string): string {
  const rendererBootstrap = definesIdentifier(code, "renderer") ? "" : "const renderer = await createCliRenderer()"

  if (isStandaloneCoreSnippet(code)) {
    return [rendererBootstrap, code].filter(Boolean).join("\n\n")
  }

  const previewTarget = findCorePreviewTarget(code, language)
  if (!previewTarget) {
    return [rendererBootstrap, code].filter(Boolean).join("\n\n")
  }

  const sections = [rendererBootstrap, code, `renderer.root.add(${previewTarget})`].filter(Boolean)

  return sections.join("\n\n")
}

function transformTypeScript(code: string, language: string): string {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.None,
      verbatimModuleSyntax: true,
    },
    fileName: getFileName(language),
  })

  return result.outputText
}

function assertSupportedImports(bindings: ImportBinding[]): void {
  for (const binding of bindings) {
    if (binding.isTypeOnly || !binding.source) {
      continue
    }

    if (binding.kind === "side-effect") {
      throw new Error(`Side-effect imports from "${binding.source}" are not previewable in the browser runtime yet.`)
    }

    if (!CORE_IMPORT_SOURCES.has(binding.source)) {
      throw new Error(`Imports from "${binding.source}" are not previewable in the browser runtime yet.`)
    }
  }
}

function buildPrelude(bindings: ImportBinding[]): string[] {
  const lines = ["const __scope = runtime.scope", "const __modules = runtime.modules"]

  for (const binding of bindings) {
    if (binding.isTypeOnly || binding.kind === "side-effect" || !binding.source) {
      continue
    }

    if (binding.kind === "named") {
      if (!binding.localName || !binding.importedName) {
        continue
      }

      lines.push(
        `const ${binding.localName} = __modules[${JSON.stringify(binding.source)}][${JSON.stringify(binding.importedName)}]`,
      )
      continue
    }

    if (binding.kind === "namespace" && binding.localName) {
      lines.push(`const ${binding.localName} = __modules[${JSON.stringify(binding.source)}]`)
      continue
    }

    if (binding.kind === "default" && binding.localName) {
      lines.push(
        `const ${binding.localName} = __modules[${JSON.stringify(binding.source)}].default ?? __modules[${JSON.stringify(binding.source)}]`,
      )
    }
  }

  return lines
}

export async function compileExample(code: string, language: string): Promise<CompiledExample> {
  const normalized = code.replace(/\r\n?/g, "\n").trim()
  const previewLanguage = normalizePreviewLanguage(language)

  if (!normalized) {
    throw new Error("This example is empty.")
  }

  if (isPropertyFragment(normalized)) {
    throw new Error("This snippet is a props fragment, so there is nothing to render by itself.")
  }

  if (!isPreviewLanguage(language)) {
    throw new Error(`"${language}" snippets do not have a browser preview runtime.`)
  }

  const parsed = parseImports(normalized, previewLanguage)
  assertSupportedImports(parsed.bindings)

  const executableSource = addCoreBootstrap(parsed.body, previewLanguage)
  const transpiled = transformTypeScript(executableSource, previewLanguage)
  const transformedImports = parseImports(transpiled, "js")
  assertSupportedImports(transformedImports.bindings)

  const body = stripEmptyModuleExport(transformedImports.body)
  const prelude = buildPrelude([...parsed.bindings, ...transformedImports.bindings])

  return {
    compiled: `${prelude.join("\n")}\n\nwith (__scope) {\n${body}\n}`,
  }
}
