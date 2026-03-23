import { singleton } from "../singleton.js"
import { TreeSitterClient } from "./client.js"
import type { TreeSitterClientOptions } from "./types.js"
import { getDataPaths } from "../data-paths.js"

export * from "./client.js"
export * from "../tree-sitter-styled-text.js"
export * from "./types.js"
export * from "./resolve-ft.js"

const BROWSER_TREE_SITTER_DATA_PATH = ".opentui-browser"

function isBrowserRuntime(): boolean {
  return typeof document !== "undefined"
}

export function getDefaultTreeSitterDataPath(): string {
  if (isBrowserRuntime()) {
    return BROWSER_TREE_SITTER_DATA_PATH
  }

  return getDataPaths().globalDataPath
}

export function getTreeSitterClient(): TreeSitterClient {
  const defaultOptions: TreeSitterClientOptions = {
    dataPath: getDefaultTreeSitterDataPath(),
  }

  return singleton("tree-sitter-client", () => {
    const client = new TreeSitterClient(defaultOptions)

    if (!isBrowserRuntime()) {
      const dataPathsManager = getDataPaths()

      dataPathsManager.on("paths:changed", (paths) => {
        client.setDataPath(paths.globalDataPath)
      })
    }

    return client
  })
}
