import { createContext } from "react"

export interface CursorPosition {
  x: number
  y: number
}

export interface CursorContextValue {
  setCursorPosition: (position: CursorPosition | undefined) => void
}

export const CursorContext = createContext<CursorContextValue>({
  setCursorPosition() {},
})
