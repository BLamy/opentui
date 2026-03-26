import process from "node:process"
import { createContext } from "react"

export interface StderrContextValue {
  stderr: NodeJS.WriteStream
  write: (data: string) => void
}

export const StderrContext = createContext<StderrContextValue>({
  stderr: process.stderr,
  write() {},
})
