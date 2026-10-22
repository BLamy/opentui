import { BoxRenderable, TextAttributes, TextRenderable, createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer()

const layout = new BoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  flexDirection: "column",
  padding: 1,
  gap: 1,
})
const title = new TextRenderable(renderer, { content: "OpenTUI workbench", attributes: TextAttributes.BOLD })
const keys = new TextRenderable(renderer, { content: "Press a key." })
const size = new TextRenderable(renderer, { content: `${renderer.width} x ${renderer.height}` })
const pad = new BoxRenderable(renderer, { flexGrow: 1, border: true, borderStyle: "rounded", title: "Drag the block" })

let grab = { x: 0, y: 0 }
const block = new BoxRenderable(renderer, {
  position: "absolute",
  left: 2,
  top: 1,
  width: 8,
  height: 3,
  backgroundColor: "#1131E9",
  onMouseDown(event) {
    grab = { x: event.x - this.x, y: event.y - this.y }
  },
  onMouseDrag(event) {
    this.left = Math.max(0, Math.min(pad.width - 2 - this.width, event.x - grab.x - pad.x - 1))
    this.top = Math.max(0, Math.min(pad.height - 2 - this.height, event.y - grab.y - pad.y - 1))
  },
})

pad.add(block)
layout.add(title)
layout.add(keys)
layout.add(size)
layout.add(pad)
renderer.root.add(layout)

renderer.keyInput.on("keypress", (key) => {
  const modifiers = [key.ctrl && "ctrl", key.meta && "meta", key.shift && "shift"].filter(Boolean)
  keys.content = `Key ${[...modifiers, key.name || JSON.stringify(key.sequence)].join("+")}`
})

renderer.on("resize", (width: number, height: number) => {
  size.content = `${width} x ${height}`
})
