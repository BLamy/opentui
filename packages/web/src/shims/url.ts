export function fileURLToPath(value: string | URL): string {
  const url = value instanceof URL ? value : new URL(value)
  return decodeURIComponent(url.pathname)
}
