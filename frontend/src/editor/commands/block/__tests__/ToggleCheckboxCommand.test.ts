import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { toggleCheckboxCommand } from '../ToggleCheckboxCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('ToggleCheckboxCommand', () => {
  it('toggles unchecked to checked', () => {
    const { adapter, runner } = createRunner('- [ ] Task', { anchor: 5 })
    runner.run(toggleCheckboxCommand)
    expect(adapter.getContent()).toBe('- [x] Task')
    // Selection unchanged when only a single character is replaced
    expect(adapter.getSelection()).toEqual({ anchor: 5, head: 5 })
  })

  it('toggles checked to unchecked', () => {
    const { adapter, runner } = createRunner('- [x] Task', { anchor: 5 })
    runner.run(toggleCheckboxCommand)
    expect(adapter.getContent()).toBe('- [ ] Task')
    expect(adapter.getSelection()).toEqual({ anchor: 5, head: 5 })
  })

  it('returns false for non-task line', () => {
    const { adapter, runner } = createRunner('Just text', { anchor: 5 })
    const result = runner.run(toggleCheckboxCommand)
    expect(result.success).toBe(false)
    expect(adapter.getContent()).toBe('Just text')
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('- [ ] Task', { anchor: 5 })
    runner.run(toggleCheckboxCommand)
    expect(adapter.focusCount).toBe(1)
  })
})
