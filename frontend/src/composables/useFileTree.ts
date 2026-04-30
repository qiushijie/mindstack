import { ref, computed, watch } from 'vue'
import {
  OpenFolderDialog,
  OpenFileDialog,
  ReadDirEntries,
  ReadFileContent,
  SaveFileContent,
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
import { useEditorState } from './useEditorState'
import { setCurrentFilePath, setFileServerPort } from '../extensions/currentFilePath'
import { useTabs } from './useTabs'

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

export interface EditorAdapter {
  setContent(content: string): void
  getContent(): string
}

const rootPath = ref('')
const treeData = ref<TreeNode[]>([])
const selectedFilePath = ref('')
const selectedFileContent = ref('')
const isDirty = ref(false)
let editorAdapter: EditorAdapter | null = null
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const { tabs, activeTabIndex, openTab, closeTab, switchTab, clearTabs } = useTabs()
const tabContentCache = new Map<string, string>()
const dirtyTabs = new Set<string>()

function clearAutoSaveTimer() {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
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

if (import.meta.env.DEV) {
  ;(window as any).__setTestWorkspace = (path: string, nodes: TreeNode[]) => {
    rootPath.value = path
    treeData.value = nodes
  }
  ;(window as any).__resetFileTreeState = () => {
    clearAutoSaveTimer()
    rootPath.value = ''
    treeData.value = []
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false
    if (editorAdapter) {
      editorAdapter.setContent('')
    }
  }
}

export function useFileTree() {
  const { autoSave, autoSaveDelay } = useSettings()
  const { editorView: sharedView } = useEditorState()

  const folderName = computed(() => {
    if (!rootPath.value) return 'MindStack'
    const parts = rootPath.value.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || 'MindStack'
  })

  function setEditorAdapter(adapter: EditorAdapter) {
    editorAdapter = adapter
  }

  function saveCurrentToCache() {
    if (selectedFilePath.value && editorAdapter) {
      tabContentCache.set(selectedFilePath.value, editorAdapter.getContent())
    }
  }

  async function loadTabContent(path: string): Promise<string> {
    const cached = tabContentCache.get(path)
    return cached !== undefined ? cached : await ReadFileContent(path)
  }

  function applyContent(path: string, content: string) {
    selectedFilePath.value = path
    selectedFileContent.value = content
    isDirty.value = dirtyTabs.has(path)
    if (editorAdapter) {
      editorAdapter.setContent(content)
    }
  }

  async function saveAppConfig() {
    const raw = await LoadConfig()
    const config = JSON.parse(raw || '{}')
    config.lastFolderPath = rootPath.value
    config.lastFilePath = selectedFilePath.value
    await SaveConfig(JSON.stringify(config))
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
        }
      }
    } catch {
      // ignore restore errors
    }
  }

  async function openFolder() {
    const path = await OpenFolderDialog()
    if (!path) return

    clearAutoSaveTimer()
    clearTabs()
    tabContentCache.clear()
    dirtyTabs.clear()
    rootPath.value = path
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false

    await SetWorkspaceRoot(path)
    const entries = await ReadDirEntries(path)
    treeData.value = entriesToNodes(entries)
    await saveAppConfig()
    AddRecentEntry(path, true)
  }

  async function openFile() {
    const path = await OpenFileDialog()
    if (!path) return

    if (!rootPath.value) {
      const dir = path.substring(0, path.lastIndexOf('/'))
      rootPath.value = dir
      await SetWorkspaceRoot(dir)
    }

    saveCurrentToCache()
    const content = await ReadFileContent(path)
    openTab(path)
    tabContentCache.set(path, content)
    applyContent(path, content)
    await saveAppConfig()
    AddRecentEntry(path, false)
  }

  async function selectFile(path: string) {
    if (path === selectedFilePath.value) return

    clearAutoSaveTimer()
    saveCurrentToCache()

    const { isNew } = openTab(path)
    const content = await loadTabContent(path)
    if (isNew) {
      tabContentCache.set(path, content)
    }
    applyContent(path, content)
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
    const err = await SaveFileContent(selectedFilePath.value, content)
    if (!err) {
      isDirty.value = false
      dirtyTabs.delete(selectedFilePath.value)
      tabContentCache.set(selectedFilePath.value, content)
    }
  }

  function newFile() {
    clearAutoSaveTimer()
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false
    if (editorAdapter) {
      editorAdapter.setContent('')
    }
  }

  function markDirty() {
    isDirty.value = true
    if (selectedFilePath.value) {
      dirtyTabs.add(selectedFilePath.value)
    }

    if (autoSave.value && selectedFilePath.value) {
      clearAutoSaveTimer()
      autoSaveTimer = setTimeout(() => {
        saveCurrentFile()
      }, autoSaveDelay.value * 1000)
    }
  }

  async function refreshTree() {
    if (!rootPath.value) return
    const entries = await ReadDirEntries(rootPath.value)
    treeData.value = entriesToNodes(entries)
  }

  async function refreshDir(path: string) {
    const node = findNode(treeData.value, path)
    if (!node || !node.isDir || !node.expanded) return
    const entries = await ReadDirEntries(path)
    node.children = entriesToNodes(entries)
  }

  async function openRecentFolder(path: string) {
    clearAutoSaveTimer()
    clearTabs()
    tabContentCache.clear()
    dirtyTabs.clear()
    rootPath.value = path
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false

    await SetWorkspaceRoot(path)
    const entries = await ReadDirEntries(path)
    treeData.value = entriesToNodes(entries)
    await saveAppConfig()
    AddRecentEntry(path, true)
  }

  async function openRecentFile(path: string) {
    clearAutoSaveTimer()
    saveCurrentToCache()

    const { isNew } = openTab(path)
    const content = await loadTabContent(path)
    if (isNew) {
      tabContentCache.set(path, content)
    }
    applyContent(path, content)
    await saveAppConfig()
    AddRecentEntry(path, false)
  }

  async function switchToTab(index: number) {
    if (index === activeTabIndex.value) return

    clearAutoSaveTimer()
    saveCurrentToCache()

    switchTab(index)

    const newPath = tabs.value[index].path
    const content = await loadTabContent(newPath)
    applyContent(newPath, content)
    await saveAppConfig()
  }

  async function closeFileTab(index: number) {
    clearAutoSaveTimer()

    if (index === activeTabIndex.value) {
      saveCurrentToCache()
    }

    const path = tabs.value[index].path
    tabContentCache.delete(path)
    dirtyTabs.delete(path)

    const newPath = closeTab(index)

    if (newPath) {
      const content = await loadTabContent(newPath)
      applyContent(newPath, content)
    } else {
      selectedFilePath.value = ''
      selectedFileContent.value = ''
      isDirty.value = false
      if (editorAdapter) {
        editorAdapter.setContent('')
      }
    }

    await saveAppConfig()
  }

  watch(selectedFilePath, (newPath) => {
    const view = sharedView.value
    if (view) {
      view.dispatch({ effects: setCurrentFilePath.of(newPath) })
    }
  }, { flush: 'sync' })

  return {
    rootPath,
    treeData,
    selectedFilePath,
    selectedFileContent,
    isDirty,
    folderName,
    setEditorAdapter,
    openFolder,
    openFile,
    selectFile,
    toggleDir,
    saveCurrentFile,
    newFile,
    markDirty,
    refreshTree,
    refreshDir,
    restoreSession,
    openRecentFolder,
    openRecentFile,
    switchToTab,
    closeFileTab,
  }
}
