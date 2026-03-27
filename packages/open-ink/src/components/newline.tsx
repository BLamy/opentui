import React, { useContext } from "react"
import { Text } from "./text.js"
import { TextContext } from "../context/text.js"
import { OPEN_INK_NEWLINE } from "../internal/markers.js"

export type Props = {
  count?: number
}

export function Newline({ count = 1 }: Props): React.ReactNode {
  const { insideText } = useContext(TextContext)
  const value = "\n".repeat(count)

  if (insideText) {
    return value
  }

  return <Text>{value}</Text>
}

;(Newline as any)[OPEN_INK_NEWLINE] = true
