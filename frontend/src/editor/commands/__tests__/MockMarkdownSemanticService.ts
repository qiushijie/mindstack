import { BlockType } from '../../../utils/blockType'
import type { TableData } from '../../../utils/tableUtils'
import type { MarkdownSemanticService } from '../MarkdownSemanticService'

export class MockMarkdownSemanticService implements MarkdownSemanticService {
  private blockTypes = new Map<number, BlockType>()
  private tables = new Map<number, TableData>()
  private cells = new Map<number, { table: TableData; rowIdx: number; colIdx: number }>()

  setBlockTypeAtLine(lineFrom: number, type: BlockType): void {
    this.blockTypes.set(lineFrom, type)
  }

  setTableAtPos(pos: number, table: TableData): void {
    this.tables.set(pos, table)
  }

  setTableCell(pos: number, cell: { table: TableData; rowIdx: number; colIdx: number }): void {
    this.cells.set(pos, cell)
  }

  getBlockTypeAtLine(line: { from: number }): BlockType {
    return this.blockTypes.get(line.from) ?? BlockType.Paragraph
  }

  findTableAtPos(pos: number): TableData | null {
    return this.tables.get(pos) ?? null
  }

  findTableCell(pos: number): { table: TableData; rowIdx: number; colIdx: number } | null {
    return this.cells.get(pos) ?? null
  }
}
