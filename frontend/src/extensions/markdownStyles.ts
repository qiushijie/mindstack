import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { currentFilePathField, resolveImageUrl } from './currentFilePath'
import { createCommandRunner } from '../editor/commands/createCommandRunner'
import { toggleCheckboxCommand } from '../editor/commands/block/ToggleCheckboxCommand'
import { changeCodeLanguageCommand } from '../editor/commands/block/ChangeCodeLanguageCommand'
import { selectionIntersectsRange } from '../editor/widgets/widgetMode'
import { addWidgetClickHandler, addWidgetMouseDownHandler } from '../editor/widgets/widgetEvents'
import { trackDocumentListener } from '../editor/widgets/widgetCleanup'
import type { CleanupHandle } from '../editor/widgets/widgetCleanup'

// --- Widgets ---

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '•'
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

const CODE_LANGUAGES = [
  'text', 'javascript', 'typescript', 'python', 'go', 'rust',
  'java', 'c', 'cpp', 'csharp', 'sql', 'json', 'yaml', 'toml',
  'xml', 'html', 'css', 'scss', 'bash', 'shell', 'powershell',
  'markdown', 'dockerfile', 'vim', 'lua', 'ruby', 'php', 'swift',
  'kotlin', 'dart', 'elixir', 'haskell', 'r', 'matlab',
]

function changeLanguage(view: EditorView, nodeFrom: number, newLang: string) {
  createCommandRunner(view).run(changeCodeLanguageCommand, { nodeFrom, newLang })
}

class CodeHeaderWidget extends WidgetType {
  constructor(readonly lang: string, readonly nodeFrom: number) { super() }

  private cleanup: (() => void) | null = null

  toDOM(view: EditorView) {
    const div = document.createElement('div')
    div.className = 'cm-code-header'

    const span = document.createElement('span')
    span.className = 'cm-code-lang'
    span.textContent = this.lang
    span.style.cursor = 'pointer'
    span.style.userSelect = 'none'

    let dropdown: HTMLDivElement | null = null
    let docListener: CleanupHandle | null = null

    const closeDropdown = () => {
      if (dropdown) {
        dropdown.remove()
        dropdown = null
      }
      if (docListener) {
        docListener.dispose()
        docListener = null
      }
    }

    const onDocClick = (e: MouseEvent) => {
      if (!dropdown) return
      if (!dropdown.contains(e.target as Node)) {
        closeDropdown()
      }
    }

    const openDropdown = () => {
      if (dropdown) {
        closeDropdown()
        return
      }

      const dd = document.createElement('div')
      dd.className = 'cm-code-lang-dropdown'
      dropdown = dd

      CODE_LANGUAGES.forEach(lang => {
        const item = document.createElement('div')
        item.className = 'cm-code-lang-item'
        item.textContent = lang
        if (lang === this.lang) item.classList.add('active')
        item.addEventListener('mousedown', (ev) => {
          ev.stopPropagation()
        })
        item.addEventListener('click', (ev) => {
          ev.stopPropagation()
          changeLanguage(view, this.nodeFrom, lang)
          closeDropdown()
        })
        dd.appendChild(item)
      })

      div.appendChild(dd)
      docListener = trackDocumentListener('mousedown', onDocClick as EventListener)
    }

    this.cleanup = combineCleanups(
      closeDropdown,
      addWidgetMouseDownHandler(span, () => {}),
      addWidgetClickHandler(span, openDropdown),
    )

    div.appendChild(span)
    return div
  }

  eq(other: CodeHeaderWidget) {
    return other.lang === this.lang && other.nodeFrom === this.nodeFrom
  }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
  }

  ignoreEvent() { return false }
}

class MermaidEditHeaderWidget extends WidgetType {
  constructor(readonly pos: number) { super() }

  private cleanup: (() => void) | null = null

  toDOM(view: EditorView) {
    const div = document.createElement('div')
    div.className = 'cm-mermaid-edit-header'
    div.dataset.pos = String(this.pos)

    const badge = document.createElement('span')
    badge.className = 'cm-mermaid-badge'
    badge.textContent = 'mermaid'

    const previewBtn = document.createElement('button')
    previewBtn.className = 'cm-mermaid-preview-btn'
    previewBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span>Preview</span>'
    previewBtn.title = 'Preview'

    div.appendChild(badge)
    div.appendChild(previewBtn)

    const handlePreviewClick = () => {
      const tree = syntaxTree(view.state)
      const pos = this.pos
      let blockEnd = pos
      tree.iterate({
        enter(node) {
          if (node.name === 'FencedCode' && node.from === pos) {
            blockEnd = node.to
          }
        },
      })
      view.dispatch({
        selection: { anchor: Math.min(blockEnd + 1, view.state.doc.length) },
      })
      view.focus()
    }

    this.cleanup = combineCleanups(
      addWidgetMouseDownHandler(div, () => {}),
      addWidgetMouseDownHandler(previewBtn, () => {}),
      addWidgetClickHandler(previewBtn, handlePreviewClick),
    )

    return div
  }

  eq(other: MermaidEditHeaderWidget) { return other.pos === this.pos }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
  }

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

  private cleanup: (() => void) | null = null

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
        console.warn('[ImageWidget] Failed to load image:', this.url)
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

    // Prevent CodeMirror from moving the text cursor into the hidden source
    // when the user presses the preview widget. The actual edit action is
    // handled by imageClickHandler on the editor view.
    this.cleanup = addWidgetMouseDownHandler(container, () => {})

    return container
  }

  eq(other: ImageWidget) { return other.url === this.url && other.alt === this.alt && other.nodeFrom === this.nodeFrom }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
  }

  ignoreEvent() { return false }
}

// --- Helpers ---

function extractAlt(text: string): string {
  const m = text.match(/^!\[([\s\S]*?)\]/)
  return m ? m[1] : ''
}

function combineCleanups(...cleanups: Array<(() => void) | null | undefined>): (() => void) {
  return () => {
    cleanups.forEach(c => c?.())
  }
}

// --- Shared decorations ---

const lineDecs: Record<string, Decoration> = {}
function getLineDec(cls: string): Decoration {
  if (!lineDecs[cls]) lineDecs[cls] = Decoration.line({ class: cls })
  return lineDecs[cls]
}

const hide = Decoration.replace({})

const bulletDec = Decoration.widget({ widget: new BulletWidget() })

function getViewportLines(doc: typeof EditorView.prototype.state.doc, vpFrom: number, vpTo: number) {
  const vpStartLine = doc.lineAt(vpFrom)
  const vpEndLine = doc.lineAt(Math.min(vpTo, doc.length))
  return { vpStartLine, vpEndLine }
}

// --- Static layer: only depends on doc/viewport ---

export const markdownStaticStyles = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  atomics: DecorationSet

  constructor(view: EditorView) {
    const { deco, atomic } = buildStatic(view)
    this.decorations = deco
    this.atomics = atomic
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged) {
      const { deco, atomic } = buildStatic(u.view)
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

function buildStatic(view: EditorView) {
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
  const { vpStartLine, vpEndLine } = getViewportLines(doc, vpFrom, vpTo)

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      enter(node) {
        const t = node.name

        if (node.from > to) return
        if (node.to < from) return

        const nodeVisible = node.from >= vpFrom && node.from < vpTo
        const nodeOverlapsVp = node.from < vpTo && node.to > vpFrom

        if (nodeVisible && /^ATXHeading\d$/.test(t)) {
          addLine(node.from, `cm-h${t.replace('ATXHeading', '')}`)
        }

        if (nodeOverlapsVp && t === 'Blockquote') {
          const s = doc.lineAt(node.from).number
          const e = doc.lineAt(Math.max(node.from, node.to - 1)).number
          for (let ln = s; ln <= e; ln++) {
            const lineFrom = doc.line(ln).from
            if (lineFrom >= vpStartLine.from && lineFrom <= vpEndLine.to) {
              addLine(lineFrom, 'cm-blockquote-line')
            }
          }
        }

        if (nodeOverlapsVp && t === 'FencedCode') {
          const langNode = node.node.getChild('CodeInfo')
          const lang = langNode ? doc.sliceString(langNode.from, langNode.to) : 'text'
          const isMermaid = lang === 'mermaid'

          // Mermaid preview styling is handled by the selection-sensitive layer.
          // Here we only style regular code blocks.
          if (!isMermaid) {
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
        }

        if (nodeVisible && t === 'ListItem') {
          addLine(node.from, 'cm-list-item')
        }

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

        // Read the language directly from the document line so the header stays
        // in sync even when the syntax tree has not finished re-parsing.
        if (nodeVisible && t === 'FencedCode') {
          const startLine = doc.lineAt(node.from)
          const lineText = doc.sliceString(startLine.from, startLine.to)
          const match = lineText.match(/^(`{3,})\s*(\S*)/)
          const lang = match?.[2] || 'text'
          if (lang !== 'mermaid') {
            ranges.push(Decoration.widget({ widget: new CodeHeaderWidget(lang, node.from), side: 1 }).range(startLine.from))
          }
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

// --- Selection-sensitive layer ---

export const markdownSelectionStyles = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  atomics: DecorationSet

  constructor(view: EditorView) {
    const { deco, atomic } = buildSelection(view)
    this.decorations = deco
    this.atomics = atomic
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet) {
      const { deco, atomic } = buildSelection(u.view)
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

function buildSelection(view: EditorView) {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc
  const selection = view.state.selection.main

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

  const vpFrom = view.viewport.from
  const vpTo = view.viewport.to
  const { vpStartLine, vpEndLine } = getViewportLines(doc, vpFrom, vpTo)

  const editingImageRanges: Array<{ from: number; to: number }> = []

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      enter(node) {
        if (node.name === 'Image' && selectionIntersectsRange(selection, node)) {
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

        if (node.from > to) return
        if (node.to < from) return

        const nodeVisible = node.from >= vpFrom && node.from < vpTo
        const nodeOverlapsVp = node.from < vpTo && node.to > vpFrom

        if (t === 'Image') {
          const isEditing = selectionIntersectsRange(selection, node)
          if (!isEditing) {
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

        if (nodeOverlapsVp && t === 'FencedCode') {
          const langNode = node.node.getChild('CodeInfo')
          const lang = langNode ? doc.sliceString(langNode.from, langNode.to) : 'text'
          const isMermaid = lang === 'mermaid'
          if (isMermaid) {
            const isEditing = selectionIntersectsRange(selection, node)
            if (isEditing) {
              const s = doc.lineAt(node.from).number
              const e = doc.lineAt(Math.min(node.to, doc.length)).number
              for (let ln = s; ln <= e; ln++) {
                const lineFrom = doc.line(ln).from
                if (lineFrom >= vpStartLine.from && lineFrom <= vpEndLine.to) {
                  addLine(lineFrom, 'cm-mermaid-block')
                  if (ln === s) {
                    addLine(lineFrom, 'cm-mermaid-first')
                  } else if (ln === e) {
                    addLine(lineFrom, 'cm-mermaid-last')
                  } else {
                    addLine(lineFrom, 'cm-mermaid-line')
                  }
                }
              }
            }
          }
        }

        if (nodeVisible && t === 'FencedCode') {
          const startLine = doc.lineAt(node.from)
          const langNode = node.node.getChild('CodeInfo')
          const lang = langNode ? doc.sliceString(langNode.from, langNode.to) : 'text'
          const isMermaid = lang === 'mermaid'
          if (isMermaid && selectionIntersectsRange(selection, node)) {
            ranges.push(Decoration.widget({ widget: new MermaidEditHeaderWidget(node.from), side: 1 }).range(startLine.from))
          }
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

// --- Convenience export: both layers ---

export const markdownStyles = [markdownStaticStyles, markdownSelectionStyles]

// --- Event handlers ---

export const checkboxClickHandler = EditorView.domEventHandlers({
  click(e, view) {
    const target = e.target as Element
    if (target.closest('.cm-todo-check')) {
      createCommandRunner(view).run(toggleCheckboxCommand)
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

        view.dispatch({
          selection: { anchor: Math.min(imgFrom + 2, imgTo) },
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
