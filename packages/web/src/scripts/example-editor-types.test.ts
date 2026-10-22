import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

import { CORE_PACKAGE_ROOT, createCoreExtraLibs } from "./example-editor-types"

const CORE_PACKAGE_DIR = path.resolve(import.meta.dir, "../../../core")
const CORE_SOURCE_DIR = path.join(CORE_PACKAGE_DIR, "src")

function readCoreSourceFiles(dir: string, output: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) readCoreSourceFiles(entryPath, output)
    else if (entry.isFile() && entry.name.endsWith(".ts")) output[entryPath] = readFileSync(entryPath, "utf8")
  }
  return output
}

const extraLibs = createCoreExtraLibs(
  readFileSync(path.join(CORE_PACKAGE_DIR, "package.json"), "utf8"),
  readCoreSourceFiles(CORE_SOURCE_DIR),
)

test("creates a virtual @opentui/core package for the editor", () => {
  const paths = new Set(extraLibs.map((lib) => lib.filePath))

  expect(paths.has(`${CORE_PACKAGE_ROOT}/package.json`)).toBe(true)
  expect(paths.has(`${CORE_PACKAGE_ROOT}/index.d.ts`)).toBe(true)
  expect(paths.has(`${CORE_PACKAGE_ROOT}/browser.d.ts`)).toBe(true)
  expect(paths.has(`${CORE_PACKAGE_ROOT}/src/renderables/Box.ts`)).toBe(true)
  expect(paths.has(`${CORE_PACKAGE_ROOT}/src/renderer.test.ts`)).toBe(false)
  expect(paths.has(`${CORE_PACKAGE_ROOT}/src/examples/index.ts`)).toBe(false)
})

test("completes string-literal props from @opentui/core", () => {
  const mainFilePath = "file:///opentui-examples/example.ts"
  const mainFileText = ['import { Box } from "@opentui/core"', 'Box({ borderStyle: "" })'].join("\n")
  const files: Record<string, string> = Object.fromEntries([
    [mainFilePath, mainFileText],
    ...extraLibs.map((lib) => [lib.filePath, lib.content]),
  ])
  const paths = Object.keys(files)
  const withSlash = (directory: string) => (directory.endsWith("/") ? directory : `${directory}/`)

  const service = ts.createLanguageService({
    getCompilationSettings: () => ({
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    }),
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    directoryExists: (directory) => paths.some((file) => file.startsWith(withSlash(directory))),
    getDirectories: (directory) => [
      ...new Set(
        paths
          .filter(
            (file) => file.startsWith(withSlash(directory)) && file.slice(withSlash(directory).length).includes("/"),
          )
          .map((file) => file.slice(withSlash(directory).length).split("/")[0]!),
      ),
    ],
    fileExists: (file) => file in files || ts.sys.fileExists(file),
    readFile: (file) => files[file] ?? ts.sys.readFile(file),
    getScriptFileNames: () => paths,
    getScriptSnapshot: (file) => {
      const text = files[file] ?? ts.sys.readFile(file)
      return typeof text === "string" ? ts.ScriptSnapshot.fromString(text) : undefined
    },
    getScriptVersion: () => "1",
  })

  const completions = service.getCompletionsAtPosition(mainFilePath, mainFileText.indexOf('""') + 1, {})
  expect(completions?.entries.map((entry) => entry.name)).toEqual(
    expect.arrayContaining(["single", "double", "rounded", "heavy"]),
  )
})
