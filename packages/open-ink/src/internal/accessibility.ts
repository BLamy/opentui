import type { ReactNode } from "react"
import { flattenTextToString } from "./text-model.js"

export type AriaRole =
  | "button"
  | "checkbox"
  | "radio"
  | "radiogroup"
  | "list"
  | "listitem"
  | "menu"
  | "menuitem"
  | "progressbar"
  | "tab"
  | "tablist"
  | "timer"
  | "toolbar"
  | "table"

export interface AriaState {
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  selected?: boolean
}

function describeState(state: AriaState | undefined): string[] {
  if (!state) {
    return []
  }

  const parts: string[] = []

  if (state.checked) {
    parts.push("checked")
  }

  if (state.selected) {
    parts.push("selected")
  }

  if (state.expanded) {
    parts.push("expanded")
  }

  if (state.disabled) {
    parts.push("disabled")
  }

  return parts
}

export function buildAccessibilityText(options: {
  ariaLabel?: string
  ariaRole?: AriaRole
  ariaState?: AriaState
  children?: ReactNode
}): string | undefined {
  const label = options.ariaLabel ?? flattenTextToString(options.children)
  const states = describeState(options.ariaState)
  const prefix = [
    states.length > 0 ? `(${states.join(", ")})` : "",
    options.ariaRole ? `${options.ariaRole}:` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  const text = [prefix, label].filter(Boolean).join(" ").trim()
  return text.length > 0 ? text : undefined
}
