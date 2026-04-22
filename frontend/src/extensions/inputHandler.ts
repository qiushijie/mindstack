import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { BlockType, getBlockTypeAtLine } from '../utils/syntaxUtils'

const markdownShortcuts: [RegExp, string][] = [
  [/^# $/, '# '],
  [/^## $/, '## '],
  [/^### $/, '### '],
  [/^#### $/, '#### '],
  [/^- $/, '- '],
  [/^\* $/, '- '],
  [/^\d+\. $/, '1. '],
  [/^> $/, '> '],
  [/^\[\] $/, '- [ ] '],
  [/^\[x] $/, '- [x] '],
]

export function handleMarkdownShortcut(view: EditorView): boolean {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  const textBefore = line.text

  for (const [pattern] of markdownShortcuts) {
    if (pattern.test(textBefore)) {
      return true // The text is already there, the decoration will handle visual
    }
  }
  return false
}

const inputHandler = EditorView.inputHandler.of((view, _from, _to, text) => {
  if (text === ' ') {
    return handleMarkdownShortcut(view)
  }
  return false
})

export function handleEnter(view: EditorView): boolean {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)

  // Inside a fenced code block, let CM6 default Enter behavior handle it (simple newline)
  if (getBlockTypeAtLine(view, line) === BlockType.FencedCode) return false

  const tree = syntaxTree(view.state)

  let blockType = ''
  let prefix = ''
  tree.iterate({
    enter(node) {
      if (node.from <= line.from && node.to >= line.from) {
        if (/^ATXHeading\d$/.test(node.name)) {
          blockType = 'heading'
        } else if (node.name === 'Blockquote') {
          blockType = 'blockquote'
          prefix = '> '
        } else if (node.name === 'ListItem') {
          const parent = node.node.parent
          if (parent?.name === 'OrderedList') {
            blockType = 'ordered_list'
            const match = line.text.match(/^\s*\d+\.\s/)
            if (match) {
              const num = parseInt(line.text.match(/\d+/)![0]) + 1
              const indent = line.text.match(/^\s*/)?.[0] ?? ''
              prefix = indent + num + '. '
            }
          } else if (line.text.match(/^\s*[-*+]\s\[[ x]\]\s/)) {
            blockType = 'todo'
            prefix = '- [ ] '
          } else {
            blockType = 'bullet_list'
            const bullet = line.text.match(/^\s*([-*+])\s/)?.[1] ?? '-'
            const indent = line.text.match(/^\s*/)?.[0] ?? ''
            prefix = indent + bullet + ' '
          }
        } else if (node.name === 'FencedCode') {
          blockType = 'code'
        }
      }
    },
  })

  // Empty block: if line has only marks/prefix, clear it
  const contentText = line.text.replace(/^(\s*#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+\.\s|\s*[-*+]\s\[[ x]\]\s)/, '')
  if (contentText.trim() === '' && blockType) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  // Insert new line with appropriate prefix
  const insertText = '\n' + prefix
  view.dispatch({
    changes: { from: pos, to: pos, insert: insertText },
    selection: { anchor: pos + insertText.length },
  })
  return true
}

export function handleBackspace(view: EditorView): boolean {
  const pos = view.state.selection.main.head
  if (pos === 0) return false

  const line = view.state.doc.lineAt(pos)

  // Only at line start
  if (pos !== line.from) return false

  const text = line.text

  // Remove heading prefix
  const headingMatch = text.match(/^(#{1,6})\s(.*)$/)
  if (headingMatch) {
    view.dispatch({
      changes: { from: line.from, to: line.from + headingMatch[1].length + 1, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  // Remove blockquote prefix
  const quoteMatch = text.match(/^>\s?(.*)$/)
  if (quoteMatch) {
    view.dispatch({
      changes: { from: line.from, to: line.from + (text.match(/^>\s?/)![0].length), insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  // Remove list prefix
  const listMatch = text.match(/^(\s*)([-*+]|\d+\.)\s(.*)$/)
  if (listMatch) {
    const prefixLen = listMatch[1].length + listMatch[2].length + 1
    view.dispatch({
      changes: { from: line.from, to: line.from + prefixLen, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  // Remove todo prefix
  const todoMatch = text.match(/^(\s*)[-*+]\s\[[ x]\]\s(.*)$/)
  if (todoMatch) {
    const prefixLen = text.match(/^(\s*)[-*+]\s\[[ x]\]\s/)![0].length
    view.dispatch({
      changes: { from: line.from, to: line.from + prefixLen, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  return false
}

export function handleTab(view: EditorView, shift: boolean): boolean {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)

  if (shift) {
    // Outdent
    if (line.text.startsWith('  ')) {
      view.dispatch({
        changes: { from: line.from, to: line.from + 2, insert: '' },
        selection: { anchor: Math.max(line.from, pos - 2) },
      })
      return true
    }
  } else {
    // Indent
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: '  ' },
      selection: { anchor: pos + 2 },
    })
    return true
  }
  return false
}

export function handleTripleClick(view: EditorView, event: MouseEvent): boolean {
  if (event.detail !== 3) return false

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos == null) return false

  const line = view.state.doc.lineAt(pos)
  view.dispatch({
    selection: { anchor: line.from, head: line.to },
  })
  return true
}

const tripleClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    return handleTripleClick(view, event)
  },
})

export function createInputHandler(): Extension {
  return [inputHandler, enterHandler, tripleClickHandler]
}

const enterHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      return handleEnter(view)
    }
    if (event.key === 'Backspace') {
      return handleBackspace(view)
    }
    if (event.key === 'Tab') {
      return handleTab(view, event.shiftKey)
    }
    return false
  },
})
