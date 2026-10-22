function missing(path: unknown): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${String(path)}'`), { code: "ENOENT" })
}

export function existsSync(): boolean {
  return false
}

export function readFileSync(path: unknown): never {
  throw missing(path)
}

export function statSync(path: unknown): never {
  throw missing(path)
}

export function realpathSync(path: string): string {
  return path
}

export function writeFileSync(): void {}

export function appendFileSync(): void {}

export function mkdirSync(): void {}

export function rmSync(): void {}

export default { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync }
