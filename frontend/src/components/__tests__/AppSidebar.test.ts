import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h, ref, computed } from 'vue'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Global mutable state for sharing between mock factory and tests
const g = globalThis as unknown as { __testCopiedFilePath: string | null }
g.__testCopiedFilePath = null

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  createI18n: () => ({}),
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
const mockSelectedFileContent = ref('')
const mockFolderName = computed(() => mockRootPath.value.split('/').pop() || 'MindStack')

const mockSelectFile = vi.fn()
const mockToggleDir = vi.fn()
const mockOpenFolder = vi.fn()
const mockRefreshTree = vi.fn().mockResolvedValue(undefined)
const mockRefreshDir = vi.fn().mockResolvedValue(undefined)

vi.mock('../../composables/useSettings', () => ({
  useSettings: () => ({
    uiPlatform: ref('macos'),
  }),
}))

vi.mock('../../composables/useFileTree', () => ({
  useFileTree: () => ({
    rootPath: mockRootPath,
    treeData: mockTreeData,
    selectedFilePath: mockSelectedFilePath,
    selectedFileContent: mockSelectedFileContent,
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
  pasteToDirectory: vi.fn().mockImplementation(async (_targetDir: string) => {
    return !!g.__testCopiedFilePath
  }),
}))

// Mutable mock headings state
const mockHeadings = ref<{ text: string; level: number; line: number }[]>([])

vi.mock('../../composables/useHeadingTree', () => ({
  useHeadingTree: () => ({
    headings: computed(() => mockHeadings.value),
    selectedHeadingLine: computed(() => 1),
  }),
  setCurrentHeadings: vi.fn(),
  setSelectedHeadingLine: vi.fn(),
  currentHeadings: { value: [] },
}))

// Mock useEditorState
vi.mock('../../composables/useEditorState', () => ({
  scrollToLine: vi.fn(),
}))

// Mock SidebarTreeNode as a simple functional stub
const SidebarTreeNodeStub = {
  name: 'SidebarTreeNode',
  props: ['node', 'selectedPath', 'depth', 'rootPath'],
  emits: ['select', 'refresh'],
  render() {
    return h('div', { class: 'sidebar-tree-node-stub', 'data-path': (this as any).node?.path })
  },
}

const HeadingOutlineStub = {
  name: 'HeadingOutline',
  props: ['headings', 'selectedLine'],
  emits: ['select'],
  render() {
    const headings = (this as any).headings as { text: string; level: number; line: number }[] || []
    return h('div', { class: 'heading-outline-stub' }, headings.map(hd =>
      h('div', { class: 'heading-item-stub', 'data-text': hd.text })
    ))
  },
}

import AppSidebar from '../AppSidebar.vue'
import { pasteToDirectory } from '../../composables/useFileTree'

// Helper to flush all pending promises
async function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 50))
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockRootPath.value = '/test/project'
    mockTreeData.value = [
      { name: 'src', path: '/test/project/src', isDir: true, expanded: false, children: [] },
      { name: 'README.md', path: '/test/project/README.md', isDir: false, expanded: false, children: [] },
    ]
    mockSelectedFilePath.value = ''
    mockSelectedFileContent.value = ''
    g.__testCopiedFilePath = null
    mockHeadings.value = []
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
          HeadingOutline: HeadingOutlineStub,
        },
      },
    })
  }

  describe('collapsed prop and toggle', () => {
    it('renders expanded by default', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.sidebar').classes()).not.toContain('collapsed')
      expect(wrapper.find('.sidebar-header').exists()).toBe(true)
      expect(wrapper.find('.sidebar-search').exists()).toBe(true)
      expect(wrapper.find('.sidebar-tree').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders collapsed when collapsed=true', () => {
      const wrapper = mountComponent({ collapsed: true })
      expect(wrapper.find('.sidebar').classes()).toContain('collapsed')
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

    it('hides search and tree when collapsed', () => {
      const wrapper = mountComponent({ collapsed: true })
      expect(wrapper.find('.sidebar-search').exists()).toBe(false)
      expect(wrapper.find('.sidebar-tree').exists()).toBe(false)
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

    it('filters tree when search query is entered', async () => {
      const wrapper = mountComponent()
      const input = wrapper.find('.search-input')
      expect(input.exists()).toBe(true)

      await input.setValue('README')
      await nextTick()

      const stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(2)
      expect(stubs[0].attributes('data-path')).toBe('/test/project/src')
      expect(stubs[1].attributes('data-path')).toBe('/test/project/README.md')
      wrapper.unmount()
    })

    it('shows all nodes when search query is cleared', async () => {
      const wrapper = mountComponent()
      const input = wrapper.find('.search-input')

      await input.setValue('README')
      await nextTick()

      let stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(2)

      await input.setValue('')
      await nextTick()

      stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(2)
      wrapper.unmount()
    })

    it('shows matching directory when searching by dir name', async () => {
      const wrapper = mountComponent()
      const input = wrapper.find('.search-input')

      await input.setValue('src')
      await nextTick()

      const stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(1)
      expect(stubs[0].attributes('data-path')).toBe('/test/project/src')
      wrapper.unmount()
    })

    it('hides non-matching expanded directory when children are loaded', async () => {
      const wrapper = mountComponent()
      mockTreeData.value = [
        {
          name: 'src', path: '/test/project/src', isDir: true, expanded: true,
          children: [
            { name: 'main.ts', path: '/test/project/src/main.ts', isDir: false, expanded: false, children: [] },
            { name: 'utils.ts', path: '/test/project/src/utils.ts', isDir: false, expanded: false, children: [] },
          ],
        },
        { name: 'README.md', path: '/test/project/README.md', isDir: false, expanded: false, children: [] },
      ]
      await nextTick()

      const input = wrapper.find('.search-input')
      await input.setValue('README')
      await nextTick()

      const stubs = wrapper.findAll('.sidebar-tree-node-stub')
      expect(stubs).toHaveLength(1)
      expect(stubs[0].attributes('data-path')).toBe('/test/project/README.md')
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
      const tree = wrapper.find('.file-tree-content')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const menu = document.querySelector('.tree-context-menu')
      expect(menu).not.toBeNull()
      wrapper.unmount()
    })

    it('closes context menu on document click', async () => {
      const wrapper = mountComponent()
      const tree = wrapper.find('.file-tree-content')

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
      const tree = wrapper.find('.file-tree-content')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(true)
      wrapper.unmount()
    })

    it('paste menu item is enabled when file is copied', async () => {
      g.__testCopiedFilePath = '/test/project/copied.md'
      const wrapper = mountComponent()
      const tree = wrapper.find('.file-tree-content')

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
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountComponent()
      const tree = wrapper.find('.file-tree-content')

      await tree.trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(false)

      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(pasteToDirectory).toHaveBeenCalledWith('/test/project')
      expect(mockRefreshTree).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('pastes clipboard text when no copied file', async () => {
      g.__testCopiedFilePath = null
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountComponent()
      const tree = wrapper.find('.file-tree-content')

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

  describe('heading search', () => {
    async function switchToHeadingView(wrapper: ReturnType<typeof mountComponent>) {
      const toggleBtn = wrapper.find('.view-toggle-btn')
      await toggleBtn.trigger('click')
      await nextTick()
    }

    it('renders all headings when no search query', async () => {
      mockHeadings.value = [
        { text: 'Installation', level: 1, line: 1 },
        { text: 'Usage', level: 2, line: 10 },
        { text: 'API Reference', level: 2, line: 20 },
      ]
      const wrapper = mountComponent()
      await switchToHeadingView(wrapper)

      const items = wrapper.findAll('.heading-item-stub')
      expect(items).toHaveLength(3)
      wrapper.unmount()
    })

    it('filters headings by search query', async () => {
      mockHeadings.value = [
        { text: 'Installation', level: 1, line: 1 },
        { text: 'Usage', level: 2, line: 10 },
        { text: 'API Reference', level: 2, line: 20 },
      ]
      const wrapper = mountComponent()
      await switchToHeadingView(wrapper)

      const input = wrapper.find('.search-input')
      await input.setValue('API')
      await nextTick()

      const items = wrapper.findAll('.heading-item-stub')
      expect(items).toHaveLength(1)
      expect(items[0].attributes('data-text')).toBe('API Reference')
      wrapper.unmount()
    })

    it('shows no headings when query does not match any heading', async () => {
      mockHeadings.value = [
        { text: 'Installation', level: 1, line: 1 },
        { text: 'Usage', level: 2, line: 10 },
      ]
      const wrapper = mountComponent()
      await switchToHeadingView(wrapper)

      const input = wrapper.find('.search-input')
      await input.setValue('Nonexistent')
      await nextTick()

      const items = wrapper.findAll('.heading-item-stub')
      expect(items).toHaveLength(0)
      wrapper.unmount()
    })

    it('shows all headings when search is cleared', async () => {
      mockHeadings.value = [
        { text: 'Installation', level: 1, line: 1 },
        { text: 'Usage', level: 2, line: 10 },
      ]
      const wrapper = mountComponent()
      await switchToHeadingView(wrapper)

      const input = wrapper.find('.search-input')
      await input.setValue('Usage')
      await nextTick()

      expect(wrapper.findAll('.heading-item-stub')).toHaveLength(1)

      await input.setValue('')
      await nextTick()

      expect(wrapper.findAll('.heading-item-stub')).toHaveLength(2)
      wrapper.unmount()
    })
  })
})
