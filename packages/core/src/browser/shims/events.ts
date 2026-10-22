type Listener = (...args: any[]) => void
type Entry = { listener: Listener; once: boolean }

export class EventEmitter {
  readonly #events = new Map<string | symbol, Entry[]>()

  #add(event: string | symbol, listener: Listener, once: boolean, prepend: boolean): this {
    const entries = this.#events.get(event) ?? []
    if (prepend) entries.unshift({ listener, once })
    else entries.push({ listener, once })
    this.#events.set(event, entries)
    return this
  }

  on(event: string | symbol, listener: Listener): this {
    return this.#add(event, listener, false, false)
  }

  addListener(event: string | symbol, listener: Listener): this {
    return this.#add(event, listener, false, false)
  }

  prependListener(event: string | symbol, listener: Listener): this {
    return this.#add(event, listener, false, true)
  }

  once(event: string | symbol, listener: Listener): this {
    return this.#add(event, listener, true, false)
  }

  prependOnceListener(event: string | symbol, listener: Listener): this {
    return this.#add(event, listener, true, true)
  }

  // Like Node, off() and removeListener() never call each other, so subclasses can override one and call the
  // other. Helpers are #private so they cannot collide with subclass methods such as Renderable.add().
  #remove(event: string | symbol, listener: Listener): this {
    const entries = this.#events.get(event)
    if (!entries) return this
    const index = entries.findLastIndex((entry) => entry.listener === listener)
    if (index !== -1) entries.splice(index, 1)
    if (entries.length === 0) this.#events.delete(event)
    return this
  }

  off(event: string | symbol, listener: Listener): this {
    return this.#remove(event, listener)
  }

  removeListener(event: string | symbol, listener: Listener): this {
    return this.#remove(event, listener)
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.#events.clear()
    else this.#events.delete(event)
    return this
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const entries = this.#events.get(event)
    if (!entries || entries.length === 0) {
      if (event === "error") throw args[0] instanceof Error ? args[0] : new Error(String(args[0]))
      return false
    }
    for (const entry of [...entries]) {
      if (entry.once) this.#remove(event, entry.listener)
      entry.listener.apply(this, args)
    }
    return true
  }

  listenerCount(event: string | symbol): number {
    return this.#events.get(event)?.length ?? 0
  }

  listeners(event: string | symbol): Listener[] {
    return (this.#events.get(event) ?? []).map((entry) => entry.listener)
  }

  rawListeners(event: string | symbol): Listener[] {
    return this.listeners(event)
  }

  eventNames(): Array<string | symbol> {
    return [...this.#events.keys()]
  }

  setMaxListeners(_count: number): this {
    return this
  }

  getMaxListeners(): number {
    return Infinity
  }
}

export default { EventEmitter }
