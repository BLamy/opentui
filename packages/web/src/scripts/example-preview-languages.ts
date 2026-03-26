const PREVIEW_LANGUAGE_ALIASES = new Map([
  ["example", "typescript"],
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["javascript", "javascript"],
  ["js", "javascript"],
  ["jsx", "jsx"],
])
const PREVIEW_LANGUAGES = new Set(["typescript", "ts", "tsx", "javascript", "js", "jsx", "example"])
const EDITOR_LANGUAGE_MAP = new Map([
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["javascript", "javascript"],
  ["js", "javascript"],
  ["jsx", "javascript"],
])
const EDITOR_MODEL_EXTENSION_MAP = new Map([
  ["typescript", ".ts"],
  ["ts", ".ts"],
  ["tsx", ".tsx"],
  ["javascript", ".js"],
  ["js", ".js"],
  ["jsx", ".jsx"],
])

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase()
}

export function normalizePreviewLanguage(language: string): string {
  const normalized = normalizeLanguage(language)
  return PREVIEW_LANGUAGE_ALIASES.get(normalized) ?? normalized
}

export function isPreviewLanguage(language: string): boolean {
  return PREVIEW_LANGUAGES.has(normalizeLanguage(language))
}

export function getEditorLanguage(language: string): string {
  return EDITOR_LANGUAGE_MAP.get(normalizePreviewLanguage(language)) ?? "plaintext"
}

export function getEditorModelExtension(language: string): string {
  return EDITOR_MODEL_EXTENSION_MAP.get(normalizePreviewLanguage(language)) ?? ".txt"
}
