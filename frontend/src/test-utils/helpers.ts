import { EditorView, ViewPlugin } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import type { Extension } from '@codemirror/state'

export function createView(doc: string, exts: Extension[] = []): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: GFM }), ...exts],
  })
  return new EditorView({ state, parent: document.body })
}

export function getVisibleText(
  view: EditorView,
  pluginRef: ViewPlugin<{ decorations: any }>,
): string {
  const plugin = view.plugin(pluginRef)
  if (!plugin) return view.state.doc.toString()

  const doc = view.state.doc.toString()
  const deco = plugin.decorations
  const hidden: { from: number; to: number }[] = []

  deco.between(0, doc.length, (from: number, to: number, dec: any) => {
    const spec = dec.spec
    if (from < to && spec.block !== true && spec.tagName === undefined) {
      hidden.push({ from, to })
    }
  })

  hidden.sort((a, b) => a.from - b.from)
  let result = ''
  let pos = 0
  for (const h of hidden) {
    if (h.from > pos) result += doc.slice(pos, h.from)
    pos = Math.max(pos, h.to)
  }
  if (pos < doc.length) result += doc.slice(pos)
  return result
}
