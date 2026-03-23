const virtualFiles = new Map<string, Uint8Array>()

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/")
}

function isFetchablePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")
}

function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value)
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to read ${path}: ${response.status} ${response.statusText}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

function getEncoding(encoding?: string | { encoding?: string | null } | null): string | undefined {
  if (!encoding) {
    return undefined
  }

  return typeof encoding === "string" ? encoding : encoding.encoding ?? undefined
}

export async function mkdir(): Promise<void> {}

export async function readFile(
  path: string | URL,
  encoding?: string | { encoding?: string | null } | null,
): Promise<Uint8Array | string> {
  const normalizedPath = normalizePath(String(path))
  const cached = virtualFiles.get(normalizedPath)
  const bytes = cached ?? (isFetchablePath(normalizedPath) ? await fetchBytes(normalizedPath) : undefined)

  if (!bytes) {
    throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`)
  }

  const resolvedEncoding = getEncoding(encoding)
  if (resolvedEncoding) {
    return new TextDecoder(resolvedEncoding).decode(bytes)
  }

  return bytes
}

export async function writeFile(path: string | URL, data: string | ArrayBuffer | ArrayBufferView): Promise<void> {
  virtualFiles.set(normalizePath(String(path)), toBytes(data))
}

export async function rm(path: string | URL): Promise<void> {
  const normalizedPath = normalizePath(String(path))

  for (const key of virtualFiles.keys()) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      virtualFiles.delete(key)
    }
  }
}

export async function readdir(path: string | URL): Promise<string[]> {
  const normalizedPath = normalizePath(String(path)).replace(/\/+$/, "")
  const entries = new Set<string>()

  for (const key of virtualFiles.keys()) {
    if (!key.startsWith(`${normalizedPath}/`)) {
      continue
    }

    const relative = key.slice(normalizedPath.length + 1)
    const segment = relative.split("/", 1)[0]
    if (segment) {
      entries.add(segment)
    }
  }

  return [...entries]
}

export async function stat(path: string | URL): Promise<{
  isDirectory(): boolean
  isFile(): boolean
  size: number
}> {
  const normalizedPath = normalizePath(String(path)).replace(/\/+$/, "")
  const file = virtualFiles.get(normalizedPath)
  const hasChildren = [...virtualFiles.keys()].some((key) => key.startsWith(`${normalizedPath}/`))

  return {
    isDirectory: () => hasChildren,
    isFile: () => Boolean(file),
    size: file?.byteLength ?? 0,
  }
}

export async function unlink(path: string | URL): Promise<void> {
  virtualFiles.delete(normalizePath(String(path)))
}

export async function mkdtemp(prefix: string): Promise<string> {
  return `${normalizePath(prefix)}${crypto.randomUUID()}`
}

const fsPromises = {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
}

export default fsPromises
