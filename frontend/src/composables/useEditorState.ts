import { shallowRef, watch } from 'vue'
import type { EditorView } from '@codemirror/view'

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
