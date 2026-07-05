import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import {
  removeSlashTextCommand,
  type RemoveSlashTextPayload,
} from '../RemoveSlashTextCommand'

function createRunner(
  content: string,
  selection: { anchor: number; head?: number },
) {
  const adapter = new MockEditorAdapter(content, {
    anchor: selection.anchor,
    head: selection.head ?? selection.anchor,
  })
  const semantics = new MockMarkdownSemanticService()
  return { adapter, runner: new CommandRunner({ adapter, semantics }) }
}

function run(
  runner: CommandRunner,
  payload: RemoveSlashTextPayload,
) {
  return runner.run(removeSlashTextCommand, payload)
}

describe('RemoveSlashTextCommand', () => {
  it('removes slash text and places cursor at the slash position', () => {
    const { adapter, runner } = createRunner('/heading text', { anchor: 13 })
    const result = run(runner, { from: 0, to: 13 })
    expect(result.success).toBe(true)
    expect(adapter.getContent()).toBe('')
    expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
  })

  it('removes only the range between from and to', () => {
    const { adapter, runner } = createRunner('before/more', { anchor: 11 })
    const result = run(runner, { from: 6, to: 11 })
    expect(result.success).toBe(true)
    expect(adapter.getContent()).toBe('before')
    expect(adapter.getSelection()).toEqual({ anchor: 6, head: 6 })
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('/x', { anchor: 2 })
    run(runner, { from: 0, to: 2 })
    expect(adapter.focusCount).toBe(1)
  })
})
