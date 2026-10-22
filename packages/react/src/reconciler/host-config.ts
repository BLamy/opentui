import { ImageRenderable, TextNodeRenderable } from "@opentui/core"
import { createOpenTUIRuntime } from "@opentui/react-runtime"
import pkgJson from "../../package.json" with { type: "json" }
import { getComponentCatalogue } from "../components/index.js"
import { textNodeKeys } from "../components/text.js"
import type { Props, Type } from "../types/host.js"
import { getNextId } from "../utils/id.js"
import { setInitialProperties, updateProperties } from "../utils/index.js"

function hasDeferredImageSource(type: string, props: Props): boolean {
  return type === "image" && props.source !== undefined
}

export const runtime = createOpenTUIRuntime({
  rendererPackageName: "@opentui/react",
  rendererVersion: pkgJson.version,
  getComponentCatalogue,
  textNodeKeys,
  createId: (type) => getNextId(type as Type),
  createTextInstance: (text) => TextNodeRenderable.fromString(text),
  setInitialProperties: (instance, type, props) => setInitialProperties(instance, type as Type, props),
  updateProperties: (instance, type, oldProps, newProps) =>
    updateProperties(instance, type as Type, oldProps, newProps),
  // Images load their source once mounted.
  getInitialProps: (type, props) => (hasDeferredImageSource(type, props) ? { ...props, source: undefined } : props),
  shouldCommitMount: hasDeferredImageSource,
  commitMount(instance, _type, props) {
    if (instance instanceof ImageRenderable) instance.source = props.source
  },
})

export const hostConfig = runtime.hostConfig
