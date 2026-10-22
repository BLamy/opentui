import type { RenderContext, TextNodeOptions } from "@opentui/core"
import type { RenderableConstructor, RuntimeComponentCatalogue } from "@opentui/react-runtime"
import { getCore } from "./core.js"

export const textNodeKeys = ["span", "a"] as const

interface LinkOptions extends TextNodeOptions {
  href: string
}

let catalogue: RuntimeComponentCatalogue | undefined

function createCatalogue(): RuntimeComponentCatalogue {
  const { BoxRenderable, TextNodeRenderable, TextRenderable } = getCore()

  class SpanRenderable extends TextNodeRenderable {
    constructor(_ctx: RenderContext | null, options: TextNodeOptions) {
      super(options)
    }
  }

  class LinkRenderable extends TextNodeRenderable {
    constructor(_ctx: RenderContext | null, options: LinkOptions) {
      super({
        ...options,
        link: { url: options.href },
      })
    }
  }

  return {
    box: BoxRenderable,
    text: TextRenderable,
    span: SpanRenderable as RenderableConstructor,
    a: LinkRenderable as RenderableConstructor,
  }
}

export function getComponentCatalogue(): RuntimeComponentCatalogue {
  catalogue ??= createCatalogue()
  return catalogue
}
