const DEFAULT_BASE_URL = "/"
const ABSOLUTE_URL_PATTERN = /^[a-z]+:/i

export function getBaseUrl(): string {
  const baseUrl =
    typeof import.meta.env?.BASE_URL === "string" && import.meta.env.BASE_URL.length > 0
      ? import.meta.env.BASE_URL
      : DEFAULT_BASE_URL

  if (baseUrl === "/") {
    return baseUrl
  }

  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
}

export function getBasePath(): string {
  const baseUrl = getBaseUrl()

  return baseUrl === "/" ? "" : baseUrl.slice(0, -1)
}

export function withBase(path: string): string {
  if (!path) {
    return getBaseUrl()
  }

  if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith("//") || path.startsWith("#") || path.startsWith("?")) {
    return path
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  if (normalizedPath === "/") {
    return getBaseUrl()
  }

  const basePath = getBasePath()

  return basePath ? `${basePath}${normalizedPath}` : normalizedPath
}

export function stripBase(path: string): string {
  const normalizedPath = path || "/"
  const basePath = getBasePath()

  if (!basePath) {
    return normalizedPath
  }

  if (normalizedPath === basePath || normalizedPath === `${basePath}/`) {
    return "/"
  }

  return normalizedPath.startsWith(`${basePath}/`) ? normalizedPath.slice(basePath.length) : normalizedPath
}
