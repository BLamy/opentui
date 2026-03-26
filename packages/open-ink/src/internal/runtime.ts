import pkgJson from "../../package.json"
import { createOpenTUIRuntime } from "@opentui/react-runtime"
import { componentCatalogue, textNodeKeys } from "./catalogue.js"
import { setInitialProperties, updateProperties } from "./host-utils.js"
import { getNextId } from "./id.js"

export const runtime = createOpenTUIRuntime({
  rendererPackageName: "open-ink",
  rendererVersion: pkgJson.version,
  getComponentCatalogue: () => componentCatalogue,
  textNodeKeys,
  createId: getNextId,
  setInitialProperties,
  updateProperties,
})

export const reconciler = runtime.reconciler
