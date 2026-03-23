import { copyFileSync, existsSync, mkdirSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const webRoot = resolve(__dirname, "..")
const browserPublicDir = join(webRoot, "public", "opentui")
const browserPublicPath = join(browserPublicDir, "opentui.wasm")

const candidates = [
  resolve(webRoot, "../core/dist/browser/opentui.wasm"),
  resolve(webRoot, "../core/src/zig/lib/wasm32-freestanding/libopentui.wasm"),
  resolve(webRoot, "../core/src/zig/lib/wasm32-freestanding/opentui.wasm"),
]

const sourcePath = candidates.find((candidate) => existsSync(candidate))

if (!sourcePath) {
  console.warn("[sync-core-wasm] No browser wasm artifact found. Run `cd packages/core && bun run build:wasm` to enable /workbench.")
  process.exit(0)
}

mkdirSync(browserPublicDir, { recursive: true })
copyFileSync(sourcePath, browserPublicPath)

console.log(`[sync-core-wasm] Copied ${sourcePath} -> ${browserPublicPath}`)
