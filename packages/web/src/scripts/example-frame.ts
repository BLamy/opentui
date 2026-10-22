import { EXAMPLE_FRAME_PATH, MESSAGE, type ExampleSource, type FrameMessage } from "./example-protocol"
import { fallbackTheme } from "./example-theme"

export interface PreviewStatus {
  state: "running" | "rendered" | "error"
  message?: string
}

export interface ExamplePreview {
  run(source: ExampleSource): void
  destroy(): void
}

interface PendingFrame {
  frame: HTMLIFrameElement
  requestId: string
  source: ExampleSource
}

// Core draws text and borders white unless a program sets colors, as most
// examples assume a dark terminal. The preview terminal is dark in every page theme.
const TERMINAL_THEME = fallbackTheme("dark")

let sequence = 0

export function statusText({ state, message }: PreviewStatus): string {
  if (state === "running") return "Starting"
  return state === "error" ? `Failed: ${message ?? "unknown error"}` : ""
}

// Shows an example frame in `container`. Each run loads a fresh frame behind the
// current one and swaps it in once the program has rendered or failed.
export function createExamplePreview(
  container: HTMLElement,
  onStatus: (status: PreviewStatus) => void = () => {},
): ExamplePreview {
  let current: HTMLIFrameElement | null = null
  let pending: PendingFrame | null = null

  const show = (next: PendingFrame) => {
    const hadFocus = current !== null && document.activeElement === current
    current?.remove()
    current = next.frame
    current.removeAttribute("aria-hidden")
    current.removeAttribute("tabindex")
    current.dataset.state = "shown"
    if (hadFocus) current.focus()
    pending = null
  }

  const onMessage = (event: MessageEvent<FrameMessage>) => {
    if (event.origin !== location.origin || !pending || event.source !== pending.frame.contentWindow) return
    const message = event.data
    if (message?.type === MESSAGE.ready) {
      pending.frame.contentWindow?.postMessage(
        { type: MESSAGE.run, ...pending.source, theme: TERMINAL_THEME, requestId: pending.requestId },
        location.origin,
      )
    } else if (message?.type === MESSAGE.status && message.requestId === pending.requestId) {
      show(pending)
      onStatus({ state: message.status, message: message.message })
    }
  }

  window.addEventListener("message", onMessage)

  return {
    run(source) {
      pending?.frame.remove()
      const frame = document.createElement("iframe")
      frame.className = "example-frame"
      frame.title = "Example output"
      frame.dataset.state = "loading"
      frame.setAttribute("aria-hidden", "true")
      frame.tabIndex = -1
      frame.src = EXAMPLE_FRAME_PATH
      pending = { frame, requestId: `example-${++sequence}`, source }
      container.append(frame)
      onStatus({ state: "running" })
    },
    destroy() {
      window.removeEventListener("message", onMessage)
      pending?.frame.remove()
      current?.remove()
      pending = null
      current = null
    },
  }
}
