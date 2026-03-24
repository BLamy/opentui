import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const ASTRO_FILES = [
  "../src/components/TuiSurface.astro",
  "../src/layouts/Docs.astro",
  "../src/pages/index.astro",
  "../src/pages/workbench.astro",
  "../src/pages/workbench/embed.astro",
  "../src/pages/workbench/example.astro",
]

test("Astro client scripts do not use inline lang=ts blocks that bypass bundling", () => {
  for (const relativePath of ASTRO_FILES) {
    const filePath = path.resolve(import.meta.dir, relativePath)
    const source = readFileSync(filePath, "utf8")

    expect(source).not.toContain('<script lang="ts">')
  }
})
