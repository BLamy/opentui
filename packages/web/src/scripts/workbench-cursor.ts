export interface WorkbenchEditorCursorLayout {
  contentX: number
  contentY: number
  gutterWidth: number
  cursorCol: number
  cursorRow: number
  editorScrollTop: number
  contentHeight: number
}

export interface WorkbenchTerminalCursorPosition {
  x: number
  y: number
}

export function getWorkbenchEditorCursorPosition(
  layout: WorkbenchEditorCursorLayout,
): WorkbenchTerminalCursorPosition | null {
  const cursorScreenRow = layout.cursorRow - layout.editorScrollTop
  if (cursorScreenRow < 0 || cursorScreenRow >= layout.contentHeight) {
    return null
  }

  return {
    // Terminal cursor positioning uses 1-based coordinates.
    x: layout.contentX + layout.gutterWidth + layout.cursorCol + 1,
    y: layout.contentY + cursorScreenRow + 1,
  }
}
