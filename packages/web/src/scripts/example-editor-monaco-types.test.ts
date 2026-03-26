import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

import { DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT, createCoreMonacoExtraLibs } from "./example-editor-monaco-types"
import { createPreviewRuntimeMonacoExtraLibs } from "./example-editor-monaco-preview-types"

const CORE_PACKAGE_DIR = path.resolve(import.meta.dir, "../../../core")
const CORE_SOURCE_DIR = path.join(CORE_PACKAGE_DIR, "src")
const CORE_PACKAGE_JSON_PATH = path.join(CORE_PACKAGE_DIR, "package.json")

function readCoreSourceFiles(dir: string, output: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      readCoreSourceFiles(entryPath, output)
      continue
    }

    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts"))) {
      output[entryPath] = readFileSync(entryPath, "utf8")
    }
  }

  return output
}

function createVirtualDirectoryHelpers(virtualFiles: Record<string, string>) {
  const filePaths = Object.keys(virtualFiles)

  const directoryExists = (directoryPath: string): boolean => {
    const normalizedDirectoryPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`
    return filePaths.some((filePath) => filePath.startsWith(normalizedDirectoryPath))
  }

  const getDirectories = (directoryPath: string): string[] => {
    const normalizedDirectoryPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`
    const directories = new Set<string>()

    for (const filePath of filePaths) {
      if (!filePath.startsWith(normalizedDirectoryPath)) {
        continue
      }

      const nextSegment = filePath.slice(normalizedDirectoryPath.length).split("/")[0]
      if (nextSegment && filePath.slice(normalizedDirectoryPath.length).includes("/")) {
        directories.add(nextSegment)
      }
    }

    return [...directories]
  }

  const readDirectory = (directoryPath: string): string[] => {
    const normalizedDirectoryPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`
    return filePaths.filter((filePath) => filePath.startsWith(normalizedDirectoryPath))
  }

  return {
    directoryExists,
    getDirectories,
    readDirectory,
  }
}

test("creates a virtual @opentui/core package rooted under the docs example workspace", () => {
  const sourceFiles = readCoreSourceFiles(CORE_SOURCE_DIR)
  const extraLibs = createCoreMonacoExtraLibs(readFileSync(CORE_PACKAGE_JSON_PATH, "utf8"), sourceFiles)
  const extraLibPaths = new Set(extraLibs.map((lib) => lib.filePath))

  expect(extraLibPaths.has(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/package.json`)).toBe(true)
  expect(extraLibPaths.has(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/index.d.ts`)).toBe(true)
  expect(extraLibPaths.has(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/src/index.ts`)).toBe(true)
  expect(extraLibPaths.has(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/src/renderables/Box.ts`)).toBe(true)
  expect(extraLibPaths.has(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/src/examples/editor-demo.ts`)).toBe(false)
})

test("restores string-literal completions for @opentui/core props", () => {
  const mainFilePath = "file:///opentui-doc-examples/example.ts"
  const mainFileText = ['import { Box } from "@opentui/core"', 'Box({ borderStyle: "" })'].join("\n")
  const sourceFiles = readCoreSourceFiles(CORE_SOURCE_DIR)
  const extraLibs = createCoreMonacoExtraLibs(readFileSync(CORE_PACKAGE_JSON_PATH, "utf8"), sourceFiles)

  const virtualFiles = Object.fromEntries(
    [[mainFilePath, mainFileText], ...extraLibs.map((lib) => [lib.filePath, lib.content] as const)].map(
      ([filePath, content]) => [filePath, content],
    ),
  )
  const { directoryExists, getDirectories, readDirectory } = createVirtualDirectoryHelpers(virtualFiles)

  const languageServiceHost: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({
      allowImportingTsExtensions: true,
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    }),
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories,
    directoryExists,
    fileExists: (filePath) => filePath in virtualFiles || ts.sys.fileExists(filePath),
    getScriptFileNames: () => Object.keys(virtualFiles),
    getScriptSnapshot: (filePath) => {
      const fileText = virtualFiles[filePath]
      if (typeof fileText === "string") {
        return ts.ScriptSnapshot.fromString(fileText)
      }

      const diskFileText = ts.sys.readFile(filePath)
      return typeof diskFileText === "string" ? ts.ScriptSnapshot.fromString(diskFileText) : undefined
    },
    getScriptVersion: () => "1",
    readDirectory,
    readFile: (filePath) => virtualFiles[filePath] ?? ts.sys.readFile(filePath),
  }

  const languageService = ts.createLanguageService(languageServiceHost)
  const completionPosition = mainFileText.indexOf('""') + 1
  const completions = languageService.getCompletionsAtPosition(mainFilePath, completionPosition, {
    includeCompletionsWithInsertText: true,
  })

  expect(completions?.entries.map((entry) => entry.name)).toEqual(
    expect.arrayContaining(["single", "double", "rounded", "heavy"]),
  )
})

test("resolves react and open-ink imports for TSX doc examples", () => {
  const mainFilePath = "file:///opentui-doc-examples/example.tsx"
  const mainFileText = [
    'import { Box, Text, render } from "open-ink"',
    'import { useState } from "react"',
    "",
    "function App() {",
    "  const [count] = useState(1)",
    "  return <Box border><Text>{count}</Text></Box>",
    "}",
    "",
    "render(<App />)",
  ].join("\n")
  const sourceFiles = readCoreSourceFiles(CORE_SOURCE_DIR)
  const extraLibs = [
    ...createCoreMonacoExtraLibs(readFileSync(CORE_PACKAGE_JSON_PATH, "utf8"), sourceFiles),
    ...createPreviewRuntimeMonacoExtraLibs(),
  ]

  const virtualFiles = Object.fromEntries(
    [[mainFilePath, mainFileText], ...extraLibs.map((lib) => [lib.filePath, lib.content] as const)].map(
      ([filePath, content]) => [filePath, content],
    ),
  )
  const { directoryExists, getDirectories, readDirectory } = createVirtualDirectoryHelpers(virtualFiles)

  const languageServiceHost: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({
      allowImportingTsExtensions: true,
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    }),
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories,
    directoryExists,
    fileExists: (filePath) => filePath in virtualFiles || ts.sys.fileExists(filePath),
    getScriptFileNames: () => Object.keys(virtualFiles),
    getScriptSnapshot: (filePath) => {
      const fileText = virtualFiles[filePath]
      if (typeof fileText === "string") {
        return ts.ScriptSnapshot.fromString(fileText)
      }

      const diskFileText = ts.sys.readFile(filePath)
      return typeof diskFileText === "string" ? ts.ScriptSnapshot.fromString(diskFileText) : undefined
    },
    getScriptVersion: () => "1",
    readDirectory,
    readFile: (filePath) => virtualFiles[filePath] ?? ts.sys.readFile(filePath),
  }

  const languageService = ts.createLanguageService(languageServiceHost)
  const diagnostics = [
    ...languageService.getSyntacticDiagnostics(mainFilePath),
    ...languageService.getSemanticDiagnostics(mainFilePath),
  ].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))

  expect(diagnostics).not.toEqual(
    expect.arrayContaining([
      expect.stringContaining('Cannot find module "react"'),
      expect.stringContaining('Cannot find module "open-ink"'),
      expect.stringContaining("JSX element implicitly has type"),
    ]),
  )
})
