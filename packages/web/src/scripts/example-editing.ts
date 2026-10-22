import type { ExampleEditor } from "./example-editor"

// Loads the code editor, or a plain textarea when it cannot load.
export async function loadEditor(
  host: HTMLElement,
  options: { code: string; language: string; label: string; autoHeight?: boolean },
): Promise<ExampleEditor> {
  try {
    const { mountEditor } = await import("./example-editor")
    return mountEditor(host, options)
  } catch (error) {
    console.error("The code editor failed to load. Using a plain text area.", error)
    return mountTextarea(host, options)
  }
}

function mountTextarea(host: HTMLElement, options: { code: string; label: string }): ExampleEditor {
  const textarea = document.createElement("textarea")
  textarea.className = "example-textarea"
  textarea.value = options.code
  textarea.spellcheck = false
  textarea.wrap = "off"
  textarea.setAttribute("aria-label", options.label)
  textarea.rows = Math.max(4, options.code.split("\n").length)
  host.append(textarea)
  return {
    getValue: () => textarea.value,
    setValue: (value) => {
      textarea.value = value
    },
    onChange: (listener) => textarea.addEventListener("input", () => listener(textarea.value)),
    focus: () => textarea.focus(),
    dispose: () => textarea.remove(),
  }
}

export function debounce<T extends unknown[]>(callback: (...args: T) => void, delay: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => callback(...args), delay)
  }
}
