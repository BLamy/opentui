import pkgJson from "../../package.json"
import { getComponentCatalogue } from "../components/index.js"
import { textNodeKeys } from "../components/text.js"
import { getNextId } from "../utils/id.js"
import { setInitialProperties, updateProperties } from "../utils/index.js"
import { createOpenTUIRuntime } from "@opentui/react-runtime"

export const runtime = createOpenTUIRuntime({
  rendererPackageName: "@opentui/react",
  rendererVersion: pkgJson.version,
  getComponentCatalogue,
  textNodeKeys,
  createId: (type) => getNextId(type as never),
  setInitialProperties: (instance, type, props) => setInitialProperties(instance, type as never, props),
  updateProperties: (instance, type, oldProps, newProps) =>
    updateProperties(instance, type as never, oldProps, newProps),
})

export const hostConfig = runtime.hostConfig
export const reconciler = runtime.reconciler
