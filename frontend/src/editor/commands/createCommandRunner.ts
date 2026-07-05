import type { EditorView } from '@codemirror/view'
import { CodeMirrorAdapter } from '../codemirror/CodeMirrorAdapter'
import { CommandRunner } from './CommandRunner'
import { CodeMirrorMarkdownSemanticService } from './CodeMirrorMarkdownSemanticService'

export function createCommandRunner(view: EditorView): CommandRunner {
  return new CommandRunner({
    adapter: new CodeMirrorAdapter(view),
    semantics: new CodeMirrorMarkdownSemanticService(view),
  })
}
