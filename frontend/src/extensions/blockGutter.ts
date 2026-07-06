import { gutter, GutterMarker, EditorView, ViewPlugin, type BlockInfo } from '@codemirror/view'
import { RangeSet, StateField, StateEffect, type Range, type RangeValue, type Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { BLOCK_NODE_NAMES } from '../utils/syntaxUtils'
import { t } from '../i18n'
import { createCommandRunner } from '../editor/commands/createCommandRunner'
import { insertBlockCommand } from '../editor/commands/block/InsertBlockCommand'
import { viewPosAtCoords, constrainRectToViewport } from '../editor/geometry'
import { getBlockRanges, findBlockAtPos, startDrag, isDragging, isInDragCooldown } from './dragSort'

// --- Plus button menu items (matches design in ui/desktop.pen, node zHLIh) ---

interface PlusMenuItem {
  id: string
  icon: string
  labelKey: string
  shortcut?: string
  shortcutFont?: 'mono' | 'sans'
  labelWeight?: number
  action: (view: EditorView, lineFrom: number) => void
}

interface PlusMenuGroup {
  items: PlusMenuItem[]
}

function lucideIcon(name: string): string {
  const paths: Record<string, string> = {
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    strikethrough: '<path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6"/><line x1="4" x2="20" y1="12" y2="12"/><path d="M15 12a3 3 0 1 1 0 8H8"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    'list-ordered': '<line x1="10" x2="20" y1="6" y2="6"/><line x1="10" x2="20" y1="12" y2="12"/><line x1="10" x2="20" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    'square-check': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
    'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`
}

function insertBlock(view: EditorView, lineFrom: number, prefix: string, example: string) {
  createCommandRunner(view).run(insertBlockCommand, { lineFrom, prefix, example })
}

const PLUS_MENU_GROUPS: PlusMenuGroup[] = [
  {
    items: [
      { id: 'bold', icon: 'bold', labelKey: 'editor.toolbar.Bold', shortcut: '⌘B', action: (v, lf) => insertBlock(v, lf, '**', t('editor.placeholder.bold')) },
      { id: 'italic', icon: 'italic', labelKey: 'editor.toolbar.Italic', shortcut: '⌘I', action: (v, lf) => insertBlock(v, lf, '*', t('editor.placeholder.italic')) },
      { id: 'strikethrough', icon: 'strikethrough', labelKey: 'editor.toolbar.Strikethrough', action: (v, lf) => insertBlock(v, lf, '~~', t('editor.placeholder.strikethrough')) },
    ],
  },
  {
    items: [
      { id: 'h1', icon: '', labelKey: 'blocks.h1.label', shortcut: '# ', shortcutFont: 'mono', labelWeight: 600, action: (v, lf) => insertBlock(v, lf, '# ', t('editor.placeholder.heading1')) },
      { id: 'h2', icon: '', labelKey: 'blocks.h2.label', shortcut: '## ', shortcutFont: 'mono', labelWeight: 600, action: (v, lf) => insertBlock(v, lf, '## ', t('editor.placeholder.heading2')) },
      { id: 'h3', icon: '', labelKey: 'blocks.h3.label', shortcut: '### ', shortcutFont: 'mono', labelWeight: 600, action: (v, lf) => insertBlock(v, lf, '### ', t('editor.placeholder.heading3')) },
      { id: 'h4', icon: '', labelKey: 'blocks.h4.label', shortcut: '#### ', shortcutFont: 'mono', labelWeight: 600, action: (v, lf) => insertBlock(v, lf, '#### ', t('editor.placeholder.heading4')) },
    ],
  },
  {
    items: [
      { id: 'ul', icon: 'list', labelKey: 'blocks.bulletList.label', action: (v, lf) => insertBlock(v, lf, '- ', t('editor.placeholder.listItem')) },
      { id: 'ol', icon: 'list-ordered', labelKey: 'blocks.orderedList.label', action: (v, lf) => insertBlock(v, lf, '1. ', t('editor.placeholder.listItem')) },
      { id: 'todo', icon: 'square-check', labelKey: 'blocks.todo.label', action: (v, lf) => insertBlock(v, lf, '- [ ] ', t('editor.placeholder.todo')) },
    ],
  },
  {
    items: [
      { id: 'code', icon: 'code', labelKey: 'blocks.codeBlock.label', action: (v, lf) => insertBlock(v, lf, '```text\n', t('editor.placeholder.code')) },
      { id: 'mermaid', icon: 'git-branch', labelKey: 'blocks.mermaid.label', action: (v, lf) => insertBlock(v, lf, '```mermaid\n', t('editor.placeholder.mermaid')) },
      { id: 'quote', icon: 'quote', labelKey: 'blocks.blockquote.label', action: (v, lf) => insertBlock(v, lf, '> ', t('editor.placeholder.quote')) },
      { id: 'link', icon: 'link', labelKey: 'editor.toolbar.Link', action: (v, lf) => insertBlock(v, lf, '[', `${t('editor.placeholder.link')}](${t('editor.placeholder.linkUrl')})`) },
      { id: 'image', icon: 'image', labelKey: 'editor.toolbar.Image', action: (v, lf) => { hideBlockMenu(); v.dom.dispatchEvent(new CustomEvent('editor:insert-image', { detail: { lineFrom: lf }, bubbles: true })) } },
      { id: 'table', icon: 'table', labelKey: 'editor.toolbar.Table', action: (v, lf) => insertBlock(v, lf, '', `| ${t('editor.placeholder.tableCol1')} | ${t('editor.placeholder.tableCol2')} |\n| --- | --- |\n| ${t('editor.placeholder.tableCell1')} | ${t('editor.placeholder.tableCell2')} |`) },
    ],
  },
]

class BlockControlsMarker extends GutterMarker {
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-block-controls'

    const plusBtn = document.createElement('button')
    plusBtn.className = 'cm-block-btn cm-block-plus'
    plusBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    plusBtn.title = t('editor.tooltip.addBlock')

    const dragBtn = document.createElement('button')
    dragBtn.className = 'cm-block-btn cm-block-drag'
    dragBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>'
    dragBtn.title = t('editor.tooltip.dragToReorder')

    wrap.appendChild(plusBtn)
    wrap.appendChild(dragBtn)
    return wrap
  }

  eq(_other: GutterMarker) { return true }
}

const blockControlsMarker = new BlockControlsMarker()

class ImageBlockControlsMarker extends GutterMarker {
  elementClass = 'cm-block-type-image'
  toDOM() {
    return new BlockControlsMarker().toDOM()
  }
  eq(_other: GutterMarker) { return true }
}

const imageBlockMarker = new ImageBlockControlsMarker()

function containsImage(nodeRef: { node: { firstChild: { name: string; firstChild: unknown; nextSibling: unknown } | null } }): boolean {
  const stack: { firstChild: unknown; nextSibling: unknown; name: string }[] = []
  let child = nodeRef.node.firstChild as { name: string; firstChild: unknown; nextSibling: unknown } | null
  while (child || stack.length) {
    if (!child) { child = stack.pop()!.nextSibling as typeof child; continue }
    if (child.name === 'Image') return true
    if (child.firstChild) { stack.push(child); child = child.firstChild as typeof child }
    else { child = child.nextSibling as typeof child }
  }
  return false
}

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
      const marker = containsImage(node) ? imageBlockMarker : blockControlsMarker
      ranges.push(marker.range(lineFrom))
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
      // Plus button: toggle block type menu (use mousedown so CodeMirror
      // re-render between mousedown and click doesn't detach the target)
      if (target.closest('.cm-block-plus')) {
        event.preventDefault()
        event.stopPropagation()
        if (activeMenu && activeMenuLineFrom === line.from) {
          hideBlockMenu()
        } else {
          const btn = target.closest('.cm-block-plus') as HTMLElement
          const rect = btn.getBoundingClientRect()
          showBlockMenu(view, line.from, rect)
        }
        return true
      }
      // Drag button
      if (target.closest('.cm-block-drag')) {
        const ev = event as MouseEvent
        ev.stopPropagation()
        ev.preventDefault()
        const blocks = getBlockRanges(view)
        const block = findBlockAtPos(blocks, line.from)
        if (!block) return false
        startDrag(view, block)
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
let wheelHandler: ((e: WheelEvent) => void) | null = null

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
  if (wheelHandler) {
    document.removeEventListener('wheel', wheelHandler, true)
    wheelHandler = null
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
    padding: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    width: '280px',
    visibility: 'hidden',
  })

  // Build menu content
  for (let gi = 0; gi < PLUS_MENU_GROUPS.length; gi++) {
    const group = PLUS_MENU_GROUPS[gi]

    // Add separator between groups
    if (gi > 0) {
      const sep = document.createElement('div')
      Object.assign(sep.style, {
        height: '1px',
        backgroundColor: 'var(--border-subtle)',
        margin: '4px 0',
      })
      menu.appendChild(sep)
    }

    for (const item of group.items) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        height: '32px',
        padding: '0 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        gap: '8px',
      })

      // Icon
      if (item.icon) {
        const iconWrap = document.createElement('span')
        iconWrap.innerHTML = lucideIcon(item.icon)
        Object.assign(iconWrap.style, {
          display: 'flex',
          alignItems: 'center',
          color: 'var(--foreground-secondary)',
          flexShrink: '0',
        })
        row.appendChild(iconWrap)
      }

      // Label
      const label = document.createElement('span')
      label.textContent = t(item.labelKey)
      Object.assign(label.style, {
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--foreground-primary)',
        fontWeight: String(item.labelWeight ?? 'normal'),
        flex: '1',
      })
      row.appendChild(label)

      // Shortcut / hint
      if (item.shortcut) {
        const hint = document.createElement('span')
        hint.textContent = item.shortcut
        Object.assign(hint.style, {
          fontSize: '12px',
          fontFamily: item.shortcutFont === 'mono' ? 'var(--font-mono)' : 'var(--font-sans)',
          color: 'var(--foreground-tertiary)',
          flexShrink: '0',
        })
        row.appendChild(hint)
      }

      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = 'var(--surface-hover)'
      })
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = ''
      })
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        item.action(view, lineFrom)
        hideBlockMenu()
      })
      menu.appendChild(row)
    }
  }

  // Position
  document.body.appendChild(menu)

  const menuRect = menu.getBoundingClientRect()
  const menuWidth = menuRect.width
  const menuHeight = menuRect.height

  let desiredLeft = anchorRect.right + 4
  const desiredTop = anchorRect.top

  if (desiredLeft + menuWidth > window.innerWidth) {
    desiredLeft = anchorRect.left - menuWidth - 4
  }

  const { left, top } = constrainRectToViewport(
    { left: desiredLeft, top: desiredTop, width: menuWidth, height: menuHeight },
    { left: 8, right: 8, top: 8, bottom: 8 },
  )

  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  menu.style.visibility = ''

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
      // 点击加号按钮由 gutter mousedown handler 负责 toggle，这里不关闭
      const target = e.target
      if (target instanceof Element && target.closest('.cm-block-plus')) return
      hideBlockMenu()
    }
  }
  setTimeout(() => {
    if (closeHandler) document.addEventListener('mousedown', closeHandler, true)
  }, 0)

  wheelHandler = () => {
    hideBlockMenu()
  }
  document.addEventListener('wheel', wheelHandler, true)
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

    const pos = viewPosAtCoords(view, { x: e.clientX, y: e.clientY })
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
