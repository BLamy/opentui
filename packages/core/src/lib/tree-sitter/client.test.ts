import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { getDefaultTreeSitterWorkerPath } from "./client.js"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

describe("tree sitter worker path selection", () => {
  test("falls back to the source worker when import.meta.dirname is unavailable", () => {
    const workerPath = getDefaultTreeSitterWorkerPath("file:///virtual/tree-sitter/client.ts")

    expect(workerPath).toBeInstanceOf(URL)
    expect((workerPath as URL).href).toBe("file:///virtual/tree-sitter/parser.worker.ts")
  })

  test("uses the built worker when parser.worker.js exists beside the client", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tree-sitter-client-"))
    tempDirs.push(dir)
    await writeFile(join(dir, "parser.worker.js"), "export {}")

    const workerPath = getDefaultTreeSitterWorkerPath(new URL(`file://${join(dir, "client.ts")}`).href, dir)

    expect(workerPath).toBe(new URL("./parser.worker.js", new URL(`file://${join(dir, "client.ts")}`).href).href)
  })
})
