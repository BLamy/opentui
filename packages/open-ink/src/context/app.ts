import { createContext } from "react"

export interface AppContextValue {
  exit: (errorOrResult?: Error | unknown) => void
  waitUntilRenderFlush: () => Promise<void>
}

export const AppContext = createContext<AppContextValue>({
  exit() {},
  async waitUntilRenderFlush() {},
})
