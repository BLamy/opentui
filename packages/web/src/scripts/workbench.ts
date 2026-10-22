import defaultProgram from "../data/workbench-program.ts?raw"
import { debounce, loadEditor } from "./example-editing"
import { createExamplePreview, statusText } from "./example-frame"
import { decodeExampleHash, encodeExampleHash, type ExampleSource } from "./example-protocol"

// The workbench edits one program and runs it as you type. The URL fragment
// holds the program, so a link reproduces it.
const RERUN_DELAY = 400

const editorHost = document.querySelector<HTMLElement>("[data-workbench-editor]")
const output = document.querySelector<HTMLElement>("[data-workbench-output]")
const status = document.querySelector<HTMLElement>("[data-workbench-status]")
const reset = document.querySelector<HTMLButtonElement>("[data-workbench-reset]")

async function start(editorHost: HTMLElement, output: HTMLElement): Promise<void> {
  const initial: ExampleSource = decodeExampleHash(location.hash) ?? { code: defaultProgram, language: "typescript" }
  const preview = createExamplePreview(output, (next) => {
    if (status) status.textContent = statusText(next)
  })
  preview.run(initial)

  const editor = await loadEditor(editorHost, { ...initial, label: "Program" })
  const rerun = debounce((code: string) => {
    const source = { code, language: initial.language }
    history.replaceState(null, "", code === defaultProgram ? location.pathname : encodeExampleHash(source))
    preview.run(source)
  }, RERUN_DELAY)
  editor.onChange(rerun)
  reset?.addEventListener("click", () => editor.setValue(defaultProgram))
}

if (editorHost && output) void start(editorHost, output)
