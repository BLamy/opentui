import type { DocExampleEditor } from "./example-editor-monaco"

import {
  clampDocExampleCodePaneWidth,
  DOC_EXAMPLE_CODE_PANE_MIN_WIDTH,
  DOC_EXAMPLE_KEYBOARD_STEP,
  DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH,
  DOC_EXAMPLE_RESIZER_SIZE,
  getDefaultDocExampleCodePaneWidth,
  getDocExampleResizeBounds,
  getDocExampleResizeValueNow,
} from "./docs-example-resize"
import { getEditorLanguage, isPreviewLanguage, normalizePreviewLanguage } from "./example-preview-languages"
import { withBase } from "../utils/base-path"

const COPY_BUTTON_MARKUP = `
  <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
  <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`

const PREVIEW_ROUTE = withBase("/workbench/example")
const PREVIEW_UPDATE_DEBOUNCE_MS = 120
const PREVIEW_STATUS_MESSAGE = "opentui-doc-example-status"
const TAB_INSERT = "  "
const DESKTOP_MQ =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 1200px)")
    : null
export const DOC_EXAMPLE_BLOCK_SELECTOR = '.content [data-doc-example="true"] pre[data-code]'

interface PreviewUpdatePayload {
  code: string
  language: string
  requestId?: string
}

interface PreviewStatusPayload {
  type: typeof PREVIEW_STATUS_MESSAGE
  requestId: string
  status: "rendered" | "error"
}

interface PendingPreviewFocusRestore {
  requestId: string
  restore: (() => void) | null
}

interface FocusAwareElement {
  tagName?: string | null
}

const pendingPreviewFocusRestores = new WeakMap<HTMLIFrameElement, PendingPreviewFocusRestore>()
let previewRequestSequence = 0

function createTabButton(label: string, pane: "code" | "preview", active: boolean): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "doc-example__tab"
  button.dataset.pane = pane
  button.textContent = label
  button.setAttribute("aria-selected", active ? "true" : "false")
  return button
}

function createResizer(): HTMLDivElement {
  const resizer = document.createElement("div")
  resizer.className = "doc-example__resizer"
  resizer.tabIndex = 0
  resizer.setAttribute("role", "separator")
  resizer.setAttribute("aria-label", "Resize code and preview panes")
  resizer.setAttribute("aria-orientation", "vertical")
  resizer.setAttribute("aria-valuemin", "0")
  resizer.setAttribute("aria-valuemax", "100")

  return resizer
}

function createPreviewRequestId(): string {
  previewRequestSequence += 1
  return `opentui-doc-example-${previewRequestSequence}`
}

export function shouldRestorePreviewEditorFocus(
  activeElement: FocusAwareElement | null,
  iframe: FocusAwareElement,
): boolean {
  return (
    activeElement === null ||
    activeElement === iframe ||
    activeElement.tagName === "BODY" ||
    activeElement.tagName === "HTML"
  )
}

function postExampleToFrame(iframe: HTMLIFrameElement, payload: PreviewUpdatePayload): void {
  iframe.contentWindow?.postMessage(
    {
      type: "opentui-doc-example",
      code: payload.code,
      language: payload.language,
      path: window.location.pathname,
      requestId: payload.requestId,
    },
    window.location.origin,
  )
}

function suppressPreviewStatus(iframe: HTMLIFrameElement): void {
  const document = iframe.contentDocument
  if (!document) {
    return
  }

  document.querySelector<HTMLElement>("[data-preview-status]")?.remove()
}

function mountPreview(iframe: HTMLIFrameElement, getPayload: () => { code: string; language: string }): void {
  if (iframe.dataset.loaded === "true") {
    return
  }

  iframe.dataset.loaded = "true"
  iframe.src = PREVIEW_ROUTE
  iframe.addEventListener(
    "load",
    () => {
      suppressPreviewStatus(iframe)
      postExampleToFrame(iframe, getPayload())
      window.setTimeout(() => postExampleToFrame(iframe, getPayload()), 150)
    },
    { once: true },
  )
}

function findPreviewIframeBySource(source: MessageEventSource | null): HTMLIFrameElement | null {
  if (!source || typeof document === "undefined") {
    return null
  }

  for (const iframe of document.querySelectorAll<HTMLIFrameElement>(".doc-example__frame")) {
    if (iframe.contentWindow === source) {
      return iframe
    }
  }

  return null
}

function restorePendingPreviewEditorFocus(event: MessageEvent<PreviewStatusPayload>): void {
  if (event.origin !== window.location.origin || event.data?.type !== PREVIEW_STATUS_MESSAGE) {
    return
  }

  const iframe = findPreviewIframeBySource(event.source)
  if (!iframe) {
    return
  }

  const pending = pendingPreviewFocusRestores.get(iframe)
  if (!pending || pending.requestId !== event.data.requestId) {
    return
  }

  pendingPreviewFocusRestores.delete(iframe)

  if (pending.restore && shouldRestorePreviewEditorFocus(document.activeElement, iframe)) {
    pending.restore()
  }
}

function resizeEditor(editor: HTMLTextAreaElement): void {
  editor.style.height = "0px"
  editor.style.height = `${Math.max(editor.scrollHeight, 280)}px`
}

function createTextareaEditor(codePane: HTMLDivElement, code: string): DocExampleEditor {
  const editor = document.createElement("textarea")
  editor.className = "doc-example__editor"
  editor.value = code
  editor.spellcheck = false
  editor.wrap = "off"
  editor.setAttribute("aria-label", "Editable example code")
  editor.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return
    }

    event.preventDefault()

    const start = editor.selectionStart
    const end = editor.selectionEnd
    editor.setRangeText(TAB_INSERT, start, end, "end")
    editor.dispatchEvent(new Event("input", { bubbles: true }))
  })

  resizeEditor(editor)
  codePane.appendChild(editor)

  return {
    getValue: () => editor.value,
    onDidChange: (listener) => {
      const handleInput = () => {
        resizeEditor(editor)
        listener(editor.value)
      }

      editor.addEventListener("input", handleInput)

      return () => editor.removeEventListener("input", handleInput)
    },
    captureFocus: () => {
      if (document.activeElement !== editor) {
        return null
      }

      const selectionStart = editor.selectionStart
      const selectionEnd = editor.selectionEnd
      const selectionDirection = editor.selectionDirection ?? "none"

      return {
        restore: () => {
          editor.focus()
          editor.setSelectionRange(selectionStart, selectionEnd, selectionDirection)
        },
      }
    },
    dispose: () => editor.remove(),
  }
}

async function mountCodeEditor(codePane: HTMLDivElement, code: string, language: string): Promise<DocExampleEditor> {
  const host = document.createElement("div")
  host.className = "doc-example__editor"
  codePane.appendChild(host)

  try {
    const { mountMonacoEditor } = await import("./example-editor-monaco")

    return await mountMonacoEditor(host, {
      code,
      language,
      ariaLabel: "Editable example code",
      viewportElement: codePane,
    })
  } catch (error) {
    host.remove()

    console.error("Failed to load Monaco for docs examples, falling back to textarea.", error)

    return createTextareaEditor(codePane, code)
  }
}

function mountPaneResizer(
  wrapper: HTMLElement,
  body: HTMLDivElement,
  codePane: HTMLDivElement,
  resizer: HTMLDivElement,
): void {
  let activePointerId: number | null = null
  let currentWidth: number | null = null
  let dragStartWidth = 0
  let dragStartX = 0
  let hasUserResized = false

  const setCodePaneWidth = (nextWidth: number, userInitiated = false): void => {
    const containerWidth = body.getBoundingClientRect().width
    if (containerWidth <= 0) {
      return
    }

    if (userInitiated) {
      hasUserResized = true
    }

    const resolvedWidth = hasUserResized
      ? clampDocExampleCodePaneWidth(nextWidth, containerWidth)
      : getDefaultDocExampleCodePaneWidth(containerWidth)

    currentWidth = resolvedWidth
    wrapper.style.setProperty("--doc-example-code-width", `${resolvedWidth}px`)
    resizer.setAttribute("aria-valuenow", String(getDocExampleResizeValueNow(resolvedWidth, containerWidth)))
  }

  const syncCodePaneWidth = (): void => {
    const containerWidth = body.getBoundingClientRect().width
    if (containerWidth <= 0) {
      return
    }

    const nextWidth =
      hasUserResized && currentWidth !== null
        ? clampDocExampleCodePaneWidth(currentWidth, containerWidth)
        : getDefaultDocExampleCodePaneWidth(containerWidth)

    currentWidth = nextWidth
    wrapper.style.setProperty("--doc-example-code-width", `${nextWidth}px`)
    resizer.setAttribute("aria-valuenow", String(getDocExampleResizeValueNow(nextWidth, containerWidth)))
  }

  const stopPointerResize = (): void => {
    activePointerId = null
    wrapper.dataset.resizing = "false"
    resizer.dataset.active = "false"
  }

  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()

    activePointerId = event.pointerId
    dragStartX = event.clientX
    dragStartWidth = codePane.getBoundingClientRect().width
    wrapper.dataset.resizing = "true"
    resizer.dataset.active = "true"
    resizer.setPointerCapture(event.pointerId)
  })

  resizer.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) {
      return
    }

    event.preventDefault()
    setCodePaneWidth(dragStartWidth + (event.clientX - dragStartX), true)
  })

  resizer.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) {
      return
    }

    if (resizer.hasPointerCapture(event.pointerId)) {
      resizer.releasePointerCapture(event.pointerId)
    }

    stopPointerResize()
  })

  resizer.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== activePointerId) {
      return
    }

    stopPointerResize()
  })

  resizer.addEventListener("lostpointercapture", stopPointerResize)
  resizer.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return
    }

    event.preventDefault()

    const containerWidth = body.getBoundingClientRect().width
    if (containerWidth <= 0) {
      return
    }

    const baseWidth = currentWidth ?? getDefaultDocExampleCodePaneWidth(containerWidth)

    if (event.key === "Home") {
      setCodePaneWidth(DOC_EXAMPLE_CODE_PANE_MIN_WIDTH, true)
      return
    }

    if (event.key === "End") {
      setCodePaneWidth(getDocExampleResizeBounds(containerWidth).maxCodePaneWidth, true)
      return
    }

    const delta = event.key === "ArrowLeft" ? -DOC_EXAMPLE_KEYBOARD_STEP : DOC_EXAMPLE_KEYBOARD_STEP
    setCodePaneWidth(baseWidth + delta, true)
  })

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => syncCodePaneWidth())
    resizeObserver.observe(body)
  } else {
    window.addEventListener("resize", syncCodePaneWidth)
  }

  syncCodePaneWidth()
}

async function enhanceCodeBlock(pre: HTMLPreElement): Promise<void> {
  if (pre.dataset.enhanced === "true") {
    return
  }

  const code = pre.dataset.code ?? ""
  const exampleContainer = pre.closest<HTMLElement>("[data-doc-example='true']")
  const sourceLanguage = exampleContainer?.dataset.docExampleLanguage ?? pre.dataset.language ?? ""
  const language = normalizePreviewLanguage(sourceLanguage)
  const supportsPreview = isPreviewLanguage(language)

  pre.dataset.enhanced = "true"

  const wrapper = document.createElement("section")
  wrapper.className = "doc-example"
  wrapper.dataset.showCode = "true"
  wrapper.dataset.showPreview = supportsPreview ? "true" : "false"
  wrapper.dataset.previewable = supportsPreview ? "true" : "false"
  wrapper.dataset.resizing = "false"
  wrapper.style.setProperty("--doc-example-code-min-width", `${DOC_EXAMPLE_CODE_PANE_MIN_WIDTH}px`)
  wrapper.style.setProperty("--doc-example-preview-min-width", `${DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH}px`)
  wrapper.style.setProperty("--doc-example-resizer-size", `${DOC_EXAMPLE_RESIZER_SIZE}px`)

  const toolbar = document.createElement("div")
  toolbar.className = "doc-example__toolbar"

  const codeTab = createTabButton("Code", "code", true)

  const actions = document.createElement("div")
  actions.className = "doc-example__actions"

  const languageChip = document.createElement("span")
  languageChip.className = "doc-example__language"
  languageChip.textContent = getEditorLanguage(language) || "text"

  const copyButton = document.createElement("button")
  copyButton.type = "button"
  copyButton.className = "doc-example__copy"
  copyButton.setAttribute("aria-label", "Copy code")
  copyButton.innerHTML = COPY_BUTTON_MARKUP

  if (supportsPreview) {
    const tabs = document.createElement("div")
    tabs.className = "doc-example__tabs"

    const previewTab = createTabButton("Preview", "preview", true)

    const syncTabState = () => {
      codeTab.setAttribute("aria-selected", wrapper.dataset.showCode === "true" ? "true" : "false")
      previewTab.setAttribute("aria-selected", wrapper.dataset.showPreview === "true" ? "true" : "false")
    }

    codeTab.addEventListener("click", () => {
      if (DESKTOP_MQ?.matches) {
        const next = wrapper.dataset.showCode === "true" ? "false" : "true"
        if (next === "false" && wrapper.dataset.showPreview === "false") return
        wrapper.dataset.showCode = next
      } else {
        wrapper.dataset.showCode = "true"
        wrapper.dataset.showPreview = "false"
      }
      syncTabState()
    })

    previewTab.addEventListener("click", () => {
      if (DESKTOP_MQ?.matches) {
        const next = wrapper.dataset.showPreview === "true" ? "false" : "true"
        if (next === "false" && wrapper.dataset.showCode === "false") return
        wrapper.dataset.showPreview = next
      } else {
        wrapper.dataset.showCode = "false"
        wrapper.dataset.showPreview = "true"
      }
      syncTabState()
    })

    tabs.append(codeTab, previewTab)
    toolbar.append(tabs)
  } else {
    toolbar.classList.add("doc-example__toolbar--compact")
  }

  actions.append(languageChip, copyButton)
  toolbar.append(actions)

  const body = document.createElement("div")
  body.className = "doc-example__body"

  const codePane = document.createElement("div")
  codePane.className = "doc-example__code"

  let previewPane: HTMLDivElement | null = null
  let resizer: HTMLDivElement | null = null

  if (supportsPreview) {
    resizer = createResizer()
    previewPane = document.createElement("div")
    previewPane.className = "doc-example__preview"

    body.append(codePane, resizer, previewPane)
  } else {
    body.append(codePane)
  }

  wrapper.append(toolbar, body)
  pre.replaceWith(wrapper)

  if (supportsPreview && previewPane && resizer) {
    mountPaneResizer(wrapper, body, codePane, resizer)

    const current = { code }
    const editor = await mountCodeEditor(codePane, code, language)
    let updateTimer: number | null = null

    current.code = editor.getValue()
    editor.onDidChange((value) => {
      current.code = value

      if (updateTimer !== null) {
        window.clearTimeout(updateTimer)
      }

      updateTimer = window.setTimeout(() => {
        const iframe = previewPane.querySelector<HTMLIFrameElement>(".doc-example__frame")
        if (!iframe || iframe.dataset.loaded !== "true") {
          return
        }

        const requestId = createPreviewRequestId()
        const focusSnapshot = editor.captureFocus()
        pendingPreviewFocusRestores.set(iframe, {
          requestId,
          restore: focusSnapshot ? () => focusSnapshot.restore() : null,
        })

        postExampleToFrame(iframe, { code: current.code, language, requestId })
      }, PREVIEW_UPDATE_DEBOUNCE_MS)
    })

    const iframe = document.createElement("iframe")
    iframe.className = "doc-example__frame"
    iframe.loading = "lazy"
    iframe.setAttribute("title", "OpenTUI example preview")
    iframe.setAttribute("allow", "clipboard-read; clipboard-write")
    previewPane.appendChild(iframe)
    mountPreview(iframe, () => ({ code: current.code, language }))

    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(current.code)
      copyButton.classList.add("copied")
      window.setTimeout(() => copyButton.classList.remove("copied"), 1500)
    })

    return
  }

  const editor = await mountCodeEditor(codePane, code, language)

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(editor.getValue())
    copyButton.classList.add("copied")
    window.setTimeout(() => copyButton.classList.remove("copied"), 1500)
  })
}

export function getDocExampleBlocks(root: ParentNode = document): HTMLPreElement[] {
  return Array.from(root.querySelectorAll<HTMLPreElement>(DOC_EXAMPLE_BLOCK_SELECTOR))
}

export async function enhanceDocExamples(
  root: ParentNode = document,
  enhancer: (pre: HTMLPreElement) => Promise<void> | void = enhanceCodeBlock,
): Promise<void[]> {
  return Promise.all(getDocExampleBlocks(root).map((pre) => Promise.resolve(enhancer(pre))))
}

if (typeof document !== "undefined") {
  window.addEventListener("message", (event) => {
    restorePendingPreviewEditorFocus(event as MessageEvent<PreviewStatusPayload>)
  })
  void enhanceDocExamples()
}
