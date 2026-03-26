import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"

interface PackageJson {
  name: string
  version: string
  module?: string
  type?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, "..")
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
  entrypoints: [join(rootDir, packageJson.module)],
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

const tscResult: SpawnSyncReturns<Buffer> = spawnSync("bunx", ["tsc", "-p", join(rootDir, "tsconfig.build.json")], {
  cwd: rootDir,
  stdio: "inherit",
})

if (tscResult.status !== 0) {
  console.error("TypeScript declaration generation failed")
  process.exit(1)
}

writeFileSync(
  join(distDir, "package.json"),
  JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      private: true,
      type: packageJson.type,
      module: "index.js",
      main: "index.js",
      types: "src/index.d.ts",
    },
    null,
    2,
  ),
)
