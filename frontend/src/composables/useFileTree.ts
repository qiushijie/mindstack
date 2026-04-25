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
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import type { TreeNode } from '../types/file'
import { useSettings } from './useSettings'
import { useEditorState } from './useEditorState'
import { setCurrentFilePath, setFileServerPort } from '../extensions/currentFilePath'

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

  async function saveAppConfig() {
    const config = {
      lastFolderPath: rootPath.value,
      lastFilePath: selectedFilePath.value,
    }
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
          selectedFilePath.value = config.lastFilePath
          selectedFileContent.value = content
          if (editorAdapter) {
            editorAdapter.setContent(content)
          }
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
    rootPath.value = path
    selectedFilePath.value = ''
    selectedFileContent.value = ''
    isDirty.value = false

    await SetWorkspaceRoot(path)
    const entries = await ReadDirEntries(path)
    treeData.value = entriesToNodes(entries)
    await saveAppConfig()
  }

  async function openFile() {
    const path = await OpenFileDialog()
    if (!path) return

    if (!rootPath.value) {
      const dir = path.substring(0, path.lastIndexOf('/'))
      rootPath.value = dir
      await SetWorkspaceRoot(dir)
    }

    const content = await ReadFileContent(path)
    selectedFilePath.value = path
    selectedFileContent.value = content
    isDirty.value = false

    if (editorAdapter) {
      editorAdapter.setContent(content)
    }
    await saveAppConfig()
  }

  function clearAutoSaveTimer() {
    if (autoSaveTimer !== null) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  async function selectFile(path: string) {
    if (path === selectedFilePath.value) return

    clearAutoSaveTimer()
    const content = await ReadFileContent(path)
    selectedFilePath.value = path
    selectedFileContent.value = content
    isDirty.value = false

    if (editorAdapter) {
      editorAdapter.setContent(content)
    }
    await saveAppConfig()
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
    restoreSession,
  }
}
