import { createTextAttributes, type TextBufferOptions, type TextNodeOptions } from "@opentui/core/browser"
import React, { useContext } from "react"
import { accessibilityContext } from "../context/accessibility.js"
import { backgroundContext } from "../context/background.js"
import { TextContext } from "../context/text.js"

export type TextWrap = "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end"

export type Props = {
  "aria-label"?: string
  "aria-hidden"?: boolean
  color?: string
  backgroundColor?: string
  dimColor?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
  wrap?: TextWrap
  children?: React.ReactNode
}

function mapWrap(wrap: TextWrap = "wrap"): Pick<TextBufferOptions, "wrapMode" | "truncate"> {
  switch (wrap) {
    case "truncate":
    case "truncate-start":
    case "truncate-middle":
    case "truncate-end":
      return { wrapMode: "none", truncate: true }
    default:
      return { wrapMode: "word", truncate: false }
  }
}

export function Text(props: Props): React.ReactNode {
  const {
    color,
    backgroundColor,
    dimColor = false,
    bold = false,
    italic = false,
    underline = false,
    strikethrough = false,
    inverse = false,
    wrap = "wrap",
    children,
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden = false,
  } = props
  const { isScreenReaderEnabled } = useContext(accessibilityContext)
  const inheritedBackgroundColor = useContext(backgroundContext)
  const { insideText } = useContext(TextContext)

  if (isScreenReaderEnabled && ariaHidden) {
    return null
  }

  const content = isScreenReaderEnabled && ariaLabel ? ariaLabel : children
  if (content == null) {
    return null
  }

  const attributes = createTextAttributes({
    dim: dimColor,
    bold,
    italic,
    underline,
    inverse,
    strikethrough,
  })

  const effectiveBackgroundColor = backgroundColor ?? inheritedBackgroundColor
  const textNodeProps: Pick<TextNodeOptions, "fg" | "bg" | "attributes"> = {
    fg: color,
    bg: effectiveBackgroundColor,
    attributes,
  }

  if (insideText) {
    return React.createElement(
      "span",
      textNodeProps,
      React.createElement(TextContext.Provider, { value: { insideText: true } }, content),
    )
  }

  return React.createElement(
    "text",
    {
      ...textNodeProps,
      ...mapWrap(wrap),
    },
    React.createElement(TextContext.Provider, { value: { insideText: true } }, content),
  )
}
