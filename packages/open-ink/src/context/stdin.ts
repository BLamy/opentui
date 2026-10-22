import { EventEmitter } from "node:events"
import process from "node:process"
import { createContext } from "react"

export interface StdinPublicProps {
  stdin: NodeJS.ReadStream
  setRawMode: (value: boolean) => void
  isRawModeSupported: boolean
}

export interface StdinContextValue extends StdinPublicProps {
  setBracketedPasteMode: (value: boolean) => void
  internal_exitOnCtrlC: boolean
  internal_eventEmitter: EventEmitter
}

export const StdinContext = createContext<StdinContextValue>({
  stdin: process.stdin,
  setRawMode() {},
  setBracketedPasteMode() {},
  isRawModeSupported: false,
  internal_exitOnCtrlC: true,
  internal_eventEmitter: new EventEmitter(),
})
