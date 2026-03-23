import { defineConfig } from "astro/config"
import mdx from "@astrojs/mdx"
import { fileURLToPath } from "node:url"

function hasDocExampleFlag(meta) {
  if (typeof meta !== "string") {
    return false
  }

  return meta.trim().split(/\s+/).includes("example")
}

function annotateDocExampleFences() {
  return (tree) => {
    const visit = (node) => {
      if (!node || typeof node !== "object" || !Array.isArray(node.children)) {
        return
      }

      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index]

        if (child?.type === "code" && hasDocExampleFlag(child.meta)) {
          node.children.splice(
            index,
            1,
            {
              type: "html",
              value: `<div data-doc-example="true" data-doc-example-language="${child.lang ?? ""}">`,
            },
            child,
            {
              type: "html",
              value: "</div>",
            },
          )
          index += 2
          continue
        }

        visit(child)
      }
    }

    visit(tree)
  }
}

const copyButtonTransformer = {
  name: "copy-button",
  pre(node) {
    node.properties["data-code"] = this.source
  },
}

const browserAliases = [
  { find: /^bun:ffi$/, replacement: fileURLToPath(new URL("./src/shims/bun-ffi.ts", import.meta.url)) },
  { find: /^node:fs\/promises$/, replacement: fileURLToPath(new URL("./src/shims/fs-promises.ts", import.meta.url)) },
  { find: /^node:fs$/, replacement: fileURLToPath(new URL("./src/shims/fs.ts", import.meta.url)) },
  { find: /^node:os$/, replacement: fileURLToPath(new URL("./src/shims/os.ts", import.meta.url)) },
  { find: /^node:path$/, replacement: fileURLToPath(new URL("./src/shims/path.ts", import.meta.url)) },
  { find: /^node:worker_threads$/, replacement: fileURLToPath(new URL("./src/shims/worker-threads.ts", import.meta.url)) },
  { find: /^fs\/promises$/, replacement: fileURLToPath(new URL("./src/shims/fs-promises.ts", import.meta.url)) },
  { find: /^fs$/, replacement: fileURLToPath(new URL("./src/shims/fs.ts", import.meta.url)) },
  { find: /^os$/, replacement: fileURLToPath(new URL("./src/shims/os.ts", import.meta.url)) },
  { find: /^path$/, replacement: fileURLToPath(new URL("./src/shims/path.ts", import.meta.url)) },
  { find: /^url$/, replacement: fileURLToPath(new URL("./src/shims/url.ts", import.meta.url)) },
  { find: /^worker_threads$/, replacement: fileURLToPath(new URL("./src/shims/worker-threads.ts", import.meta.url)) },
]

export default defineConfig({
  integrations: [mdx()],
  site: "https://opentui.com",
  markdown: {
    remarkPlugins: [annotateDocExampleFences],
    shikiConfig: {
      themes: {
        light: "min-light",
        dark: "github-dark",
      },
      transformers: [copyButtonTransformer],
    },
  },
  vite: {
    define: {
      "process.arch": JSON.stringify("x64"),
      "process.platform": JSON.stringify("browser"),
    },
    build: {
      target: "es2022",
    },
    resolve: {
      alias: browserAliases,
    },
    optimizeDeps: {
      include: ["@xterm/addon-fit", "@xterm/xterm", "monaco-editor", "typescript"],
      esbuildOptions: {
        // yoga-layout ships a top-level-await ESM entry.
        target: "es2022",
      },
    },
  },
})
