import { ref, type Ref } from 'vue'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import { useEditorState } from './useEditorState'

export interface EditResult {
  content: string
  done: boolean
  error?: string
}

export interface SelectionInfo {
  text: string
  from: number
  to: number
}

export interface SearchReplaceBlock {
  search: string
  replace: string
}

export interface ChangeBlock {
  search: string
  replace: string
  position?: 'replace' | 'before' | 'after'
}

const pendingEdit: Ref<EditResult | null> = ref(null)
const isEditing = ref(false)

function parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = []
  const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ search: match[1], replace: match[2] })
  }
  return blocks
}

export function getModifiedDocument(original: string, aiResponse: string): string {
  const blocks = parseSearchReplaceBlocks(aiResponse)
  if (blocks.length === 0) {
    // No search/replace blocks, return the AI response as-is (full rewrite)
    return aiResponse
  }
  let doc = original
  for (const block of blocks) {
    const index = doc.indexOf(block.search)
    if (index !== -1) {
      doc = doc.slice(0, index) + block.replace + doc.slice(index + block.search.length)
    }
  }
  return doc
}

export function useAIEdit() {
  const { editorView } = useEditorState()

  function getCurrentDocument(): string {
    const view = editorView.value
    if (!view) return ''
    return view.state.doc.toString()
  }

  function getSelection(): SelectionInfo | null {
    const view = editorView.value
    if (!view) return null
    const sel = view.state.selection.main
    if (sel.empty) return null
    return {
      text: view.state.sliceDoc(sel.from, sel.to),
      from: sel.from,
      to: sel.to,
    }
  }

  function applyEdit(content: string, isSelectionEdit: boolean, from?: number, to?: number): boolean {
    const view = editorView.value
    if (!view) return false

    if (isSelectionEdit && from !== undefined && to !== undefined) {
      view.dispatch({
        changes: { from, to, insert: content },
        selection: { anchor: from + content.length },
      })
    } else {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: { anchor: content.length },
      })
    }
    pendingEdit.value = null
    return true
  }

  function applyChanges(changes: ChangeBlock[]): number {
    const view = editorView.value
    if (!view) return 0

    let doc = view.state.doc.toString()
    let applied = 0

    // Apply changes in reverse order by position to avoid index shifting
    const sorted = [...changes].map((c, i) => ({ ...c, originalIndex: i }))
    sorted.sort((a, b) => {
      const idxA = doc.indexOf(a.search)
      const idxB = doc.indexOf(b.search)
      if (idxB !== idxA) {
        return idxB - idxA
      }
      return b.originalIndex - a.originalIndex
    })

    for (const change of sorted) {
      const index = doc.indexOf(change.search)
      if (index === -1) continue

      const pos = change.position || 'replace'
      if (pos === 'before') {
        doc = doc.slice(0, index) + change.replace + doc.slice(index)
      } else if (pos === 'after') {
        doc = doc.slice(0, index + change.search.length) + change.replace + doc.slice(index + change.search.length)
      } else {
        doc = doc.slice(0, index) + change.replace + doc.slice(index + change.search.length)
      }
      applied++
    }

    if (applied === 0) return 0

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: doc.length },
    })
    return applied
  }

  function applySearchReplace(content: string): number {
    const view = editorView.value
    if (!view) return 0

    const blocks = parseSearchReplaceBlocks(content)
    if (blocks.length === 0) return 0

    const changes: ChangeBlock[] = blocks.map(b => ({ search: b.search, replace: b.replace, position: 'replace' }))
    return applyChanges(changes)
  }

  return {
    pendingEdit,
    isEditing,
    getCurrentDocument,
    getSelection,
    applyEdit,
    applySearchReplace,
    applyChanges,
    getModifiedDocument,
  }
}

