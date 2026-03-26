import { useLayoutEffect } from "react"
import type { KeyEvent } from "@opentui/core/browser"
import { useStdinContext } from "./use-stdin.js"
import { runtime } from "../internal/runtime.js"

export type Key = {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean
  super: boolean
  hyper: boolean
  capsLock: boolean
  numLock: boolean
  eventType?: "press" | "repeat" | "release"
}

type Handler = (input: string, key: Key) => void
type Options = {
  isActive?: boolean
}

function mapKey(event: KeyEvent): Key {
  return {
    upArrow: event.name === "up",
    downArrow: event.name === "down",
    leftArrow: event.name === "left",
    rightArrow: event.name === "right",
    pageDown: event.name === "pagedown",
    pageUp: event.name === "pageup",
    home: event.name === "home",
    end: event.name === "end",
    return: event.name === "return" || event.name === "enter",
    escape: event.name === "escape",
    ctrl: event.ctrl,
    shift: event.shift,
    tab: event.name === "tab",
    backspace: event.name === "backspace",
    delete: event.name === "delete",
    meta: event.meta || event.option || event.name === "escape",
    super: event.super ?? false,
    hyper: event.hyper ?? false,
    capsLock: event.capsLock ?? false,
    numLock: event.numLock ?? false,
    eventType: event.eventType === "release" ? "release" : event.repeated ? "repeat" : "press",
  }
}

function getInput(event: KeyEvent): string {
  if (event.ctrl && event.name.length === 1) {
    return event.name
  }

  switch (event.name) {
    case "up":
    case "down":
    case "left":
    case "right":
    case "pagedown":
    case "pageup":
    case "home":
    case "end":
    case "tab":
    case "backspace":
    case "delete":
    case "return":
    case "enter":
    case "escape":
      return ""
    default:
      return event.sequence.startsWith("\u001B") ? event.sequence.slice(1) : event.sequence
  }
}

export default function useInput(inputHandler: Handler, options: Options = {}): void {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdinContext()

  useLayoutEffect(() => {
    if (options.isActive === false) {
      return
    }

    setRawMode(true)
    return () => {
      setRawMode(false)
    }
  }, [options.isActive, setRawMode])

  useLayoutEffect(() => {
    if (options.isActive === false) {
      return
    }

    const handleInput = (event: KeyEvent) => {
      const key = mapKey(event)
      const input = getInput(event)

      if (input === "c" && key.ctrl && internal_exitOnCtrlC) {
        return
      }

      runtime.flushSync(() => {
        inputHandler(input, key)
      })
    }

    internal_eventEmitter.on("input", handleInput)
    return () => {
      internal_eventEmitter.off("input", handleInput)
    }
  }, [inputHandler, internal_eventEmitter, internal_exitOnCtrlC, options.isActive])
}
