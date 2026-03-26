import { useLayoutEffect } from "react"
import { useStdinContext } from "./use-stdin.js"
import { runtime } from "../internal/runtime.js"

type Options = {
  isActive?: boolean
}

export default function usePaste(handler: (text: string) => void, options: Options = {}): void {
  const { setRawMode, setBracketedPasteMode, internal_eventEmitter } = useStdinContext()

  useLayoutEffect(() => {
    if (options.isActive === false) {
      return
    }

    setRawMode(true)
    setBracketedPasteMode(true)
    return () => {
      setRawMode(false)
      setBracketedPasteMode(false)
    }
  }, [options.isActive, setBracketedPasteMode, setRawMode])

  useLayoutEffect(() => {
    if (options.isActive === false) {
      return
    }

    const wrappedHandler = (text: string) => {
      runtime.flushSync(() => {
        handler(text)
      })
    }

    internal_eventEmitter.on("paste", wrappedHandler)
    return () => {
      internal_eventEmitter.off("paste", wrappedHandler)
    }
  }, [handler, internal_eventEmitter, options.isActive])
}
