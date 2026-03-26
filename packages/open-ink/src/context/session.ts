import { createContext, useContext } from "react"
import type { OpenInkSession } from "../internal/session.js"

export const SessionContext = createContext<OpenInkSession | null>(null)

export function useSession(): OpenInkSession {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error("OpenInk session not found.")
  }

  return session
}
