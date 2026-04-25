import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { toggleCheckbox } from '../utils/markdownUtils'
import { currentFilePathField, resolveImageUrl } from './currentFilePath'

// --- Widgets ---

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '\u2022'
    return span
  }
  ignoreEvent() { return false }
}

class NumberWidget extends WidgetType {
  constructor(readonly num: number) { super() }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-list-num'
    span.textContent = this.num + '.'
    return span
  }
  eq(other: NumberWidget) { return other.num === this.num }
  ignoreEvent() { return false }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super() }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-todo-check' + (this.checked ? ' done' : '')
    return span
  }
  eq(other: CheckboxWidget) { return other.checked === this.checked }
  ignoreEvent() { return false }
}

class CodeHeaderWidget extends WidgetType {
  constructor(readonly lang: string) { super() }
  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-code-header'
    const span = document.createElement('span')
    span.className = 'cm-code-lang'
    span.textContent = this.lang
    div.appendChild(span)
    return div
  }
  eq(other: CodeHeaderWidget) { return other.lang === this.lang }
  ignoreEvent() { return false }
}

class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    return hr
  }
  ignoreEvent() { return true }
}

class ImageWidget extends WidgetType {
  constructor(readonly url: string, readonly alt: string, readonly nodeFrom: number) { super() }

  toDOM() {
    const container = document.createElement('div')
    container.className = 'cm-image-container'
    container.dataset.pos = String(this.nodeFrom)

    if (this.url) {
      const img = document.createElement('img')
      img.className = 'cm-image'
      img.src = this.url
      img.alt = this.alt
      img.loading = 'lazy'
      img.onerror = () => {
        container.classList.add('cm-image-load-error')
      }
      container.appendChild(img)
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'cm-image-placeholder'
      placeholder.textContent = this.alt || 'Image'
      container.appendChild(placeholder)
    }

    if (this.alt && this.url) {
      const caption = document.createElement('div')
      caption.className = 'cm-image-caption'
      caption.textContent = this.alt
      container.appendChild(caption)
    }

    return container
  }

  eq(other: ImageWidget) { return other.url === this.url && other.alt === this.alt }
  ignoreEvent() { return false }
}

// --- Helpers ---

function extractAlt(text: string): string {
  const m = text.match(/^!\[([\s\S]*?)\]/)
  return m ? m[1] : ''
}

// --- Shared decorations ---

const lineDecs: Record<string, Decoration> = {}
function getLineDec(cls: string): Decoration {
  if (!lineDecs[cls]) lineDecs[cls] = Decoration.line({ class: cls })
  return lineDecs[cls]
}

const hide = Decoration.replace({})

const bulletDec = Decoration.widget({ widget: new BulletWidget() })

// --- Plugin ---

export const markdownStyles = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  atomics: DecorationSet

  constructor(view: EditorView) {
    const { deco, atomic } = build(view)
    this.decorations = deco
    this.atomics = atomic
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet) {
      const { deco, atomic } = build(u.view)
      this.decorations = deco
      this.atomics = atomic
    }
  }
}, {
  decorations: v => v.decorations,
  provide: plugin => EditorView.atomicRanges.of(view => {
    const instance = view.plugin(plugin)
    return instance ? instance.atomics : Decoration.none
  }),
})

function build(view: EditorView) {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc

  const ranges: Range<Decoration>[] = []
  const atomRanges: Range<Decoration>[] = []

  function addRange(from: number, to: number, dec: Decoration) {
    ranges.push(dec.range(from, to))
  }

  function addAtomic(from: number, to: number) {
    atomRanges.push(hide.range(from, to))
  }

  function addLine(pos: number, cls: string) {
    const lineStart = doc.lineAt(pos).from
    ranges.push(getLineDec(cls).range(lineStart))
  }

  // Count ordered list item index
  function itemIndex(listItemFrom: number): number {
    const cursor = tree.cursorAt(listItemFrom, 1)
    cursor.parent() // up to ListItem
    cursor.parent() // up to BulletList/OrderedList
    let idx = 0
    if (cursor.firstChild()) {
      do {
        idx++
        const child = cursor.node
        if (child.from >= listItemFrom) break
      } while (cursor.nextSibling())
    }
    return idx
  }

  const vpFrom = view.viewport.from
  const vpTo = view.viewport.to

  // Expand viewport to include any block whose start falls within the viewport
  // (block decorations apply from the node's start position)
  const vpStartLine = doc.lineAt(vpFrom)
  const vpEndLine = doc.lineAt(Math.min(vpTo, doc.length))

  // Pre-scan: find Image nodes containing the cursor (editing state)
  // Only strictly inside the node — cursor at boundaries shows the widget
  const cursorPos = view.state.selection.main.head
  const editingImageRanges: Array<{ from: number; to: number }> = []

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      enter(node) {
        if (node.name === 'Image' && cursorPos > node.from && cursorPos < node.to) {
          editingImageRanges.push({ from: node.from, to: node.to })
        }
      },
      from,
      to,
    })
  }

  function isInEditingImage(from: number, to: number): boolean {
    return editingImageRanges.some(r => from >= r.from && to <= r.to)
  }

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      enter(node) {
        const t = node.name

        // Skip nodes entirely after the visible range
        if (node.from > to) return
        // Skip nodes entirely before the visible range (except blocks that span into it)
        if (node.to < from) return

        // -- Block line decorations --
        // Only process block decorations if the node's start is within the expanded viewport
        const nodeVisible = node.from >= vpFrom && node.from < vpTo

        if (nodeVisible && /^ATXHeading\d$/.test(t)) {
          addLine(node.from, `cm-h${t.replace('ATXHeading', '')}`)
        }

        if (nodeVisible && t === 'Blockquote') {
          const s = doc.lineAt(node.from).number
          const e = doc.lineAt(Math.max(node.from, node.to - 1)).number
          for (let ln = s; ln <= e; ln++) {
            const lineFrom = doc.line(ln).from
            if (lineFrom >= vpStartLine.from && lineFrom <= vpEndLine.to) {
              addLine(lineFrom, 'cm-blockquote-line')
            }
          }
        }

        if (nodeVisible && t === 'FencedCode') {
          const s = doc.lineAt(node.from).number
          const e = doc.lineAt(Math.min(node.to, doc.length)).number
          for (let ln = s; ln <= e; ln++) {
            const lineFrom = doc.line(ln).from
            if (lineFrom >= vpStartLine.from && lineFrom <= vpEndLine.to) {
              addLine(lineFrom, 'cm-code-block')
              if (ln === s) {
                addLine(lineFrom, 'cm-code-first')
              } else if (ln === e) {
                addLine(lineFrom, 'cm-code-last')
              } else {
                addLine(lineFrom, 'cm-code-line')
              }
            }
          }
        }

        if (nodeVisible && t === 'ListItem') {
          addLine(node.from, 'cm-list-item')
        }

        // -- Mark hiding --
        // Inline marks are only relevant if they overlap the visible range

        if (t === 'HeaderMark') {
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
          addRange(node.from, end, hide)
          addAtomic(node.from, end)
        }

        if (t === 'QuoteMark') {
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
          addRange(node.from, end, hide)
          addAtomic(node.from, end)
        }

        if (t === 'ListMark') {
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
          addRange(node.from, end, hide)
          addAtomic(node.from, end)

          // Widget: bullet or number
          const parent = node.node.parent // ListItem
          const grandparent = parent?.parent // BulletList or OrderedList
          if (grandparent?.name === 'OrderedList') {
            const idx = itemIndex(node.from)
            ranges.push(Decoration.widget({ widget: new NumberWidget(idx), side: 1 }).range(node.from))
          } else {
            ranges.push(bulletDec.range(node.from))
          }
        }

        if (t === 'EmphasisMark' || t === 'StrikethroughMark' || t === 'CodeMark') {
          addRange(node.from, node.to, hide)
          addAtomic(node.from, node.to)
        }

        // -- Image handling --
        if (t === 'Image') {
          if (!isInEditingImage(node.from, node.to)) {
            const urlNode = node.node.getChild('URL')
            const rawUrl = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
            const alt = extractAlt(doc.sliceString(node.from, node.to))
            const filePath = view.state.field(currentFilePathField, false) ?? ''
            const resolvedUrl = resolveImageUrl(rawUrl, filePath)
            const lineFrom = doc.lineAt(node.from).from
            if (node.from === lineFrom) addLine(node.from, 'cm-image-line')
            addRange(node.from, node.to, Decoration.replace({ widget: new ImageWidget(resolvedUrl, alt, node.from) }))
            addAtomic(node.from, node.to)
          } else {
            addLine(node.from, 'cm-image-editing')
          }
          return
        }

        if ((t === 'LinkMark' || t === 'URL' || t === 'LinkTitle') && !isInEditingImage(node.from, node.to)) {
          addRange(node.from, node.to, hide)
          addAtomic(node.from, node.to)
        }

        if (t === 'TaskMarker') {
          const text = doc.sliceString(node.from, node.to)
          const checked = text.includes('x') || text.includes('X')
          addRange(node.from, node.to, Decoration.replace({ widget: new CheckboxWidget(checked) }))
          addAtomic(node.from, node.to)
        }

        if (t === 'CodeInfo') {
          addRange(node.from, node.to, hide)
          addAtomic(node.from, node.to)
        }

        // FencedCode: code header widget
        if (nodeVisible && t === 'FencedCode') {
          const startLine = doc.lineAt(node.from)
          const langNode = node.node.getChild('CodeInfo')
          const lang = langNode ? doc.sliceString(langNode.from, langNode.to) : 'text'
          ranges.push(Decoration.widget({ widget: new CodeHeaderWidget(lang), side: 1 }).range(startLine.from))
        }

        if (t === 'HorizontalRule') {
          addRange(node.from, node.to, Decoration.replace({ widget: new HrWidget() }))
          addAtomic(node.from, node.to)
        }
      },
      from,
      to,
    })
  }

  return {
    deco: Decoration.set(ranges, true),
    atomic: Decoration.set(atomRanges, true),
  }
}

export const checkboxClickHandler = EditorView.domEventHandlers({
  click(e, view) {
    const target = e.target as Element
    if (target.closest('.cm-todo-check')) {
      toggleCheckbox(view)
      return true
    }
    return false
  },
})

export const imageClickHandler = EditorView.domEventHandlers({
  click(e, view) {
    const target = e.target as Element
    const imgContainer = target.closest('.cm-image-container') as HTMLElement | null
    if (imgContainer) {
      const pos = parseInt(imgContainer.dataset.pos!)
      if (!isNaN(pos)) {
        const tree = syntaxTree(view.state)
        const doc = view.state.doc
        let url = ''
        let alt = ''
        let imgFrom = pos
        let imgTo = pos

        tree.iterate({
          enter(node) {
            if (node.name === 'Image' && node.from <= pos && node.to >= pos) {
              imgFrom = node.from
              imgTo = node.to
              const urlNode = node.node.getChild('URL')
              url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : ''
              const text = doc.sliceString(node.from, node.to)
              alt = extractAlt(text)
            }
          },
        })

        view.dom.dispatchEvent(new CustomEvent('editor:edit-image', {
          detail: { url, alt, from: imgFrom, to: imgTo },
          bubbles: true,
        }))
        return true
      }
    }
    return false
  },
})
