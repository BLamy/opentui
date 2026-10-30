import type { ExampleTheme } from "./example-theme"

// Messages between a page and the example frame (/workbench/example).
export const MESSAGE = {
  ready: "opentui-example:ready",
  run: "opentui-example:run",
  status: "opentui-example:status",
} as const

// Root-relative like the rest of the site, so scripts/site/rebase-site.ts can move them under a base path.
export const EXAMPLE_FRAME_PATH = "/workbench/example/"
export const OPENTUI_ASSETS_URL = "/opentui/"
export const OPENTUI_WASM_URL = "/opentui/opentui.wasm"

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

// A sandbox has an opaque origin. Its parent still has the origin supplied by
// the browser's referrer, including when Docstream is hosted on another site.
export function exampleParentOrigin(referrer: string, fallback: string): string {
  try {
    return new URL(referrer || fallback).origin
  } catch {
    return new URL(fallback).origin
  }
}

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
