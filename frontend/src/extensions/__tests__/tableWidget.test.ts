import { describe, it, expect, afterEach } from 'vitest'
import { tablePlugin, TableWidget } from '../tableWidget'
import { createView } from '../../test-utils/helpers'
import { syntaxTree } from '@codemirror/language'

afterEach(() => {
  document.body.innerHTML = ''
})

const TABLE_DOC = `| Name | Value |
|------|-------|
| Rev | 128 |
| Users | 3421 |`

describe('tablePlugin - core rendering chain', () => {
  it('GFM parser detects Table node', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    const tree = syntaxTree(view.state)

    let foundTable = false
    tree.iterate({
      enter(node) {
        if (node.name === 'Table') foundTable = true
      },
    })
    expect(foundTable).toBe(true)
    view.destroy()
  })

  it('StateField produces decoration that covers the table range', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    const deco = view.state.field(tablePlugin)

    // Check if any decoration covers the table range
    let foundDeco = false
    deco.between(0, TABLE_DOC.length, (from, to) => {
      if (from <= 0 && to >= TABLE_DOC.length) foundDeco = true
    })
    expect(foundDeco).toBe(true)
    view.destroy()
  })

  it('decoration contains a TableWidget with correct headers and rows', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    const deco = view.state.field(tablePlugin)

    let widget: TableWidget | null = null
    deco.between(0, TABLE_DOC.length, (from, to, dec) => {
      const spec = dec.spec
      if (spec.widget && spec.widget instanceof TableWidget) {
        widget = spec.widget
      }
    })

    expect(widget).not.toBeNull()
    expect(widget!.headers).toEqual(['Name', 'Value'])
    expect(widget!.rows).toEqual([['Rev', '128'], ['Users', '3421']])
    view.destroy()
  })

  it('TableWidget.toDOM produces a table element with correct content', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    const deco = view.state.field(tablePlugin)

    let widget: TableWidget | null = null
    deco.between(0, TABLE_DOC.length, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget = dec.spec.widget
    })
    expect(widget).not.toBeNull()

    const dom = widget!.toDOM()
    expect(dom.tagName).toBe('TABLE')

    const ths = dom.querySelectorAll('th')
    expect(ths.length).toBe(2)
    expect(ths[0].textContent).toBe('Name')
    expect(ths[1].textContent).toBe('Value')

    const tds = dom.querySelectorAll('td')
    expect(tds.length).toBe(4) // 2 rows x 2 cols
    expect(tds[0].textContent).toBe('Rev')
    expect(tds[1].textContent).toBe('128')
    expect(tds[2].textContent).toBe('Users')
    expect(tds[3].textContent).toBe('3421')
    view.destroy()
  })

  it('cell positions are stored in dataset attributes', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    const deco = view.state.field(tablePlugin)

    let widget: TableWidget | null = null
    deco.between(0, TABLE_DOC.length, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget = dec.spec.widget
    })
    expect(widget).not.toBeNull()

    const dom = widget!.toDOM()
    const firstTh = dom.querySelector('th')!
    expect(firstTh.dataset.from).toBeDefined()
    expect(firstTh.dataset.to).toBeDefined()
    expect(Number(firstTh.dataset.from)).toBeGreaterThanOrEqual(0)
    view.destroy()
  })

  it('widget eq returns false when table content changes', () => {
    const view = createView(TABLE_DOC, [tablePlugin])

    // Get original widget
    const deco1 = view.state.field(tablePlugin)
    let widget1: TableWidget | null = null
    deco1.between(0, TABLE_DOC.length, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget1 = dec.spec.widget
    })
    expect(widget1).not.toBeNull()

    // Widget should equal itself
    expect(widget1!.eq(widget1!)).toBe(true)

    // Different widget
    const other = new TableWidget(['X'], [['1']], [], [], 0)
    expect(widget1!.eq(other)).toBe(false)
    view.destroy()
  })

  it('no decoration for non-table content', () => {
    const view = createView('Hello World', [tablePlugin])
    const deco = view.state.field(tablePlugin)

    let count = 0
    deco.between(0, 11, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('decoration updates when table content changes', () => {
    const view = createView(TABLE_DOC, [tablePlugin])

    const deco1 = view.state.field(tablePlugin)
    let widget1: TableWidget | null = null
    deco1.between(0, TABLE_DOC.length, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget1 = dec.spec.widget
    })

    // Modify the table (change "Rev" to "Revenue")
    const revIdx = TABLE_DOC.indexOf('Rev')
    view.dispatch({
      changes: { from: revIdx, to: revIdx + 3, insert: 'Revenue' },
    })

    const deco2 = view.state.field(tablePlugin)
    let widget2: TableWidget | null = null
    deco2.between(0, 100, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget2 = dec.spec.widget
    })
    expect(widget2).not.toBeNull()
    expect(widget2!.rows[0][0]).toBe('Revenue')
    view.destroy()
  })
})

describe('TableWidget', () => {
  it('ignoreEvent returns false to allow click events', () => {
    const widget = new TableWidget(['A'], [['1']], [], [], 0)
    expect(widget.ignoreEvent()).toBe(false)
  })
})
