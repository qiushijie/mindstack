import { inject, provide, shallowRef, type ShallowRef } from 'vue'
import type { EditorView } from '@codemirror/view'

const EDITOR_VIEW_KEY = Symbol('editorView')

export function provideEditorState() {
  const editorView = shallowRef<EditorView | null>(null)
  provide(EDITOR_VIEW_KEY, editorView)
  return { editorView }
}

export function useEditorState() {
  const editorView = inject<ShallowRef<EditorView | null>>(EDITOR_VIEW_KEY)
  if (!editorView) {
    throw new Error('EditorView not provided. Call provideEditorState() in parent component.')
  }
  return { editorView }
}
