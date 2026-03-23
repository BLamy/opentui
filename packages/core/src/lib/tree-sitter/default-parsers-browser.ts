import type { FiletypeParserOptions } from "./types"

import javascriptHighlights from "./assets/javascript/highlights.scm?url"
import javascriptLanguage from "./assets/javascript/tree-sitter-javascript.wasm?url"
import markdownHighlights from "./assets/markdown/highlights.scm?url"
import markdownInjections from "./assets/markdown/injections.scm?url"
import markdownLanguage from "./assets/markdown/tree-sitter-markdown.wasm?url"
import markdownInlineHighlights from "./assets/markdown_inline/highlights.scm?url"
import markdownInlineLanguage from "./assets/markdown_inline/tree-sitter-markdown_inline.wasm?url"
import typescriptHighlights from "./assets/typescript/highlights.scm?url"
import typescriptLanguage from "./assets/typescript/tree-sitter-typescript.wasm?url"
import zigHighlights from "./assets/zig/highlights.scm?url"
import zigLanguage from "./assets/zig/tree-sitter-zig.wasm?url"

let cachedParsers: FiletypeParserOptions[] | undefined

export function getParsers(): FiletypeParserOptions[] {
  if (cachedParsers) {
    return cachedParsers
  }

  cachedParsers = [
    {
      filetype: "javascript",
      aliases: ["javascriptreact"],
      queries: {
        highlights: [javascriptHighlights],
      },
      wasm: javascriptLanguage,
    },
    {
      filetype: "typescript",
      aliases: ["typescriptreact"],
      queries: {
        highlights: [typescriptHighlights],
      },
      wasm: typescriptLanguage,
    },
    {
      filetype: "markdown",
      queries: {
        highlights: [markdownHighlights],
        injections: [markdownInjections],
      },
      wasm: markdownLanguage,
      injectionMapping: {
        nodeTypes: {
          inline: "markdown_inline",
          pipe_table_cell: "markdown_inline",
        },
        infoStringMap: {
          javascript: "javascript",
          js: "javascript",
          jsx: "javascriptreact",
          javascriptreact: "javascriptreact",
          typescript: "typescript",
          ts: "typescript",
          tsx: "typescriptreact",
          typescriptreact: "typescriptreact",
          markdown: "markdown",
          md: "markdown",
        },
      },
    },
    {
      filetype: "markdown_inline",
      queries: {
        highlights: [markdownInlineHighlights],
      },
      wasm: markdownInlineLanguage,
    },
    {
      filetype: "zig",
      queries: {
        highlights: [zigHighlights],
      },
      wasm: zigLanguage,
    },
  ]

  return cachedParsers
}
