import React, { useContext } from "react"
import { accessibilityContext } from "../context/accessibility.js"
import { Newline } from "./newline.js"
import { Text } from "./text.js"

export type Props = {
  accessibilityLabel?: string
  transform: (children: string, index: number) => string
  children?: React.ReactNode
}

function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return ""
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map((child) => flattenText(child)).join("")
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<any>

    if (element.type === React.Fragment || element.type === Text) {
      return flattenText(element.props.children)
    }

    if (element.type === Newline) {
      return "\n".repeat(element.props.count ?? 1)
    }

    throw new Error("open-ink Transform only supports textual descendants.")
  }

  return ""
}

export function Transform({ children, transform, accessibilityLabel }: Props): React.ReactNode {
  const { isScreenReaderEnabled } = useContext(accessibilityContext)
  const value = isScreenReaderEnabled && accessibilityLabel ? accessibilityLabel : flattenText(children)

  if (!value) {
    return null
  }

  const lines = value.split("\n").map((line, index) => transform(line, index))
  return <Text>{lines.join("\n")}</Text>
}
