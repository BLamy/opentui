import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { docstreamParts } from "./docstream-markdown"

test("production links keep their project path without rewriting source-code paths", () => {
  expect(
    docstreamParts(
      '[Docs](/docs/components/code) [Workbench](/workbench)\n\n```ts\nconst url = "/opentui/"\n```',
      { base: "/docs/next" },
      "https://blamy.github.io/opentui/",
    ),
  ).toEqual([
    {
      type: "markdown",
      markdown:
        '[Docs](https://blamy.github.io/opentui/docs/next/components/code) [Workbench](https://blamy.github.io/opentui/workbench)\n\n```ts\nconst url = "/opentui/"\n```',
    },
  ])
})

test("runnable fences become Docstream TUIs without changing program imports or strings", () => {
  const source =
    '# Counter\n\n```typescript example\nimport X from "./x.astro"\nconst url = "[link](/docs)"\n```\n\n[Next](/docs/components/text)'
  expect(docstreamParts(source, { base: "/docs/next" })).toEqual([
    {
      type: "markdown",
      markdown: source.replace("typescript example", "typescript tui").replace("[Next](/docs/", "[Next](/docs/next/"),
    },
  ])
})

test("Astro demonstrations keep their position between Markdown sections", () => {
  expect(
    docstreamParts(
      'import MousePointerPreview from "../../../components/MousePointerPreview.astro"\n# Pointer\n\n<MousePointerPreview />\n\nAfter',
      { base: "/docs" },
    ),
  ).toEqual([
    { type: "markdown", markdown: "# Pointer" },
    { type: "mouse-pointers" },
    { type: "markdown", markdown: "After" },
  ])
})

test("every documentation page is supported by the Docstream adapter", () => {
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : entry.name.endsWith(".mdx")
          ? [join(directory, entry.name)]
          : [],
    )
  }
  const pages = files(new URL("../content/docs", import.meta.url).pathname)
  expect(pages.length).toBeGreaterThan(80)
  for (const page of pages) {
    const parts = docstreamParts(readFileSync(page, "utf8"), { base: "/docs" })
    expect(parts.some((part) => part.type === "markdown")).toBe(true)
  }
})
