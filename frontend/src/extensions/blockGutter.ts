import { gutter, GutterMarker, EditorView, ViewPlugin, type BlockInfo } from '@codemirror/view'
import { RangeSet, StateField, StateEffect, type Range, type RangeValue, type Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { BLOCK_NODE_NAMES } from '../utils/syntaxUtils'
import { getBlockRanges, findBlockAtPos, startDrag, isDragging, isInDragCooldown } from './dragSort'
import { SLASH_ITEMS, type SlashMenuItem } from './slashCommand'

class BlockControlsMarker extends GutterMarker {
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-block-controls'

    const plusBtn = document.createElement('button')
    plusBtn.className = 'cm-block-btn cm-block-plus'
    plusBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    plusBtn.title = 'Add block'

    const dragBtn = document.createElement('button')
    dragBtn.className = 'cm-block-btn cm-block-drag'
    dragBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>'
    dragBtn.title = 'Drag to reorder'

    wrap.appendChild(plusBtn)
    wrap.appendChild(dragBtn)
    return wrap
  }

  eq(_other: GutterMarker) { return true }
}

const blockControlsMarker = new BlockControlsMarker()

const activeBlockMarker = new (class extends GutterMarker {
  elementClass = 'cm-active-block'
  eq() { return false }
})()

export const setHoveredLine = StateEffect.define<number | null>()

const hoveredLineField = StateField.define<number | null>({
  create: () => null,
  update: (val, tr) => {
    for (const e of tr.effects) {
      if (e.is(setHoveredLine)) return e.value
    }
    return val
  },
})

function buildMarkers(view: EditorView): RangeSet<GutterMarker> {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc
  const ranges: Range<RangeValue>[] = []
  const seenLines = new Set<number>()

  const hoveredLine = view.state.field(hoveredLineField, false)

  tree.iterate({
    enter(node) {
      if (!BLOCK_NODE_NAMES.has(node.name)) return
      const lineNum = doc.lineAt(node.from).number
      if (seenLines.has(lineNum)) return
      seenLines.add(lineNum)
      const lineFrom = doc.line(lineNum).from
      ranges.push(blockControlsMarker.range(lineFrom))
      if (hoveredLine === lineNum) {
        ranges.push(activeBlockMarker.range(lineFrom))
      }
    },
  })

  return RangeSet.of(ranges, true) as RangeSet<GutterMarker>
}

const blockGutter = gutter({
  class: 'cm-block-gutter',
  markers: buildMarkers,
  renderEmptyElements: false,
  domEventHandlers: {
    mousedown(view, line, event) {
      const target = (event as MouseEvent).target as Element

      // Drag button
      if (target.closest('.cm-block-drag')) {
        const blocks = getBlockRanges(view)
        const block = findBlockAtPos(blocks, line.from)
        if (!block) return false
        startDrag(view, block)
        return true
      }

      return false
    },
    click(view, line, event) {
      const target = (event as MouseEvent).target as Element

      // Plus button: show block type menu
      if (target.closest('.cm-block-plus')) {
        const btn = target.closest('.cm-block-plus') as HTMLElement
        const rect = btn.getBoundingClientRect()
        showBlockMenu(view, line.from, rect)
        return true
      }

      return false
    },
  },
})

let activeMenu: HTMLDivElement | null = null
let activeMenuLineFrom = -1
let escHandler: ((e: KeyboardEvent) => void) | null = null
let closeHandler: ((e: MouseEvent) => void) | null = null

function hideBlockMenu() {
  if (closeHandler) {
    document.removeEventListener('mousedown', closeHandler, true)
    closeHandler = null
  }
  if (activeMenu) {
    activeMenu.remove()
    activeMenu = null
    activeMenuLineFrom = -1
  }
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, true)
    escHandler = null
  }
}

function showBlockMenu(view: EditorView, lineFrom: number, anchorRect: DOMRect) {
  hideBlockMenu()

  const menu = document.createElement('div')
  Object.assign(menu.style, {
    position: 'fixed' as const,
    left: `${anchorRect.right + 4}px`,
    top: `${anchorRect.top}px`,
    zIndex: '200',
    backgroundColor: 'var(--surface-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '4px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    minWidth: '220px',
    visibility: 'hidden',
  })

  document.body.appendChild(menu)

  const menuRect = menu.getBoundingClientRect()
  const menuWidth = menuRect.width
  const menuHeight = menuRect.height

  let left = anchorRect.right + 4
  let top = anchorRect.top

  if (left + menuWidth > window.innerWidth) {
    left = anchorRect.left - menuWidth - 4
  }
  if (top + menuHeight > window.innerHeight) {
    top = window.innerHeight - menuHeight - 8
  }
  if (top < 8) top = 8

  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  menu.style.visibility = ''

  document.body.removeChild(menu)

  for (const item of SLASH_ITEMS) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: '4px',
      cursor: 'pointer',
      gap: '12px',
    })

    const label = document.createElement('span')
    label.textContent = item.label
    Object.assign(label.style, {
      fontSize: 'var(--font-size-md)',
      color: 'var(--foreground-primary)',
      fontWeight: '500',
    })

    const desc = document.createElement('span')
    desc.textContent = item.description
    Object.assign(desc.style, {
      fontSize: 'var(--font-size-xs)',
      color: 'var(--foreground-tertiary)',
    })

    row.appendChild(label)
    row.appendChild(desc)

    row.addEventListener('mouseenter', () => {
      row.style.backgroundColor = 'var(--surface-hover)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.backgroundColor = ''
    })
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertBlockBelow(view, lineFrom, item)
      hideBlockMenu()
    })
    menu.appendChild(row)
  }

  document.body.appendChild(menu)
  activeMenu = menu
  activeMenuLineFrom = lineFrom

  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideBlockMenu()
    }
  }
  document.addEventListener('keydown', escHandler, true)

  closeHandler = (e: MouseEvent) => {
    if (activeMenu && !activeMenu.contains(e.target as Node)) {
      hideBlockMenu()
    }
  }
  setTimeout(() => {
    if (closeHandler) document.addEventListener('mousedown', closeHandler, true)
  }, 0)
}

function insertBlockBelow(view: EditorView, lineFrom: number, item: SlashMenuItem) {
  const doc = view.state.doc
  const line = doc.lineAt(lineFrom)
  const insertPos = line.to
  const prefixPart = '\n\n' + item.prefix
  const insertText = prefixPart + item.example
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: insertText },
    selection: { anchor: prefixPart.length + insertPos, head: insertText.length + insertPos },
  })
  view.focus()
}

let lastHovered = -1

function setupHoverTracker(view: EditorView): () => void {
  let lastDispatch = 0

  const handler = (e: MouseEvent) => {
    if (isDragging()) return
    if (isInDragCooldown()) {
      if (lastHovered >= 0) {
        lastHovered = -1
        view.dispatch({ effects: setHoveredLine.of(null) })
      }
      return
    }
    const now = Date.now()
    if (now - lastDispatch < 200) return
    lastDispatch = now

    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) {
      if (lastHovered >= 0) {
        lastHovered = -1
        view.dispatch({ effects: setHoveredLine.of(null) })
      }
      return
    }
    const lineNum = view.state.doc.lineAt(pos).number
    if (lineNum !== lastHovered) {
      lastHovered = lineNum
      view.dispatch({ effects: setHoveredLine.of(lineNum) })
    }
  }
  const leaveHandler = () => {
    if (lastHovered >= 0) {
      lastHovered = -1
      view.dispatch({ effects: setHoveredLine.of(null) })
    }
  }
  view.scrollDOM.addEventListener('mousemove', handler)
  view.scrollDOM.addEventListener('mouseleave', leaveHandler)

  return () => {
    view.scrollDOM.removeEventListener('mousemove', handler)
    view.scrollDOM.removeEventListener('mouseleave', leaveHandler)
  }
}

export function createBlockGutter(): Extension[] {
  return [
    hoveredLineField,
    blockGutter,
    ViewPlugin.fromClass(class {
      private cleanup: (() => void) | null = null

      constructor(view: EditorView) {
        this.cleanup = setupHoverTracker(view)
      }

      destroy() {
        this.cleanup?.()
        this.cleanup = null
        hideBlockMenu()
      }
    }),
  ]
}
