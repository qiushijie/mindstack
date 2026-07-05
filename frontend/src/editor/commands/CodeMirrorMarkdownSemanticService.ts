import type { EditorView } from '@codemirror/view'
import { getBlockTypeAtLine } from '../../utils/syntaxUtils'
import { findTableAtPos, findTableCell } from '../../utils/tableUtils'
import type { MarkdownSemanticService } from './MarkdownSemanticService'

export class CodeMirrorMarkdownSemanticService implements MarkdownSemanticService {
  constructor(private readonly view: EditorView) {}

  getBlockTypeAtLine(line: { from: number; to: number; text: string }): ReturnType<MarkdownSemanticService['getBlockTypeAtLine']> {
    return getBlockTypeAtLine(this.view, line)
  }

  findTableAtPos(pos: number): ReturnType<MarkdownSemanticService['findTableAtPos']> {
    return findTableAtPos(this.view, pos)
  }

  findTableCell(pos: number): ReturnType<MarkdownSemanticService['findTableCell']> {
    return findTableCell(this.view, pos)
  }
}
