import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { insertLinkCommand } from '../InsertLinkCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('InsertLinkCommand', () => {
  it('wraps selected text as link', () => {
    const { adapter, runner } = createRunner('Click here', { anchor: 0, head: 10 })
    runner.run(insertLinkCommand, {})
    expect(adapter.getContent()).toBe('[Click here](url)')
    expect(adapter.getSelection()).toEqual({ anchor: 13, head: 16 })
  })

  it('inserts link template when no selection', () => {
    const { adapter, runner } = createRunner('Hello ', { anchor: 6 })
    runner.run(insertLinkCommand, { defaultText: 'link text' })
    expect(adapter.getContent()).toBe('Hello [link text](url)')
    expect(adapter.getSelection()).toEqual({ anchor: 7, head: 16 })
  })

  it('falls back to default text when no selection and no payload', () => {
    const { adapter, runner } = createRunner('Hello ', { anchor: 6 })
    runner.run(insertLinkCommand, {})
    expect(adapter.getContent()).toBe('Hello [link text](url)')
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('Click here', { anchor: 0, head: 10 })
    runner.run(insertLinkCommand, {})
    expect(adapter.focusCount).toBe(1)
  })
})
