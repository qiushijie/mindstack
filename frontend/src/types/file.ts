export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  expanded: boolean
  children: TreeNode[]
}
