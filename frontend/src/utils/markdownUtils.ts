import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { BlockType, blockPrefixMap, getBlockTypeAtLine } from './syntaxUtils'

export function moveLines(
  text: string,
  sourceLineFrom: number,
  sourceLineTo: number,
  targetLine: number,
): string {
  const lines = text.split('\n')
  const count = sourceLineTo - sourceLineFrom + 1
  const moved = lines.splice(sourceLineFrom - 1, count)

  let insertIdx: number
  if (targetLine > sourceLineTo) {
    insertIdx = targetLine - 1 - count
  } else {
    insertIdx = targetLine - 1
  }
  insertIdx = Math.max(0, Math.min(insertIdx, lines.length))

  lines.splice(insertIdx, 0, ...moved)

  let result = lines.join('\n')
  if (!text.endsWith('\n') && result.endsWith('\n')) {
    result = result.replace(/\n+$/, '')
  }
  return result
}

export function wrapInline(before: string, after: string) {
  return (view: EditorView): boolean => {
    let { from, to } = view.state.selection.main
    // Trim newlines from selection so inline marks don't span lines
    while (from < to && view.state.sliceDoc(from, from + 1) === '\n') from++
    while (to > from && view.state.sliceDoc(to - 1, to) === '\n') to--
    const selected = view.state.sliceDoc(from, to)

    if (from === to) {
      view.dispatch({
        changes: { from, to, insert: before + after },
        selection: { anchor: from + before.length },
      })
      return true
    }

    const beforeText = view.state.sliceDoc(Math.max(0, from - before.length), from)
    const afterText = view.state.sliceDoc(to, to + after.length)

    if (beforeText === before && afterText === after) {
      const wordBefore = view.state.sliceDoc(Math.max(0, from - before.length - 1), from - before.length)
      const wordAfter = view.state.sliceDoc(to + after.length, to + after.length + 1)
      if (from >= before.length + 1 && /\w/.test(wordBefore) && to + after.length < view.state.doc.length && /\w/.test(wordAfter)) {
        view.dispatch({
          changes: { from: from - before.length, to: to + after.length, insert: selected },
          selection: { anchor: from - before.length, head: to - before.length },
        })
        return true
      }

      view.dispatch({
        changes: [
          { from: from - before.length, to: from, insert: '' },
          { from: to, to: to + after.length, insert: '' },
        ],
        selection: { anchor: from - before.length, head: to - before.length },
      })
      return true
    }

    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: to + before.length },
    })
    return true
  }
}

export function toggleBlockType(prefix: string) {
  return (view: EditorView): boolean => {
    const { head } = view.state.selection.main
    const line = view.state.doc.lineAt(head)
    const blockType = getBlockTypeAtLine(view, line)

    // Code blocks have multi-line prefixes that can't be toggled inline
    if (blockType === BlockType.FencedCode) return false

    const currentPrefix = blockPrefixMap[blockType] ?? ''

    if (currentPrefix) {
      // Has existing block prefix — replace or remove
      const newPrefix = currentPrefix === prefix ? '' : prefix
      view.dispatch({
        changes: { from: line.from, to: line.from + currentPrefix.length, insert: newPrefix },
        selection: newPrefix ? { anchor: line.from + newPrefix.length } : undefined,
      })
    } else {
      // Plain paragraph — insert prefix
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
        selection: { anchor: line.from + prefix.length },
      })
    }
    return true
  }
}

export function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const text = selected || 'link text'

  view.dispatch({
    changes: { from, to, insert: `[${text}](url)` },
    selection: selected
      ? { anchor: from + text.length + 3, head: from + text.length + 6 }
      : { anchor: from + 1, head: from + 1 + text.length },
  })
  return true
}

export function toggleCheckbox(view: EditorView): boolean {
  const { head } = view.state.selection.main
  const line = view.state.doc.lineAt(head)
  const match = line.text.match(/^[-*+]\s\[([ x])\]\s/)

  if (!match) return false

  const checked = match[1] === 'x'
  const bracketPos = line.text.indexOf('[')
  const newChar = checked ? ' ' : 'x'

  view.dispatch({
    changes: { from: line.from + bracketPos + 1, to: line.from + bracketPos + 2, insert: newChar },
  })
  return true
}
