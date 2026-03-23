export type PasteKind = "text" | "binary" | "unknown"

export interface PasteMetadata {
  mimeType?: string
  kind?: PasteKind
}

const PASTE_TEXT_DECODER = new TextDecoder()

export function decodePasteBytes(bytes: Uint8Array): string {
  return PASTE_TEXT_DECODER.decode(bytes)
}

export function stripAnsiSequences(text: string): string {
  return text.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\x1b\\))/g, "")
}
