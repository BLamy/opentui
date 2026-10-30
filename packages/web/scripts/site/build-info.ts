import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export async function writeBuildInfo(directory: string): Promise<void> {
  const core = JSON.parse(await readFile(new URL("../../../core/package.json", import.meta.url), "utf8"))
  const web = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"))
  const revision = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  await writeFile(
    join(directory, "build-info.json"),
    JSON.stringify(
      {
        opentui: core.version,
        docstream: web.dependencies["@brett_lamy/docstream"],
        revision,
        builtAt: new Date().toISOString(),
        runtime: "wasm32-wasi",
      },
      null,
      2,
    ) + "\n",
  )
}
