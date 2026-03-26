import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import process from "process"

interface PackageJson {
  name: string
  version: string
  description?: string
  license?: string
  repository?: unknown
  author?: string
  homepage?: string
  bugs?: unknown
  keywords?: string[]
  module?: string
  type?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, unknown>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, "..")
const projectRootDir = resolve(rootDir, "../..")
const licensePath = join(projectRootDir, "LICENSE")
const packageJson: PackageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))

if (!packageJson.module) {
  console.error("Error: 'module' field not found in package.json")
  process.exit(1)
}

const distDir = join(rootDir, "dist")
rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const externalDeps = [...Object.keys(packageJson.dependencies || {}), ...Object.keys(packageJson.peerDependencies || {})]

const buildResult = await Bun.build({
  entrypoints: [join(rootDir, packageJson.module), join(rootDir, "src/browser.ts")],
  target: "bun",
  format: "esm",
  outdir: distDir,
  external: externalDeps,
  splitting: true,
})

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs)
  process.exit(1)
}

const runtimeRootDir = resolve(rootDir, "../react-runtime")
const runtimeBuildResult: SpawnSyncReturns<Buffer> = spawnSync("bun", ["run", "build"], {
  cwd: runtimeRootDir,
  stdio: "inherit",
})

if (runtimeBuildResult.status !== 0) {
  console.error("Error: Failed to build @opentui/react-runtime declarations required by open-ink")
  process.exit(1)
}

const tscResult: SpawnSyncReturns<Buffer> = spawnSync("bunx", ["tsc", "-p", join(rootDir, "tsconfig.build.json")], {
  cwd: rootDir,
  stdio: "inherit",
})

if (tscResult.status !== 0) {
  console.error("TypeScript declaration generation failed")
  process.exit(1)
}

const exports = {
  ".": {
    types: "./src/index.d.ts",
    import: "./index.js",
    require: "./index.js",
  },
  "./browser": {
    types: "./src/browser.d.ts",
    import: "./browser.js",
    require: "./browser.js",
  },
}

const processedDependencies = { ...packageJson.dependencies }
if (processedDependencies["@opentui/core"] === "workspace:*") {
  processedDependencies["@opentui/core"] = packageJson.version
}

writeFileSync(
  join(distDir, "package.json"),
  JSON.stringify(
    {
      name: packageJson.name,
      module: "index.js",
      main: "index.js",
      types: "src/index.d.ts",
      type: packageJson.type,
      version: packageJson.version,
      description: packageJson.description,
      keywords: packageJson.keywords,
      license: packageJson.license,
      author: packageJson.author,
      homepage: packageJson.homepage,
      repository: packageJson.repository,
      bugs: packageJson.bugs,
      exports,
      dependencies: processedDependencies,
      peerDependencies: packageJson.peerDependencies,
      peerDependenciesMeta: packageJson.peerDependenciesMeta,
    },
    null,
    2,
  ),
)

if (existsSync(licensePath)) {
  copyFileSync(licensePath, join(distDir, "LICENSE"))
}
