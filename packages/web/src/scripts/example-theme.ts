export type ThemeMode = "dark" | "light"

export interface ExampleTheme {
  mode: ThemeMode
  background: string
  foreground: string
}

const FALLBACK: Record<ThemeMode, ExampleTheme> = {
  light: { mode: "light", background: "#ffffff", foreground: "#000000" },
  dark: { mode: "dark", background: "#000000", foreground: "#ededed" },
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "")
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number]
}

function parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function toHex(color: string): string | null {
  const channels = parseHex(color) ?? parseRgb(color)
  if (!channels) return null
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`
}

export function themeModeOf(background: string): ThemeMode {
  const channels = parseHex(background)
  if (!channels) return "light"
  const [red, green, blue] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 128 ? "dark" : "light"
}

export function mixColors(foreground: string, background: string, amount: number): string {
  const top = parseHex(foreground)
  const bottom = parseHex(background)
  if (!top || !bottom) return foreground
  return `#${top
    .map((channel, index) => Math.round(channel * amount + bottom[index]! * (1 - amount)))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`
}

// The preview terminal sits on the page: page background, page ink.
export function readPageTheme(element: Element = document.body): ExampleTheme {
  const style = getComputedStyle(element)
  const background = toHex(style.backgroundColor)
  const foreground = toHex(style.color)
  if (!background || !foreground) {
    return FALLBACK[matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"]
  }
  return { mode: themeModeOf(background), background, foreground }
}

export function isExampleTheme(value: unknown): value is ExampleTheme {
  if (!value || typeof value !== "object") return false
  const theme = value as Record<string, unknown>
  return (
    (theme.mode === "dark" || theme.mode === "light") &&
    typeof theme.background === "string" &&
    typeof theme.foreground === "string"
  )
}

export function fallbackTheme(mode: ThemeMode): ExampleTheme {
  return FALLBACK[mode]
}
