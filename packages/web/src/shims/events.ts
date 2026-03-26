type Listener = (...args: any[]) => void

export class EventEmitter {
  private readonly listeners = new Map<string | symbol, Set<Listener>>()

  public on(event: string | symbol, listener: Listener): this {
    let bucket = this.listeners.get(event)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(event, bucket)
    }

    bucket.add(listener)
    return this
  }

  public addListener(event: string | symbol, listener: Listener): this {
    return this.on(event, listener)
  }

  public once(event: string | symbol, listener: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped)
      listener(...args)
    }

    return this.on(event, wrapped)
  }

  public off(event: string | symbol, listener: Listener): this {
    const bucket = this.listeners.get(event)
    if (!bucket) {
      return this
    }

    bucket.delete(listener)
    if (bucket.size === 0) {
      this.listeners.delete(event)
    }

    return this
  }

  public removeListener(event: string | symbol, listener: Listener): this {
    return this.off(event, listener)
  }

  public emit(event: string | symbol, ...args: any[]): boolean {
    const bucket = this.listeners.get(event)
    if (!bucket || bucket.size === 0) {
      return false
    }

    for (const listener of [...bucket]) {
      listener(...args)
    }

    return true
  }

  public removeAllListeners(event?: string | symbol): this {
    if (event === undefined) {
      this.listeners.clear()
      return this
    }

    this.listeners.delete(event)
    return this
  }
}

const events = {
  EventEmitter,
}

export default events
