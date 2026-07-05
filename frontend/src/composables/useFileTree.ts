import { ref, computed, watch, nextTick } from 'vue'
import {
  OpenFolderDialog,
  OpenFileDialog,
  ReadDirEntries,
  ReadFileContent,
  SaveFileContent,
  SaveFileDialog,
  LoadConfig,
  SaveConfig,
  SetWorkspaceRoot,
  GetFileServerPort,
  AddRecentEntry,
  FileExists,
  ClipboardGetText,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import type { TreeNode } from '../types/file'
import { useSettings } from './useSettings'
import { t } from '../i18n'
import { useEditorState, focusEditor } from './useEditorState'
import { setCurrentFilePath, setFileServerPort } from '../extensions/currentFilePath'
import type { EditorAdapter } from '../editor/EditorAdapter'
import { useTabs, isPageTab, isUntitledPath, nextUntitledPath, openPageTab, closeTabByPath, closeTabsUnderDir } from './useTabs'
import { useNavigation, type PageName } from './useNavigation'
import { useConfirmDialog } from './useConfirmDialog'

export async function resolveUniqueFilePath(
  dirPath: string,
  fileName: string,
  fileExists: (path: string) => Promise<boolean>
): Promise<string> {
  const dotIndex = fileName.lastIndexOf('.')
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  let targetName = fileName
  let targetPath = dirPath + '/' + targetName
  let counter = 1
  while (await fileExists(targetPath)) {
    targetName = base + '-' + counter + ext
    targetPath = dirPath + '/' + targetName
    counter++
  }
  return targetPath
}

export async function resolvePasteFilePath(
  dirPath: string,
  clipboardText: string,
  fileExists: (path: string) => Promise<boolean>
): Promise<{ path: string; content: string }> {
  const fileName = clipboardText.trim().split('\n')[0].split('/').pop() || `${t('file.pastedFileName')}.md`
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const [nameBase, nameExt] = (() => {
    const idx = safeName.lastIndexOf('.')
    return idx > 0 ? [safeName.slice(0, idx), safeName.slice(idx)] : [safeName, '']
  })()

  let filePath = dirPath + '/' + safeName
  let counter = 1
  while (await fileExists(filePath)) {
    filePath = dirPath + '/' + nameBase + '-' + counter + nameExt
    counter++
  }

  return { path: filePath, content: clipboardText }
}

export async function pasteToDirectory(targetDir: string): Promise<boolean> {
  // Priority: duplicate internally copied file
  if (copiedFilePath.value) {
    const content = await ReadFileContent(copiedFilePath.value)
    const sourceName = copiedFilePath.value.split('/').pop() || 'file.md'
    const targetPath = await resolveUniqueFilePath(targetDir, sourceName, FileExists)
    await SaveFileContent(targetPath, content)
    return true
  }

  // Fallback: create a new file from system clipboard text
  const text = await ClipboardGetText()
  if (!text) return false

  const { path: filePath, content } = await resolvePasteFilePath(targetDir, text, FileExists)
  await SaveFileContent(filePath, content)
  return true
}

export const copiedFilePath = ref('')

const rootPath = ref('')
const treeData = ref<TreeNode[]>([])
const selectedFilePath = ref('')
const selectedFileContent = ref('')
const isDirty = ref(false)
let editorAdapter: EditorAdapter | null = null
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let suppressDirtyMark = false

const { tabs, activeTabIndex, openTab, closeTab, switchTab, clearTabs } = useTabs()
const tabContentCache = new Map<string, string>()
const dirtyTabs = ref<string[]>([])

function clearAutoSaveTimer() {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

async function confirmAndSaveDirtyTabs(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  // Skip untitled paths — they cannot be saved to disk without a dialog
  const realPaths = paths.filter(p => !isUntitledPath(p))
  if (realPaths.length === 0) return
  const { confirm } = useConfirmDialog()
  const shouldSave = await confirm({
    title: t('editor.confirmUnsaved.title'),
    message: t('editor.confirmUnsaved.message'),
    confirmText: t('editor.confirmUnsaved.save'),
    cancelText: t('editor.confirmUnsaved.discard'),
  })
  if (shouldSave) {
    for (const path of realPaths) {
      const content = tabContentCache.get(path)
      if (content !== undefined) {
        await SaveFileContent(path, content)
      }
    }
  }
}

function entriesToNodes(entries: main.FileEntry[] | null | undefined): TreeNode[] {
  if (!entries) return []
  return entries.map(e => ({
    name: e.name,
    path: e.path,
    isDir: e.isDir,
    expanded: false,
    children: [],
  }))
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.isDir) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

export function isFileInsideRoot(filePath: string, root: string): boolean {
  if (!root) return false
  const normalizedRoot = root.replace(/\/$/, '')
  return filePath.startsWith(normalizedRoot + '/')
}

async function syncRootToFile(filePath: string) {
  if (isFileInsideRoot(filePath, rootPath.value)) return
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  if (!dir) return
  rootPath.value = dir
  await SetWorkspaceRoot(dir)
  const entries = await ReadDirEntries(dir)
  treeData.value = entriesToNodes(entries)
  AddRecentEntry(dir, true)
}

if (import.meta.env.DEV) {
  ;(window as any).__setTestWorkspace = async (path: string, nodes: TreeNode[]) => {
    try {
      await SetWorkspaceRoot(path)
    } catch (err) {
      // Wails bindings may be unavailable when Playwright connects to Vite dev server directly
      console.warn('[FileTree] SetWorkspaceRoot failed:', err)
    }
    rootPath.value = path
    treeData.value = nodes
  }
  ;(window as any).__resetFileTreeState = () => {
    clearAutoSaveTimer()
    clearTabs()
    tabContentCache.clear()
    dirtyTabs.value = []
    rootPath.value = ''
    treeData.value = []
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false
    if (editorAdapter) {
      editorAdapter.setContent('')
    }
  }
  ;(window as any).__setCopiedFilePath = (path: string) => {
    copiedFilePath.value = path
  }
}

export function useFileTree() {
  const { autoSave, autoSaveDelay } = useSettings()
  const { editorView: sharedView } = useEditorState()
  const { navigateTo } = useNavigation()

  const folderName = computed(() => {
    if (!rootPath.value) return 'MindStack'
    const parts = rootPath.value.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || 'MindStack'
  })

  function setEditorAdapter(adapter: EditorAdapter) {
    editorAdapter = adapter
  }

  function clearEditorAdapter() {
    editorAdapter = null
  }

  function saveCurrentToCache() {
    if (selectedFilePath.value && editorAdapter) {
      tabContentCache.set(selectedFilePath.value, editorAdapter.getContent())
    }
  }

  async function loadTabContent(path: string): Promise<string> {
    const cached = tabContentCache.get(path)
    if (cached !== undefined) return cached
    if (isUntitledPath(path)) return ''
    return await ReadFileContent(path)
  }

  function applyContent(path: string, content: string) {
    selectedFilePath.value = path
    selectedFileContent.value = content
    isDirty.value = dirtyTabs.value.includes(path)
    if (editorAdapter) {
      suppressDirtyMark = true
      editorAdapter.setContent(content)
      suppressDirtyMark = false
    }
  }

  async function saveAppConfig() {
    try {
      const raw = await LoadConfig()
      const config = JSON.parse(raw || '{}')
      config.lastFolderPath = rootPath.value
      config.lastFilePath = isUntitledPath(selectedFilePath.value) ? '' : selectedFilePath.value
      await SaveConfig(JSON.stringify(config))
    } catch (err) {
      // Wails bindings unavailable (e.g. dev mode without Go backend)
      console.warn('[FileTree] Save config failed:', err)
    }
  }

  async function restoreSession() {
    try {
      const port = await GetFileServerPort()
      setFileServerPort(port)
      const raw = await LoadConfig()
      const config = JSON.parse(raw || '{}')
      if (config.lastFolderPath) {
        rootPath.value = config.lastFolderPath
        await SetWorkspaceRoot(config.lastFolderPath)
        const entries = await ReadDirEntries(config.lastFolderPath)
        treeData.value = entriesToNodes(entries)

        if (config.lastFilePath) {
          const content = await ReadFileContent(config.lastFilePath)
          openTab(config.lastFilePath)
          tabContentCache.set(config.lastFilePath, content)
          applyContent(config.lastFilePath, content)
          navigateTo('editor')
        }
      }
    } catch (err) {
      console.warn('[FileTree] Restore state failed:', err)
    }
  }

  async function openFolder() {
    const path = await OpenFolderDialog()
    if (!path) return

    clearAutoSaveTimer()
    clearTabs()
    tabContentCache.clear()
    dirtyTabs.value = []
    rootPath.value = path
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false

    await SetWorkspaceRoot(path)
    const entries = await ReadDirEntries(path)
    treeData.value = entriesToNodes(entries)
    await saveAppConfig()
    AddRecentEntry(path, true)
    navigateTo('editor')
  }

  async function openFile() {
    const path = await OpenFileDialog()
    if (!path) return

    clearAutoSaveTimer()
    saveCurrentToCache()
    await syncRootToFile(path)

    const content = await ReadFileContent(path)
    openTab(path)
    tabContentCache.set(path, content)
    applyContent(path, content)
    navigateTo('editor')
    await saveAppConfig()
    AddRecentEntry(path, false)
  }

  async function selectFile(path: string) {
    if (path === selectedFilePath.value) return

    clearAutoSaveTimer()
    saveCurrentToCache()

    const { isNew } = openTab(path)
    let content = ''
    try {
      content = await loadTabContent(path)
    } catch (err) {
      // Wails bindings (ReadFileContent) unavailable in dev mode.
      // Open the tab with empty content so file selection still works.
      console.warn('[FileTree] Load tab content failed:', err)
    }
    if (isNew) {
      tabContentCache.set(path, content)
    }
    applyContent(path, content)
    navigateTo('editor')
    await saveAppConfig()
    AddRecentEntry(path, false)
  }

  async function toggleDir(path: string) {
    const node = findNode(treeData.value, path)
    if (!node || !node.isDir) return

    if (node.expanded) {
      node.expanded = false
      node.children = []
    } else {
      const entries = await ReadDirEntries(path)
      node.children = entriesToNodes(entries)
      node.expanded = true
    }
  }

  async function saveCurrentFile() {
    if (!selectedFilePath.value) return

    clearAutoSaveTimer()
    const content = editorAdapter ? editorAdapter.getContent() : selectedFileContent.value

    // Handle untitled files — prompt for save location
    if (isUntitledPath(selectedFilePath.value)) {
      const defaultName = 'untitled.md'
      const savePath = await SaveFileDialog(defaultName)
      if (!savePath) return

      const err = await SaveFileContent(savePath, content)
      if (!err) {
        // Update tab path from untitled to the real file path
        const oldPath = selectedFilePath.value
        const tab = tabs.value.find(t => t.path === oldPath)
        if (tab) {
          const filename = savePath.split('/').pop() || 'Untitled'
          tab.path = savePath
          tab.title = filename.lastIndexOf('.') > 0 ? filename.substring(0, filename.lastIndexOf('.')) : filename
        }

        selectedFilePath.value = savePath
        isDirty.value = false
        dirtyTabs.value = dirtyTabs.value.filter(p => p !== oldPath)
        tabContentCache.delete(oldPath)
        tabContentCache.set(savePath, content)

        // Refresh file tree and navigate
        await refreshTree()
        await saveAppConfig()
        AddRecentEntry(savePath, false)
      }
      return
    }

    const err = await SaveFileContent(selectedFilePath.value, content)
    if (!err) {
      isDirty.value = false
      dirtyTabs.value = dirtyTabs.value.filter(p => p !== selectedFilePath.value)
      tabContentCache.set(selectedFilePath.value, content)
    }
  }

  function newFile() {
    clearAutoSaveTimer()
    saveCurrentToCache()

    const untitledPath = nextUntitledPath()
    openTab(untitledPath)

    selectedFilePath.value = untitledPath
    selectedFileContent.value = ''
    isDirty.value = false
    if (editorAdapter) {
      suppressDirtyMark = true
      editorAdapter.setContent('')
      suppressDirtyMark = false
    }
    navigateTo('editor')
    nextTick(focusEditor)
  }

  function markDirty() {
    if (suppressDirtyMark) return

    const path = selectedFilePath.value

    if (path) {
      const savedContent = tabContentCache.get(path)
      if (savedContent !== undefined && selectedFileContent.value === savedContent) {
        isDirty.value = false
        dirtyTabs.value = dirtyTabs.value.filter(p => p !== path)
        return
      }
    }

    isDirty.value = true
    if (path) {
      if (!dirtyTabs.value.includes(path)) {
        dirtyTabs.value.push(path)
      }
    }

    // Auto-save only for files with a real path on disk
    if (autoSave.value && path && !isUntitledPath(path)) {
      clearAutoSaveTimer()
      autoSaveTimer = setTimeout(() => {
        saveCurrentFile().catch(err => console.warn('auto-save failed:', err))
      }, autoSaveDelay.value * 1000)
    }
  }

  // Recursively merges new tree nodes into old ones, preserving expanded state
  // and refreshing children of expanded directories from disk.
  async function mergePreserveExpanded(
    oldNodes: TreeNode[],
    newNodes: TreeNode[],
  ): Promise<TreeNode[]> {
    const oldMap = new Map<string, TreeNode>()
    for (const n of oldNodes) {
      if (n.isDir) oldMap.set(n.path, n)
    }
    const result: TreeNode[] = []
    for (const node of newNodes) {
      if (!node.isDir) {
        result.push(node)
        continue
      }
      const old = oldMap.get(node.path)
      if (!old || !old.expanded) {
        result.push(node)
        continue
      }
      const entries = await ReadDirEntries(node.path)
      const freshChildren = entriesToNodes(entries)
      node.children = await mergePreserveExpanded(old.children, freshChildren)
      node.expanded = true
      result.push(node)
    }
    return result
  }

  async function refreshTree() {
    if (!rootPath.value) return
    const oldTree = treeData.value
    const entries = await ReadDirEntries(rootPath.value)
    treeData.value = await mergePreserveExpanded(oldTree, entriesToNodes(entries))
  }

  async function refreshDir(path: string) {
    const node = findNode(treeData.value, path)
    if (!node || !node.isDir || !node.expanded) return
    const entries = await ReadDirEntries(path)
    node.children = await mergePreserveExpanded(node.children, entriesToNodes(entries))
  }

  async function handleExternalChange() {
    if (!rootPath.value) return
    await refreshTree()

    const currentPath = selectedFilePath.value

    // Invalidate cache for unmodified background tabs so they reload from disk on switch
    for (const tab of tabs.value) {
      if (isPageTab(tab.path)) continue
      if (isUntitledPath(tab.path)) continue
      if (tab.path === currentPath) continue
      if (dirtyTabs.value.includes(tab.path)) continue
      tabContentCache.delete(tab.path)
    }

    if (currentPath && !isUntitledPath(currentPath) && !isDirty.value) {
      try {
        const diskContent = await ReadFileContent(currentPath)
        const cached = tabContentCache.get(currentPath)
        if (diskContent !== cached) {
          tabContentCache.set(currentPath, diskContent)
          applyContent(currentPath, diskContent)
        }
      } catch (err) {
        console.warn('[FileTree] Reload disk content failed:', err)
        tabContentCache.set(currentPath, '')
        applyContent(currentPath, '')
      }
    }
  }

  async function openRecentFolder(path: string) {
    clearAutoSaveTimer()
    clearTabs()
    tabContentCache.clear()
    dirtyTabs.value = []
    rootPath.value = path
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false

    await SetWorkspaceRoot(path)
    const entries = await ReadDirEntries(path)
    treeData.value = entriesToNodes(entries)
    await saveAppConfig()
    AddRecentEntry(path, true)
    navigateTo('editor')
  }

  async function openRecentFile(path: string) {
    clearAutoSaveTimer()
    saveCurrentToCache()

    await syncRootToFile(path)

    const { isNew } = openTab(path)
    const content = await loadTabContent(path)
    if (isNew) {
      tabContentCache.set(path, content)
    }
    applyContent(path, content)
    navigateTo('editor')
    await saveAppConfig()
    AddRecentEntry(path, false)
  }

  async function switchToTab(index: number) {
    if (index === activeTabIndex.value) return

    clearAutoSaveTimer()
    saveCurrentToCache()

    switchTab(index)

    const tab = tabs.value[index]
    if (isPageTab(tab.path)) {
      navigateTo(tab.path as PageName)
      return
    }

    const newPath = tab.path
    const content = await loadTabContent(newPath)
    applyContent(newPath, content)
    navigateTo('editor')
    await saveAppConfig()
  }

  async function closeFileTab(index: number) {
    clearAutoSaveTimer()

    const path = tabs.value[index].path

    if (!isPageTab(path) && dirtyTabs.value.includes(path)) {
      if (index === activeTabIndex.value) {
        saveCurrentToCache()
      }
      await confirmAndSaveDirtyTabs([path])
    } else if (index === activeTabIndex.value) {
      saveCurrentToCache()
    }

    if (!isPageTab(path)) {
      tabContentCache.delete(path)
      dirtyTabs.value = dirtyTabs.value.filter(p => p !== path)
    }

    const newPath = closeTab(index)

    if (newPath) {
      if (isPageTab(newPath)) {
        navigateTo(newPath as PageName)
      } else {
        const content = await loadTabContent(newPath)
        applyContent(newPath, content)
        navigateTo('editor')
      }
    } else {
      selectedFilePath.value = ''
      selectedFileContent.value = ''
      isDirty.value = false
      if (editorAdapter) {
        editorAdapter.setContent('')
      }
      navigateTo('editor')
    }

    await saveAppConfig()
  }

  async function closeOtherTabs(index: number) {
    clearAutoSaveTimer()
    saveCurrentToCache()

    const keepPath = tabs.value[index].path

    // Collect dirty file tabs to be closed
    const dirtyToClose: string[] = []
    for (const tab of tabs.value) {
      if (tab.path !== keepPath && !isPageTab(tab.path) && dirtyTabs.value.includes(tab.path)) {
        dirtyToClose.push(tab.path)
      }
    }

    await confirmAndSaveDirtyTabs(dirtyToClose)

    const keepTab = tabs.value[index]
    const { title: keepTitle } = keepTab

    for (const tab of tabs.value) {
      if (tab.path !== keepPath && !isPageTab(tab.path)) {
        tabContentCache.delete(tab.path)
        dirtyTabs.value = dirtyTabs.value.filter(p => p !== tab.path)
      }
    }

    clearTabs()

    if (!isPageTab(keepPath)) {
      openTab(keepPath)
      const content = await loadTabContent(keepPath)
      applyContent(keepPath, content)
      navigateTo('editor')
    } else {
      openPageTab(keepPath as PageName, keepTitle)
      navigateTo(keepPath as PageName)
    }

    await saveAppConfig()
  }

  async function closeAllTabs() {
    clearAutoSaveTimer()
    saveCurrentToCache()

    // Collect dirty file tabs to be closed
    const dirtyToClose: string[] = []
    for (const tab of tabs.value) {
      if (!isPageTab(tab.path) && dirtyTabs.value.includes(tab.path)) {
        dirtyToClose.push(tab.path)
      }
    }

    await confirmAndSaveDirtyTabs(dirtyToClose)

    for (const tab of tabs.value) {
      if (!isPageTab(tab.path)) {
        tabContentCache.delete(tab.path)
        dirtyTabs.value = dirtyTabs.value.filter(p => p !== tab.path)
      }
    }

    clearTabs()

    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false
    if (editorAdapter) {
      editorAdapter.setContent('')
    }
    navigateTo('editor')

    await saveAppConfig()
  }

  async function closeTabsForDeletedPath(path: string, isDir: boolean) {
    clearAutoSaveTimer()
    saveCurrentToCache()

    const removed = isDir
      ? tabs.value.filter(t => t.path === path || t.path.startsWith(path + '/'))
      : tabs.value.filter(t => t.path === path)

    for (const tab of removed) {
      if (!isPageTab(tab.path)) {
        tabContentCache.delete(tab.path)
        dirtyTabs.value = dirtyTabs.value.filter(p => p !== tab.path)
      }
    }

    if (isDir) {
      closeTabsUnderDir(path)
    } else {
      closeTabByPath(path)
    }

    if (tabs.value.length === 0) {
      selectedFilePath.value = ''
      selectedFileContent.value = ''
      isDirty.value = false
      if (editorAdapter) editorAdapter.setContent('')
    } else if (!tabs.value.find(t => t.path === selectedFilePath.value)) {
      const nextTab = tabs.value[activeTabIndex.value]
      if (nextTab && !isPageTab(nextTab.path)) {
        const content = await loadTabContent(nextTab.path)
        applyContent(nextTab.path, content)
      }
    }

    await saveAppConfig()
  }

  watch(selectedFilePath, (newPath) => {
    const view = sharedView.value
    if (view) {
      const effectivePath = isUntitledPath(newPath) ? '' : newPath
      view.dispatch({ effects: setCurrentFilePath.of(effectivePath) })
    }
  }, { flush: 'sync' })

  return {
    rootPath,
    treeData,
    selectedFilePath,
    selectedFileContent,
    isDirty,
    dirtyTabs,
    folderName,
    setEditorAdapter,
    clearEditorAdapter,
    openFolder,
    openFile,
    selectFile,
    toggleDir,
    saveCurrentFile,
    newFile,
    markDirty,
    refreshTree,
    refreshDir,
    handleExternalChange,
    restoreSession,
    openRecentFolder,
    openRecentFile,
    switchToTab,
    closeFileTab,
    closeOtherTabs,
    closeAllTabs,
    closeTabsForDeletedPath,
  }
}
