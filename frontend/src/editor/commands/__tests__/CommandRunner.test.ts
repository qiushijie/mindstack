import { describe, it, expect } from 'vitest'
import { CommandRunner } from '../CommandRunner'
import { MockEditorAdapter } from './MockEditorAdapter'
import { MockMarkdownSemanticService } from './MockMarkdownSemanticService'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

describe('CommandRunner', () => {
  function createRunner() {
    const adapter = new MockEditorAdapter('hello world', { anchor: 0, head: 0 })
    const semantics = new MockMarkdownSemanticService()
    const runner = new CommandRunner({ adapter, semantics })
    return { runner, adapter, semantics }
  }

  it('executes a command with payload', () => {
    const { runner, adapter } = createRunner()
    const command: EditorCommand<{ text: string }> = {
      id: 'test.upper',
      execute(_ctx, payload): CommandResult {
        adapter.replaceRange({ from: 0, to: 0, insert: payload.text })
        return { success: true }
      },
    }

    const result = runner.run(command, { text: '!' })
    expect(result.success).toBe(true)
    expect(adapter.getContent()).toBe('!hello world')
  })

  it('executes a void command without payload', () => {
    const { runner, adapter } = createRunner()
    const command: EditorCommand<void> = {
      id: 'test.focus',
      execute(): CommandResult {
        adapter.focus()
        return { success: true }
      },
    }

    const result = runner.run(command)
    expect(result.success).toBe(true)
    expect(adapter.focusCount).toBe(1)
  })

  it('returns failure result from command', () => {
    const { runner } = createRunner()
    const command: EditorCommand = {
      id: 'test.fail',
      execute(): CommandResult {
        return { success: false, error: 'boom' }
      },
    }

    const result = runner.run(command)
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
  })
})
