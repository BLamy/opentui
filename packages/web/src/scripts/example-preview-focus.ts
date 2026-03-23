export interface PreviewFocusState {
  activeWithinPreview: boolean
  documentHasFocus: boolean
}

export function shouldAutoFocusPreview(state: PreviewFocusState): boolean {
  return state.documentHasFocus && state.activeWithinPreview
}
