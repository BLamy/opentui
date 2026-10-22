import { createReadStream, existsSync } from "node:fs"
import { copyFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { AstroIntegration, AstroUserConfig } from "astro"
import { browserShimAliases } from "../../../core/src/browser/shims/index.ts"

// Live examples run @opentui/core in the page against opentui.wasm. The site serves
// the wasm at this path; build it with `bun run build:wasm` in packages/core.
export const OPENTUI_WASM_PATH = "opentui/opentui.wasm"

type VitePlugin = NonNullable<NonNullable<AstroUserConfig["vite"]>["plugins"]>[number]

const CORE_SOURCE = resolve(fileURLToPath(new URL("../../../core/src", import.meta.url)))

function wasmSource(): string {
  return resolve(
    process.env.OPENTUI_WASM ?? fileURLToPath(new URL("../../../native/lib/wasm32-wasi/opentui.wasm", import.meta.url)),
  )
}

function missingWasmWarning(path: string): string {
  return `${path} is missing, so live examples will not run. Build it with \`bun run build:wasm\` in packages/core.`
}

// Core imports Node built-ins. Client bundles resolve them to core's browser shims;
// the server build keeps the real modules.
function browserShims(): VitePlugin {
  const aliases = browserShimAliases()
  return {
    name: "opentui-browser-shims",
    enforce: "pre",
    resolveId(this: { environment?: { name: string } }, source: string, importer: string | undefined) {
      if (this.environment?.name !== "client" || !importer) return null
      if (!resolve(importer).startsWith(CORE_SOURCE)) return null
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
          createReadStream(source).pipe(response)
        })
      },
      "astro:build:done": async ({ dir, logger }) => {
        const source = wasmSource()
        if (!existsSync(source)) {
          logger.warn(missingWasmWarning(source))
          return
        }
        const target = join(fileURLToPath(dir), OPENTUI_WASM_PATH)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(source, target)
      },
    },
  }
}
