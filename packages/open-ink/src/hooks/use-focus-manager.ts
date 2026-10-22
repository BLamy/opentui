import { useContext } from "react"
import { FocusContext } from "../context/focus.js"

export default function useFocusManager() {
  const focusContext = useContext(FocusContext)

  return {
    enableFocus: focusContext.enableFocus,
    disableFocus: focusContext.disableFocus,
    focusNext: focusContext.focusNext,
    focusPrevious: focusContext.focusPrevious,
    focus: focusContext.focus,
    activeId: focusContext.activeId,
  }
}
