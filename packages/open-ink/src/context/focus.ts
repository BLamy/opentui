import { createContext } from "react"

export interface FocusContextValue {
  activeId?: string
  add: (id: string, options: { autoFocus: boolean }) => void
  remove: (id: string) => void
  activate: (id: string) => void
  deactivate: (id: string) => void
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
}

export const FocusContext = createContext<FocusContextValue>({
  activeId: undefined,
  add() {},
  remove() {},
  activate() {},
  deactivate() {},
  enableFocus() {},
  disableFocus() {},
  focusNext() {},
  focusPrevious() {},
  focus() {},
})
