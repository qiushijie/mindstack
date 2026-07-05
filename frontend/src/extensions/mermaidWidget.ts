import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { StateField, type EditorState, Range, type SelectionRange } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import mermaid from 'mermaid'
import { selectionIntersectsRange } from '../editor/widgets/widgetMode'
import { addWidgetClickHandler, addWidgetMouseDownHandler } from '../editor/widgets/widgetEvents'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
})

// --- Types ---

interface MermaidRange {
  from: number
  to: number
  content: string
}

// --- Helpers ---

function extractMermaidContent(doc: EditorState['doc'], from: number, to: number): string {
  const text = doc.sliceString(from, to)
  const lines = text.split('\n')
  if (lines.length <= 2) return ''
  return lines.slice(1, -1).join('\n')
}

function scanMermaidRanges(doc: EditorState['doc'], tree: ReturnType<typeof syntaxTree>): MermaidRange[] {
  const ranges: MermaidRange[] = []
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      const langNode = node.node.getChild('CodeInfo')
      const lang = langNode ? doc.sliceString(langNode.from, langNode.to) : ''
      if (lang !== 'mermaid') return
      const content = extractMermaidContent(doc, node.from, node.to)
      ranges.push({ from: node.from, to: node.to, content })
    },
  })
  return ranges
}

// --- Preview Widget ---

class MermaidPreviewWidget extends WidgetType {
  constructor(
    readonly content: string,
    readonly pos: number,
  ) { super() }

  private cleanup: (() => void) | null = null

  toDOM(view: EditorView) {
    const container = document.createElement('div')
    container.className = 'cm-mermaid-preview'
    container.dataset.pos = String(this.pos)
    container.setAttribute('contenteditable', 'false')

    // Header
    const header = document.createElement('div')
    header.className = 'cm-mermaid-preview-header'

    const badge = document.createElement('span')
    badge.className = 'cm-mermaid-badge'
    badge.textContent = 'mermaid'

    const editBtn = document.createElement('button')
    editBtn.className = 'cm-mermaid-edit-btn'
    editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg><span>Edit</span>'
    editBtn.title = 'Edit'

    header.appendChild(badge)
    header.appendChild(editBtn)
    container.appendChild(header)

    // Separator
    const sep = document.createElement('div')
    sep.className = 'cm-mermaid-sep'
    container.appendChild(sep)

    // Preview area
    const preview = document.createElement('div')
    preview.className = 'cm-mermaid-preview-area'

    const id = 'mermaid-' + Math.random().toString(36).slice(2, 10)
    mermaid.render(id, this.content).then(({ svg }) => {
      preview.innerHTML = svg
    }).catch((err: Error) => {
      preview.innerHTML = `<div class="cm-mermaid-error">${escapeHtml(err.message)}</div>`
    })

    container.appendChild(preview)

    // Click handler - move cursor into the block
    const handleClick = () => {
      const tree = syntaxTree(view.state)
      const pos = this.pos
      let codeFrom = pos
      tree.iterate({
        enter(node) {
          if (node.name === 'FencedCode' && node.from === pos) {
            codeFrom = node.from
          }
        },
      })

      const doc = view.state.doc
      const startLine = doc.lineAt(codeFrom)
      const nextLineNum = Math.min(startLine.number + 1, doc.lines)
      const nextLine = doc.line(nextLineNum)
      view.dispatch({
        selection: { anchor: nextLine.from },
      })
      view.focus()
    }

    this.cleanup = combineCleanups(
      addWidgetMouseDownHandler(container, () => {}),
      addWidgetMouseDownHandler(editBtn, () => {}),
      addWidgetClickHandler(editBtn, handleClick),
      addWidgetClickHandler(container, handleClick),
    )

    return container
  }

  eq(other: MermaidPreviewWidget) {
    return other.content === this.content && other.pos === this.pos
  }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
  }

  ignoreEvent() { return false }
}

function combineCleanups(...cleanups: Array<(() => void) | null | undefined>): (() => void) {
  return () => {
    cleanups.forEach(c => c?.())
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// --- StateField ---

interface MermaidPluginState {
  ranges: MermaidRange[]
  decorations: DecorationSet
}

function buildMermaidDecorations(state: EditorState, ranges: MermaidRange[]): DecorationSet {
  const sel = state.selection.main
  const decorations: Range<Decoration>[] = []

  for (const r of ranges) {
    if (selectionIntersectsRange(sel, r)) continue

    const widget = new MermaidPreviewWidget(r.content, r.from)
    const deco = Decoration.replace({ widget, block: true })
    decorations.push(deco.range(r.from, r.to))
  }

  return Decoration.set(decorations, true)
}

function buildMermaidState(state: EditorState): MermaidPluginState {
  const tree = syntaxTree(state)
  const ranges = scanMermaidRanges(state.doc, tree)
  return {
    ranges,
    decorations: buildMermaidDecorations(state, ranges),
  }
}

function mermaidSelectionOverlapChanged(
  ranges: MermaidRange[],
  oldSel: SelectionRange,
  newSel: SelectionRange,
): boolean {
  for (const r of ranges) {
    const oldOverlaps = selectionIntersectsRange(oldSel, r)
    const newOverlaps = selectionIntersectsRange(newSel, r)
    if (oldOverlaps !== newOverlaps) return true
  }
  return false
}

export const mermaidPlugin = StateField.define<MermaidPluginState>({
  create(state) {
    return buildMermaidState(state)
  },
  update(state, tr) {
    if (tr.docChanged) {
      return buildMermaidState(tr.state)
    }
    if (tr.selection) {
      if (!mermaidSelectionOverlapChanged(
        state.ranges,
        tr.startState.selection.main,
        tr.state.selection.main,
      )) {
        return state
      }
      return {
        ranges: state.ranges,
        decorations: buildMermaidDecorations(tr.state, state.ranges),
      }
    }
    return {
      ranges: state.ranges,
      decorations: state.decorations.map(tr.changes),
    }
  },
  provide: f => EditorView.decorations.from(f, v => v.decorations),
})

