export interface PreviewFocusState {
  activeWithinPreview: boolean
  documentHasFocus: boolean
  frameElementHasFocus: boolean
}

interface PreviewFocusWindowLike {
  frameElement: Element | null
  parent: {
    document: {
      activeElement: Element | null
    }
  }
}

export function isPreviewFrameActiveInParentDocument(currentWindow: PreviewFocusWindowLike | Window = window): boolean {
  const frameElement = currentWindow.frameElement
  if (!frameElement) {
    return true
  }

  try {
    return currentWindow.parent.document.activeElement === frameElement
  } catch {
    return false
  }
}

export function shouldAutoFocusPreview(state: PreviewFocusState): boolean {
  return state.documentHasFocus && state.activeWithinPreview && state.frameElementHasFocus
}
