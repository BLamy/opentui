export function existsSync(): boolean {
  return false
}

export function writeFileSync(): void {}

export function readFileSync(): string {
  return ""
}

export function mkdirSync(): void {}

export function rmSync(): void {}

export function mkdtempSync(prefix: string): string {
  return `${prefix}${crypto.randomUUID()}`
}

const fs = {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
}

export default fs
