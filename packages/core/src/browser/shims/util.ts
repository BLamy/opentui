export function inspect(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function format(...args: unknown[]): string {
  return args.map(inspect).join(" ")
}

export function parseArgs(): { values: Record<string, unknown>; positionals: string[] } {
  return { values: {}, positionals: [] }
}

export default { format, inspect, parseArgs }
