import type { EditorAdapter } from '../EditorAdapter'
import type { MarkdownSemanticService } from './MarkdownSemanticService'

export interface CommandContext {
  adapter: EditorAdapter
  semantics: MarkdownSemanticService
}

export interface CommandResult {
  success: boolean
  error?: string
}

export interface EditorCommand<TPayload = void> {
  readonly id: string
  execute(ctx: CommandContext, payload: TPayload): CommandResult
}
