import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { insertImageCommand } from '../InsertImageCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('InsertImageCommand', () => {
  it('inserts a new image after the line', () => {
    const { adapter, runner } = createRunner('Hello', { anchor: 0 })
    runner.run(insertImageCommand, { url: 'https://example.com/img.png', alt: 'image', lineFrom: 0 })
    expect(adapter.getContent()).toBe('Hello\n\n![image](https://example.com/img.png)')
  })

  it('replaces existing image markdown in edit mode', () => {
    const { adapter, runner } = createRunner('![old](old-url)', { anchor: 0 })
    runner.run(insertImageCommand, { url: 'new-url', alt: 'new', editingFrom: 0, editingTo: 15 })
    expect(adapter.getContent()).toBe('![new](new-url)')
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('Hello', { anchor: 0 })
    runner.run(insertImageCommand, { url: 'u', alt: 'a', lineFrom: 0 })
    expect(adapter.focusCount).toBe(1)
  })
})
