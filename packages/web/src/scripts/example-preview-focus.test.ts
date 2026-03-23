import { expect, test } from "bun:test"

import { shouldAutoFocusPreview } from "./example-preview-focus"

test("does not autofocus when the iframe document is not focused", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: false,
      activeWithinPreview: true,
    }),
  ).toBe(false)
})

test("does not autofocus when focus is outside the preview surface", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: true,
      activeWithinPreview: false,
    }),
  ).toBe(false)
})

test("autofocuses when the preview surface owned focus before refresh", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: true,
      activeWithinPreview: true,
    }),
  ).toBe(true)
})
