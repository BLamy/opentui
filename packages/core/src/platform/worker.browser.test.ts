import { expect, test } from "bun:test"
import { createModuleWorkerConstructor, type PlatformWorkerHandle } from "./worker"

class BrowserWorker implements PlatformWorkerHandle {
  onmessage = null
  onerror = null
  stopped = false
  constructor(
    readonly source: string | URL,
    readonly options: object = {},
  ) {}
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {
    this.stopped = true
  }
}

test("an opaque-origin worker loads a CORS module through a local blob and revokes it on termination", async () => {
  const Worker = createModuleWorkerConstructor(BrowserWorker, "null")
  const worker = new Worker("https://docs.example.com/opentui/parser.worker.browser.js") as BrowserWorker
  const source = String(worker.source)
  expect(source.startsWith("blob:")).toBe(true)
  expect(await (await fetch(source)).text()).toBe('import "https://docs.example.com/opentui/parser.worker.browser.js";')
  worker.terminate()
  expect(worker.stopped).toBe(true)
  await expect(fetch(source)).rejects.toThrow()
})

test("a same-origin worker keeps its original URL and module type", () => {
  const Worker = createModuleWorkerConstructor(BrowserWorker, "https://docs.example.com")
  const worker = new Worker("https://docs.example.com/worker.js", { name: "parser" }) as BrowserWorker
  expect(worker.source).toBe("https://docs.example.com/worker.js")
  expect(worker.options).toEqual({ name: "parser", type: "module" })
})
