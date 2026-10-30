import { createReadStream, existsSync } from "node:fs"
import { copyFile, cp, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { AstroIntegration, AstroUserConfig } from "astro"
import { browserShimAliases } from "../../../core/src/browser/shims/index.ts"
import { writeBuildInfo } from "../../scripts/site/build-info"

// Live examples run @opentui/core in the page against opentui.wasm. The site serves
// the wasm at this path; build it with `bun run build:wasm` in packages/core.
export const OPENTUI_WASM_PATH = "opentui/opentui.wasm"

// Syntax highlighting uses the browser tree-sitter worker and parsers from core's
// build output (`bun run build:lib` in packages/core), served under opentui/.
const CORE_DIST = resolve(fileURLToPath(new URL("../../../core/dist", import.meta.url)))
const CORE_BROWSER_ASSETS = ["tree-sitter.wasm", "parser.worker.browser.js", "assets"]

type VitePlugin = NonNullable<NonNullable<AstroUserConfig["vite"]>["plugins"]>[number]

const CORE_SOURCE = resolve(fileURLToPath(new URL("../../../core/src", import.meta.url)))
// Packages that run on core in the page and import Node built-ins the same way.
const SHIMMED_SOURCES = [CORE_SOURCE, resolve(fileURLToPath(new URL("../../../open-ink/src", import.meta.url)))]

function wasmSource(): string {
  return resolve(
    process.env.OPENTUI_WASM ?? fileURLToPath(new URL("../../../native/lib/wasm32-wasi/opentui.wasm", import.meta.url)),
  )
}

function missingAssetsWarning(): string {
  return `${CORE_DIST} has no browser tree-sitter assets, so examples will not highlight code. Build core with \`bun run build:lib\`.`
}

function contentType(path: string): string {
  if (path.endsWith(".wasm")) return "application/wasm"
  if (path.endsWith(".js")) return "text/javascript"
  return "text/plain"
}

function missingWasmWarning(path: string): string {
  return `${path} is missing, so live examples will not run. Build it with \`bun run build:wasm\` in packages/core.`
}

// Core and open-ink import Node built-ins. Client bundles resolve them to core's browser shims;
// the server build keeps the real modules.
function browserShims(): VitePlugin {
  const aliases = browserShimAliases()
  return {
    name: "opentui-browser-shims",
    enforce: "pre",
    resolveId(this: { environment?: { name: string } }, source: string, importer: string | undefined) {
      if (this.environment?.name !== "client" || !importer) return null
      if (!SHIMMED_SOURCES.some((source) => resolve(importer).startsWith(source))) return null
      return aliases.find((alias) => alias.find.test(source))?.replacement ?? null
    },
  }
}

export function opentuiBrowser(): AstroIntegration {
  return {
    name: "opentui-browser",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [browserShims()] } })
      },
      "astro:server:setup": ({ server, logger }) => {
        const source = wasmSource()
        if (!existsSync(source)) logger.warn(missingWasmWarning(source))
        server.middlewares.use(`/${OPENTUI_WASM_PATH}`, (_request, response, next) => {
          if (!existsSync(source)) return next()
          response.setHeader("Content-Type", "application/wasm")
          response.setHeader("Access-Control-Allow-Origin", "*")
          createReadStream(source).pipe(response)
        })
        if (!existsSync(join(CORE_DIST, "parser.worker.browser.js"))) logger.warn(missingAssetsWarning())
        server.middlewares.use("/opentui", (request, response, next) => {
          const name = decodeURIComponent((request.url ?? "/").split("?")[0]!).replace(/^\/+/, "")
          const path = resolve(CORE_DIST, name)
          const allowed = CORE_BROWSER_ASSETS.some((asset) => name === asset || name.startsWith(`${asset}/`))
          if (!allowed || !path.startsWith(CORE_DIST) || !existsSync(path)) return next()
          response.setHeader("Content-Type", contentType(path))
          response.setHeader("Access-Control-Allow-Origin", "*")
          createReadStream(path).pipe(response)
        })
      },
      "astro:build:done": async ({ dir, logger }) => {
        await writeBuildInfo(fileURLToPath(dir))
        const source = wasmSource()
        if (!existsSync(source)) {
          logger.warn(missingWasmWarning(source))
          return
        }
        const target = join(fileURLToPath(dir), OPENTUI_WASM_PATH)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(source, target)
        if (!existsSync(join(CORE_DIST, "parser.worker.browser.js"))) {
          logger.warn(missingAssetsWarning())
          return
        }
        for (const asset of CORE_BROWSER_ASSETS) {
          await cp(join(CORE_DIST, asset), join(dirname(target), asset), { recursive: true })
        }
      },
    },
  }
}
