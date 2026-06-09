import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { StateEffect } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { BLOCK_REGISTRY, type BlockConfig } from '../utils/blockRegistry'
import { t } from '../i18n'

// StateEffect to track the currently selected index in the slash menu
const setSelectedIndex = StateEffect.define<number>({})
/** Extract initials from each word in the label (e.g. "Code Block" -> "cb") */
function getInitials(label: string): string {
  return label.split(/\s+/).map(w => w[0]).join('').toLowerCase()
}

type MatchKind = 'prefix' | 'abbreviation' | 'contains' | 'none'

function getMatchKind(item: SlashMenuItem, filter: string): MatchKind {
  const f = filter.toLowerCase()
  const label = item.label.toLowerCase()
  const desc = item.description.toLowerCase()
  if (label.startsWith(f)) return 'prefix'
  if (getInitials(item.label).startsWith(f)) return 'abbreviation'
  if (label.includes(f) || desc.includes(f)) return 'contains'
  return 'none'
}

function matchScore(kind: MatchKind): number {
  switch (kind) {
    case 'prefix': return 0
    case 'abbreviation': return 1
    case 'contains': return 2
    case 'none': return 3
  }
}

export interface SlashMenuItem {
  key: string
  label: string
  description: string
  prefix: string
  example: string
}

export const SLASH_ITEMS: SlashMenuItem[] = BLOCK_REGISTRY.map(
  ({ key, label, description, prefix, example }) => ({ key, label, description, prefix, example }),
)

function getTranslatedItem(item: SlashMenuItem): SlashMenuItem {
  return {
    ...item,
    label: t(`blocks.${item.key}.label`),
    description: t(`blocks.${item.key}.desc`),
    example: t(`blocks.${item.key}.example`),
  }
}

class SlashMenuWidget extends WidgetType {
  constructor(
    readonly items: SlashMenuItem[],
    readonly filter: string,
    readonly slashFrom: number,
    readonly selectedIndex: number,
  ) { super() }

  toDOM(view: EditorView) {
    const container = document.createElement('div')
    container.className = 'cm-slash-menu'

    const filtered = getFilteredItems(this.filter)

    const clampedIndex = filtered.length > 0
      ? Math.max(0, Math.min(this.selectedIndex, filtered.length - 1))
      : -1

    for (let i = 0; i < filtered.length; i++) {
      const item = getTranslatedItem(filtered[i])
      const row = document.createElement('div')
      row.className = 'cm-slash-item'
      if (i === clampedIndex) {
        row.classList.add('cm-slash-active')
      }
      row.innerHTML = `<span class="cm-slash-label">${item.label}</span><span class="cm-slash-desc">${item.description}</span>`
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        applyItem(view, filtered[i], this.slashFrom)
      })
      container.appendChild(row)
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'cm-slash-empty'
      empty.textContent = t('slash.noResults')
      container.appendChild(empty)
    }

    return container
  }

  ignoreEvent() { return false }
}

export const slashCommand = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  selectedIndex: number
  activeSlashFrom: number
  dismissed: boolean

  constructor(view: EditorView) {
    this.selectedIndex = 0
    this.activeSlashFrom = -1
    this.dismissed = false
    this.decorations = this.build(view)
  }

  update(update: ViewUpdate) {
    // Check for setSelectedIndex effect
    for (const effect of update.transactions.flatMap(t => t.effects)) {
      if (effect.is(setSelectedIndex)) {
        this.selectedIndex = effect.value
      }
    }

    if (update.docChanged || update.selectionSet) {
      this.dismissed = false
      // Reset selected index when filter text changes
      if (update.docChanged) {
        this.selectedIndex = 0
      }
      this.decorations = this.build(update.view)
    } else if (update.transactions.some(t => t.effects.some(e => e.is(setSelectedIndex)))) {
      this.decorations = this.build(update.view)
    }
  }

  private setMenuActive(view: EditorView, active: boolean) {
    view.dom.classList.toggle('cm-slash-menu-active', active)
  }

  build(view: EditorView): DecorationSet {
    if (this.dismissed) {
      this.activeSlashFrom = -1
      this.setMenuActive(view, false)
      return Decoration.none
    }

    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)

    // Check if cursor is after a /
    const textBefore = line.text.slice(0, pos - line.from)
    const slashIndex = textBefore.lastIndexOf('/')

    if (slashIndex === -1) {
      this.activeSlashFrom = -1
      this.setMenuActive(view, false)
      return Decoration.none
    }

    // Only trigger at line start (after optional whitespace)
    const beforeSlash = textBefore.slice(0, slashIndex)
    if (beforeSlash.trim() !== '') {
      this.activeSlashFrom = -1
      this.setMenuActive(view, false)
      return Decoration.none
    }

    this.activeSlashFrom = line.from + slashIndex
    const filter = textBefore.slice(slashIndex + 1)
    const widget = Decoration.widget({
      widget: new SlashMenuWidget(SLASH_ITEMS, filter, line.from + slashIndex, this.selectedIndex),
      side: 1,
    })

    this.setMenuActive(view, true)
    return Decoration.set([widget.range(pos)])
  }
}, {
  decorations: v => v.decorations,
})

function getFilteredItems(filter: string): SlashMenuItem[] {
  return filter
    ? SLASH_ITEMS
        .map(i => ({ item: i, kind: getMatchKind(i, filter) }))
        .filter(({ kind }) => kind !== 'none')
        .sort((a, b) => matchScore(a.kind) - matchScore(b.kind))
        .map(({ item }) => item)
    : SLASH_ITEMS
}

function applyItem(view: EditorView, item: SlashMenuItem, slashFrom: number) {
  const line = view.state.doc.lineAt(slashFrom)
  const slashOffset = slashFrom - line.from
  const before = line.text.slice(0, slashOffset) // leading whitespace before /
  const prefixLen = item.prefix.length
  const translated = getTranslatedItem(item)
  const insertText = before + item.prefix + translated.example
  const cursorPos = line.from + before.length + prefixLen
  view.dispatch({
    changes: { from: line.from, to: line.from + line.text.length, insert: insertText },
    selection: { anchor: cursorPos, head: cursorPos },
  })
  view.focus()
  const plugin = view.plugin(slashCommand)
  if (plugin) plugin.activeSlashFrom = -1
}

function removeSlashText(view: EditorView, plugin: { activeSlashFrom: number }) {
  const pos = view.state.selection.main.head
  view.dispatch({
    changes: { from: plugin.activeSlashFrom, to: pos, insert: '' },
    selection: { anchor: plugin.activeSlashFrom },
  })
}

const slashDismissHandler = EditorView.domEventHandlers({
  blur(event, view) {
    const plugin = view.plugin(slashCommand)
    if (!plugin || plugin.activeSlashFrom === -1) return false
    removeSlashText(view, plugin)
    return false
  },
  keydown(event, view) {
    const plugin = view.plugin(slashCommand)
    if (!plugin || plugin.activeSlashFrom === -1) return false

    if (event.key === 'Escape') {
      plugin.dismissed = true
      removeSlashText(view, plugin)
      return true
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      const pos = view.state.selection.main.head
      const line = view.state.doc.lineAt(pos)
      const textBefore = line.text.slice(0, pos - line.from)
      const slashIndex = textBefore.lastIndexOf('/')
      if (slashIndex === -1) return false

      const filter = textBefore.slice(slashIndex + 1)
      const filtered = getFilteredItems(filter)

      if (filtered.length === 0) return true

      const currentIndex = plugin.selectedIndex
      const clampedIndex = Math.max(0, Math.min(currentIndex, filtered.length - 1))

      if (event.key === 'ArrowDown') {
        const nextIndex = (clampedIndex + 1) % filtered.length
        view.dispatch({ effects: setSelectedIndex.of(nextIndex) })
        return true
      }

      if (event.key === 'ArrowUp') {
        const prevIndex = (clampedIndex - 1 + filtered.length) % filtered.length
        view.dispatch({ effects: setSelectedIndex.of(prevIndex) })
        return true
      }

      if (event.key === 'Enter') {
        applyItem(view, filtered[clampedIndex], plugin.activeSlashFrom)
        return true
      }
    }

    return false
  },
})

export function createSlashCommand(): Extension {
  return [slashCommand, slashDismissHandler]
}
