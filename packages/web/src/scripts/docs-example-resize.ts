export interface DocExampleResizeOptions {
  codePaneMinWidth?: number
  defaultCodePaneRatio?: number
  previewPaneMinWidth?: number
  resizerSize?: number
}

interface DocExampleResizeBounds {
  maxCodePaneWidth: number
  minCodePaneWidth: number
}

export const DOC_EXAMPLE_DEFAULT_CODE_PANE_RATIO = 0.58
export const DOC_EXAMPLE_CODE_PANE_MIN_WIDTH = 320
export const DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH = 360
export const DOC_EXAMPLE_RESIZER_SIZE = 1
export const DOC_EXAMPLE_KEYBOARD_STEP = 24

function normalizeContainerWidth(containerWidth: number): number {
  return Number.isFinite(containerWidth) ? Math.max(containerWidth, 0) : 0
}

function resolveOptions(options: DocExampleResizeOptions = {}): Required<DocExampleResizeOptions> {
  return {
    codePaneMinWidth: options.codePaneMinWidth ?? DOC_EXAMPLE_CODE_PANE_MIN_WIDTH,
    defaultCodePaneRatio: options.defaultCodePaneRatio ?? DOC_EXAMPLE_DEFAULT_CODE_PANE_RATIO,
    previewPaneMinWidth: options.previewPaneMinWidth ?? DOC_EXAMPLE_PREVIEW_PANE_MIN_WIDTH,
    resizerSize: options.resizerSize ?? DOC_EXAMPLE_RESIZER_SIZE,
  }
}

export function getDocExampleResizeBounds(
  containerWidth: number,
  options: DocExampleResizeOptions = {},
): DocExampleResizeBounds {
  const normalizedContainerWidth = normalizeContainerWidth(containerWidth)
  const { codePaneMinWidth, previewPaneMinWidth, resizerSize } = resolveOptions(options)
  const minCodePaneWidth = Math.max(codePaneMinWidth, 0)
  const maxCodePaneWidth = Math.max(minCodePaneWidth, normalizedContainerWidth - previewPaneMinWidth - resizerSize)

  return { minCodePaneWidth, maxCodePaneWidth }
}

export function clampDocExampleCodePaneWidth(
  proposedWidth: number,
  containerWidth: number,
  options: DocExampleResizeOptions = {},
): number {
  const { minCodePaneWidth, maxCodePaneWidth } = getDocExampleResizeBounds(containerWidth, options)
  const normalizedWidth = Number.isFinite(proposedWidth) ? proposedWidth : minCodePaneWidth

  return Math.min(Math.max(normalizedWidth, minCodePaneWidth), maxCodePaneWidth)
}

export function getDefaultDocExampleCodePaneWidth(
  containerWidth: number,
  options: DocExampleResizeOptions = {},
): number {
  const normalizedContainerWidth = normalizeContainerWidth(containerWidth)
  const { defaultCodePaneRatio } = resolveOptions(options)

  return clampDocExampleCodePaneWidth(normalizedContainerWidth * defaultCodePaneRatio, normalizedContainerWidth, options)
}

export function getDocExampleResizeValueNow(
  codePaneWidth: number,
  containerWidth: number,
  options: DocExampleResizeOptions = {},
): number {
  const { minCodePaneWidth, maxCodePaneWidth } = getDocExampleResizeBounds(containerWidth, options)

  if (maxCodePaneWidth <= minCodePaneWidth) {
    return 50
  }

  const clampedWidth = clampDocExampleCodePaneWidth(codePaneWidth, containerWidth, options)

  return Math.round(((clampedWidth - minCodePaneWidth) / (maxCodePaneWidth - minCodePaneWidth)) * 100)
}
