import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../../CommandRunner'
import { MockEditorAdapter } from '../../__tests__/MockEditorAdapter'
import { MockMarkdownSemanticService } from '../../__tests__/MockMarkdownSemanticService'
import {
  changeCodeLanguageCommand,
  type ChangeCodeLanguagePayload,
} from '../ChangeCodeLanguageCommand'

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
  payload: ChangeCodeLanguagePayload,
) {
  return runner.run(changeCodeLanguageCommand, payload)
}

describe('ChangeCodeLanguageCommand', () => {
  it('changes an existing language tag', () => {
    const { adapter, runner } = createRunner('```typescript\ncode\n```', {
      anchor: 0,
    })
    const result = run(runner, { nodeFrom: 0, newLang: 'python' })
    expect(result.success).toBe(true)
    expect(adapter.getContent()).toBe('```python\ncode\n```')
  })

  it('inserts a language tag when none exists', () => {
    const { adapter, runner } = createRunner('```\ncode\n```', { anchor: 0 })
    const result = run(runner, { nodeFrom: 0, newLang: 'go' })
    expect(result.success).toBe(true)
    expect(adapter.getContent()).toBe('``` go\ncode\n```')
  })

  it('focuses editor after execution', () => {
    const { adapter, runner } = createRunner('```\ncode\n```', { anchor: 0 })
    run(runner, { nodeFrom: 0, newLang: 'rust' })
    expect(adapter.focusCount).toBe(1)
  })

  it('preserves whitespace between fence and existing tag', () => {
    const { adapter, runner } = createRunner('```   js\ncode\n```', {
      anchor: 0,
    })
    run(runner, { nodeFrom: 0, newLang: 'tsx' })
    expect(adapter.getContent()).toBe('```   tsx\ncode\n```')
  })

  it('returns failure when nodeFrom is not on a code fence line', () => {
    const { adapter, runner } = createRunner('plain text', { anchor: 0 })
    const result = run(runner, { nodeFrom: 0, newLang: 'go' })
    expect(result.success).toBe(false)
    expect(adapter.getContent()).toBe('plain text')
  })
})
