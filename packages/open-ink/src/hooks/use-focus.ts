import { useContext, useLayoutEffect, useMemo } from "react"
import { FocusContext } from "../context/focus.js"
import useStdin from "./use-stdin.js"

type Input = {
  isActive?: boolean
  autoFocus?: boolean
  id?: string
}

type Output = {
  isFocused: boolean
  focus: (id: string) => void
}

export default function useFocus({ isActive = true, autoFocus = false, id: customId }: Input = {}): Output {
  const { isRawModeSupported, setRawMode } = useStdin()
  const { activeId, add, remove, activate, deactivate, focus } = useContext(FocusContext)

  const id = useMemo(() => customId ?? Math.random().toString().slice(2, 7), [customId])

  useLayoutEffect(() => {
    add(id, { autoFocus })
    return () => {
      remove(id)
    }
  }, [add, autoFocus, id, remove])

  useLayoutEffect(() => {
    if (isActive) {
      activate(id)
    } else {
      deactivate(id)
    }
  }, [activate, deactivate, id, isActive])

  useLayoutEffect(() => {
    if (!isRawModeSupported || !isActive) {
      return
    }

    setRawMode(true)
    return () => {
      setRawMode(false)
    }
  }, [isActive, isRawModeSupported, setRawMode])

  return {
    isFocused: Boolean(id) && activeId === id,
    focus,
  }
}
