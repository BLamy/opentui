import { useCallback, useContext, useInsertionEffect, useRef } from "react"
import { CursorContext, type CursorPosition } from "../context/cursor.js"

export default function useCursor() {
  const context = useContext(CursorContext)
  const positionRef = useRef<CursorPosition | undefined>(undefined)

  const setCursorPosition = useCallback((position: CursorPosition | undefined) => {
    positionRef.current = position
  }, [])

  useInsertionEffect(() => {
    context.setCursorPosition(positionRef.current)
    return () => {
      context.setCursorPosition(undefined)
    }
  })

  return { setCursorPosition }
}
