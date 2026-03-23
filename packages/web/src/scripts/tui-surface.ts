const CELL_W = 10
const CELL_H = 18
const FONT = '14px "IBM Plex Mono", monospace'

type BoxStyle = "single" | "double" | "bold"
type Feature = "layout" | "syntax" | "components" | "keyboard" | "react" | "animations"

interface ThemeColors {
  bg: string
  fg: string
  fgStrong: string
  fgWeak: string
  border: string
}

interface SyntaxColors {
  keyword: string
  string: string
  function: string
  component: string
  punctuation: string
  text: string
}

class Renderer {
  public cols = 0
  public rows = 0
  public dpr = 1
  public colors: ThemeColors = {
    bg: "transparent",
    fg: "#666",
    fgStrong: "#1f1f1f",
    fgWeak: "#999",
    border: "#e5e5e5",
  }
  public syntax: SyntaxColors = {
    keyword: "#6366f1",
    string: "#059669",
    function: "#0891b2",
    component: "#9333ea",
    punctuation: "#71717a",
    text: "#3f3f46",
  }

  private readonly ctx: CanvasRenderingContext2D

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("2D canvas context unavailable")
    }

    this.ctx = context
    this.updateTheme()
    this.resize()

    const resizeObserver = new ResizeObserver(() => this.resize())
    resizeObserver.observe(canvas.parentElement as HTMLElement)

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.updateTheme())
  }

  public updateTheme(): void {
    const style = getComputedStyle(document.documentElement)
    this.colors.fg = style.getPropertyValue("--color-text").trim() || "#666"
    this.colors.fgStrong = style.getPropertyValue("--color-text-strong").trim() || "#111"
    this.colors.fgWeak = style.getPropertyValue("--color-text-weak").trim() || "#999"
    this.colors.border = style.getPropertyValue("--color-border").trim() || "#eee"

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      this.syntax = {
        keyword: "#c9a0dc",
        string: "#a5d6a7",
        function: "#7dd3fc",
        component: "#e0b0ff",
        punctuation: "#a0a0a0",
        text: "#e0e0e0",
      }
      return
    }

    this.syntax = {
      keyword: "#6366f1",
      string: "#059669",
      function: "#0891b2",
      component: "#9333ea",
      punctuation: "#71717a",
      text: "#3f3f46",
    }
  }

  public resize(): void {
    const parent = this.canvas.parentElement as HTMLElement
    const rect = parent.getBoundingClientRect()

    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    this.cols = Math.floor(rect.width / CELL_W)
    this.rows = Math.floor(rect.height / CELL_H)
  }

  public clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr)
  }

  public drawChar(char: string, x: number, y: number, fg: string, bg?: string): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
      return
    }

    const px = x * CELL_W
    const py = y * CELL_H

    if (bg) {
      this.ctx.fillStyle = bg
      this.ctx.fillRect(px, py, CELL_W, CELL_H)
    }

    this.ctx.font = FONT
    this.ctx.textBaseline = "top"
    this.ctx.fillStyle = fg
    this.ctx.fillText(char, px, py + 2)
  }

  public drawBox(x: number, y: number, w: number, h: number, fg: string, style: BoxStyle = "single", label?: string): void {
    const chars =
      style === "double"
        ? { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" }
        : style === "bold"
          ? { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" }
          : { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" }

    this.drawChar(chars.tl, x, y, fg)
    this.drawChar(chars.tr, x + w - 1, y, fg)
    this.drawChar(chars.bl, x, y + h - 1, fg)
    this.drawChar(chars.br, x + w - 1, y + h - 1, fg)

    for (let index = 1; index < w - 1; index += 1) {
      this.drawChar(chars.h, x + index, y, fg)
      this.drawChar(chars.h, x + index, y + h - 1, fg)
    }

    for (let index = 1; index < h - 1; index += 1) {
      this.drawChar(chars.v, x, y + index, fg)
      this.drawChar(chars.v, x + w - 1, y + index, fg)
    }

    if (!label) {
      return
    }

    const paddedLabel = ` ${label} `
    for (let index = 0; index < paddedLabel.length; index += 1) {
      const labelX = x + 1 + index
      if (labelX >= x + w - 1) {
        break
      }

      const px = labelX * CELL_W
      const py = y * CELL_H
      this.ctx.clearRect(px, py, CELL_W, CELL_H)
      this.drawChar(paddedLabel[index] ?? " ", labelX, y, fg)
    }
  }

  public drawText(text: string, x: number, y: number, fg: string): void {
    for (let index = 0; index < text.length; index += 1) {
      this.drawChar(text[index] ?? "", x + index, y, fg)
    }
  }
}

function initSurface(root: HTMLElement): void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-tui-surface-canvas]")
  if (!canvas || root.dataset.initialized === "true") {
    return
  }

  root.dataset.initialized = "true"

  const renderer = new Renderer(canvas)
  let activeFeature: Feature = "layout"

  window.addEventListener("feature-change", (event: Event) => {
    activeFeature = (event as CustomEvent<Feature>).detail
  })

  const animate = (time: number) => {
    renderer.clear()

    const t = time / 1000
    const cx = Math.floor(renderer.cols / 2)
    const cy = Math.floor(renderer.rows / 2)

    switch (activeFeature) {
      case "layout": {
        const phase = (Math.sin(t) + 1) / 2
        const gap = 2
        const totalW = 40
        const h = 10
        const wLeft = Math.floor(10 + phase * 10)
        const wRight = totalW - wLeft
        const startX = cx - (totalW + gap) / 2
        const startY = cy - h / 2

        renderer.drawBox(Math.floor(startX), Math.floor(startY), wLeft, h, renderer.colors.fgStrong, "single", "Nav")
        renderer.drawBox(
          Math.floor(startX + wLeft + gap),
          Math.floor(startY),
          wRight,
          h,
          renderer.colors.fg,
          "single",
          "Content",
        )
        renderer.drawText(`${wLeft}w`, Math.floor(startX), Math.floor(startY) - 1, renderer.colors.fgWeak)
        renderer.drawText(`${wRight}w`, Math.floor(startX + wLeft + gap), Math.floor(startY) - 1, renderer.colors.fgWeak)
        break
      }

      case "syntax": {
        const code = [
          "import { Text } from 'tui'",
          "",
          "function App() {",
          "  return (",
          "    <Text color='green'>",
          "      Hello World",
          "    </Text>",
          "  )",
          "}",
        ]
        const keywords = ["import", "from", "function", "return", "const"]
        const components = ["Text"]
        const startX = cx - 15
        const startY = cy - 5
        const cycleLength = code.length + 4
        const scanRow = Math.floor(t * 2) % cycleLength

        code.forEach((line, lineIndex) => {
          const isCurrentLine = lineIndex === scanRow
          const isHighlighted = lineIndex <= scanRow
          const tokens = line.split(/(\s+|[{}()<>='",;/]|'[^']*')/).filter(Boolean)
          let tokenX = startX

          tokens.forEach((token) => {
            let color = renderer.colors.fgWeak

            if (isHighlighted) {
              if (keywords.includes(token)) {
                color = renderer.syntax.keyword
              } else if (components.includes(token)) {
                color = renderer.syntax.component
              } else if (token.startsWith("'") && token.endsWith("'")) {
                color = renderer.syntax.string
              } else if (/^[{}()<>=,;]$/.test(token)) {
                color = renderer.syntax.punctuation
              } else if (token === "App") {
                color = renderer.syntax.function
              } else if (token.trim()) {
                color = renderer.syntax.text
              }
            }

            renderer.drawText(token, tokenX, startY + lineIndex, color)
            tokenX += token.length
          })

          if (isCurrentLine && scanRow < code.length) {
            renderer.drawChar("│", startX - 2, startY + lineIndex, renderer.colors.fgStrong)
          }
        })
        break
      }

      case "components": {
        const step = Math.floor(t / 1.5) % 3
        const startX = cx - 12
        const startY = cy - 6
        const inputFocused = step === 0
        const selectFocused = step === 1
        const buttonFocused = step === 2

        renderer.drawText("Username:", startX, startY, renderer.colors.fg)
        renderer.drawBox(
          startX,
          startY + 1,
          24,
          3,
          inputFocused ? renderer.colors.fgStrong : renderer.colors.border,
          inputFocused ? "double" : "single",
        )
        renderer.drawText(inputFocused ? "Simon|" : "Simon", startX + 2, startY + 2, inputFocused ? renderer.colors.fgStrong : renderer.colors.fg)

        renderer.drawText("Role:", startX, startY + 5, renderer.colors.fg)
        renderer.drawBox(
          startX,
          startY + 6,
          24,
          3,
          selectFocused ? renderer.colors.fgStrong : renderer.colors.border,
          selectFocused ? "double" : "single",
        )
        renderer.drawText(
          "Developer ▼",
          startX + 2,
          startY + 7,
          selectFocused ? renderer.colors.fgStrong : renderer.colors.fg,
        )

        renderer.drawBox(
          startX + 14,
          startY + 10,
          10,
          3,
          buttonFocused ? renderer.colors.fgStrong : renderer.colors.border,
          buttonFocused ? "bold" : "single",
        )
        renderer.drawText("Save", startX + 17, startY + 11, buttonFocused ? renderer.colors.fgStrong : renderer.colors.fg)
        break
      }

      case "keyboard": {
        const items = [" Dashboard", " Settings", " Profile", " Logout"]
        const idx = Math.floor(t * 1.5) % 4
        const startX = cx - 10
        const startY = cy - 5

        renderer.drawBox(startX, startY, 20, 8, renderer.colors.border, "single", "Menu")
        items.forEach((item, index) => {
          const active = index === idx
          renderer.drawText((active ? ">" : " ") + item, startX + 2, startY + 2 + index, active ? renderer.colors.fgStrong : renderer.colors.fg)
        })
        break
      }

      case "react": {
        const startX = cx
        const startY = cy - 4
        const pulse = Math.floor(t) % 2 === 0

        renderer.drawBox(startX - 4, startY, 8, 3, renderer.colors.fgStrong, "single", "App")
        renderer.drawChar("│", startX, startY + 3, renderer.colors.border)
        renderer.drawChar("┌", startX - 6, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX - 5, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX - 4, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX - 3, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX - 2, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX - 1, startY + 4, renderer.colors.border)
        renderer.drawChar("┴", startX, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX + 1, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX + 2, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX + 3, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX + 4, startY + 4, renderer.colors.border)
        renderer.drawChar("─", startX + 5, startY + 4, renderer.colors.border)
        renderer.drawChar("┐", startX + 6, startY + 4, renderer.colors.border)
        renderer.drawChar("│", startX - 6, startY + 5, renderer.colors.border)
        renderer.drawChar("│", startX + 6, startY + 5, renderer.colors.border)
        renderer.drawBox(startX - 10, startY + 6, 8, 3, pulse ? renderer.colors.fgStrong : renderer.colors.fgWeak, "single", "List")
        renderer.drawBox(startX + 2, startY + 6, 8, 3, !pulse ? renderer.colors.fgStrong : renderer.colors.fgWeak, "single", "Item")
        break
      }

      case "animations": {
        const w = 30
        const h = 12
        const startX = cx - w / 2
        const startY = cy - h / 2
        const bx = Math.abs(Math.sin(t) * (w - 3))
        const by = Math.abs(Math.cos(t * 0.8) * (h - 3))

        renderer.drawBox(startX, startY, w, h, renderer.colors.border)
        for (let index = 1; index < 4; index += 1) {
          const trailTime = t - index * 0.1
          const tx = Math.abs(Math.sin(trailTime) * (w - 3))
          const ty = Math.abs(Math.cos(trailTime * 0.8) * (h - 3))
          renderer.drawChar("·", startX + 1 + tx, startY + 1 + ty, renderer.colors.border)
        }
        renderer.drawChar("●", startX + 1 + bx, startY + 1 + by, renderer.colors.fgStrong)
        break
      }
    }

    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)
}

document.querySelectorAll<HTMLElement>("[data-tui-surface]").forEach((surface) => initSurface(surface))
