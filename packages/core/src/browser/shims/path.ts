function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/")
}

function splitSegments(value: string): string[] {
  return normalizeSlashes(value).split("/").filter(Boolean)
}

function isUrlLike(value: string): boolean {
  return /^[a-zA-Z]+:\/\//.test(value)
}

export function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || isUrlLike(value)
}

export function basename(value: string): string {
  const normalized = normalizeSlashes(value)
  const segments = normalized.split("/")
  return segments[segments.length - 1] ?? ""
}

export function dirname(value: string): string {
  const normalized = normalizeSlashes(value)
  const segments = normalized.split("/")
  segments.pop()

  if (segments.length === 0) {
    return "."
  }

  if (segments.length === 1 && segments[0] === "") {
    return "/"
  }

  return segments.join("/") || "."
}

export function join(...parts: string[]): string {
  const filtered = parts.filter(Boolean)
  if (filtered.length === 0) {
    return "."
  }

  const first = filtered[0]
  const prefix = isAbsolute(first) && !isUrlLike(first) ? "/" : ""
  return `${prefix}${filtered.flatMap(splitSegments).join("/")}` || prefix || "."
}

export function resolve(...parts: string[]): string {
  const filtered = parts.filter(Boolean)
  if (filtered.length === 0) {
    return "/"
  }

  const lastAbsoluteIndex = filtered.findLastIndex((part) => isAbsolute(part))
  const relevantParts = lastAbsoluteIndex === -1 ? filtered : filtered.slice(lastAbsoluteIndex)
  const first = relevantParts[0] ?? ""

  if (isUrlLike(first)) {
    const [base, ...rest] = relevantParts
    const url = new URL(base)
    const suffix = rest.flatMap(splitSegments).join("/")
    return suffix ? new URL(suffix, url).href : url.href
  }

  const prefix = first.startsWith("/") ? "/" : ""
  const segments: string[] = []

  for (const part of relevantParts) {
    for (const segment of splitSegments(part)) {
      if (segment === ".") {
        continue
      }

      if (segment === "..") {
        segments.pop()
        continue
      }

      segments.push(segment)
    }
  }

  return `${prefix}${segments.join("/")}` || prefix || "."
}

export function parse(value: string): { root: string; dir: string; base: string; ext: string; name: string } {
  const base = basename(value)
  const dir = dirname(value)
  const extensionIndex = base.lastIndexOf(".")
  const ext = extensionIndex > 0 ? base.slice(extensionIndex) : ""
  const name = ext ? base.slice(0, -ext.length) : base

  return {
    root: isAbsolute(value) && !isUrlLike(value) ? "/" : "",
    dir,
    base,
    ext,
    name,
  }
}

const path = {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  posix: {
    basename,
    dirname,
    isAbsolute,
    join,
    parse,
    resolve,
  },
  resolve,
}

export default path
