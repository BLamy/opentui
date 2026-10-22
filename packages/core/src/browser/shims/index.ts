// Browser replacements for the Node built-ins that core imports. Bundlers that
// build core from source alias each specifier to the file listed here.
const shims: Record<string, string> = {
  buffer: "buffer.ts",
  console: "console.ts",
  crypto: "crypto.ts",
  events: "events.ts",
  fs: "fs.ts",
  "fs/promises": "fs-promises.ts",
  module: "module.ts",
  os: "os.ts",
  path: "path.ts",
  process: "process.ts",
  stream: "stream.ts",
  url: "url.ts",
  util: "util.ts",
}

export function browserShimAliases(): Array<{ find: RegExp; replacement: string }> {
  return Object.entries(shims).map(([specifier, file]) => ({
    find: new RegExp(`^(node:)?${specifier.replace("/", "\\/")}$`),
    replacement: new URL(`./${file}`, import.meta.url).pathname,
  }))
}
