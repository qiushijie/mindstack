import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { t } from '../i18n'

class PlaceholderWidget extends WidgetType {
  toDOM() {
    const wrapper = document.createElement('span')
    wrapper.style.display = 'inline-block'
    wrapper.style.width = '0'
    wrapper.style.overflow = 'visible'
    wrapper.style.position = 'relative'
    wrapper.style.verticalAlign = 'top'

    const text = document.createElement('span')
    text.className = 'cm-empty-line-placeholder'
    text.textContent = t('editor.placeholder.emptyLinePlaceholder')
    text.style.position = 'absolute'
    text.style.left = '3px'
    text.style.top = '0'
    text.style.whiteSpace = 'nowrap'

    wrapper.appendChild(text)
    return wrapper
  }

  ignoreEvent() { return true }
}

export const emptyLinePlaceholder = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.build(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.focusChanged) {
      this.decorations = this.build(update.view)
    }
  }

  build(view: EditorView): DecorationSet {
    if (!view.hasFocus) return Decoration.none

    const ranges = view.state.selection.ranges
    const decorations: ReturnType<ReturnType<typeof Decoration.widget>['range']>[] = []

    for (const range of ranges) {
      const pos = range.head
      const line = view.state.doc.lineAt(pos)

      // Skip non-empty lines
      if (line.text.trim() !== '') continue

      // Skip if slash menu is active (cursor after / at line start)
      const textBefore = line.text.slice(0, pos - line.from)
      if (textBefore.includes('/')) continue

      decorations.push(
        Decoration.widget({
          widget: new PlaceholderWidget(),
          side: -1,
        }).range(line.from),
      )
    }

    return decorations.length > 0 ? Decoration.set(decorations) : Decoration.none
  }
}, {
  decorations: v => v.decorations,
})
