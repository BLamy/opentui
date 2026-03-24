import { expect, test } from "bun:test"

import { getWorkbenchEditorCursorPosition } from "./workbench-cursor"

test("workbench editor cursor uses 1-based terminal coordinates", () => {
  expect(
    getWorkbenchEditorCursorPosition({
      contentX: 12,
      contentY: 8,
      gutterWidth: 5,
      cursorCol: 3,
      cursorRow: 10,
      editorScrollTop: 0,
      contentHeight: 20,
    }),
  ).toEqual({ x: 21, y: 19 })
})

test("workbench editor cursor hides when scrolled outside the viewport", () => {
  expect(
    getWorkbenchEditorCursorPosition({
      contentX: 12,
      contentY: 8,
      gutterWidth: 5,
      cursorCol: 3,
      cursorRow: 10,
      editorScrollTop: 11,
      contentHeight: 20,
    }),
  ).toBeNull()
})
