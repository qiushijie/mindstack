import { describe, it, expect, afterEach } from 'vitest'
import { tablePlugin, TableWidget, tableCellEditPlugin } from '../tableWidget'
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
    const deco = view.state.field(tablePlugin).decorations

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
    const deco = view.state.field(tablePlugin).decorations

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
    const deco = view.state.field(tablePlugin).decorations

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
    const deco = view.state.field(tablePlugin).decorations

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
    const deco1 = view.state.field(tablePlugin).decorations
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

  it('no decoration when selection overlaps table range', () => {
    const view = createView(TABLE_DOC, [tablePlugin])

    // Dispatch a selection change to place cursor inside the table (position 5 is within first header cell)
    view.dispatch({ selection: { anchor: 5 } })

    const deco = view.state.field(tablePlugin).decorations
    let count = 0
    deco.between(0, TABLE_DOC.length, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('no decoration for non-table content', () => {
    const view = createView('Hello World', [tablePlugin])
    const deco = view.state.field(tablePlugin).decorations

    let count = 0
    deco.between(0, 11, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('decoration updates when table content changes', () => {
    const view = createView(TABLE_DOC, [tablePlugin])

    const deco1 = view.state.field(tablePlugin).decorations
    let widget1: TableWidget | null = null
    deco1.between(0, TABLE_DOC.length, (_from, _to, dec) => {
      if (dec.spec.widget instanceof TableWidget) widget1 = dec.spec.widget
    })

    // Modify the table (change "Rev" to "Revenue")
    const revIdx = TABLE_DOC.indexOf('Rev')
    view.dispatch({
      changes: { from: revIdx, to: revIdx + 3, insert: 'Revenue' },
    })

    const deco2 = view.state.field(tablePlugin).decorations
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

describe('tablePlugin selection behavior', () => {
  it('does not rebuild decorations when selection moves outside table', () => {
    const view = createView(TABLE_DOC, [tablePlugin])
    view.dispatch({ selection: { anchor: 0 } })

    const state1 = view.state.field(tablePlugin)
    const deco1 = state1.decorations
    let count1 = 0
    deco1.between(0, TABLE_DOC.length, () => { count1++ })
    expect(count1).toBe(1)

    view.dispatch({ selection: { anchor: TABLE_DOC.length } })

    const state2 = view.state.field(tablePlugin)
    const deco2 = state2.decorations
    let count2 = 0
    deco2.between(0, TABLE_DOC.length, () => { count2++ })
    expect(count2).toBe(1)
    expect(deco2).toBe(deco1)
    expect(state2).toBe(state1)
    view.destroy()
  })
})

describe('tableCellEditPlugin', () => {
  it('creates a floating input when start is called', () => {
    const view = createView(TABLE_DOC, [tablePlugin, tableCellEditPlugin])
    const controller = view.plugin(tableCellEditPlugin)!
    const cell = view.dom.querySelector('td') as HTMLElement
    expect(cell).not.toBeNull()

    controller.start(view, cell)

    const input = document.body.querySelector('.cm-table-cell-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    view.destroy()
  })

  it('commits the edit on Enter and removes the input', () => {
    const view = createView(TABLE_DOC, [tablePlugin, tableCellEditPlugin])
    const controller = view.plugin(tableCellEditPlugin)!
    const cell = view.dom.querySelector('td') as HTMLElement

    controller.start(view, cell)
    const input = document.body.querySelector('.cm-table-cell-input') as HTMLInputElement
    input.value = 'Updated'

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(document.body.querySelector('.cm-table-cell-input')).toBeNull()
    expect(view.state.doc.toString()).toContain('Updated')
    view.destroy()
  })

  it('does not duplicate commit when Enter is followed by blur', () => {
    const view = createView(TABLE_DOC, [tablePlugin, tableCellEditPlugin])
    const controller = view.plugin(tableCellEditPlugin)!
    const cell = view.dom.querySelector('td') as HTMLElement

    controller.start(view, cell)
    const input = document.body.querySelector('.cm-table-cell-input') as HTMLInputElement
    input.value = 'Once'

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    input.dispatchEvent(new FocusEvent('blur'))

    const content = view.state.doc.toString()
    const matches = content.split('Once').length - 1
    expect(matches).toBe(1)
    view.destroy()
  })
})
