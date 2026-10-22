import type { ExampleTheme } from "./example-theme"

// Messages between a page and the example frame (/workbench/example).
export const MESSAGE = {
  ready: "opentui-example:ready",
  run: "opentui-example:run",
  status: "opentui-example:status",
} as const

const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/?$/, "/")

export const EXAMPLE_FRAME_PATH = `${BASE}workbench/example/`
export const OPENTUI_WASM_URL = `${BASE}opentui/opentui.wasm`

export interface ExampleSource {
  code: string
  language: string
}

export interface RunMessage extends ExampleSource {
  type: typeof MESSAGE.run
  theme: ExampleTheme
  requestId?: string
}

export interface ReadyMessage {
  type: typeof MESSAGE.ready
}

export interface StatusMessage {
  type: typeof MESSAGE.status
  requestId?: string
  status: "rendered" | "error"
  message?: string
}

export type FrameMessage = RunMessage | ReadyMessage | StatusMessage

function toBase64Url(text: string): string {
  let binary = ""
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

// Workbench and frame links carry the program in the URL fragment: #ts=<base64url>.
export function encodeExampleHash({ code, language }: ExampleSource): string {
  return `#${encodeURIComponent(language)}=${toBase64Url(code)}`
}

export function decodeExampleHash(hash: string): ExampleSource | null {
  const match = hash.match(/^#([\w-]+)=([\w-]*)$/)
  if (!match) return null
  try {
    return { language: decodeURIComponent(match[1]!), code: fromBase64Url(match[2]!) }
  } catch {
    return null
  }
}
