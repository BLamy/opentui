type ScheduledCallback = () => void

function getProcessNextTick(): ((callback: ScheduledCallback) => void) | undefined {
  if (typeof process === "undefined" || !process || typeof process !== "object") {
    return undefined
  }

  const nextTick = (process as { nextTick?: unknown }).nextTick
  if (typeof nextTick !== "function" || nextTick === scheduleNextMicrotask) {
    return undefined
  }

  return (callback) => nextTick.call(process, callback)
}

export function scheduleNextMicrotask(callback: ScheduledCallback): void {
  const nextTick = getProcessNextTick()
  if (nextTick) {
    nextTick(callback)
    return
  }

  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback)
    return
  }

  void Promise.resolve().then(callback)
}
