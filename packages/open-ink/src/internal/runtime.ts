import { createOpenTUIRuntime } from "@opentui/react-runtime"
import pkgJson from "../../package.json" with { type: "json" }
import { getComponentCatalogue, textNodeKeys } from "./catalogue.js"
import { getCore } from "./core.js"
import { setInitialProperties, updateProperties } from "./host-utils.js"
import { getNextId } from "./id.js"

export const runtime = createOpenTUIRuntime({
  rendererPackageName: "open-ink",
  rendererVersion: pkgJson.version,
  getComponentCatalogue,
  textNodeKeys,
  createId: getNextId,
  createTextInstance: (text) => getCore().TextNodeRenderable.fromString(text),
  setInitialProperties,
  updateProperties,
})

export const reconciler = runtime.reconciler
