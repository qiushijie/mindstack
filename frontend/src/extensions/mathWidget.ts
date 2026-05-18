import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { StateField, type EditorState, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// --- Widget ---

export class MathWidget extends WidgetType {
  constructor(
    readonly content: string,
    readonly isBlock: boolean,
    readonly pos: number,
  ) { super() }

  toDOM(view: EditorView) {
    const container = document.createElement(this.isBlock ? 'div' : 'span')
    container.className = this.isBlock ? 'cm-math-block' : 'cm-math-inline'
    container.dataset.pos = String(this.pos)
    container.setAttribute('contenteditable', 'false')

    try {
      const html = katex.renderToString(this.content, {
        throwOnError: true,
        displayMode: this.isBlock,
      })
      container.innerHTML = html
    } catch (err) {
      console.error('[MathWidget] KaTeX render error:', err, 'content:', this.content)
      container.textContent = this.content
      container.classList.add('cm-math-error')
    }

    container.addEventListener('click', (e) => {
      e.stopPropagation()
      view.dispatch({
        selection: { anchor: this.pos + (this.isBlock ? 2 : 1) },
      })
      view.focus()
    })

    return container
  }

  eq(other: MathWidget) {
    return other.content === this.content && other.isBlock === this.isBlock && other.pos === this.pos
  }

  ignoreEvent() { return false }
}

// --- Math range detection ---

interface MathRange {
  from: number
  to: number
  content: string
  isBlock: boolean
}

const CODE_NODE_NAMES = new Set(['FencedCode', 'InlineCode', 'CodeBlock'])

function collectCodeRanges(state: EditorState): Array<{ from: number; to: number }> {
  const codeRanges: Array<{ from: number; to: number }> = []
  syntaxTree(state).iterate({
    enter(node) {
      if (CODE_NODE_NAMES.has(node.name)) {
        codeRanges.push({ from: node.from, to: node.to })
      }
    },
  })
  return codeRanges
}

function isInCode(codeRanges: Array<{ from: number; to: number }>, pos: number): boolean {
  for (const r of codeRanges) {
    if (pos >= r.from && pos < r.to) return true
  }
  return false
}

export function scanMathRanges(state: EditorState): MathRange[] {
  const codeRanges = collectCodeRanges(state)
  const doc = state.doc
  const text = doc.toString()
  const ranges: MathRange[] = []
  let i = 0

  while (i < text.length) {
    if (text[i] === '$' && !isInCode(codeRanges, i)) {
      if (text[i + 1] === '$') {
        // Block math: $$ ... $$
        const start = i
        i += 2
        let found = false
        while (i < text.length - 1) {
          if (text[i] === '$' && text[i + 1] === '$' && !isInCode(codeRanges, i)) {
            const end = i + 2
            ranges.push({
              from: start,
              to: end,
              content: text.slice(start + 2, end - 2).trim(),
              isBlock: true,
            })
            i = end - 1
            found = true
            break
          }
          i++
        }
        if (!found) break
      } else if (text[i + 1] !== ' ') {
        // Inline math: $...$ (start $ not followed by space)
        const start = i
        i++
        let found = false
        while (i < text.length) {
          if (text[i] === '$' && text[i - 1] !== ' ' && !isInCode(codeRanges, i)) {
            // End $ not preceded by space
            ranges.push({
              from: start,
              to: i + 1,
              content: text.slice(start + 1, i),
              isBlock: false,
            })
            found = true
            break
          }
          i++
        }
        if (!found) break
      }
    }
    i++
  }

  return ranges
}

// --- StateField for decorations ---

function computeMathDecorations(state: EditorState): DecorationSet {
  const ranges = scanMathRanges(state)
  const sel = state.selection.main
  const decorations: Range<Decoration>[] = []

  for (const r of ranges) {
    // Skip widgets for ranges that overlap with the current selection
    if (sel.from < r.to && sel.to > r.from) continue

    const widget = new MathWidget(r.content, r.isBlock, r.from)
    const deco = Decoration.replace({
      widget,
      block: r.isBlock,
    })
    decorations.push(deco.range(r.from, r.to))
  }

  return Decoration.set(decorations, true)
}

export const mathPlugin = StateField.define<DecorationSet>({
  create(state) {
    return computeMathDecorations(state)
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) {
      return computeMathDecorations(tr.state)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f, v => v),
})

// --- Click handler: focus into the math source for editing ---

export const mathEditHandler = EditorView.domEventHandlers({
  click(e, view) {
    const target = e.target as HTMLElement
    const mathEl = target.closest('.cm-math-inline, .cm-math-block') as HTMLElement | null
    if (!mathEl) return false

    const pos = parseInt(mathEl.dataset.pos!)
    if (isNaN(pos)) return false

    const isBlock = mathEl.classList.contains('cm-math-block')
    view.dispatch({
      selection: { anchor: pos + (isBlock ? 2 : 1) },
    })
    view.focus()
    return true
  },
})
