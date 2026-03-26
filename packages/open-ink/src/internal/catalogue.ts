import {
  BoxRenderable,
  TextAttributes,
  TextNodeRenderable,
  TextRenderable,
  type RenderContext,
  type TextNodeOptions,
} from "@opentui/core/browser"
import type { RenderableConstructor } from "@opentui/react-runtime"

export const textNodeKeys = ["span", "a"] as const

class SpanRenderable extends TextNodeRenderable {
  constructor(_ctx: RenderContext | null, options: TextNodeOptions) {
    super(options)
  }
}

interface LinkOptions extends TextNodeOptions {
  href: string
}

class LinkRenderable extends TextNodeRenderable {
  constructor(_ctx: RenderContext | null, options: LinkOptions) {
    super({
      ...options,
      link: { url: options.href },
    })
  }
}

export const componentCatalogue: Record<string, RenderableConstructor> = {
  box: BoxRenderable,
  text: TextRenderable,
  span: SpanRenderable,
  a: LinkRenderable,
}

export { TextAttributes }
