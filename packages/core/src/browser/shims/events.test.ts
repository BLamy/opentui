import { expect, test } from "bun:test"
import { EventEmitter } from "./events.js"

test("off and removeListener can each be overridden to call the other", () => {
  class OffCallsRemove extends EventEmitter {
    override off(event: string, listener: () => void): this {
      return this.removeListener(event, listener)
    }
  }
  class RemoveCallsOff extends EventEmitter {
    override removeListener(event: string, listener: () => void): this {
      return this.off(event, listener)
    }
  }
  for (const emitter of [new OffCallsRemove(), new RemoveCallsOff()]) {
    const listener = () => {}
    emitter.on("change", listener)
    emitter.off("change", listener)
    expect(emitter.listenerCount("change")).toBe(0)
  }
})

test("once listeners run a single time and prepend runs first", () => {
  const emitter = new EventEmitter()
  const calls: string[] = []
  emitter.once("tick", () => calls.push("once"))
  emitter.prependListener("tick", () => calls.push("first"))
  emitter.emit("tick")
  emitter.emit("tick")
  expect(calls).toEqual(["first", "once", "first"])
})

test("subclass methods named like internal helpers do not break listeners", () => {
  class Container extends EventEmitter {
    readonly children: string[] = []
    add(child: string) {
      this.children.push(child)
    }
    remove(child: string) {
      this.children.splice(this.children.indexOf(child), 1)
    }
  }
  const container = new Container()
  const listener = () => {}
  container.on("resize", listener)
  container.off("resize", listener)
  expect(container.children).toEqual([])
  expect(container.listenerCount("resize")).toBe(0)
})
