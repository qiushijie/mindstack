import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import type { TableData } from '../../../../utils/tableUtils'
import { addRowBelowCommand } from '../AddRowBelowCommand'
import { addRowAboveCommand } from '../AddRowAboveCommand'
import { deleteRowCommand } from '../DeleteRowCommand'
import { addColumnLeftCommand } from '../AddColumnLeftCommand'
import { addColumnRightCommand } from '../AddColumnRightCommand'
import { deleteColumnCommand } from '../DeleteColumnCommand'
import { editTableCellCommand } from '../EditTableCellCommand'

function createTableData(content: string): TableData {
  // Simple parser for test fixtures; assumes well-formed two-column table
  const lines = content.split('\n')
  const tableFrom = 0
  const tableTo = content.length
  const headers = lines[0].split('|').map(s => s.trim()).filter(Boolean).map(text => ({
    content: text,
    from: 0,
    to: 0,
  }))
  const rows = lines.slice(2).map(line =>
    line.split('|').map(s => s.trim()).filter(Boolean).map(text => ({
      content: text,
      from: 0,
      to: 0,
    })),
  )
  return {
    headers,
    rows,
    tableFrom,
    tableTo,
    colCount: headers.length,
  }
}

function createRunner(tableMarkdown: string) {
  const tableData = createTableData(tableMarkdown)
  const adapter = new MockEditorAdapter(tableMarkdown, { anchor: 0, head: 0 })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }), tableData }
}

describe('TableCommands', () => {
  const tableMarkdown = '| A | B |\n| --- | --- |\n| a | b |'

  it('addRowBelow inserts a row', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(addRowBelowCommand, { tableData, rowIdx: 0 })
    expect(adapter.getContent()).toContain('| A | B |')
    expect(adapter.getContent()).toContain('|   |   |')
    expect(adapter.getSelection().anchor).toBeGreaterThan(0)
  })

  it('addRowAbove inserts a row', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(addRowAboveCommand, { tableData, rowIdx: 0 })
    expect(adapter.getContent()).toContain('|   |   |')
    expect(adapter.getContent()).toContain('| a | b |')
    expect(adapter.getSelection().anchor).toBeGreaterThan(0)
  })

  it('deleteRow removes a row', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(deleteRowCommand, { tableData, rowIdx: 0 })
    expect(adapter.getContent()).not.toContain('| a | b |')
    expect(adapter.getContent()).toContain('| A | B |')
  })

  it('deleteRow returns false for invalid index', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    const result = runner.run(deleteRowCommand, { tableData, rowIdx: 99 })
    expect(result.success).toBe(false)
    expect(adapter.getContent()).toBe(tableMarkdown)
  })

  it('addColumnLeft inserts a column', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(addColumnLeftCommand, { tableData, rowIdx: 0, colIdx: 0 })
    expect(adapter.getContent()).toContain('|   | A | B |')
    expect(adapter.getContent()).toContain('|   | a | b |')
  })

  it('addColumnRight inserts a column', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(addColumnRightCommand, { tableData, rowIdx: 0, colIdx: 0 })
    expect(adapter.getContent()).toContain('| A |   | B |')
    expect(adapter.getContent()).toContain('| a |   | b |')
  })

  it('deleteColumn removes a column', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(deleteColumnCommand, { tableData, rowIdx: 0, colIdx: 0 })
    expect(adapter.getContent()).toContain('| B |')
    expect(adapter.getContent()).toContain('| b |')
    expect(adapter.getContent()).not.toContain('| A |')
  })

  it('deleteColumn returns false when only one column remains', () => {
    const singleCol = '| A |\n| --- |\n| a |'
    const { adapter, runner, tableData } = createRunner(singleCol)
    const result = runner.run(deleteColumnCommand, { tableData, rowIdx: 0, colIdx: 0 })
    expect(result.success).toBe(false)
    expect(adapter.getContent()).toBe(singleCol)
  })

  it('editTableCell updates an existing cell', () => {
    const content = '| A | B |\n| --- | --- |\n| a | b |'
    const adapter = new MockEditorAdapter(content, { anchor: 0, head: 0 })
    const runner = new CommandRunner({ adapter, semantics: new MockMarkdownSemanticService() })
    runner.run(editTableCellCommand, { type: 'cell', newText: 'x', cellFrom: 26, cellTo: 27 })
    expect(adapter.getContent()).toContain('| x | b |')
    expect(adapter.focusCount).toBe(1)
  })

  it('editTableCell does nothing when text is unchanged', () => {
    const content = '| A | B |\n| --- | --- |\n| a | b |'
    const adapter = new MockEditorAdapter(content, { anchor: 0, head: 0 })
    const runner = new CommandRunner({ adapter, semantics: new MockMarkdownSemanticService() })
    runner.run(editTableCellCommand, { type: 'cell', newText: 'a', cellFrom: 26, cellTo: 27 })
    expect(adapter.getContent()).toBe(content)
    expect(adapter.replaceRangeCalls.length).toBe(0)
    expect(adapter.focusCount).toBe(1)
  })

  it('addRowBelow with header row inserts row at top of body', () => {
    const { adapter, runner, tableData } = createRunner(tableMarkdown)
    runner.run(addRowBelowCommand, { tableData, rowIdx: -1 })
    expect(adapter.getContent()).toContain('| A | B |')
    expect(adapter.getContent()).toContain('| a | b |')
    expect(adapter.getContent().split('\n').length).toBe(4)
    expect(adapter.getSelection().anchor).toBeGreaterThan(0)
  })

  it('editTableCell rebuilds a padded row with missing columns', () => {
    const row = '| a |\n'
    const adapter = new MockEditorAdapter(row, { anchor: 0, head: 0 })
    const runner = new CommandRunner({ adapter, semantics: new MockMarkdownSemanticService() })
    runner.run(editTableCellCommand, { type: 'row', newText: 'x', rowFrom: 0, rowTo: row.length, colIdx: 0, totalCols: 2 })
    expect(adapter.getContent()).toBe('| x | |\n')
    expect(adapter.focusCount).toBe(1)
  })
})