import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import { BlockType } from '../../../../utils/blockType'
import { toggleBlockTypeCommand } from '../ToggleBlockTypeCommand'

function createRunner(
  content: string,
  selection: { anchor: number; head?: number },
  blockType: BlockType = BlockType.Paragraph,
) {
  const adapter = new MockEditorAdapter(content, { anchor: selection.anchor, head: selection.head ?? selection.anchor })
  const semantics = new MockMarkdownSemanticService()
  const line = adapter.getLineAt(selection.anchor)
  semantics.setBlockTypeAtLine(line.from, blockType)
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

describe('ToggleBlockTypeCommand', () => {
  it('converts paragraph to h1', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 5 })
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(adapter.getContent()).toBe('# Hello World')
    expect(adapter.getSelection()).toEqual({ anchor: 2, head: 2 })
  })

  it('removes h1 prefix on toggle off', () => {
    const { adapter, runner } = createRunner('# Hello World', { anchor: 5 }, BlockType.H1)
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(adapter.getContent()).toBe('Hello World')
    expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
  })

  it('converts paragraph to bullet list', () => {
    const { adapter, runner } = createRunner('Item text', { anchor: 5 })
    runner.run(toggleBlockTypeCommand, { prefix: '- ' })
    expect(adapter.getContent()).toBe('- Item text')
    expect(adapter.getSelection()).toEqual({ anchor: 2, head: 2 })
  })

  it('converts paragraph to blockquote', () => {
    const { adapter, runner } = createRunner('Quote text', { anchor: 5 })
    runner.run(toggleBlockTypeCommand, { prefix: '> ' })
    expect(adapter.getContent()).toBe('> Quote text')
  })

  it('converts h1 to bullet list', () => {
    const { adapter, runner } = createRunner('# Title', { anchor: 5 }, BlockType.H1)
    runner.run(toggleBlockTypeCommand, { prefix: '- ' })
    expect(adapter.getContent()).toBe('- Title')
  })

  it('removes bullet list prefix on toggle off', () => {
    const { adapter, runner } = createRunner('- Item', { anchor: 5 }, BlockType.BulletList)
    runner.run(toggleBlockTypeCommand, { prefix: '- ' })
    expect(adapter.getContent()).toBe('Item')
  })

  it('handles empty line', () => {
    const { adapter, runner } = createRunner('', { anchor: 0 })
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(adapter.getContent()).toBe('# ')
  })

  it('returns false for fenced code block', () => {
    const { adapter, runner } = createRunner('```\ncode\n```', { anchor: 5 }, BlockType.FencedCode)
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(adapter.getContent()).toBe('```\ncode\n```')
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('Hello World', { anchor: 5 })
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(adapter.focusCount).toBe(1)
  })

  it('converts h2 to h3', () => {
    const { adapter, runner } = createRunner('## Title', { anchor: 5 }, BlockType.H2)
    runner.run(toggleBlockTypeCommand, { prefix: '### ' })
    expect(adapter.getContent()).toBe('### Title')
    expect(adapter.getSelection()).toEqual({ anchor: 4, head: 4 })
  })

  it('switches blockquote to bullet list', () => {
    const { adapter, runner } = createRunner('> Quote', { anchor: 5 }, BlockType.Blockquote)
    runner.run(toggleBlockTypeCommand, { prefix: '- ' })
    expect(adapter.getContent()).toBe('- Quote')
    expect(adapter.getSelection()).toEqual({ anchor: 2, head: 2 })
  })

  it('converts paragraph to ordered list', () => {
    const { adapter, runner } = createRunner('Item text', { anchor: 5 }, BlockType.Paragraph)
    runner.run(toggleBlockTypeCommand, { prefix: '1. ' })
    expect(adapter.getContent()).toBe('1. Item text')
    expect(adapter.getSelection()).toEqual({ anchor: 3, head: 3 })
  })

  it('removes todo prefix on toggle off', () => {
    const { adapter, runner } = createRunner('- [ ] Task', { anchor: 5 }, BlockType.Todo)
    runner.run(toggleBlockTypeCommand, { prefix: '- [ ] ' })
    expect(adapter.getContent()).toBe('Task')
  })
})
