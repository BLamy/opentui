import { expect, test } from "bun:test"

import {
  clampDocExampleCodePaneWidth,
  DOC_EXAMPLE_CODE_PANE_MIN_WIDTH,
  DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH,
  DOC_EXAMPLE_RESIZER_SIZE,
  getDefaultDocExampleCodePaneWidth,
  getDocExampleResizeBounds,
  getDocExampleResizeValueNow,
} from "./docs-example-resize"

test("computes resize bounds from the container width", () => {
  expect(getDocExampleResizeBounds(1400)).toEqual({
    minCodePaneWidth: DOC_EXAMPLE_CODE_PANE_MIN_WIDTH,
    maxCodePaneWidth: 1400 - DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH - DOC_EXAMPLE_RESIZER_SIZE,
  })
})

test("clamps the code pane width within the allowed split range", () => {
  const { maxCodePaneWidth } = getDocExampleResizeBounds(1400)

  expect(clampDocExampleCodePaneWidth(120, 1400)).toBe(DOC_EXAMPLE_CODE_PANE_MIN_WIDTH)
  expect(clampDocExampleCodePaneWidth(1200, 1400)).toBe(maxCodePaneWidth)
  expect(clampDocExampleCodePaneWidth(640, 1400)).toBe(640)
})

test("uses the default ratio until it would crowd the preview pane", () => {
  expect(getDefaultDocExampleCodePaneWidth(1400)).toBe(812)
  expect(getDefaultDocExampleCodePaneWidth(560)).toBe(DOC_EXAMPLE_CODE_PANE_MIN_WIDTH)
})

test("reports separator aria values across the allowed range", () => {
  const { maxCodePaneWidth } = getDocExampleResizeBounds(1400)
  const midpoint = Math.round((DOC_EXAMPLE_CODE_PANE_MIN_WIDTH + maxCodePaneWidth) / 2)

  expect(getDocExampleResizeValueNow(DOC_EXAMPLE_CODE_PANE_MIN_WIDTH, 1400)).toBe(0)
  expect(getDocExampleResizeValueNow(maxCodePaneWidth, 1400)).toBe(100)
  expect(getDocExampleResizeValueNow(midpoint, 1400)).toBe(50)
  expect(getDocExampleResizeValueNow(320, 560)).toBe(50)
})
