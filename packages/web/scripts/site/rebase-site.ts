// Moves a built site under a base path, such as /opentui for a project site on GitHub Pages. The site is built for
// the domain root, and its pages, scripts and data refer to it with root-relative URLs such as /docs/x or /_astro/y.
// This prefixes every such URL whose first segment names an entry at the root of the build, in every text file.
//
// Usage: bun scripts/site/rebase-site.ts <directory> <base>
import { readdir, readFile, writeFile } from "node:fs/promises"
import { extname } from "node:path"
import { listFiles } from "./validate-site"

const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".txt", ".svg", ".webmanifest", ".map"])

/** Rewrites one file's text. `roots` are the names at the root of the build. */
export function rebaseText(text: string, base: string, roots: string[]): string {
  if (roots.length === 0) return text
  const names = roots.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  // A URL starts after a quote (also an escaped one in JSON within an attribute), a parenthesis, `=` (meta refresh),
  // or a srcset comma, and its first segment ends the URL or continues with a path, query, or fragment.
  const url = new RegExp(`([\"'\`(=]|, |&quot;)/(${names})(?=[/\"'\`)?#&\\s]|$)`, "g")
  return text.replace(url, (_, start: string, name: string) => `${start}${base}/${name}`)
}

/** Rewrites a page's links to the site root, which only HTML attributes can be told apart from other "/" strings. */
export function rebaseHome(html: string, base: string): string {
  return html.replace(/(\s(?:href|action)=")\/(?=["?#])/g, `$1${base}/`)
}

export async function rebaseSite(directory: string, base: string): Promise<number> {
  if (!/^\/[^/]+(\/[^/]+)*$/.test(base)) throw new Error(`The base must look like /name, not "${base}"`)
  // index.html and 404.html are served for paths, not by name.
  const roots = (await readdir(directory)).filter((name) => name !== "index.html" && name !== "404.html")
  let changed = 0
  for (const file of await listFiles(directory)) {
    if (!TEXT.has(extname(file))) continue
    const text = await readFile(file, "utf8")
    let rebased = rebaseText(text, base, roots)
    if (extname(file) === ".html") rebased = rebaseHome(rebased, base)
    if (rebased === text) continue
    await writeFile(file, rebased)
    changed++
  }
  return changed
}

if (import.meta.main) {
  const [directory, base] = process.argv.slice(2)
  if (!directory || !base) throw new Error("Usage: bun scripts/site/rebase-site.ts <directory> <base>")
  console.log(`Moved ${await rebaseSite(directory, base)} files under ${base}.`)
}
