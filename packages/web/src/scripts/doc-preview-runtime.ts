export { Renderable, RootRenderable, LayoutEvents, RenderableEvents } from "../../../core/src/Renderable.ts"
export {
  TextAttributes,
  ATTRIBUTE_BASE_BITS,
  ATTRIBUTE_BASE_MASK,
  DebugOverlayCorner,
  TargetChannel,
  getBaseAttributes,
} from "../../../core/src/types.ts"
export {
  createTextAttributes,
  attributesWithLink,
  getLinkId,
  visualizeRenderableTree,
} from "../../../core/src/utils.ts"
export { RGBA, hexToRgb, rgbToHex, hsvToRgb, parseColor } from "../../../core/src/lib/RGBA.ts"
export { SyntaxStyle } from "../../../core/src/syntax-style.ts"
export { KeyEvent, PasteEvent } from "../../../core/src/lib/KeyHandler.ts"
export {
  StyledText,
  stringToStyledText,
  t,
  link,
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  brightBlack,
  brightRed,
  brightGreen,
  brightYellow,
  brightBlue,
  brightMagenta,
  brightCyan,
  brightWhite,
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  bold,
  italic,
  underline,
  strikethrough,
  dim,
  reverse,
  blink,
  fg,
  bg,
} from "../../../core/src/lib/styled-text.ts"
export {
  MouseButton,
  MouseEvent,
  BrowserRenderEvents,
  BrowserRenderer,
  createBrowserRenderer,
  loadBrowserRenderLib,
} from "../../../core/src/browser.ts"
export { BaseRenderable } from "../../../core/src/Renderable.ts"
export { TextRenderable } from "../../../core/src/renderables/Text.ts"
export { BoxRenderable } from "../../../core/src/renderables/Box.ts"
export { InputRenderable, InputRenderableEvents } from "../../../core/src/renderables/Input.ts"
export { TextareaRenderable } from "../../../core/src/renderables/Textarea.ts"
export { SelectRenderable, SelectRenderableEvents } from "../../../core/src/renderables/Select.ts"
export { TabSelectRenderable, TabSelectRenderableEvents } from "../../../core/src/renderables/TabSelect.ts"
export { ScrollBoxRenderable } from "../../../core/src/renderables/ScrollBox.ts"
export { ScrollBarRenderable } from "../../../core/src/renderables/ScrollBar.ts"
export { SliderRenderable } from "../../../core/src/renderables/Slider.ts"
export { ASCIIFontRenderable } from "../../../core/src/renderables/ASCIIFont.ts"
export { FrameBufferRenderable } from "../../../core/src/renderables/FrameBuffer.ts"
export { CodeRenderable } from "../../../core/src/renderables/Code.ts"
export { DiffRenderable } from "../../../core/src/renderables/Diff.ts"
export { LineNumberRenderable } from "../../../core/src/renderables/LineNumberRenderable.ts"
export { MarkdownRenderable } from "../../../core/src/renderables/Markdown.ts"
export { TextNodeRenderable, RootTextNodeRenderable } from "../../../core/src/renderables/TextNode.ts"
export { h, delegate, instantiate, isVNode } from "../../../core/src/renderables/composition/vnode.ts"

import { ASCIIFontRenderable } from "../../../core/src/renderables/ASCIIFont.ts"
import { BoxRenderable } from "../../../core/src/renderables/Box.ts"
import { CodeRenderable } from "../../../core/src/renderables/Code.ts"
import { DiffRenderable } from "../../../core/src/renderables/Diff.ts"
import { FrameBufferRenderable } from "../../../core/src/renderables/FrameBuffer.ts"
import { InputRenderable } from "../../../core/src/renderables/Input.ts"
import { MarkdownRenderable } from "../../../core/src/renderables/Markdown.ts"
import { ScrollBoxRenderable } from "../../../core/src/renderables/ScrollBox.ts"
import { SelectRenderable } from "../../../core/src/renderables/Select.ts"
import { TabSelectRenderable } from "../../../core/src/renderables/TabSelect.ts"
import { TextRenderable } from "../../../core/src/renderables/Text.ts"
import { TextareaRenderable } from "../../../core/src/renderables/Textarea.ts"
import { h, type VChild } from "../../../core/src/renderables/composition/vnode.ts"

export function Box(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(BoxRenderable, props ?? {}, ...children)
}

export function Text(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(TextRenderable, props ?? {}, ...children)
}

export function Input(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(InputRenderable, props ?? {}, ...children)
}

export function Textarea(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(TextareaRenderable, props ?? {}, ...children)
}

export function Select(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(SelectRenderable, props ?? {}, ...children)
}

export function TabSelect(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(TabSelectRenderable, props ?? {}, ...children)
}

export function ScrollBox(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(ScrollBoxRenderable, props ?? {}, ...children)
}

export function FrameBuffer(props: Record<string, unknown>, ...children: VChild[]) {
  return h(FrameBufferRenderable, props, ...children)
}

export function Code(props: Record<string, unknown>, ...children: VChild[]) {
  return h(CodeRenderable, props, ...children)
}

export function Diff(props: Record<string, unknown>, ...children: VChild[]) {
  return h(DiffRenderable, props, ...children)
}

export function Markdown(props: Record<string, unknown>, ...children: VChild[]) {
  return h(MarkdownRenderable, props, ...children)
}

export function ASCIIFont(props?: Record<string, unknown>, ...children: VChild[]) {
  return h(ASCIIFontRenderable, props ?? {}, ...children)
}
