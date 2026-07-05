import type { CommandContext, EditorCommand, CommandResult } from './types'

export class CommandRunner {
  constructor(private readonly ctx: CommandContext) {}

  run<T>(
    command: EditorCommand<T>,
    ...payload: T extends void ? [] : [payload: T]
  ): CommandResult {
    return command.execute(this.ctx, payload[0] as T)
  }
}
