import {
  createBrowserRenderer,
  loadOpenTUI,
  type BrowserRuntimeAssets,
  type BrowserTerminalHost,
} from "@opentui/core/browser"
import { compileExample, type RuntimeKind } from "./example-compiler"

export interface RuntimeContext {
  host: BrowserTerminalHost
  wasm: string
  assets: BrowserRuntimeAssets
  backgroundColor: string
}

export interface ExampleRuntime {
  modules: Record<string, unknown>
  // Resolves once work the example started but did not await has rendered.
  settle?(): Promise<void>
  hasOutput(): boolean
}

type RuntimeFactory = (context: RuntimeContext) => Promise<ExampleRuntime>

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>

// Each example sees @opentui/core loaded against the wasm bindings, with
// createCliRenderer() attached to the preview terminal.
async function createCoreRuntime({ host, wasm, assets, backgroundColor }: RuntimeContext): Promise<ExampleRuntime> {
  const opentui = await loadOpenTUI({ wasm, assets })
  const renderers: Array<Awaited<ReturnType<typeof createBrowserRenderer>>> = []

  const createCliRenderer = async (config: Parameters<typeof opentui.createCliRenderer>[0] = {}) => {
    const { stdin: _stdin, stdout: _stdout, ...rendererConfig } = config
    const renderer = await createBrowserRenderer(host, { backgroundColor, ...rendererConfig, wasm })
    renderers.push(renderer)
    return renderer
  }

  return {
    modules: { "@opentui/core": { ...opentui, createCliRenderer } },
    hasOutput: () => renderers.some((renderer) => !renderer.isDestroyed && renderer.root.getChildrenCount() > 0),
  }
}

// JSX examples use open-ink, rendered into one browser renderer per example.
async function createOpenInkRuntime({ host, wasm, assets, backgroundColor }: RuntimeContext): Promise<ExampleRuntime> {
  const [opentui, openInk, react, jsxRuntime] = await Promise.all([
    loadOpenTUI({ wasm, assets }),
    import("open-ink/browser"),
    import("react"),
    import("react/jsx-runtime"),
  ])
  const renderer = await createBrowserRenderer(host, { backgroundColor, wasm, assets })
  const renders: Promise<unknown>[] = []
  const render = (
    node: Parameters<typeof openInk.render>[0],
    options: Partial<Parameters<typeof openInk.render>[1]> = {},
  ) => {
    const instance = openInk.render(node, { ...options, renderer })
    renders.push(instance)
    return instance
  }

  return {
    modules: {
      "@opentui/core": opentui,
      "open-ink": { ...openInk, render },
      react,
      "react/jsx-runtime": jsxRuntime,
    },
    settle: async () => {
      await Promise.all(renders)
    },
    hasOutput: () => !renderer.isDestroyed && renderer.root.getChildrenCount() > 0,
  }
}

const RUNTIMES: Record<RuntimeKind, RuntimeFactory> = {
  core: createCoreRuntime,
  react: createOpenInkRuntime,
}

export async function runExample(source: string, language: string, context: RuntimeContext): Promise<ExampleRuntime> {
  const compiled = compileExample(source, language)
  if (compiled.imports.includes("@opentui/react"))
    throw new Error("@opentui/react examples do not run in the browser yet.")
  const runtime = await RUNTIMES[compiled.runtimeKind](context)
  const require = (name: string) => {
    if (name in runtime.modules) return runtime.modules[name]
    throw new Error(`Examples can import ${Object.keys(runtime.modules).join(", ")} in the browser, not ${name}.`)
  }
  const module = { exports: {} }
  await new AsyncFunction("require", "exports", "module", compiled.code)(require, module.exports, module)
  await runtime.settle?.()

  if (!runtime.hasOutput()) throw new Error("The example ran, but it did not render anything.")
  return runtime
}
