import type { BorderCharacters, BorderStyle, BoxOptions, Renderable } from "@opentui/core/browser"
import React, { forwardRef, useContext } from "react"
import { accessibilityContext } from "../context/accessibility.js"
import { backgroundContext } from "../context/background.js"

type InkBorderStyle = BorderStyle | "round" | "bold" | "classic" | "singleDouble" | "doubleSingle"

const CUSTOM_BORDERS: Record<Exclude<InkBorderStyle, BorderStyle | "round" | "bold">, BorderCharacters> = {
  classic: {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
    topT: "+",
    bottomT: "+",
    leftT: "+",
    rightT: "+",
    cross: "+",
  },
  singleDouble: {
    topLeft: "╓",
    topRight: "╖",
    bottomLeft: "╙",
    bottomRight: "╜",
    horizontal: "─",
    vertical: "║",
    topT: "╥",
    bottomT: "╨",
    leftT: "╟",
    rightT: "╢",
    cross: "╫",
  },
  doubleSingle: {
    topLeft: "╒",
    topRight: "╕",
    bottomLeft: "╘",
    bottomRight: "╛",
    horizontal: "═",
    vertical: "│",
    topT: "╤",
    bottomT: "╧",
    leftT: "╞",
    rightT: "╡",
    cross: "╪",
  },
}

function normalizeBorderStyle(borderStyle?: InkBorderStyle): Pick<BoxOptions, "borderStyle" | "customBorderChars"> {
  switch (borderStyle) {
    case "round":
      return { borderStyle: "rounded" }
    case "bold":
      return { borderStyle: "heavy" }
    case "classic":
    case "singleDouble":
    case "doubleSingle":
      return { borderStyle: "single", customBorderChars: CUSTOM_BORDERS[borderStyle] }
    default:
      return { borderStyle }
  }
}

export type Props = React.PropsWithChildren<
  Omit<BoxOptions, "borderStyle" | "customBorderChars"> & {
    "aria-label"?: string
    "aria-hidden"?: boolean
    borderStyle?: InkBorderStyle
  }
>

export const Box = forwardRef<Renderable, Props>(function Box(props, ref) {
  const { children, backgroundColor, borderStyle, "aria-label": ariaLabel, "aria-hidden": ariaHidden, ...rest } = props
  const { isScreenReaderEnabled } = useContext(accessibilityContext)

  if (isScreenReaderEnabled && ariaHidden) {
    return null
  }

  const borderProps = normalizeBorderStyle(borderStyle)
  const content = isScreenReaderEnabled && ariaLabel ? ariaLabel : children
  const node = React.createElement(
    "box",
    {
      ref: ref as React.Ref<any>,
      flexDirection: rest.flexDirection ?? "row",
      flexGrow: rest.flexGrow ?? 0,
      flexShrink: rest.flexShrink ?? 1,
      backgroundColor,
      ...borderProps,
      ...rest,
    },
    content,
  )

  if (backgroundColor) {
    return <backgroundContext.Provider value={String(backgroundColor)}>{node}</backgroundContext.Provider>
  }

  return node
})
