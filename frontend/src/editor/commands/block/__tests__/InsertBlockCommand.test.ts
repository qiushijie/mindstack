import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { insertBlockCommand } from '../InsertBlockCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('InsertBlockCommand', () => {
  it('inserts a new block after the line', () => {
    const { adapter, runner } = createRunner('Hello', { anchor: 0 })
    runner.run(insertBlockCommand, { lineFrom: 0, prefix: '# ', example: 'Heading' })
    expect(adapter.getContent()).toBe('Hello\n\n# Heading')
  })

  it('selects the example text', () => {
    const { adapter, runner } = createRunner('Hello', { anchor: 0 })
    runner.run(insertBlockCommand, { lineFrom: 0, prefix: '# ', example: 'Heading' })
    // prefixPart = '\n\n# ' length 4, insertText = '\n\n# Heading' length 12
    expect(adapter.getSelection()).toEqual({ anchor: 9, head: 16 })
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('Hello', { anchor: 0 })
    runner.run(insertBlockCommand, { lineFrom: 0, prefix: '# ', example: 'Heading' })
    expect(adapter.focusCount).toBe(1)
  })
})
