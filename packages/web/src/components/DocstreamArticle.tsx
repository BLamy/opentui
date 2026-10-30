import { GitbookStreamdown } from "@brett_lamy/docstream/streamdown"

export default function DocstreamArticle({
  markdownBase64,
  runtimeUrl,
}: {
  markdownBase64: string
  runtimeUrl: string
}) {
  // Keep source text out of the deployment URL rewriter: code and inline paths
  // must hydrate byte-for-byte, while navigation links are resolved at build time.
  const markdown = new TextDecoder().decode(Uint8Array.from(atob(markdownBase64), (char) => char.charCodeAt(0)))
  return <GitbookStreamdown markdown={markdown} documentProperties={false} tui={{ runtimeUrl }} />
}
