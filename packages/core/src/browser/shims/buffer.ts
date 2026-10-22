const encoder = new TextEncoder()

// The subset of Buffer that core uses: byte views with string conversion.
class ShimBuffer extends Uint8Array {
  override toString(encoding: string = "utf8"): string {
    return new TextDecoder(encoding === "latin1" || encoding === "binary" ? "latin1" : "utf-8").decode(this)
  }
}

function from(value: string | ArrayLike<number> | ArrayBuffer, byteOffset?: number, length?: number): ShimBuffer {
  if (typeof value === "string") return new ShimBuffer(encoder.encode(value))
  if (value instanceof ArrayBuffer) return new ShimBuffer(value, byteOffset, length)
  return new ShimBuffer(value)
}

function concat(chunks: Uint8Array[]): ShimBuffer {
  const output = new ShimBuffer(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export const Buffer = {
  alloc: (size: number) => new ShimBuffer(size),
  concat,
  from,
  isBuffer: (value: unknown): value is ShimBuffer => value instanceof ShimBuffer,
}

export default { Buffer }
