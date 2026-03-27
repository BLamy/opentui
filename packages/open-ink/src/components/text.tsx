import {
  type Renderable,
  StyledText,
  createTextAttributes,
  type TextBufferOptions,
  type TextNodeOptions,
} from "@opentui/core/browser"
import React, { forwardRef, useContext, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { AriaRole, AriaState } from "../internal/accessibility.js"
import { buildAccessibilityText } from "../internal/accessibility.js"
import { OPEN_INK_TEXT } from "../internal/markers.js"
import { createBaseTextStyle, flattenTextToStyledText, truncateStyledText } from "../internal/text-model.js"
import { accessibilityContext } from "../context/accessibility.js"
import { backgroundContext } from "../context/background.js"
import { TextContext } from "../context/text.js"

export type TextWrap = "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end"

export type Props = {
  "aria-label"?: string
  "aria-hidden"?: boolean
  "aria-role"?: AriaRole
  "aria-state"?: AriaState
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
    case "truncate-end":
      return { wrapMode: "none", truncate: true }
    default:
      return { wrapMode: "word", truncate: false }
  }
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (!ref) {
        return
      }

      if (typeof ref === "function") {
        ref(value)
        return
      }

      ;(ref as React.MutableRefObject<T | null>).current = value
    })
  }
}

export const Text = forwardRef<Renderable, Props>(function Text(props, ref): React.ReactNode {
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
    "aria-role": ariaRole,
    "aria-state": ariaState,
  } = props
  const { isScreenReaderEnabled } = useContext(accessibilityContext)
  const inheritedBackgroundColor = useContext(backgroundContext)
  const { insideText } = useContext(TextContext)
  const localRef = useRef<Renderable | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number>()

  if (isScreenReaderEnabled && ariaHidden) {
    return null
  }

  const accessibleContent =
    isScreenReaderEnabled && (ariaLabel || ariaRole || ariaState)
      ? buildAccessibilityText({
          ariaLabel,
          ariaRole,
          ariaState,
          children,
        })
      : undefined

  const content = accessibleContent ?? children
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

  const isCustomTruncate = !insideText && (wrap === "truncate-start" || wrap === "truncate-middle")
  const styledContent = useMemo<StyledText | null>(() => {
    if (!isCustomTruncate) {
      return null
    }

    return flattenTextToStyledText(content, createBaseTextStyle(textNodeProps), { strict: false })
  }, [content, isCustomTruncate, textNodeProps])

  useLayoutEffect(() => {
    if (!isCustomTruncate || !localRef.current) {
      return
    }

    const width = localRef.current.getLayoutNode().getComputedLayout().width
    if (width > 0 && width !== measuredWidth) {
      setMeasuredWidth(width)
    }
  }, [isCustomTruncate, measuredWidth, styledContent])

  if (insideText) {
    return React.createElement(
      "span",
      {
        ...textNodeProps,
        ref: ref as React.Ref<any>,
      },
      React.createElement(TextContext.Provider, { value: { insideText: true } }, content),
    )
  }

  if (isCustomTruncate && styledContent) {
    return React.createElement("text", {
      ref: mergeRefs(ref, localRef),
      wrapMode: "none",
      truncate: false,
      content: measuredWidth ? truncateStyledText(styledContent, measuredWidth, wrap) : styledContent,
    })
  }

  return React.createElement(
    "text",
    {
      ref: ref as React.Ref<any>,
      ...textNodeProps,
      ...mapWrap(wrap),
    },
    React.createElement(TextContext.Provider, { value: { insideText: true } }, content),
  )
})

;(Text as any)[OPEN_INK_TEXT] = true
