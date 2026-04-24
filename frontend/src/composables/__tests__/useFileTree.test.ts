import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock wailsjs modules before importing the composable
vi.mock('../../../wailsjs/go/main/App', () => ({
  OpenFolderDialog: vi.fn(),
  OpenFileDialog: vi.fn(),
  ReadDirEntries: vi.fn(),
  ReadFileContent: vi.fn(),
  SaveFileContent: vi.fn(),
  LoadConfig: vi.fn(),
  SaveConfig: vi.fn(),
}))

vi.mock('../../../wailsjs/go/models', () => ({
  main: {
    FileEntry: class FileEntry {
      name: string
      path: string
      isDir: boolean
      constructor(source: any = {}) {
        this.name = source.name ?? ''
        this.path = source.path ?? ''
        this.isDir = source.isDir ?? false
      }
    },
  },
}))

// Mock useSettings to control auto-save behavior
vi.mock('../useSettings', () => ({
  useSettings: () => ({
    autoSave: { value: true },
    autoSaveDelay: { value: 1 },
    loadSettings: vi.fn(),
  }),
}))

import {
  OpenFolderDialog,
  OpenFileDialog,
  ReadDirEntries,
  ReadFileContent,
  SaveFileContent,
} from '../../../wailsjs/go/main/App'
import { useFileTree } from '../useFileTree'

// Helper: reset shared module state between tests
function resetState() {
  const state = useFileTree()
  state.rootPath.value = ''
  state.treeData.value = []
  state.selectedFilePath.value = ''
  state.selectedFileContent.value = ''
  state.isDirty.value = false
  // Reset editorAdapter to a no-op so "no adapter" tests work correctly.
  // useFileTree checks truthiness of editorAdapter; setting a passthrough
  // adapter that returns selectedFileContent simulates the no-adapter fallback.
  state.setEditorAdapter({
    setContent: () => {},
    getContent: () => state.selectedFileContent.value,
  })
}

describe('useFileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  describe('openFolder', () => {
    it('updates rootPath and treeData when a path is returned', async () => {
      vi.mocked(OpenFolderDialog).mockResolvedValue('/home/user/project')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'src', path: '/home/user/project/src', isDir: true },
        { name: 'README.md', path: '/home/user/project/README.md', isDir: false },
      ])

      const { rootPath, treeData, openFolder } = useFileTree()
      await openFolder()

      expect(rootPath.value).toBe('/home/user/project')
      expect(treeData.value).toHaveLength(2)
      expect(treeData.value[0]).toEqual({
        name: 'src',
        path: '/home/user/project/src',
        isDir: true,
        expanded: false,
        children: [],
      })
      expect(treeData.value[1]).toEqual({
        name: 'README.md',
        path: '/home/user/project/README.md',
        isDir: false,
        expanded: false,
        children: [],
      })
    })

    it('does not update state when dialog is cancelled', async () => {
      vi.mocked(OpenFolderDialog).mockResolvedValue('')

      const { rootPath, treeData, openFolder } = useFileTree()
      await openFolder()

      expect(rootPath.value).toBe('')
      expect(treeData.value).toEqual([])
      expect(ReadDirEntries).not.toHaveBeenCalled()
    })

    it('resets selectedFilePath and isDirty when opening a new folder', async () => {
      vi.mocked(OpenFolderDialog).mockResolvedValue('/home/user/newproject')
      vi.mocked(ReadDirEntries).mockResolvedValue([])

      const { rootPath, selectedFilePath, isDirty, openFolder, markDirty } = useFileTree()

      markDirty()
      expect(isDirty.value).toBe(true)

      await openFolder()

      expect(rootPath.value).toBe('/home/user/newproject')
      expect(selectedFilePath.value).toBe('')
      expect(isDirty.value).toBe(false)
    })
  })

  describe('openFile', () => {
    it('does not update state when dialog is cancelled', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('')

      const { selectedFilePath, openFile } = useFileTree()
      await openFile()

      expect(selectedFilePath.value).toBe('')
      expect(ReadFileContent).not.toHaveBeenCalled()
    })

    it('works without editorAdapter', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/home/user/project/notes.md')
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectedFileContent, openFile } = useFileTree()
      await openFile()

      expect(selectedFilePath.value).toBe('/home/user/project/notes.md')
      expect(selectedFileContent.value).toBe('content')
    })

    it('updates selectedFilePath and calls editorAdapter.setContent', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/home/user/project/notes.md')
      vi.mocked(ReadFileContent).mockResolvedValue('# Hello World')

      const { selectedFilePath, selectedFileContent, isDirty, openFile, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await openFile()

      expect(selectedFilePath.value).toBe('/home/user/project/notes.md')
      expect(selectedFileContent.value).toBe('# Hello World')
      expect(isDirty.value).toBe(false)
      expect(mockAdapter.setContent).toHaveBeenCalledWith('# Hello World')
    })
  })

  describe('selectFile', () => {
    it('loads file content and calls editorAdapter.setContent', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('file content here')

      const { selectedFilePath, selectedFileContent, selectFile, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await selectFile('/home/user/project/file.md')

      expect(selectedFilePath.value).toBe('/home/user/project/file.md')
      expect(selectedFileContent.value).toBe('file content here')
      expect(mockAdapter.setContent).toHaveBeenCalledWith('file content here')
    })

    it('skips if the same file is already selected', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectFile } = useFileTree()
      selectedFilePath.value = '/home/user/project/same.md'

      await selectFile('/home/user/project/same.md')

      expect(ReadFileContent).not.toHaveBeenCalled()
    })

    it('resets isDirty when selecting a new file', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('new content')

      const { isDirty, selectFile, markDirty } = useFileTree()

      markDirty()
      expect(isDirty.value).toBe(true)

      await selectFile('/home/user/project/other.md')

      expect(isDirty.value).toBe(false)
    })
  })

  describe('toggleDir', () => {
    it('expands a collapsed directory and loads children', async () => {
      const { treeData, toggleDir, openFolder } = useFileTree()

      // Setup initial tree with a directory
      vi.mocked(OpenFolderDialog).mockResolvedValue('/root')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'src', path: '/root/src', isDir: true },
      ])
      await openFolder()

      // Toggle to expand
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'sub', path: '/root/src/sub', isDir: true },
        { name: 'index.ts', path: '/root/src/index.ts', isDir: false },
      ])
      await toggleDir('/root/src')

      const srcNode = treeData.value.find(n => n.path === '/root/src')
      expect(srcNode?.expanded).toBe(true)
      expect(srcNode?.children).toHaveLength(2)
      expect(srcNode?.children[0].name).toBe('sub')
      expect(srcNode?.children[1].name).toBe('index.ts')
    })

    it('collapses an expanded directory and clears children', async () => {
      const { treeData, toggleDir, openFolder } = useFileTree()

      // Setup: open folder, then expand a directory
      vi.mocked(OpenFolderDialog).mockResolvedValue('/root')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'src', path: '/root/src', isDir: true },
      ])
      await openFolder()

      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'index.ts', path: '/root/src/index.ts', isDir: false },
      ])
      await toggleDir('/root/src')

      const srcNode = treeData.value.find(n => n.path === '/root/src')
      expect(srcNode?.expanded).toBe(true)

      // Toggle again to collapse
      await toggleDir('/root/src')

      expect(srcNode?.expanded).toBe(false)
      expect(srcNode?.children).toEqual([])
    })

    it('does nothing for a non-existent path', async () => {
      const { treeData, toggleDir } = useFileTree()

      treeData.value = [
        { name: 'src', path: '/root/src', isDir: true, expanded: false, children: [] },
      ]

      await toggleDir('/nonexistent')

      expect(treeData.value[0].expanded).toBe(false)
      expect(ReadDirEntries).not.toHaveBeenCalled()
    })

    it('does nothing for a file node', async () => {
      const { treeData, toggleDir } = useFileTree()

      treeData.value = [
        { name: 'readme.md', path: '/root/readme.md', isDir: false, expanded: false, children: [] },
      ]

      await toggleDir('/root/readme.md')

      expect(treeData.value[0].expanded).toBe(false)
      expect(ReadDirEntries).not.toHaveBeenCalled()
    })
  })

  describe('saveCurrentFile', () => {
    it('uses selectedFileContent when no editorAdapter is set', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      // This test runs first; editorAdapter has not been set yet
      const { selectedFilePath, selectedFileContent, isDirty, saveCurrentFile, markDirty } = useFileTree()

      selectedFilePath.value = '/root/file.md'
      selectedFileContent.value = 'fallback content'
      markDirty()

      await saveCurrentFile()

      expect(SaveFileContent).toHaveBeenCalledWith('/root/file.md', 'fallback content')
      expect(isDirty.value).toBe(false)
    })

    it('saves file and resets isDirty on success', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectedFilePath, isDirty, saveCurrentFile, setEditorAdapter, markDirty } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('saved content') }
      setEditorAdapter(mockAdapter)

      selectedFilePath.value = '/root/file.md'
      markDirty()

      await saveCurrentFile()

      expect(SaveFileContent).toHaveBeenCalledWith('/root/file.md', 'saved content')
      expect(isDirty.value).toBe(false)
    })

    it('does not reset isDirty when save fails', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('write error')

      const { selectedFilePath, isDirty, saveCurrentFile, markDirty } = useFileTree()

      selectedFilePath.value = '/root/file.md'
      markDirty()

      await saveCurrentFile()

      expect(isDirty.value).toBe(true)
    })

    it('skips when no file is selected', async () => {
      const { saveCurrentFile } = useFileTree()

      await saveCurrentFile()

      expect(SaveFileContent).not.toHaveBeenCalled()
    })
  })

  describe('newFile', () => {
    it('works without editorAdapter', () => {
      const { selectedFilePath, selectedFileContent, isDirty, newFile, markDirty } = useFileTree()

      selectedFilePath.value = '/root/old.md'
      selectedFileContent.value = 'old content'
      markDirty()

      newFile()

      expect(selectedFilePath.value).toBe('')
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
    })

    it('clears selected file state and editor content', () => {
      const { selectedFilePath, selectedFileContent, isDirty, newFile, setEditorAdapter, markDirty } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      selectedFilePath.value = '/root/old.md'
      selectedFileContent.value = 'old content'
      markDirty()

      newFile()

      expect(selectedFilePath.value).toBe('')
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
      expect(mockAdapter.setContent).toHaveBeenCalledWith('')
    })
  })

  describe('folderName computed', () => {
    it('returns default name when rootPath is empty', () => {
      const { folderName } = useFileTree()
      expect(folderName.value).toBe('MindStack')
    })

    it('extracts folder name from rootPath', () => {
      const { rootPath, folderName } = useFileTree()
      rootPath.value = '/home/user/my-project'
      expect(folderName.value).toBe('my-project')
    })

    it('handles trailing slash', () => {
      const { rootPath, folderName } = useFileTree()
      rootPath.value = '/home/user/my-project/'
      expect(folderName.value).toBe('my-project')
    })

    it('handles single-level path', () => {
      const { rootPath, folderName } = useFileTree()
      rootPath.value = 'project'
      expect(folderName.value).toBe('project')
    })

    it('handles root path', () => {
      const { rootPath, folderName } = useFileTree()
      rootPath.value = '/'
      expect(folderName.value).toBe('MindStack')
    })
  })

  describe('markDirty', () => {
    it('sets isDirty to true', () => {
      const { isDirty, markDirty } = useFileTree()
      expect(isDirty.value).toBe(false)

      markDirty()

      expect(isDirty.value).toBe(true)
    })
  })

  describe('auto-save', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-saves after delay when autoSave is enabled and file is selected', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectedFilePath, setEditorAdapter, markDirty } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()

      expect(SaveFileContent).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      await vi.runOnlyPendingTimersAsync()

      expect(SaveFileContent).toHaveBeenCalledWith('/root/file.md', 'content')
    })

    it('resets timer on subsequent markDirty calls', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectedFilePath, setEditorAdapter, markDirty } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()
      vi.advanceTimersByTime(500)

      markDirty()
      vi.advanceTimersByTime(500)

      expect(SaveFileContent).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      await vi.runOnlyPendingTimersAsync()

      expect(SaveFileContent).toHaveBeenCalledTimes(1)
    })

    it('does not auto-save when selectedFilePath is empty', () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { markDirty } = useFileTree()

      markDirty()
      vi.advanceTimersByTime(5000)

      expect(SaveFileContent).not.toHaveBeenCalled()
    })

    it('cancels auto-save on manual saveCurrentFile', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectedFilePath, setEditorAdapter, markDirty, saveCurrentFile } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()

      await saveCurrentFile()

      vi.advanceTimersByTime(5000)
      await vi.runOnlyPendingTimersAsync()

      expect(SaveFileContent).toHaveBeenCalledTimes(1)
    })

    it('cancels auto-save on selectFile', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')
      vi.mocked(ReadFileContent).mockResolvedValue('new content')

      const { selectedFilePath, setEditorAdapter, markDirty, selectFile } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()

      await selectFile('/root/other.md')

      vi.advanceTimersByTime(5000)
      await vi.runOnlyPendingTimersAsync()

      expect(SaveFileContent).not.toHaveBeenCalled()
    })

    it('cancels auto-save on newFile', () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectedFilePath, setEditorAdapter, markDirty, newFile } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()
      newFile()

      vi.advanceTimersByTime(5000)

      expect(SaveFileContent).not.toHaveBeenCalled()
    })

    it('cancels auto-save on openFolder', async () => {
      vi.mocked(SaveFileContent).mockResolvedValue('')
      vi.mocked(OpenFolderDialog).mockResolvedValue('/newroot')
      vi.mocked(ReadDirEntries).mockResolvedValue([])

      const { selectedFilePath, setEditorAdapter, markDirty, openFolder } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn().mockReturnValue('content') }
      setEditorAdapter(mockAdapter)
      selectedFilePath.value = '/root/file.md'

      markDirty()

      await openFolder()

      vi.advanceTimersByTime(5000)
      await vi.runOnlyPendingTimersAsync()

      expect(SaveFileContent).not.toHaveBeenCalled()
    })
  })

  describe('refreshTree', () => {
    it('refreshes tree data from rootPath', async () => {
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'new-file.md', path: '/root/new-file.md', isDir: false },
      ])

      const { rootPath, treeData, refreshTree } = useFileTree()
      rootPath.value = '/root'

      await refreshTree()

      expect(ReadDirEntries).toHaveBeenCalledWith('/root')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('new-file.md')
    })

    it('skips when rootPath is empty', async () => {
      const { refreshTree } = useFileTree()

      await refreshTree()

      expect(ReadDirEntries).not.toHaveBeenCalled()
    })
  })
})
