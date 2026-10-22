import { createBrowserRenderer, loadOpenTUI, type BrowserTerminalHost } from "@opentui/core/browser"
import { compileExample, type RuntimeKind } from "./example-compiler"

export interface RuntimeContext {
  host: BrowserTerminalHost
  wasm: string
  backgroundColor: string
}

export interface ExampleRuntime {
  modules: Record<string, unknown>
  hasOutput(): boolean
}

type RuntimeFactory = (context: RuntimeContext) => Promise<ExampleRuntime>

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>

// Each example sees @opentui/core loaded against the wasm bindings, with
// createCliRenderer() attached to the preview terminal.
async function createCoreRuntime({ host, wasm, backgroundColor }: RuntimeContext): Promise<ExampleRuntime> {
  const opentui = await loadOpenTUI({ wasm })
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

const RUNTIMES: Partial<Record<RuntimeKind, RuntimeFactory>> = {
  core: createCoreRuntime,
}

const UNSUPPORTED: Record<RuntimeKind, string> = {
  core: "",
  react: "React and open-ink examples do not run in the browser yet.",
}

export async function runExample(source: string, language: string, context: RuntimeContext): Promise<ExampleRuntime> {
  const compiled = compileExample(source, language)
  const createRuntime = RUNTIMES[compiled.runtimeKind]
  if (!createRuntime) throw new Error(UNSUPPORTED[compiled.runtimeKind])

  const runtime = await createRuntime(context)
  const require = (name: string) => {
    if (name in runtime.modules) return runtime.modules[name]
    throw new Error(`Examples can import ${Object.keys(runtime.modules).join(", ")} in the browser, not ${name}.`)
  }
  const module = { exports: {} }
  await new AsyncFunction("require", "exports", "module", compiled.code)(require, module.exports, module)

  if (!runtime.hasOutput()) throw new Error("The example ran, but it did not render anything.")
  return runtime
}
