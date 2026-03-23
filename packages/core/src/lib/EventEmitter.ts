type EventKey<TEventMap> = keyof TEventMap & string
type Listener<TArgs extends any[]> = (...args: TArgs) => void

export class EventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> {
  private readonly listenerMap = new Map<string, Set<(...args: any[]) => void>>()

  public addListener<TKey extends EventKey<TEventMap>>(event: TKey, listener: Listener<TEventMap[TKey]>): this {
    const existing = this.listenerMap.get(event)
    if (existing) {
      existing.add(listener as (...args: any[]) => void)
      return this
    }

    this.listenerMap.set(event, new Set([listener as (...args: any[]) => void]))
    return this
  }

  public on<TKey extends EventKey<TEventMap>>(event: TKey, listener: Listener<TEventMap[TKey]>): this {
    return this.addListener(event, listener)
  }

  public once<TKey extends EventKey<TEventMap>>(event: TKey, listener: Listener<TEventMap[TKey]>): this {
    const onceListener = (...args: TEventMap[TKey]) => {
      this.off(event, onceListener)
      listener(...args)
    }

    return this.on(event, onceListener)
  }

  public off<TKey extends EventKey<TEventMap>>(event: TKey, listener: Listener<TEventMap[TKey]>): this {
    const listeners = this.listenerMap.get(event)
    if (!listeners) {
      return this
    }

    listeners.delete(listener as (...args: any[]) => void)
    if (listeners.size === 0) {
      this.listenerMap.delete(event)
    }

    return this
  }

  public removeListener<TKey extends EventKey<TEventMap>>(event: TKey, listener: Listener<TEventMap[TKey]>): this {
    return this.off(event, listener)
  }

  public removeAllListeners<TKey extends EventKey<TEventMap>>(event?: TKey): this {
    if (event === undefined) {
      this.listenerMap.clear()
      return this
    }

    this.listenerMap.delete(event)
    return this
  }

  public emit<TKey extends EventKey<TEventMap>>(event: TKey, ...args: TEventMap[TKey]): boolean {
    const listeners = this.listenerMap.get(event)
    if (!listeners || listeners.size === 0) {
      return false
    }

    for (const listener of [...listeners]) {
      listener(...args)
    }

    return true
  }

  public listeners<TKey extends EventKey<TEventMap>>(event: TKey): Array<Listener<TEventMap[TKey]>> {
    return [...(this.listenerMap.get(event) ?? [])] as Array<Listener<TEventMap[TKey]>>
  }

  public listenerCount<TKey extends EventKey<TEventMap>>(event: TKey): number {
    return this.listenerMap.get(event)?.size ?? 0
  }
}
