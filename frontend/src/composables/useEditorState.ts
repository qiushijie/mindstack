import { shallowRef, watch } from 'vue'
import { EditorView } from '@codemirror/view'
import type { EditorAdapter } from '../editor/EditorAdapter'

const sharedEditorView = shallowRef<EditorView | null>(null)
export const sharedEditorAdapter = shallowRef<EditorAdapter | null>(null)

export function provideEditorState() {
  if (import.meta.env.DEV) {
    watch(sharedEditorView, (v) => {
      ;(window as any).__cmView = v
    })
    watch(sharedEditorAdapter, (a) => {
      ;(window as any).__editor = a
    })
  }

  return { editorView: sharedEditorView, editorAdapter: sharedEditorAdapter }
}

export function useEditorState() {
  return { editorView: sharedEditorView, editorAdapter: sharedEditorAdapter }
}

export function scrollToLine(lineNumber: number) {
  const adapter = sharedEditorAdapter.value
  if (adapter) {
    adapter.scrollToLine(lineNumber)
    return
  }

  // Fallback until all callers are migrated to the adapter.
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
  sharedEditorAdapter.value?.focus() ?? sharedEditorView.value?.focus()
}
