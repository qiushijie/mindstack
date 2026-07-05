import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { moveBlockCommand } from '../MoveBlockCommand'

function createRunner(content: string) {
  const adapter = new MockEditorAdapter(content, { anchor: 0, head: 0 })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('MoveBlockCommand', () => {
  it('moves a block down past another', () => {
    const { adapter, runner } = createRunner('# Heading\n\nParagraph\n\n- List')
    runner.run(moveBlockCommand, { sourceLineFrom: 1, sourceLineTo: 1, targetLine: 4 })
    expect(adapter.getContent()).toBe('\nParagraph\n# Heading\n\n- List')
    expect(adapter.getSelection()).toEqual({ anchor: 11, head: 11 })
    expect(adapter.focusCount).toBe(1)
  })

  it('moves a block up before another', () => {
    const { adapter, runner } = createRunner('# Heading\n\nParagraph\n\n- List')
    runner.run(moveBlockCommand, { sourceLineFrom: 3, sourceLineTo: 3, targetLine: 1 })
    expect(adapter.getContent()).toBe('Paragraph\n# Heading\n\n\n- List')
    expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
    expect(adapter.focusCount).toBe(1)
  })

  it('places the cursor at the start of the moved block when moving down', () => {
    const { adapter, runner } = createRunner('# A\n\n# B')
    runner.run(moveBlockCommand, { sourceLineFrom: 1, sourceLineTo: 1, targetLine: 3 })
    expect(adapter.getContent()).toBe('\n# A\n# B')
    expect(adapter.getSelection()).toEqual({ anchor: 1, head: 1 })
  })

  it('places the cursor at the start of the moved block when moving up', () => {
    const { adapter, runner } = createRunner('# Heading\n\nParagraph\n\n- List')
    runner.run(moveBlockCommand, { sourceLineFrom: 3, sourceLineTo: 3, targetLine: 1 })
    expect(adapter.getContent()).toBe('Paragraph\n# Heading\n\n\n- List')
    expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
  })

  it('no-op when target equals source', () => {
    const content = '# Heading\n\nParagraph'
    const { adapter, runner } = createRunner(content)
    runner.run(moveBlockCommand, { sourceLineFrom: 1, sourceLineTo: 1, targetLine: 1 })
    expect(adapter.getContent()).toBe(content)
    expect(adapter.focusCount).toBe(1)
  })
})
