import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { Range } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { BLOCK_NODE_NAMES } from '../utils/syntaxUtils'
import { moveLines } from '../utils/markdownUtils'

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
    if (pos >= b.from && pos <= b.to + 1) return b
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
      const lineMid = doc.line(target.lineFrom).from + doc.line(target.lineFrom).length / 2
      newTarget = pos < lineMid ? target.lineFrom : target.lineTo + 1
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
    const doc = view.state.doc
    const oldText = doc.toString()
    const newText = moveLines(oldText, source.lineFrom, source.lineTo, target)

    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')

    // Find first different line
    let firstDiff = 0
    while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) firstDiff++

    // Find last different line (from end)
    let lastDiffOld = oldLines.length - 1
    let lastDiffNew = newLines.length - 1
    while (lastDiffOld >= 0 && lastDiffNew >= 0 && lastDiffOld > firstDiff && lastDiffNew > firstDiff && oldLines[lastDiffOld] === newLines[lastDiffNew]) {
      lastDiffOld--
      lastDiffNew--
    }

    if (firstDiff <= lastDiffOld || firstDiff <= lastDiffNew) {
      // Compute from position (start of first changed line)
      let fromPos = 0
      for (let i = 0; i < firstDiff; i++) fromPos += oldLines[i].length + 1

      // Compute to position (end of last old changed line)
      let toPos = fromPos
      for (let i = firstDiff; i <= lastDiffOld; i++) {
        toPos += oldLines[i].length
        if (i < lastDiffOld) toPos++
      }

      const insertText = newLines.slice(firstDiff, lastDiffNew + 1).join('\n')

      // Compute anchor: cursor at start of moved block in new text
      const count = source.lineTo - source.lineFrom + 1
      let newBlockLine: number
      if (target > source.lineTo) {
        newBlockLine = target - count
      } else {
        newBlockLine = target - 1
      }
      newBlockLine = Math.max(0, Math.min(newBlockLine, newLines.length - 1))

      let anchor = 0
      for (let i = 0; i < newBlockLine; i++) {
        anchor += newLines[i].length + 1
      }

      view.dispatch({
        changes: { from: fromPos, to: toPos, insert: insertText },
        selection: { anchor },
      })
    }
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
