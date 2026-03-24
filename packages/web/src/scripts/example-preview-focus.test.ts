import { expect, test } from "bun:test"

import { isPreviewFrameActiveInParentDocument, shouldAutoFocusPreview } from "./example-preview-focus"

test("does not autofocus when the iframe document is not focused", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: false,
      activeWithinPreview: true,
      frameElementHasFocus: true,
    }),
  ).toBe(false)
})

test("does not autofocus when focus is outside the preview surface", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: true,
      activeWithinPreview: false,
      frameElementHasFocus: true,
    }),
  ).toBe(false)
})

test("autofocuses when the preview surface owned focus before refresh", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: true,
      activeWithinPreview: true,
      frameElementHasFocus: true,
    }),
  ).toBe(true)
})

test("does not autofocus when the parent document focus has moved out of the iframe", () => {
  expect(
    shouldAutoFocusPreview({
      documentHasFocus: true,
      activeWithinPreview: true,
      frameElementHasFocus: false,
    }),
  ).toBe(false)
})

test("treats the preview frame as active when it is the parent document active element", () => {
  const frameElement = {}

  expect(
    isPreviewFrameActiveInParentDocument({
      frameElement: frameElement as Element,
      parent: {
        document: {
          activeElement: frameElement as Element,
        },
      },
    }),
  ).toBe(true)
})

test("treats the preview frame as inactive when the parent document focus moved elsewhere", () => {
  expect(
    isPreviewFrameActiveInParentDocument({
      frameElement: {} as Element,
      parent: {
        document: {
          activeElement: {} as Element,
        },
      },
    }),
  ).toBe(false)
})

test("allows autofocus for standalone previews without a parent iframe", () => {
  expect(
    isPreviewFrameActiveInParentDocument({
      frameElement: null,
      parent: {
        document: {
          activeElement: null,
        },
      },
    }),
  ).toBe(true)
})
