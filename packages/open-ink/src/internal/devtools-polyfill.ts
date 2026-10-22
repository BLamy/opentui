const g = globalThis as any

if (typeof g.WebSocket === "undefined") {
  try {
    const ws = await import("ws")
    g.WebSocket = ws.default
  } catch {}
}

g.window ||= globalThis
g.self ||= globalThis

g.window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = [
  {
    type: 2,
    value: "ErrorBoundary",
    isEnabled: true,
    isValid: true,
  },
]
