import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { wrapInlineCommand } from '../WrapInlineCommand'

function createRunner(content: string, selection: { anchor: number; head?: number }) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('WrapInlineCommand', () => {
  it('wraps selected text with **', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 6, head: 11 })
    runner.run(wrapInlineCommand, { before: '**', after: '**' })
    expect(adapter.getContent()).toBe('Hello **World**')
    expect(adapter.getSelection()).toEqual({ anchor: 8, head: 13 })
  })

  it('unwraps ** on toggle', () => {
    const { adapter, runner } = createRunner('Hello **World**', { anchor: 8, head: 13 })
    runner.run(wrapInlineCommand, { before: '**', after: '**' })
    expect(adapter.getContent()).toBe('Hello World')
    expect(adapter.getSelection()).toEqual({ anchor: 6, head: 11 })
  })

  it('wraps with * for italic', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 6, head: 11 })
    runner.run(wrapInlineCommand, { before: '*', after: '*' })
    expect(adapter.getContent()).toBe('Hello *World*')
    expect(adapter.getSelection()).toEqual({ anchor: 7, head: 12 })
  })

  it('wraps with ~~ for strikethrough', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 6, head: 11 })
    runner.run(wrapInlineCommand, { before: '~~', after: '~~' })
    expect(adapter.getContent()).toBe('Hello ~~World~~')
    expect(adapter.getSelection()).toEqual({ anchor: 8, head: 13 })
  })

  it('inserts empty marks when no selection', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 5 })
    runner.run(wrapInlineCommand, { before: '**', after: '**' })
    expect(adapter.getContent()).toBe('Hello**** World')
    expect(adapter.getSelection()).toEqual({ anchor: 7, head: 7 })
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 6, head: 11 })
    runner.run(wrapInlineCommand, { before: '**', after: '**' })
    expect(adapter.focusCount).toBe(1)
  })
})
