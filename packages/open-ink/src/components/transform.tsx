import React, { useContext } from "react"
import { TextAttributes } from "@opentui/core/browser"
import { accessibilityContext } from "../context/accessibility.js"
import { createBaseTextStyle, flattenTextToStyledText, transformStyledText } from "../internal/text-model.js"
import type { Props as TextProps } from "./text.js"
import { Text } from "./text.js"

export type Props = {
  accessibilityLabel?: string
  transform: (children: string, index: number) => string
  children?: React.ReactNode
} & Omit<TextProps, "children">

export function Transform({ children, transform, accessibilityLabel }: Props): React.ReactNode {
  const { isScreenReaderEnabled } = useContext(accessibilityContext)

  if (isScreenReaderEnabled && accessibilityLabel) {
    return <Text>{accessibilityLabel}</Text>
  }

  const styled = flattenTextToStyledText(children, createBaseTextStyle({ attributes: TextAttributes.NONE }), {
    strict: true,
  })
  if (styled.chunks.length === 0) {
    return null
  }

  return React.createElement("text", {
    content: transformStyledText(styled, transform),
  })
}
