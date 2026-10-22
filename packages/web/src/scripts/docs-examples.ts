import type { ExampleEditor } from "./example-editor"
import { debounce, loadEditor } from "./example-editing"
import { createExamplePreview, statusText, type ExamplePreview, type PreviewStatus } from "./example-frame"
import { encodeExampleHash } from "./example-protocol"

// Code fences tagged `example` (see ProseCode.astro) get a run control. Running an
// example shows its output below the code and makes the code editable; edits run again.
const WORKBENCH_PATH = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}workbench`
const RERUN_DELAY = 400

interface ExampleBlock {
  root: HTMLElement
  pre: HTMLPreElement
  language: string
  output: HTMLElement
  terminal: HTMLElement
  status: HTMLElement
  workbench: HTMLAnchorElement
  button: HTMLButtonElement
  preview: ExamplePreview | null
  editor: Promise<ExampleEditor> | null
}

const blocks = new WeakMap<HTMLElement, ExampleBlock>()

function blockFor(root: HTMLElement): ExampleBlock | null {
  const existing = blocks.get(root)
  if (existing) return existing
  const pre = root.querySelector<HTMLPreElement>("pre[data-code]")
  const output = root.querySelector<HTMLElement>("[data-example-output]")
  const terminal = root.querySelector<HTMLElement>("[data-example-terminal]")
  const status = root.querySelector<HTMLElement>("[data-example-status]")
  const workbench = root.querySelector<HTMLAnchorElement>("[data-example-workbench]")
  const button = root.querySelector<HTMLButtonElement>("button.run-code")
  if (!pre || !output || !terminal || !status || !workbench || !button) return null
  const block: ExampleBlock = {
    root,
    pre,
    language: root.dataset.language ?? "typescript",
    output,
    terminal,
    status,
    workbench,
    button,
    preview: null,
    editor: null,
  }
  blocks.set(root, block)
  return block
}

function source(block: ExampleBlock) {
  return { code: block.pre.dataset.code ?? "", language: block.language }
}

function showStatus(block: ExampleBlock, status: PreviewStatus): void {
  block.status.textContent = statusText(status)
  block.root.dataset.state = status.state
}

function mountEditor(block: ExampleBlock): void {
  if (block.editor) return
  const host = block.root.querySelector<HTMLElement>("[data-example-editor]")
  if (!host) return
  host.hidden = false
  block.pre.hidden = true
  block.editor = loadEditor(host, { ...source(block), label: "Example code", autoHeight: true })
  const rerun = debounce(() => block.preview?.run(source(block)), RERUN_DELAY)
  void block.editor.then((editor) => {
    editor.onChange((code) => {
      block.pre.dataset.code = code
      block.workbench.href = WORKBENCH_PATH + encodeExampleHash(source(block))
      rerun()
    })
  })
}

function start(block: ExampleBlock): void {
  block.output.hidden = false
  block.button.textContent = "stop"
  block.button.setAttribute("aria-expanded", "true")
  block.workbench.href = WORKBENCH_PATH + encodeExampleHash(source(block))
  block.preview = createExamplePreview(block.terminal, (status) => showStatus(block, status))
  block.preview.run(source(block))
  mountEditor(block)
}

function stop(block: ExampleBlock): void {
  block.preview?.destroy()
  block.preview = null
  block.output.hidden = true
  block.button.textContent = "run"
  block.button.setAttribute("aria-expanded", "false")
  delete block.root.dataset.state
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return
  const button = event.target.closest("button.run-code")
  const root = button?.closest<HTMLElement>("[data-example]")
  const block = root ? blockFor(root) : null
  if (!block) return
  if (block.preview) stop(block)
  else start(block)
})
