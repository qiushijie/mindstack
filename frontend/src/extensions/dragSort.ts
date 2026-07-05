import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { Range } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { BLOCK_NODE_NAMES } from '../utils/syntaxUtils'
import { createCommandRunner } from '../editor/commands/createCommandRunner'
import { moveBlockCommand } from '../editor/commands/drag/MoveBlockCommand'

class DropIndicatorWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-drop-indicator'
    return el
  }
  ignoreEvent() { return true }
}

const dropIndicatorDec = Decoration.widget({ widget: new DropIndicatorWidget(), side: 1, block: true })

export interface BlockRange {
  from: number
  to: number
  lineFrom: number
  lineTo: number
}

export function getBlockRanges(view: EditorView): BlockRange[] {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc
  const blocks: BlockRange[] = []
  const seen = new Set<number>()

  tree.iterate({
    enter(node) {
      if (!BLOCK_NODE_NAMES.has(node.name)) return
      const ln = doc.lineAt(node.from).number
      if (seen.has(ln)) return
      seen.add(ln)

      let endLine = doc.lineAt(Math.max(node.from, node.to - 1)).number
      if (endLine > doc.lines) endLine = doc.lines

      blocks.push({
        from: doc.line(ln).from,
        to: doc.line(endLine).to,
        lineFrom: ln,
        lineTo: endLine,
      })
    },
  })

  return blocks
}

export function findBlockAtPos(blocks: BlockRange[], pos: number): BlockRange | null {
  for (const b of blocks) {
    if (pos >= b.from && pos <= b.to) return b
  }
  return null
}

let dragging = false
export function isDragging() { return dragging }
let dragEndTime = 0
export function isInDragCooldown() { return Date.now() - dragEndTime < 300 }
let dragSourceBlock: BlockRange | null = null
let dragTargetLine = -1
let dragView: EditorView | null = null


export function startDrag(view: EditorView, block: BlockRange) {
  dragging = true
  dragSourceBlock = block
  dragTargetLine = -1
  dragView = view
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
  view.dispatch({})
}

export function simulateMouseMove(x: number, y: number) {
  const pos = dragView?.posAtCoords({ x, y })
  if (!dragging || !dragView) return

  let newTarget = -1
  if (pos != null) {
    const blocks = getBlockRanges(dragView)
    const target = findBlockAtPos(blocks, pos)
    if (target && target !== dragSourceBlock) {
      const doc = dragView.state.doc
      const lineStartRect = dragView.coordsAtPos(doc.line(target.lineFrom).from)
      const lineEndRect = dragView.coordsAtPos(doc.line(target.lineTo).to)
      if (lineStartRect && lineEndRect) {
        const lineMidY = (lineStartRect.top + lineEndRect.bottom) / 2
        newTarget = y < lineMidY ? target.lineFrom : target.lineTo + 1
      } else {
        const lineMid = doc.line(target.lineFrom).from + doc.line(target.lineFrom).length / 2
        newTarget = pos < lineMid ? target.lineFrom : target.lineTo + 1
      }
    }
  }

  if (newTarget !== dragTargetLine) {
    dragTargetLine = newTarget
    dragView.dispatch({})
  }
}

export function simulateMouseUp() {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  const shouldMove = dragging && dragView && dragSourceBlock && dragTargetLine >= 0
  const view = dragView
  const source = dragSourceBlock
  const target = dragTargetLine

  dragging = false
  dragEndTime = Date.now()
  if (view) {
    view.dom.classList.add('cm-drag-cooldown')
    setTimeout(() => view.dom.classList.remove('cm-drag-cooldown'), 300)
  }
  dragSourceBlock = null
  dragTargetLine = -1
  dragView = null

  if (shouldMove && view && source) {
    createCommandRunner(view).run(moveBlockCommand, {
      sourceLineFrom: source.lineFrom,
      sourceLineTo: source.lineTo,
      targetLine: target,
    })
  }
}

function onMouseMove(e: MouseEvent) {
  simulateMouseMove(e.clientX, e.clientY)
}

function onMouseUp(_e: MouseEvent) {
  simulateMouseUp()
}

const dragSortPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(_view: EditorView) {
    this.decorations = Decoration.none
  }

  update(update: ViewUpdate) {
    try {
      this.decorations = this.buildDeco(update.view)
    } catch {
      this.decorations = Decoration.none
    }
  }

  buildDeco(view: EditorView): DecorationSet {
    if (!dragging || !dragSourceBlock) {
      return Decoration.none
    }

    const ranges: Range<Decoration>[] = []
    const doc = view.state.doc

    // Dim source block lines
    const sourceDec = Decoration.line({ class: 'cm-drag-source' })
    for (let i = dragSourceBlock.lineFrom; i <= dragSourceBlock.lineTo && i <= doc.lines; i++) {
      ranges.push(sourceDec.range(doc.line(i).from))
    }

    // Blue indicator line at target position
    if (dragTargetLine >= 0) {
      const targetDec = Decoration.line({ class: 'cm-drag-target' })
      if (dragTargetLine > doc.lines) {
        // After last line
        ranges.push(dropIndicatorDec.range(doc.line(doc.lines).to))
      } else {
        // Before target line
        ranges.push(targetDec.range(doc.line(dragTargetLine).from))
      }
    }

    return Decoration.set(ranges, true)
  }
}, {
  decorations: v => v.decorations,
})

const dragEventHandler = EditorView.domEventHandlers({
  mousedown(e, view) {
    // blockGutter already handles gutter drag; avoid double-trigger
    if (e.defaultPrevented) return false
    const target = e.target as Element
    const dragBtn = target.closest('.cm-block-drag')
    if (!dragBtn) return false

    e.preventDefault()

    // Button is in gutter — map Y position to content area
    const gutterEl = dragBtn.closest('.cm-gutterElement')
    let pos: number | null = null
    if (gutterEl) {
      const rect = gutterEl.getBoundingClientRect()
      const contentRect = view.contentDOM.getBoundingClientRect()
      pos = view.posAtCoords({ x: contentRect.left + 10, y: rect.top + rect.height / 2 })
    }
    if (pos == null) return false

    const blocks = getBlockRanges(view)
    const block = findBlockAtPos(blocks, pos)
    if (!block) return false

    startDrag(view, block)
    return true
  },
})

export function createDragSort(): Extension[] {
  return [
    dragSortPlugin,
    dragEventHandler,
    ViewPlugin.fromClass(class {
      destroy() {
        if (dragging) {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          dragging = false
          dragSourceBlock = null
          dragTargetLine = -1
          dragView = null
        }
      }
    }),
  ]
}
