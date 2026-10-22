// The editor resolves `@opentui/core` imports against core's source, mounted as a
// virtual package under the editor's model root.
export const EDITOR_MODEL_ROOT = "file:///opentui-examples"
export const CORE_PACKAGE_ROOT = `${EDITOR_MODEL_ROOT}/node_modules/@opentui/core`

export interface ExtraLib {
  filePath: string
  content: string
}

interface PackageJson {
  types?: string
  exports?: Record<string, string | { types?: string }>
}

const CORE_SOURCE_MARKER = "/core/src/"
const EXCLUDED = ["/__snapshots__/", "/__tests__/", "/benchmark/", "/dev/", "/examples/", "/tests/", "/testing/"]

export function isCoreTypeSource(sourcePath: string): boolean {
  const normalized = sourcePath.replace(/\\/g, "/")
  if (!normalized.endsWith(".ts") || /\.test\.tsx?$/.test(normalized)) return false
  return !EXCLUDED.some((pattern) => normalized.includes(pattern))
}

function entryPoint(typesPath: string): string {
  const relative = typesPath.replace(/\\/g, "/").replace(/^\.\//, "")
  return `export * from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)}\n`
}

export function createCoreExtraLibs(packageJsonText: string, sourceFiles: Record<string, string>): ExtraLib[] {
  const files = new Map<string, string>([[`${CORE_PACKAGE_ROOT}/package.json`, packageJsonText]])

  for (const [sourcePath, content] of Object.entries(sourceFiles)) {
    const normalized = sourcePath.replace(/\\/g, "/")
    const marker = normalized.lastIndexOf(CORE_SOURCE_MARKER)
    if (marker < 0 || !isCoreTypeSource(normalized)) continue
    files.set(`${CORE_PACKAGE_ROOT}/src/${normalized.slice(marker + CORE_SOURCE_MARKER.length)}`, content)
  }

  const packageJson = JSON.parse(packageJsonText) as PackageJson
  if (packageJson.types) files.set(`${CORE_PACKAGE_ROOT}/index.d.ts`, entryPoint(packageJson.types))
  for (const [key, value] of Object.entries(packageJson.exports ?? {})) {
    const types = typeof value === "string" ? value : value.types
    if (!types?.endsWith(".ts") || !key.startsWith("./")) continue
    files.set(`${CORE_PACKAGE_ROOT}/${key.slice(2)}.d.ts`, entryPoint(types))
  }

  return [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({ filePath, content }))
}
