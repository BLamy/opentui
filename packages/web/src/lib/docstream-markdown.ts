import { closesFence, getFenceMarker } from "./docs-headings"
import { channelUrl, type DocsChannel } from "./docs-channel"

export type ArticlePart =
  | { type: "markdown"; markdown: string }
  | { type: "recording"; label: string }
  | { type: "mouse-pointers" }

// Keep the two existing Astro demonstrations in their place. Everything else,
// including runnable code, is Markdown rendered by Docstream, never rewritten DOM.
export function docstreamParts(body: string, channel: Pick<DocsChannel, "base">, site?: string): ArticlePart[] {
  const parts: ArticlePart[] = []
  const lines = body.split("\n")
  let markdown: string[] = []
  let fence: ReturnType<typeof getFenceMarker>
  const flush = () => {
    const source = markdown.join("\n").trim()
    if (source) parts.push({ type: "markdown", markdown: source })
    markdown = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (fence) {
      markdown.push(line)
      if (closesFence(line, fence)) fence = undefined
      continue
    }
    fence = getFenceMarker(line)
    if (fence) {
      markdown.push(line.replace(/^(\s*(?:`{3,}|~{3,})(?:typescript|javascript|tsx|jsx|ts|js)\s+)example\b/, "$1tui"))
      continue
    }
    if (/^import\s+\w+\s+from\s+"[^"\n]+\.astro"\s*$/.test(line)) continue
    if (/^\s*\{\/\*.*\*\/\}\s*$/.test(line)) continue
    if (/^<MousePointerPreview\s*\/>\s*$/.test(line)) {
      flush()
      parts.push({ type: "mouse-pointers" })
      continue
    }
    if (/^<ScrollbackRecording\s*$/.test(line)) {
      flush()
      const component = [line]
      while (i + 1 < lines.length && !/^\s*\/>\s*$/.test(component.at(-1)!)) component.push(lines[++i]!)
      const source = component.join("\n")
      if (!/^\s*\/>\s*$/.test(component.at(-1)!)) throw new Error("Unclosed ScrollbackRecording in documentation")
      if (!source.includes('src: "/recordings/quickstart.json"')) throw new Error("Unsupported documentation recording")
      parts.push({ type: "recording", label: source.match(/label="([^"]*)"/)?.[1] ?? "Quickstart recording" })
      continue
    }
    if (/^<[A-Z]/.test(line)) throw new Error(`Unsupported documentation component: ${line}`)
    markdown.push(
      line.replace(/(\]\()(\/(?!\/)[^\s)]*)/g, (_, start, href) => {
        const target = channelUrl(href, channel)
        return `${start}${site ? new URL(target.slice(1), site).href : target}`
      }),
    )
  }
  flush()
  return parts
}
