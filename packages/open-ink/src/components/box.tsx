import {
  RGBA,
  parseColor,
  type BorderCharacters,
  type BorderSides,
  type BorderStyle,
  type BoxOptions,
  type Renderable,
} from "@opentui/core/browser"
import React, { forwardRef, useContext } from "react"
import type { AriaRole, AriaState } from "../internal/accessibility.js"
import { buildAccessibilityText } from "../internal/accessibility.js"
import { accessibilityContext } from "../context/accessibility.js"
import { backgroundContext } from "../context/background.js"
import { Text } from "./text.js"

type InkBorderStyle = BorderStyle | "round" | "bold" | "classic" | "singleDouble" | "doubleSingle" | BorderCharacters

const CUSTOM_BORDERS: Record<"classic" | "singleDouble" | "doubleSingle", BorderCharacters> = {
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
  if (borderStyle && typeof borderStyle === "object") {
    return { borderStyle: "single", customBorderChars: borderStyle }
  }

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

function resolveBorder(options: {
  border?: boolean | BorderSides[]
  borderTop?: boolean
  borderRight?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
  borderStyle?: InkBorderStyle
}): boolean | BorderSides[] {
  const hasSideOverrides =
    options.borderTop !== undefined ||
    options.borderRight !== undefined ||
    options.borderBottom !== undefined ||
    options.borderLeft !== undefined

  if (!hasSideOverrides && !Array.isArray(options.border)) {
    return options.border ?? Boolean(options.borderStyle)
  }

  const sides = {
    top:
      options.borderTop ??
      (Array.isArray(options.border) ? options.border.includes("top") : options.border ?? Boolean(options.borderStyle)),
    right:
      options.borderRight ??
      (Array.isArray(options.border)
        ? options.border.includes("right")
        : options.border ?? Boolean(options.borderStyle)),
    bottom:
      options.borderBottom ??
      (Array.isArray(options.border)
        ? options.border.includes("bottom")
        : options.border ?? Boolean(options.borderStyle)),
    left:
      options.borderLeft ??
      (Array.isArray(options.border)
        ? options.border.includes("left")
        : options.border ?? Boolean(options.borderStyle)),
  }

  const activeSides = (["top", "right", "bottom", "left"] as const).filter((side) => sides[side])
  return activeSides.length === 4 ? true : activeSides
}

function dimColor(color: string | RGBA | undefined): RGBA {
  const parsed = parseColor(color ?? "#ffffff")
  return RGBA.fromValues(parsed.r * 0.5, parsed.g * 0.5, parsed.b * 0.5, parsed.a)
}

function resolveBorderColor(options: {
  borderColor?: string | RGBA
  borderTopColor?: string | RGBA
  borderRightColor?: string | RGBA
  borderBottomColor?: string | RGBA
  borderLeftColor?: string | RGBA
  borderDimColor?: boolean
  borderTopDimColor?: boolean
  borderRightDimColor?: boolean
  borderBottomDimColor?: boolean
  borderLeftDimColor?: boolean
}): string | RGBA | undefined {
  const color =
    options.borderColor ??
    options.borderTopColor ??
    options.borderRightColor ??
    options.borderBottomColor ??
    options.borderLeftColor

  const shouldDim =
    options.borderDimColor ||
    options.borderTopDimColor ||
    options.borderRightDimColor ||
    options.borderBottomDimColor ||
    options.borderLeftDimColor

  return shouldDim ? dimColor(color) : color
}

export type Props = React.PropsWithChildren<
  Omit<BoxOptions, "border" | "borderColor" | "borderStyle" | "customBorderChars" | "visible"> & {
    "aria-label"?: string
    "aria-hidden"?: boolean
    "aria-role"?: AriaRole
    "aria-state"?: AriaState
    display?: "flex" | "none"
    overflowX?: "visible" | "hidden"
    overflowY?: "visible" | "hidden"
    border?: boolean | BorderSides[]
    borderStyle?: InkBorderStyle
    borderColor?: string | RGBA
    borderTop?: boolean
    borderRight?: boolean
    borderBottom?: boolean
    borderLeft?: boolean
    borderTopColor?: string | RGBA
    borderRightColor?: string | RGBA
    borderBottomColor?: string | RGBA
    borderLeftColor?: string | RGBA
    borderDimColor?: boolean
    borderTopDimColor?: boolean
    borderRightDimColor?: boolean
    borderBottomDimColor?: boolean
    borderLeftDimColor?: boolean
  }
>

export const Box = forwardRef<Renderable, Props>(function Box(props, ref) {
  const {
    children,
    backgroundColor,
    border,
    borderStyle,
    display,
    overflow,
    overflowX,
    overflowY,
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden,
    "aria-role": ariaRole,
    "aria-state": ariaState,
    borderColor,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
    borderTopColor,
    borderRightColor,
    borderBottomColor,
    borderLeftColor,
    borderDimColor,
    borderTopDimColor,
    borderRightDimColor,
    borderBottomDimColor,
    borderLeftDimColor,
    ...rest
  } = props
  const { isScreenReaderEnabled } = useContext(accessibilityContext)

  if (isScreenReaderEnabled && ariaHidden) {
    return null
  }

  const accessibleText =
    isScreenReaderEnabled && (ariaLabel || ariaRole || ariaState)
      ? buildAccessibilityText({
          ariaLabel,
          ariaRole,
          ariaState,
          children,
        })
      : undefined

  if (accessibleText) {
    return <Text>{accessibleText}</Text>
  }

  const borderProps = normalizeBorderStyle(borderStyle)
  const resolvedBorder = resolveBorder({
    border,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
    borderStyle,
  })
  const resolvedBorderColor = resolveBorderColor({
    borderColor,
    borderTopColor,
    borderRightColor,
    borderBottomColor,
    borderLeftColor,
    borderDimColor,
    borderTopDimColor,
    borderRightDimColor,
    borderBottomDimColor,
    borderLeftDimColor,
  })
  const resolvedOverflow = overflow ?? (overflowX === "hidden" || overflowY === "hidden" ? "hidden" : undefined)
  const node = React.createElement(
    "box",
    {
      ref: ref as React.Ref<any>,
      flexDirection: rest.flexDirection ?? "row",
      flexGrow: rest.flexGrow ?? 0,
      flexShrink: rest.flexShrink ?? 1,
      backgroundColor,
      border: resolvedBorder,
      borderColor: resolvedBorderColor,
      visible: display !== "none",
      overflow: resolvedOverflow,
      ...borderProps,
      ...rest,
    },
    children,
  )

  if (backgroundColor) {
    return <backgroundContext.Provider value={String(backgroundColor)}>{node}</backgroundContext.Provider>
  }

  return node
})
