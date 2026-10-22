export function randomBytes(size: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(size))
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

export default { randomBytes, randomUUID }
