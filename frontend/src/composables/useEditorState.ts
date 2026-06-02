import { shallowRef, watch } from 'vue'
import { EditorView } from '@codemirror/view'

const sharedEditorView = shallowRef<EditorView | null>(null)

export function provideEditorState() {
  if (import.meta.env.DEV) {
    watch(sharedEditorView, (v) => {
      ;(window as any).__cmView = v
    })
  }

  return { editorView: sharedEditorView }
}

export function useEditorState() {
  return { editorView: sharedEditorView }
}

export function scrollToLine(lineNumber: number) {
  const view = sharedEditorView.value
  if (!view) return

  try {
    const line = view.state.doc.line(lineNumber)
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
    })
  } catch {
    // ignore invalid line numbers
  }
}

export function focusEditor() {
  sharedEditorView.value?.focus()
}
