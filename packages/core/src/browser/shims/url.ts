export function fileURLToPath(value: string | URL): string {
  const url = value instanceof URL ? value : new URL(value)
  return url.protocol === "file:" ? decodeURIComponent(url.pathname) : url.href
}

export function pathToFileURL(path: string): URL {
  return new URL(`file://${encodeURI(path)}`)
}

const { URL: BrowserURL, URLSearchParams } = globalThis
export { BrowserURL as URL, URLSearchParams }

export default { URL: BrowserURL, URLSearchParams, fileURLToPath, pathToFileURL }
