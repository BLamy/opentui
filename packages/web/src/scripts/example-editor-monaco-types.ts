export const DOCS_EXAMPLE_MONACO_VIRTUAL_ROOT = "file:///opentui-doc-examples"
export const DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT = `${DOCS_EXAMPLE_MONACO_VIRTUAL_ROOT}/node_modules/@opentui/core`

export interface MonacoExtraLibSource {
  content: string
  filePath: string
}

interface PackageJsonExportValue {
  types?: string
}

interface PackageJsonShape {
  exports?: Record<string, string | PackageJsonExportValue>
  types?: string
}

const CORE_SOURCE_MARKER = "/core/src/"
const CORE_SOURCE_PREFIX = "../../../core/src/"
const CORE_SOURCE_EXCLUDE_PATTERNS = ["/__snapshots__/", "/__tests__/", "/benchmark/", "/dev/", "/examples/", "/tests/"]

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/")
}

function toRelativeModuleSpecifier(value: string): string {
  const normalized = normalizePath(value).replace(/^\.\//, "")
  return normalized.startsWith(".") ? normalized : `./${normalized}`
}

function getEntryPointTypesPath(exportValue: string | PackageJsonExportValue | undefined): string | null {
  if (typeof exportValue === "string") {
    const normalized = normalizePath(exportValue)
    return normalized.endsWith(".ts") || normalized.endsWith(".d.ts") ? normalized : null
  }

  if (typeof exportValue?.types === "string") {
    return exportValue.types
  }

  return null
}

function getSyntheticEntryPointFileName(exportKey: string): string | null {
  if (exportKey === ".") {
    return "index.d.ts"
  }

  if (!exportKey.startsWith("./")) {
    return null
  }

  return `${exportKey.slice(2)}.d.ts`
}

function createSyntheticEntryPointContent(typesPath: string): string {
  return `export * from ${JSON.stringify(toRelativeModuleSpecifier(typesPath))}\n`
}

export function shouldIncludeCoreMonacoTypeSource(sourcePath: string): boolean {
  const normalized = normalizePath(sourcePath)

  if (!normalized.endsWith(".ts") && !normalized.endsWith(".d.ts")) {
    return false
  }

  if (normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) {
    return false
  }

  return !CORE_SOURCE_EXCLUDE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function resolveCoreMonacoVirtualSourcePath(sourcePath: string): string | null {
  const normalized = normalizePath(sourcePath)
  const markerIndex = normalized.lastIndexOf(CORE_SOURCE_MARKER)

  if (markerIndex >= 0) {
    const relativePath = normalized.slice(markerIndex + CORE_SOURCE_MARKER.length)
    return `${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/src/${relativePath}`
  }

  if (normalized.startsWith(CORE_SOURCE_PREFIX)) {
    return `${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/src/${normalized.slice(CORE_SOURCE_PREFIX.length)}`
  }

  return null
}

export function createCoreMonacoExtraLibs(
  packageJsonText: string,
  sourceFiles: Record<string, string>,
): MonacoExtraLibSource[] {
  const fileMap = new Map<string, string>()

  fileMap.set(`${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/package.json`, packageJsonText)

  for (const [sourcePath, content] of Object.entries(sourceFiles)) {
    if (!shouldIncludeCoreMonacoTypeSource(sourcePath)) {
      continue
    }

    const virtualFilePath = resolveCoreMonacoVirtualSourcePath(sourcePath)
    if (!virtualFilePath) {
      continue
    }

    fileMap.set(virtualFilePath, content)
  }

  let parsedPackageJson: PackageJsonShape | null = null
  try {
    parsedPackageJson = JSON.parse(packageJsonText) as PackageJsonShape
  } catch {
    parsedPackageJson = null
  }

  if (parsedPackageJson) {
    const rootTypesPath = getEntryPointTypesPath({ types: parsedPackageJson.types })
    if (rootTypesPath) {
      fileMap.set(
        `${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/index.d.ts`,
        createSyntheticEntryPointContent(rootTypesPath),
      )
    }

    for (const [exportKey, exportValue] of Object.entries(parsedPackageJson.exports ?? {})) {
      const entryPointFileName = getSyntheticEntryPointFileName(exportKey)
      const typesPath = getEntryPointTypesPath(exportValue)
      if (!entryPointFileName || !typesPath) {
        continue
      }

      fileMap.set(
        `${DOCS_EXAMPLE_MONACO_CORE_PACKAGE_ROOT}/${entryPointFileName}`,
        createSyntheticEntryPointContent(typesPath),
      )
    }
  }

  return [...fileMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({
      filePath,
      content,
    }))
}
