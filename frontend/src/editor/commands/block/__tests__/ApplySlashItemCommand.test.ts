import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { applySlashItemCommand } from '../ApplySlashItemCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('ApplySlashItemCommand', () => {
  it('replaces slash line with heading block', () => {
    const { adapter, runner } = createRunner('/', { anchor: 1 })
    runner.run(applySlashItemCommand, { slashFrom: 0, prefix: '# ', example: 'Heading 1' })
    expect(adapter.getContent()).toBe('# Heading 1')
    expect(adapter.getSelection()).toEqual({ anchor: 2, head: 2 })
  })

  it('preserves leading whitespace before slash', () => {
    const { adapter, runner } = createRunner('  /', { anchor: 3 })
    runner.run(applySlashItemCommand, { slashFrom: 2, prefix: '- ', example: 'List item' })
    expect(adapter.getContent()).toBe('  - List item')
    expect(adapter.getSelection()).toEqual({ anchor: 4, head: 4 })
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('/', { anchor: 1 })
    runner.run(applySlashItemCommand, { slashFrom: 0, prefix: '# ', example: 'Heading 1' })
    expect(adapter.focusCount).toBe(1)
  })
})
