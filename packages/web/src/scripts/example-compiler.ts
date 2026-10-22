import { transform } from "sucrase"

// "core" runs plain @opentui/core programs. "react" covers JSX programs (open-ink,
// @opentui/react), which need a runtime that is not wired up yet.
export type RuntimeKind = "core" | "react"

export interface CompiledExample {
  code: string
  runtimeKind: RuntimeKind
  imports: string[]
}

const LANGUAGES: Record<string, "ts" | "js" | "tsx" | "jsx"> = {
  typescript: "ts",
  ts: "ts",
  javascript: "js",
  js: "js",
  tsx: "tsx",
  jsx: "jsx",
}

const REACT_MODULES = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "open-ink",
  "@opentui/react",
  "@opentui/react-runtime",
])

const IMPORT_PATTERN =
  /(?:^|[\n;])\s*(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g

export function isRunnableLanguage(language: string): boolean {
  return language.trim().toLowerCase() in LANGUAGES
}

export function findImports(code: string): string[] {
  const sources = new Set<string>()
  for (const match of code.matchAll(IMPORT_PATTERN)) sources.add(match[1] ?? match[2]!)
  return [...sources]
}

function isPropertyFragment(code: string): boolean {
  return code.startsWith("{") && !/\b(?:const|let|function|class)\s/.test(code)
}

// Compiles an example to the body of an async function that receives
// `require`, `exports`, and `module`. Imports become require() calls, so the
// runtime decides what each module resolves to.
export function compileExample(source: string, language: string): CompiledExample {
  const code = source.replace(/\r\n?/g, "\n").trim()
  const dialect = LANGUAGES[language.trim().toLowerCase()]

  if (!dialect) throw new Error(`${language} examples do not run in the browser.`)
  if (!code) throw new Error("The example is empty.")
  if (isPropertyFragment(code)) throw new Error("The example is an options fragment. It does not render by itself.")

  const imports = findImports(code)
  const jsx = dialect === "tsx" || dialect === "jsx"
  const runtimeKind: RuntimeKind = jsx || imports.some((name) => REACT_MODULES.has(name)) ? "react" : "core"

  const transforms: Array<"typescript" | "jsx" | "imports"> = ["imports"]
  if (dialect === "ts" || dialect === "tsx") transforms.unshift("typescript")
  if (jsx) transforms.unshift("jsx")

  const output = transform(code, {
    transforms,
    filePath: `example.${dialect}`,
    jsxRuntime: "automatic",
    production: true,
  })

  return { code: output.code, runtimeKind, imports }
}
