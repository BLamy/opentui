import type { DOMElement } from "./hooks/use-box-metrics.js"

export default function measureElement(node: DOMElement): { width: number; height: number } {
  const layout = node.getLayoutNode().getComputedLayout()
  return {
    width: layout.width,
    height: layout.height,
  }
}
