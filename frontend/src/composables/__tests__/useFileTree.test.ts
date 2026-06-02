import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock wailsjs modules before importing the composable
vi.mock('../../../wailsjs/go/main/App', () => ({
  OpenFolderDialog: vi.fn(),
  OpenFileDialog: vi.fn(),
  ReadDirEntries: vi.fn(),
  ReadFileContent: vi.fn(),
  SaveFileContent: vi.fn(),
  SaveFileDialog: vi.fn(),
  LoadConfig: vi.fn(),
  SaveConfig: vi.fn(),
  SetWorkspaceRoot: vi.fn(),
  GetFileServerPort: vi.fn().mockResolvedValue(0),
  AddRecentEntry: vi.fn(),
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

// Mock useEditorState to avoid Vue provide/inject requirement
vi.mock('../useEditorState', () => ({
  useEditorState: () => ({
    editorView: { value: null },
  }),
  focusEditor: vi.fn(),
}))

// Mock currentFilePath extension
vi.mock('../../extensions/currentFilePath', () => ({
  setCurrentFilePath: { is: () => false, of: vi.fn() },
  setFileServerPort: vi.fn(),
}))

// Mock useConfirmDialog with controllable confirm result
const { mockConfirmResult } = vi.hoisted(() => ({
  mockConfirmResult: { value: true },
}))

vi.mock('../useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    visible: { value: false },
    options: { value: { title: '', message: '', confirmText: '', cancelText: '' } },
    confirm: () => Promise.resolve(mockConfirmResult.value),
    handleConfirm: vi.fn(),
    handleCancel: vi.fn(),
  }),
}))

import {
  OpenFolderDialog,
  OpenFileDialog,
  ReadDirEntries,
  ReadFileContent,
  SaveFileContent,
  SaveFileDialog,
  LoadConfig,
  SaveConfig,
  AddRecentEntry,
} from '../../../wailsjs/go/main/App'
import { useFileTree } from '../useFileTree'
import { useTabs } from '../useTabs'

// Helper: reset shared module state between tests
function resetState() {
  const { clearTabs } = useTabs()
  clearTabs()
  const state = useFileTree()
  state.rootPath.value = ''
  state.treeData.value = []
  state.selectedFilePath.value = ''
  state.selectedFileContent.value = ''
  state.isDirty.value = false
  state.dirtyTabs.value = []
  state.setEditorAdapter({
    setContent: () => {},
    getContent: () => state.selectedFileContent.value,
  })
}

describe('useFileTree', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

    it('switches root to file parent and loads tree when no workspace is open', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/external/docs/spec.md')
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'spec.md', path: '/external/docs/spec.md', isDir: false },
        { name: 'notes.md', path: '/external/docs/notes.md', isDir: false },
      ])

      const { rootPath, treeData, openFile } = useFileTree()
      await openFile()

      expect(rootPath.value).toBe('/external/docs')
      expect(treeData.value).toHaveLength(2)
      expect(treeData.value.map(n => n.name)).toEqual(['spec.md', 'notes.md'])
      expect(AddRecentEntry).toHaveBeenCalledWith('/external/docs', true)
    })

    it('keeps root unchanged when file is inside current workspace', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/workspace/notes/sub/foo.md')
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { rootPath, treeData, openFile } = useFileTree()
      rootPath.value = '/workspace/notes'
      treeData.value = [
        { name: 'sub', path: '/workspace/notes/sub', isDir: true, expanded: false, children: [] },
      ]

      await openFile()

      expect(rootPath.value).toBe('/workspace/notes')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('sub')
      expect(ReadDirEntries).not.toHaveBeenCalled()
    })

    it('switches root and reloads tree when file is outside current workspace', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/external/foo.md')
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'foo.md', path: '/external/foo.md', isDir: false },
      ])

      const { rootPath, treeData, openFile } = useFileTree()
      rootPath.value = '/workspace/notes'
      treeData.value = [
        { name: 'old.md', path: '/workspace/notes/old.md', isDir: false, expanded: false, children: [] },
      ]

      await openFile()

      expect(rootPath.value).toBe('/external')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('foo.md')
      expect(AddRecentEntry).toHaveBeenCalledWith('/external', true)
    })

    it('does not match a sibling directory with a shared prefix', async () => {
      vi.mocked(OpenFileDialog).mockResolvedValue('/workspace/notes2/foo.md')
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'foo.md', path: '/workspace/notes2/foo.md', isDir: false },
      ])

      const { rootPath, openFile } = useFileTree()
      rootPath.value = '/workspace/notes'

      await openFile()

      expect(rootPath.value).toBe('/workspace/notes2')
      expect(AddRecentEntry).toHaveBeenCalledWith('/workspace/notes2', true)
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

      expect(selectedFilePath.value).toMatch(/^__untitled__\d+$/)
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

      expect(selectedFilePath.value).toMatch(/^__untitled__\d+$/)
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
      expect(mockAdapter.setContent).toHaveBeenCalledWith('')
    })
  })

  describe('newFile + saveCurrentFile integration', () => {
    it('creates untitled tab, edits, then saves with dialog', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('/root/new-note.md')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const {
        newFile, saveCurrentFile,
        selectedFilePath, selectedFileContent, isDirty,
        setEditorAdapter, markDirty,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      // Step 1: create new file
      newFile()
      const untitledPath = selectedFilePath.value
      expect(untitledPath).toMatch(/^__untitled__\d+$/)
      expect(editorContent).toBe('')
      expect(isDirty.value).toBe(false)

      // Step 2: verify tab was created
      const { tabs, activeTabIndex } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe(untitledPath)
      expect(activeTabIndex.value).toBe(0)

      // Step 3: edit content
      editorContent = '# Hello World'
      selectedFileContent.value = '# Hello World'
      markDirty()
      expect(isDirty.value).toBe(true)

      // Step 4: save — should trigger SaveFileDialog
      await saveCurrentFile()

      expect(SaveFileDialog).toHaveBeenCalledWith('untitled.md')
      expect(SaveFileContent).toHaveBeenCalledWith('/root/new-note.md', '# Hello World')
      expect(selectedFilePath.value).toBe('/root/new-note.md')
      expect(isDirty.value).toBe(false)

      // Tab path and title should be updated
      expect(tabs.value[0].path).toBe('/root/new-note.md')
      expect(tabs.value[0].title).toBe('new-note')
    })

    it('cancels save when SaveFileDialog is dismissed', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('')

      const { newFile, saveCurrentFile, selectedFilePath, setEditorAdapter, markDirty } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      newFile()
      editorContent = 'content'
      markDirty()

      await saveCurrentFile()

      expect(SaveFileDialog).toHaveBeenCalled()
      expect(SaveFileContent).not.toHaveBeenCalled()
      // Path remains untitled
      expect(selectedFilePath.value).toMatch(/^__untitled__\d+$/)
    })

    it('creates multiple untitled files with unique paths', () => {
      const { newFile, selectedFilePath } = useFileTree()

      newFile()
      const first = selectedFilePath.value
      newFile()
      const second = selectedFilePath.value

      expect(first).not.toBe(second)
      expect(first).toMatch(/^__untitled__\d+$/)
      expect(second).toMatch(/^__untitled__\d+$/)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(2)
      expect(tabs.value.map(t => t.path)).toEqual([first, second])
    })

    it('does not auto-save untitled files', async () => {
      vi.useFakeTimers()
      try {
        vi.mocked(SaveFileContent).mockResolvedValue('')

        const { newFile, setEditorAdapter, markDirty } = useFileTree()

        let editorContent = ''
        setEditorAdapter({
          setContent: vi.fn((c: string) => { editorContent = c }),
          getContent: () => editorContent,
        })

        newFile()
        editorContent = 'content'
        markDirty()

        vi.advanceTimersByTime(5000)
        await vi.runOnlyPendingTimersAsync()

        expect(SaveFileContent).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('switches between untitled tab and real file tab', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('real content')

      const {
        newFile, selectFile, switchToTab,
        selectedFilePath, selectedFileContent,
        setEditorAdapter,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      // Open real file
      await selectFile('/root/real.md')
      expect(selectedFilePath.value).toBe('/root/real.md')
      expect(selectedFileContent.value).toBe('real content')

      // Create untitled file
      newFile()
      const untitledPath = selectedFilePath.value
      expect(untitledPath).toMatch(/^__untitled__\d+$/)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(2)

      // Switch back to real file
      await switchToTab(0)
      expect(selectedFilePath.value).toBe('/root/real.md')
      expect(selectedFileContent.value).toBe('real content')

      // Switch to untitled tab — content should be empty (no disk read)
      await switchToTab(1)
      expect(selectedFilePath.value).toBe(untitledPath)
      expect(selectedFileContent.value).toBe('')
    })

    it('does not prompt save dialog when closing dirty untitled tab', async () => {
      const { newFile, markDirty, closeFileTab, selectedFileContent, setEditorAdapter } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      newFile()
      editorContent = 'untitled content'
      selectedFileContent.value = 'untitled content'
      markDirty()

      // Close tab — confirmAndSaveDirtyTabs should skip untitled paths
      // so no confirm dialog appears and no SaveFileContent is called
      mockConfirmResult.value = true
      await closeFileTab(0)

      expect(SaveFileContent).not.toHaveBeenCalled()
      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
    })

    it('saves untitled file via dialog, then saves normally on second save', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('/root/saved.md')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const {
        newFile, saveCurrentFile,
        selectedFilePath, isDirty,
        setEditorAdapter, markDirty,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      newFile()
      editorContent = 'first save'
      markDirty()

      // First save — opens dialog
      await saveCurrentFile()
      expect(SaveFileDialog).toHaveBeenCalledTimes(1)
      expect(selectedFilePath.value).toBe('/root/saved.md')

      // Edit again
      editorContent = 'second save'
      markDirty()

      // Second save — direct save, no dialog
      await saveCurrentFile()
      expect(SaveFileDialog).toHaveBeenCalledTimes(1) // no additional dialog
      expect(SaveFileContent).toHaveBeenLastCalledWith('/root/saved.md', 'second save')
      expect(isDirty.value).toBe(false)
    })

    it('does not save untitled path to app config via selectFile', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { newFile, selectedFilePath, selectFile } = useFileTree()

      newFile()
      expect(selectedFilePath.value).toMatch(/^__untitled__\d+$/)

      // selectFile triggers saveAppConfig internally
      await selectFile('/root/real.md')

      // The config saved during selectFile should have the real file path,
      // not the untitled path
      const lastCall = vi.mocked(SaveConfig).mock.calls.at(-1)
      if (lastCall) {
        const parsed = JSON.parse(lastCall[0])
        expect(parsed.lastFilePath).toBe('/root/real.md')
      }
    })

    it('refreshes file tree after saving untitled file', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('/root/new.md')
      vi.mocked(SaveFileContent).mockResolvedValue('')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'new.md', path: '/root/new.md', isDir: false },
      ])

      const {
        newFile, saveCurrentFile,
        rootPath, treeData,
        setEditorAdapter, markDirty,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      rootPath.value = '/root'
      newFile()
      editorContent = 'content'
      markDirty()

      await saveCurrentFile()

      expect(ReadDirEntries).toHaveBeenCalledWith('/root')
      expect(treeData.value.some(n => n.name === 'new.md')).toBe(true)
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

    it('does not mark dirty when content matches cached version after selectFile', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('same content')

      const { isDirty, markDirty, selectFile } = useFileTree()

      await selectFile('/root/file.md')
      // After selectFile, isDirty is false because dirtyTabs was cleared by resetState
      expect(isDirty.value).toBe(false)

      // markDirty detects content matches cache, so it stays clean
      markDirty()
      expect(isDirty.value).toBe(false)
    })

    it('marks dirty when content differs from cached version', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('original content')

      const { isDirty, selectedFileContent, markDirty, selectFile } = useFileTree()

      await selectFile('/root/file.md')

      selectedFileContent.value = 'modified content'
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

  describe('refreshDir', () => {
    it('refreshes expanded directory children', async () => {
      const { treeData, toggleDir, openFolder, refreshDir } = useFileTree()

      // Setup: open folder with a directory
      vi.mocked(OpenFolderDialog).mockResolvedValue('/root')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'src', path: '/root/src', isDir: true },
      ])
      await openFolder()

      // Expand the directory
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'old.ts', path: '/root/src/old.ts', isDir: false },
      ])
      await toggleDir('/root/src')

      // Refresh the directory
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'new.ts', path: '/root/src/new.ts', isDir: false },
      ])
      await refreshDir('/root/src')

      const srcNode = treeData.value.find(n => n.path === '/root/src')
      expect(srcNode?.children).toHaveLength(1)
      expect(srcNode?.children[0].name).toBe('new.ts')
    })

    it('does nothing for collapsed directory', async () => {
      const { treeData, openFolder, refreshDir } = useFileTree()

      vi.mocked(OpenFolderDialog).mockResolvedValue('/root')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'src', path: '/root/src', isDir: true },
      ])
      await openFolder()

      await refreshDir('/root/src')

      const srcNode = treeData.value.find(n => n.path === '/root/src')
      expect(srcNode?.expanded).toBe(false)
      expect(srcNode?.children).toEqual([])
      expect(ReadDirEntries).toHaveBeenCalledTimes(1) // only from openFolder
    })

    it('does nothing for non-existent path', async () => {
      const { refreshDir } = useFileTree()

      await refreshDir('/nonexistent')

      expect(ReadDirEntries).not.toHaveBeenCalled()
    })

    it('does nothing for file node', async () => {
      const { treeData, openFolder, refreshDir } = useFileTree()

      vi.mocked(OpenFolderDialog).mockResolvedValue('/root')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([
        { name: 'file.md', path: '/root/file.md', isDir: false },
      ])
      await openFolder()

      await refreshDir('/root/file.md')

      expect(ReadDirEntries).toHaveBeenCalledTimes(1) // only from openFolder
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

  describe('openRecentFolder', () => {
    it('sets rootPath, loads tree, and records recent', async () => {
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'notes.md', path: '/recent/notes.md', isDir: false },
      ])

      const { rootPath, treeData, selectedFilePath, isDirty, openRecentFolder, markDirty } = useFileTree()
      markDirty()

      await openRecentFolder('/recent')

      expect(rootPath.value).toBe('/recent')
      expect(selectedFilePath.value).toBe('')
      expect(isDirty.value).toBe(false)
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('notes.md')
      expect(AddRecentEntry).toHaveBeenCalledWith('/recent', true)
    })
  })

  describe('openRecentFile', () => {
    it('loads file content, updates editor, and records recent', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('# Recent File')

      const { selectedFilePath, selectedFileContent, isDirty, openRecentFile, setEditorAdapter, markDirty } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)
      markDirty()

      await openRecentFile('/recent/notes.md')

      expect(selectedFilePath.value).toBe('/recent/notes.md')
      expect(selectedFileContent.value).toBe('# Recent File')
      expect(isDirty.value).toBe(false)
      expect(mockAdapter.setContent).toHaveBeenCalledWith('# Recent File')
      expect(AddRecentEntry).toHaveBeenCalledWith('/recent/notes.md', false)
    })

    it('works without editorAdapter', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectedFileContent, openRecentFile } = useFileTree()

      await openRecentFile('/recent/doc.md')

      expect(selectedFilePath.value).toBe('/recent/doc.md')
      expect(selectedFileContent.value).toBe('content')
      expect(AddRecentEntry).toHaveBeenCalledWith('/recent/doc.md', false)
    })

    it('switches root to file parent and loads tree when no workspace is open', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'doc.md', path: '/recent/doc.md', isDir: false },
      ])

      const { rootPath, treeData, openRecentFile } = useFileTree()

      await openRecentFile('/recent/doc.md')

      expect(rootPath.value).toBe('/recent')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('doc.md')
      expect(AddRecentEntry).toHaveBeenCalledWith('/recent', true)
    })

    it('keeps root unchanged when file is inside current workspace', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { rootPath, treeData, openRecentFile } = useFileTree()
      rootPath.value = '/workspace/notes'
      treeData.value = [
        { name: 'sub', path: '/workspace/notes/sub', isDir: true, expanded: false, children: [] },
      ]

      await openRecentFile('/workspace/notes/sub/foo.md')

      expect(rootPath.value).toBe('/workspace/notes')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('sub')
      expect(ReadDirEntries).not.toHaveBeenCalled()
    })

    it('switches root and reloads tree when file is outside current workspace', async () => {
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'foo.md', path: '/external/foo.md', isDir: false },
      ])

      const { rootPath, treeData, openRecentFile } = useFileTree()
      rootPath.value = '/workspace/notes'

      await openRecentFile('/external/foo.md')

      expect(rootPath.value).toBe('/external')
      expect(treeData.value).toHaveLength(1)
      expect(treeData.value[0].name).toBe('foo.md')
      expect(AddRecentEntry).toHaveBeenCalledWith('/external', true)
    })
  })

  describe('restoreSession', () => {
    it('restores last folder and file from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        lastFolderPath: '/root',
        lastFilePath: '/root/notes.md',
      }))
      vi.mocked(ReadDirEntries).mockResolvedValue([
        { name: 'notes.md', path: '/root/notes.md', isDir: false },
      ])
      vi.mocked(ReadFileContent).mockResolvedValue('# Restored')

      const { rootPath, selectedFilePath, selectedFileContent, restoreSession } = useFileTree()
      await restoreSession()

      expect(rootPath.value).toBe('/root')
      expect(selectedFilePath.value).toBe('/root/notes.md')
      expect(selectedFileContent.value).toBe('# Restored')
    })

    it('restores only folder when no lastFilePath', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        lastFolderPath: '/root',
      }))
      vi.mocked(ReadDirEntries).mockResolvedValue([])

      const { rootPath, selectedFilePath, restoreSession } = useFileTree()
      await restoreSession()

      expect(rootPath.value).toBe('/root')
      expect(selectedFilePath.value).toBe('')
    })

    it('does nothing when config is empty', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { rootPath, selectedFilePath, restoreSession } = useFileTree()
      await restoreSession()

      expect(rootPath.value).toBe('')
      expect(selectedFilePath.value).toBe('')
    })

    it('handles invalid config JSON', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('')

      const { rootPath, restoreSession } = useFileTree()
      await restoreSession()

      expect(rootPath.value).toBe('')
    })

    it('handles errors gracefully', async () => {
      vi.mocked(LoadConfig).mockRejectedValue(new Error('disk error'))

      const { rootPath, restoreSession } = useFileTree()
      await restoreSession()

      expect(rootPath.value).toBe('')
    })
  })

  describe('switchToTab', () => {
    // Helper: open a fresh folder to clear tabContentCache between tests
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
      // clearAllMocks resets mock call counts but keeps implementations
    }

    it('switches to another tab and loads its content', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')

      const { selectedFilePath, selectedFileContent, selectFile, switchToTab } = useFileTree()

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await switchToTab(0)

      expect(selectedFilePath.value).toBe('/root/a.md')
      expect(selectedFileContent.value).toBe('content-a')
    })

    it('skips when index equals activeTabIndex', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectFile, switchToTab } = useFileTree()

      await selectFile('/root/a.md')
      await switchToTab(0)

      expect(selectedFilePath.value).toBe('/root/a.md')
    })

    it('saves current content to cache before switching', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')

      const { selectFile, switchToTab, setEditorAdapter, selectedFileContent } = useFileTree()
      let editorContent = ''
      const mockAdapter = {
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      editorContent = 'modified-b'

      await switchToTab(0)

      expect(selectedFileContent.value).toBe('content-a')
    })

    it('cancels auto-save timer on switch', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, switchToTab, setEditorAdapter, markDirty } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      markDirty()

      vi.useFakeTimers()
      try {
        await switchToTab(0)
        vi.advanceTimersByTime(5000)
        await vi.runOnlyPendingTimersAsync()
        expect(SaveFileContent).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('closeFileTab', () => {
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
    }

    it('closes active tab and switches to adjacent', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')

      const { selectedFilePath, selectedFileContent, selectFile, closeFileTab, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      await closeFileTab(2)

      expect(selectedFilePath.value).toBe('/root/b.md')
      expect(selectedFileContent.value).toBe('content-b')
    })

    it('closes the last tab and clears editor', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectedFileContent, isDirty, selectFile, closeFileTab, markDirty } = useFileTree()

      await selectFile('/root/a.md')
      markDirty()
      await closeFileTab(0)

      expect(selectedFilePath.value).toBe('')
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
    })

    it('closes a tab before active and adjusts index', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')

      const { selectedFilePath, selectFile, closeFileTab, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      await closeFileTab(0)

      expect(selectedFilePath.value).toBe('/root/c.md')
    })

    it('clears dirty state for closed tab', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeFileTab, markDirty, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      markDirty()
      await closeFileTab(0)

      vi.useFakeTimers()
      try {
        vi.advanceTimersByTime(5000)
        await vi.runOnlyPendingTimersAsync()
        expect(SaveFileContent).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('saves current content to cache when closing active tab', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('original-a')
        .mockResolvedValueOnce('original-b')

      const { selectFile, closeFileTab, setEditorAdapter } = useFileTree()
      let editorContent = ''
      const mockAdapter = {
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await closeFileTab(1)

      expect(mockAdapter.setContent).toHaveBeenLastCalledWith('original-a')
    })

    it('saves dirty file and closes tab when confirm returns true', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('original content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeFileTab, markDirty, selectedFileContent } = useFileTree()

      await selectFile('/root/a.md')
      // Simulate editing (same pattern as CodeMirrorEditor.onChange)
      selectedFileContent.value = 'modified content'
      markDirty()

      mockConfirmResult.value = true
      await closeFileTab(0)

      expect(SaveFileContent).toHaveBeenCalledWith('/root/a.md', 'modified content')
      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
    })

    it('discards changes and closes tab when confirm returns false', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('original content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeFileTab, markDirty, selectedFileContent } = useFileTree()

      await selectFile('/root/a.md')
      selectedFileContent.value = 'modified content'
      markDirty()

      mockConfirmResult.value = false
      await closeFileTab(0)

      expect(SaveFileContent).not.toHaveBeenCalled()
      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
    })
  })

  describe('closeOtherTabs', () => {
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
    }

    it('closes all tabs except the specified one and loads its content', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')

      const { selectedFilePath, selectedFileContent, selectFile, closeOtherTabs, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      await closeOtherTabs(1)

      expect(selectedFilePath.value).toBe('/root/b.md')
      expect(selectedFileContent.value).toBe('content-b')
    })

    it('keeps only one tab after closing others', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectFile, closeOtherTabs } = useFileTree()

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      await closeOtherTabs(1)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/b.md')
    })

    it('cancels auto-save timer', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeOtherTabs, markDirty, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      markDirty()

      vi.useFakeTimers()
      try {
        await closeOtherTabs(1)
        vi.advanceTimersByTime(5000)
        await vi.runOnlyPendingTimersAsync()
        expect(SaveFileContent).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('saves dirty files when closing other tabs with confirm', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeOtherTabs, markDirty, selectedFileContent } = useFileTree()

      await selectFile('/root/a.md')  // tab 0
      await selectFile('/root/b.md')  // tab 1
      await selectFile('/root/c.md')  // tab 2, active

      // Make a dirty: switch to it, edit, mark
      await selectFile('/root/a.md')
      selectedFileContent.value = 'dirty-a'
      markDirty()

      // Make b dirty
      await selectFile('/root/b.md')
      selectedFileContent.value = 'dirty-b'
      markDirty()

      // Keep c (idx 2), close others
      mockConfirmResult.value = true
      await closeOtherTabs(2)

      expect(SaveFileContent).toHaveBeenCalledWith('/root/a.md', 'dirty-a')
      expect(SaveFileContent).toHaveBeenCalledWith('/root/b.md', 'dirty-b')
    })
  })

  describe('closeAllTabs', () => {
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
    }

    it('closes all tabs and clears editor', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectedFilePath, selectedFileContent, isDirty, selectFile, closeAllTabs, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await closeAllTabs()

      expect(selectedFilePath.value).toBe('')
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
      expect(editorContent).toBe('')
    })

    it('clears all tabs from tab bar', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')

      const { selectFile, closeAllTabs } = useFileTree()

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await closeAllTabs()

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
    })

    it('cancels auto-save timer', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeAllTabs, markDirty, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      markDirty()

      vi.useFakeTimers()
      try {
        await closeAllTabs()
        vi.advanceTimersByTime(5000)
        await vi.runOnlyPendingTimersAsync()
        expect(SaveFileContent).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('saves all dirty files when closing all tabs with confirm', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeAllTabs, markDirty, selectedFileContent } = useFileTree()

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      // Make b.md dirty
      selectedFileContent.value = 'dirty-b'
      markDirty()

      mockConfirmResult.value = true
      await closeAllTabs()

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
      expect(SaveFileContent).toHaveBeenCalledWith('/root/b.md', 'dirty-b')
    })

    it('discards all dirty files when closing all tabs with discard', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content')
      vi.mocked(SaveFileContent).mockResolvedValue('')

      const { selectFile, closeAllTabs, markDirty, selectedFileContent } = useFileTree()

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      selectedFileContent.value = 'dirty-b'
      markDirty()

      mockConfirmResult.value = false
      await closeAllTabs()

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
      expect(SaveFileContent).not.toHaveBeenCalled()
    })
  })

  describe('closeTabsForDeletedPath', () => {
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
    }

    it('deletes a single file tab and switches to neighbor', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')

      const {
        selectedFilePath, selectedFileContent,
        selectFile, closeTabsForDeletedPath, setEditorAdapter,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      // Active tab is b.md (index 1), delete a.md's file
      await closeTabsForDeletedPath('/root/a.md', false)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/b.md')
      // Active tab was b.md and it survived, so content stays
      expect(selectedFilePath.value).toBe('/root/b.md')
      expect(selectedFileContent.value).toBe('content-b')
    })

    it('deletes directory and closes all tabs under it', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('src-content')
        .mockResolvedValueOnce('other-content')

      const {
        selectedFilePath, selectedFileContent,
        selectFile, closeTabsForDeletedPath, setEditorAdapter,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/src/index.ts')
      await selectFile('/root/other/readme.md')
      // Delete /root/src directory — should close tabs under it
      await closeTabsForDeletedPath('/root/src', true)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/other/readme.md')
      expect(selectedFilePath.value).toBe('/root/other/readme.md')
      expect(selectedFileContent.value).toBe('other-content')
    })

    it('clears editor when last tab is deleted', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('only-content')

      const {
        selectedFilePath, selectedFileContent, isDirty,
        selectFile, closeTabsForDeletedPath, setEditorAdapter, markDirty,
      } = useFileTree()

      const mockSetContent = vi.fn()
      setEditorAdapter({
        setContent: mockSetContent,
        getContent: () => 'only-content',
      })

      await selectFile('/root/only.md')
      markDirty()

      await closeTabsForDeletedPath('/root/only.md', false)

      expect(selectedFilePath.value).toBe('')
      expect(selectedFileContent.value).toBe('')
      expect(isDirty.value).toBe(false)
      expect(mockSetContent).toHaveBeenLastCalledWith('')

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(0)
    })

    it('does nothing when deleted file has no open tab', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent).mockResolvedValue('content-a')

      const {
        selectedFilePath, selectedFileContent,
        selectFile, closeTabsForDeletedPath, setEditorAdapter,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')

      // Delete an unrelated file that has no open tab
      await closeTabsForDeletedPath('/root/unrelated.md', false)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/a.md')
      expect(selectedFilePath.value).toBe('/root/a.md')
      expect(selectedFileContent.value).toBe('content-a')
    })

    it('cleans up dirty state for deleted tabs', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')

      const {
        dirtyTabs, selectFile, closeTabsForDeletedPath,
        setEditorAdapter, markDirty, selectedFileContent,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')

      // Make b.md dirty
      selectedFileContent.value = 'dirty-b'
      markDirty()
      expect(dirtyTabs.value).toContain('/root/b.md')

      // Delete b.md's file
      await closeTabsForDeletedPath('/root/b.md', false)

      expect(dirtyTabs.value).not.toContain('/root/b.md')
      expect(dirtyTabs.value).toHaveLength(0)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/a.md')
    })

    it('preserves untitled tabs when deleting a directory', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('file-content')

      const {
        selectedFilePath, selectedFileContent,
        newFile, selectFile, closeTabsForDeletedPath, setEditorAdapter,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      // Open a real file under /root/src/
      await selectFile('/root/src/app.ts')
      // Create an untitled tab
      newFile()
      const untitledPath = selectedFilePath.value
      expect(untitledPath).toMatch(/^__untitled__\d+$/)

      const { tabs: tabsBefore } = useTabs()
      expect(tabsBefore.value).toHaveLength(2)

      // Delete /root/src directory
      await closeTabsForDeletedPath('/root/src', true)

      const { tabs } = useTabs()
      // Only the untitled tab should survive
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe(untitledPath)
      expect(selectedFilePath.value).toBe(untitledPath)
    })

    it('switches content when active tab is under deleted directory', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('src-content')
        .mockResolvedValueOnce('other-content')

      const {
        selectedFilePath, selectedFileContent,
        selectFile, closeTabsForDeletedPath, setEditorAdapter, switchToTab,
      } = useFileTree()

      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/src/main.ts')
      await selectFile('/root/notes.md')

      // Switch back to /root/src/main.ts so it's the active tab
      await switchToTab(0)
      expect(selectedFilePath.value).toBe('/root/src/main.ts')

      // Delete /root/src — active tab is under it, should switch to /root/notes.md
      await closeTabsForDeletedPath('/root/src', true)

      const { tabs } = useTabs()
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/notes.md')
      expect(selectedFilePath.value).toBe('/root/notes.md')
      expect(selectedFileContent.value).toBe('other-content')
    })
  })

  describe('handleExternalChange', () => {
    async function cleanOpen() {
      vi.mocked(OpenFolderDialog).mockResolvedValueOnce('/__tabtest__')
      vi.mocked(ReadDirEntries).mockResolvedValueOnce([])
      const { openFolder } = useFileTree()
      await openFolder()
    }

    it('does nothing when rootPath is empty', async () => {
      const { handleExternalChange } = useFileTree()

      await handleExternalChange()

      expect(ReadDirEntries).not.toHaveBeenCalled()
      expect(ReadFileContent).not.toHaveBeenCalled()
    })

    it('refreshes tree when rootPath is set', async () => {
      await cleanOpen()
      vi.clearAllMocks()
      vi.mocked(ReadDirEntries).mockResolvedValue([])

      const { handleExternalChange } = useFileTree()
      await handleExternalChange()

      expect(ReadDirEntries).toHaveBeenCalledWith('/__tabtest__')
    })

    it('updates editor content when current file changed on disk', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      // selectFile reads 'old' for file a
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('old')
        // refreshTree reads root dir (no files, so no extra ReadFileContent)
        // handleExternalChange reads current file again -> 'new'
        .mockResolvedValueOnce('new')

      const { selectedFilePath, selectedFileContent, selectFile, handleExternalChange, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      expect(selectedFileContent.value).toBe('old')
      expect(mockAdapter.setContent).toHaveBeenCalledWith('old')

      await handleExternalChange()

      expect(selectedFileContent.value).toBe('new')
      expect(mockAdapter.setContent).toHaveBeenCalledWith('new')
    })

    it('does not modify editor when current file is dirty', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('original')
        .mockResolvedValueOnce('disk-changed')

      const { selectedFileContent, selectFile, markDirty, handleExternalChange, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      expect(selectedFileContent.value).toBe('original')

      // Modify content and mark dirty so handleExternalChange skips current file update
      selectedFileContent.value = 'modified'
      markDirty()

      await handleExternalChange()

      // Should still be modified, not disk-changed
      expect(selectedFileContent.value).toBe('modified')
      // setContent should not be called with disk-changed
      expect(mockAdapter.setContent).not.toHaveBeenCalledWith('disk-changed')
    })

    it('does not change editor when disk content equals cache', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('same')
        .mockResolvedValueOnce('same')

      const { selectedFileContent, selectFile, handleExternalChange, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      expect(selectedFileContent.value).toBe('same')
      const callCountAfterSelect = mockAdapter.setContent.mock.calls.length

      await handleExternalChange()

      // Content unchanged, setContent should not be called again
      expect(selectedFileContent.value).toBe('same')
      expect(mockAdapter.setContent.mock.calls.length).toBe(callCountAfterSelect)
    })

    it('clears editor and cache when current file was externally deleted', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content')
        .mockRejectedValueOnce(new Error('file not found'))

      const { selectedFileContent, selectFile, handleExternalChange, setEditorAdapter } = useFileTree()
      const mockAdapter = { setContent: vi.fn(), getContent: vi.fn() }
      setEditorAdapter(mockAdapter)

      await selectFile('/root/a.md')
      expect(selectedFileContent.value).toBe('content')

      await handleExternalChange()

      expect(selectedFileContent.value).toBe('')
      expect(mockAdapter.setContent).toHaveBeenCalledWith('')
    })

    it('invalidates cache for unmodified background tabs', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      // selectFile a -> b -> c: each reads content
      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')

      const { selectFile, switchToTab, handleExternalChange, setEditorAdapter } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      // Now active is c, a and b are background tabs

      // handleExternalChange: refreshTree reads root dir
      vi.mocked(ReadDirEntries).mockResolvedValue([])
      // handleExternalChange reads current file c -> 'new-c'
      vi.mocked(ReadFileContent).mockResolvedValueOnce('new-c')

      await handleExternalChange()

      // Switch back to a: since cache was invalidated, it should read from disk
      vi.mocked(ReadFileContent).mockResolvedValueOnce('fresh-a')
      await switchToTab(0)

      // The fact that ReadFileContent was called for a proves cache was invalidated
      expect(ReadFileContent).toHaveBeenLastCalledWith('/root/a.md')
    })

    it('keeps cache for dirty background tabs', async () => {
      await cleanOpen()
      vi.clearAllMocks()

      vi.mocked(ReadFileContent)
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b')
        .mockResolvedValueOnce('content-c')

      const { selectFile, switchToTab, handleExternalChange, markDirty, setEditorAdapter, selectedFileContent } = useFileTree()
      let editorContent = ''
      setEditorAdapter({
        setContent: vi.fn((c: string) => { editorContent = c }),
        getContent: () => editorContent,
      })

      await selectFile('/root/a.md')
      await selectFile('/root/b.md')
      await selectFile('/root/c.md')
      // Now active is c

      // Switch to b and mark dirty
      await switchToTab(1)
      selectedFileContent.value = 'dirty-b'
      editorContent = 'dirty-b'
      markDirty()

      // Switch back to c
      await switchToTab(2)

      // handleExternalChange
      vi.mocked(ReadDirEntries).mockResolvedValue([])
      vi.mocked(ReadFileContent).mockResolvedValueOnce('new-c')

      await handleExternalChange()

      // Switch back to b: since b is dirty, cache should be preserved
      // No new ReadFileContent call for b expected
      const callCountBeforeSwitch = vi.mocked(ReadFileContent).mock.calls.length
      await switchToTab(1)
      const callCountAfterSwitch = vi.mocked(ReadFileContent).mock.calls.length

      // No additional ReadFileContent call for b
      expect(callCountAfterSwitch).toBe(callCountBeforeSwitch)
      // Content should come from cache, not disk
      expect(editorContent).toBe('dirty-b')
    })
  })
})

import { resolveUniqueFilePath, resolvePasteFilePath, isFileInsideRoot } from '../useFileTree'

describe('isFileInsideRoot', () => {
  it('returns true when file is a direct child of root', () => {
    expect(isFileInsideRoot('/root/file.md', '/root')).toBe(true)
  })

  it('returns true when file is in a subdirectory of root', () => {
    expect(isFileInsideRoot('/root/sub/file.md', '/root')).toBe(true)
  })

  it('handles trailing slash on root', () => {
    expect(isFileInsideRoot('/root/file.md', '/root/')).toBe(true)
  })

  it('returns false when file is outside root', () => {
    expect(isFileInsideRoot('/other/file.md', '/root')).toBe(false)
  })

  it('returns false when root is empty', () => {
    expect(isFileInsideRoot('/anywhere/file.md', '')).toBe(false)
  })

  it('does not match a sibling directory with shared prefix', () => {
    expect(isFileInsideRoot('/root2/file.md', '/root')).toBe(false)
  })

  it('returns false when path equals root exactly', () => {
    expect(isFileInsideRoot('/root', '/root')).toBe(false)
  })
})

describe('resolveUniqueFilePath', () => {
  it('returns original path when no conflict', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const result = await resolveUniqueFilePath('/root', 'file.md', exists)
    expect(result).toBe('/root/file.md')
    expect(exists).toHaveBeenCalledWith('/root/file.md')
  })

  it('appends numeric suffix on conflict', async () => {
    const exists = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const result = await resolveUniqueFilePath('/root', 'file.md', exists)
    expect(result).toBe('/root/file-2.md')
    expect(exists).toHaveBeenNthCalledWith(1, '/root/file.md')
    expect(exists).toHaveBeenNthCalledWith(2, '/root/file-1.md')
    expect(exists).toHaveBeenNthCalledWith(3, '/root/file-2.md')
  })

  it('handles file without extension', async () => {
    const exists = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const result = await resolveUniqueFilePath('/root', 'README', exists)
    expect(result).toBe('/root/README-1')
  })

  it('handles hidden files with extension', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const result = await resolveUniqueFilePath('/root', '.gitignore', exists)
    expect(result).toBe('/root/.gitignore')
  })
})

describe('resolvePasteFilePath', () => {
  it('uses first line filename and returns unique path', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const result = await resolvePasteFilePath('/root', 'notes.md\n# Hello', exists)
    expect(result.path).toBe('/root/notes.md')
    expect(result.content).toBe('notes.md\n# Hello')
  })

  it('sanitizes illegal characters in filename', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const result = await resolvePasteFilePath('/root', 'my<file>.md\ncontent', exists)
    expect(result.path).toBe('/root/my_file_.md')
  })

  it('resolves conflicts with suffix', async () => {
    const exists = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const result = await resolvePasteFilePath('/root', 'data.txt', exists)
    expect(result.path).toBe('/root/data-1.txt')
  })

  it('falls back to pasted.md when no valid filename', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const result = await resolvePasteFilePath('/root', '\n\n', exists)
    expect(result.path).toBe('/root/pasted.md')
  })
})
