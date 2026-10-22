import process from "node:process"
import { createContext } from "react"

export interface StdoutContextValue {
  stdout: NodeJS.WriteStream
  write: (data: string) => void
}

export const StdoutContext = createContext<StdoutContextValue>({
  stdout: process.stdout,
  write() {},
})
