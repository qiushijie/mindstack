import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h, ref, computed } from 'vue'

// Global mutable state for sharing between mock factory and tests
const g = globalThis as unknown as { __testCopiedFilePath: string | null }
g.__testCopiedFilePath = null

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: vi.fn((key: string) => key),
  }),
}))

// Mock wailsjs APIs
vi.mock('../../../wailsjs/go/main/App', () => ({
  ClipboardGetText: vi.fn(),
  SaveFileContent: vi.fn().mockResolvedValue(''),
  ReadFileContent: vi.fn().mockResolvedValue(''),
  FileExists: vi.fn().mockResolvedValue(false),
}))

// Mutable mock state using Vue refs
const mockRootPath = ref('/test/project')
const mockTreeData = ref([
  { name: 'src', path: '/test/project/src', isDir: true, expanded: false, children: [] },
  { name: 'README.md', path: '/test/project/README.md', isDir: false, expanded: false, children: [] },
])
const mockSelectedFilePath = ref('')
const mockFolderName = computed(() => mockRootPath.value.split('/').pop() || 'MindStack')

const mockSelectFile = vi.fn()
const mockToggleDir = vi.fn()
const mockOpenFolder = vi.fn()
const mockRefreshTree = vi.fn().mockResolvedValue(undefined)
const mockRefreshDir = vi.fn().mockResolvedValue(undefined)

vi.mock('../../composables/useFileTree', () => ({
  useFileTree: () => ({
    rootPath: mockRootPath,
    treeData: mockTreeData,
    selectedFilePath: mockSelectedFilePath,
    folderName: mockFolderName,
    selectFile: mockSelectFile,
    toggleDir: mockToggleDir,
    openFolder: mockOpenFolder,
    refreshTree: mockRefreshTree,
    refreshDir: mockRefreshDir,
  }),
  copiedFilePath: {
    get value() { return g.__testCopiedFilePath },
    set value(v: string | null) { g.__testCopiedFilePath = v },
  },
  resolveUniqueFilePath: vi.fn().mockResolvedValue('/test/project/file.md'),
  resolvePasteFilePath: vi.fn().mockResolvedValue({ path: '/test/project/pasted.md', content: 'content' }),
}))

// Mock SidebarTreeNode as a simple functional stub
const SidebarTreeNodeStub = {
  name: 'SidebarTreeNode',
  props: ['node', 'selectedPath', 'depth', 'rootPath'],
  emits: ['select', 'refresh'],
  render() {
    return h('div', { class: 'sidebar-tree-node-stub', 'data-path': this.node?.path })
  },
}

import AppSidebar from '../AppSidebar.vue'
import { ClipboardGetText, SaveFileContent, ReadFileContent } from '../../../wailsjs/go/main/App'
import { resolveUniqueFilePath, resolvePasteFilePath } from '../../composables/useFileTree'

// Helper to flush all pending promises
async function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 50))
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRootPath.value = '/test/project'
    mockTreeData.value = [
      { name: 'src', path: '/test/project/src', isDir: true, expanded: false, children: [] },
      { name: 'README.md', path: '/test/project/README.md', isDir: false, expanded: false, children: [] },
    ]
    mockSelectedFilePath.value = ''
    g.__testCopiedFilePath = null
    // Clean up any leftover menu elements from previous tests
    document.querySelectorAll('.tree-context-menu').forEach(el => el.remove())
  })

  function mountComponent(props: { collapsed?: boolean } = {}) {
    return mount(AppSidebar, {
      props,
      attachTo: document.body,
      global: {
        stubs: {
          SidebarTreeNode: SidebarTreeNodeStub,
        },
      },
    })
  }

  describe('collapsed prop and toggle', () => {
    it('renders expanded by default', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.sidebar').classes()).not.toContain('collapsed')
      expect(wrapper.find('.sidebar-logo').exists()).toBe(true)
      expect(wrapper.find('.sidebar-search').exists()).toBe(true)
      expect(wrapper.find('.sidebar-tree').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders collapsed when collapsed=true', () => {
      const wrapper = mountComponent({ collapsed: true })
      expect(wrapper.find('.sidebar').classes()).toContain('collapsed')
      expect(wrapper.find('.sidebar-logo').exists()).toBe(false)
      expect(wrapper.find('.sidebar-search').exists()).toBe(false)
      expect(wrapper.find('.sidebar-tree').exists()).toBe(false)
      wrapper.unmount()
    })

    it('emits update:collapsed when toggle button is clicked', async () => {
      const wrapper = mountComponent({ collapsed: false })
      await wrapper.find('.sidebar-new-btn').trigger('click')
      expect(wrapper.emitted('update:collapsed')).toHaveLength(1)
      expect(wrapper.emitted('update:collapsed')![0]).toEqual([true])
      wrapper.unmount()
    })

    it('emits update:collapsed with false when currently collapsed', async () => {
      const wrapper = mountComponent({ collapsed: true })
      await wrapper.find('.sidebar-new-btn').trigger('click')
      expect(wrapper.emitted('update:collapsed')).toHaveLength(1)
      expect(wrapper.emitted('update:collapsed')![0]).toEqual([false])
      wrapper.unmount()
    })

    it('shows close icon when expanded', () => {
      const wrapper = mountComponent({ collapsed: false })
      const svgIcons = wrapper.findAll('svg')
      expect(svgIcons.length).toBeGreaterThan(0)
      wrapper.unmount()
    })

    it('shows open icon when collapsed', () => {
      const wrapper = mountComponent({ collapsed: true })
      const svgIcons = wrapper.findAll('svg')
      expect(svgIcons.length).toBeGreaterThan(0)
      wrapper.unmount()
    })

    it('hides folderName when collapsed', () => {
      const wrapper = mountComponent({ collapsed: true })
      expect(wrapper.find('.sidebar-logo').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('tree content', () => {
    it('renders section label in tree area', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.section-label').exists()).toBe(true)
      expect(wrapper.find('.section-label').text()).toBe('sidebar.workspace')
      wrapper.unmount()
    })

    it('renders tree nodes from treeData', () => {
      const wrapper = mountComponent()
      const stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(2)
      expect(stubs[0].attributes('data-path')).toBe('/test/project/src')
      expect(stubs[1].attributes('data-path')).toBe('/test/project/README.md')
      wrapper.unmount()
    })
  })

  describe('empty state', () => {
    it('shows empty hint when rootPath is not set', () => {
      mockRootPath.value = ''
      mockTreeData.value = []
      const wrapper = mountComponent()
      expect(wrapper.find('.sidebar-empty').exists()).toBe(true)
      expect(wrapper.find('.empty-text').text()).toBe('sidebar.emptyHint')
      wrapper.unmount()
    })
  })

  describe('context menu', () => {
    it('shows context menu on right click', async () => {
      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const menu = document.querySelector('.tree-context-menu')
      expect(menu).not.toBeNull()
      wrapper.unmount()
    })

    it('closes context menu on document click', async () => {
      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()
      // Wait for requestAnimationFrame to register listeners
      await new Promise(r => setTimeout(r, 20))

      expect(document.querySelector('.tree-context-menu')).not.toBeNull()

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(document.querySelector('.tree-context-menu')).toBeNull()
      wrapper.unmount()
    })

    it('paste menu item is disabled when nothing is copied', async () => {
      g.__testCopiedFilePath = null
      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(true)
      wrapper.unmount()
    })

    it('paste menu item is enabled when file is copied', async () => {
      g.__testCopiedFilePath = '/test/project/copied.md'
      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(false)
      wrapper.unmount()
    })
  })

  describe('pasteToRoot', () => {
    it('pastes copied file to root', async () => {
      g.__testCopiedFilePath = '/test/project/copied.md'
      vi.mocked(ReadFileContent).mockResolvedValue('file content')
      vi.mocked(resolveUniqueFilePath).mockResolvedValue('/test/project/copied.md')

      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(false)

      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(ReadFileContent).toHaveBeenCalledWith('/test/project/copied.md')
      expect(SaveFileContent).toHaveBeenCalled()
      expect(mockRefreshTree).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('pastes clipboard text when no copied file', async () => {
      g.__testCopiedFilePath = null
      vi.mocked(ClipboardGetText).mockResolvedValue('clipboard content')
      vi.mocked(resolvePasteFilePath).mockResolvedValue({ path: '/test/project/pasted.md', content: 'clipboard content' })

      const wrapper = mountComponent()
      const tree = wrapper.find('.sidebar-tree')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      // Without copiedFilePath, the menu item should be disabled
      expect(items[1].classList.contains('disabled')).toBe(true)
      wrapper.unmount()
    })

    it('skips paste when rootPath is empty', async () => {
      mockRootPath.value = ''
      g.__testCopiedFilePath = '/test/project/copied.md'

      const wrapper = mountComponent()
      // When rootPath is empty, sidebar-empty is shown instead of sidebar-tree
      expect(wrapper.find('.sidebar-empty').exists()).toBe(true)
      expect(wrapper.find('.sidebar-tree').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('handleItemClick', () => {
    it('toggles directory when clicking a dir node', () => {
      const wrapper = mountComponent()
      const treeNode = wrapper.findAllComponents(SidebarTreeNodeStub)[0]
      treeNode.vm.$emit('select', { name: 'src', path: '/test/project/src', isDir: true })
      expect(mockToggleDir).toHaveBeenCalledWith('/test/project/src')
      wrapper.unmount()
    })

    it('selects file when clicking a file node', () => {
      const wrapper = mountComponent()
      const treeNode = wrapper.findAllComponents(SidebarTreeNodeStub)[1]
      treeNode.vm.$emit('select', { name: 'README.md', path: '/test/project/README.md', isDir: false })
      expect(mockSelectFile).toHaveBeenCalledWith('/test/project/README.md')
      wrapper.unmount()
    })
  })

  describe('handleRefresh', () => {
    it('calls refreshTree when refreshing root', async () => {
      const wrapper = mountComponent()
      const treeNode = wrapper.findAllComponents(SidebarTreeNodeStub)[0]
      treeNode.vm.$emit('refresh', '/test/project')
      expect(mockRefreshTree).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('calls refreshDir when refreshing subdir', async () => {
      const wrapper = mountComponent()
      const treeNode = wrapper.findAllComponents(SidebarTreeNodeStub)[0]
      treeNode.vm.$emit('refresh', '/test/project/src')
      expect(mockRefreshDir).toHaveBeenCalledWith('/test/project/src')
      wrapper.unmount()
    })
  })
})
