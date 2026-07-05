import type { BlockType } from '../../utils/blockType'
import type { TableData } from '../../utils/tableUtils'

export interface MarkdownSemanticService {
  getBlockTypeAtLine(line: { from: number; to: number; text: string }): BlockType
  findTableAtPos(pos: number): TableData | null
  findTableCell(pos: number): { table: TableData; rowIdx: number; colIdx: number } | null
}
