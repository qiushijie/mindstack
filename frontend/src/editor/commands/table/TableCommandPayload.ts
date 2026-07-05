export interface TableCommandPayload {
  tableData: import('../../../utils/tableUtils').TableData
  rowIdx: number
  colIdx?: number
}
