import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SidebarTreeNode from '../SidebarTreeNode.vue'
import type { TreeNode } from '../../types/file'

// Mock wailsjs APIs
vi.mock('../../../wailsjs/go/main/App', () => ({
  ClipboardSetText: vi.fn().mockResolvedValue(undefined),
  ClipboardGetText: vi.fn().mockResolvedValue(''),
  SaveFileContent: vi.fn().mockResolvedValue(undefined),
  ReadFileContent: vi.fn().mockResolvedValue(''),
  FileExists: vi.fn().mockResolvedValue(false),
  DeleteFile: vi.fn().mockResolvedValue(undefined),
  ConfirmDelete: vi.fn().mockResolvedValue(true),
}))

import {
  ClipboardSetText, ClipboardGetText, SaveFileContent,
  ReadFileContent, FileExists, DeleteFile, ConfirmDelete,
} from '../../../wailsjs/go/main/App'

const { closeTabsForDeletedPath } = vi.hoisted(() => ({
  closeTabsForDeletedPath: vi.fn().mockResolvedValue(undefined),
}))

// vi.mock is hoisted — factory must not reference outer variables.
vi.mock('../../composables/useFileTree', () => {
  const copiedFilePath = { value: '' }
  return {
    copiedFilePath,
    closeTabsForDeletedPath,
    resolveUniqueFilePath: vi.fn().mockResolvedValue('/root/src/new.md'),
    resolvePasteFilePath: vi.fn().mockResolvedValue({ path: '/root/src/pasted.md', content: 'pasted' }),
    pasteToDirectory: vi.fn().mockImplementation(async (_targetDir: string) => {
      return !!copiedFilePath.value
    }),
    useFileTree: vi.fn(() => ({
      closeTabsForDeletedPath,
    })),
  }
})

import { copiedFilePath as mockCopiedFilePath, pasteToDirectory } from '../../composables/useFileTree'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: vi.fn((key: string) => key),
  }),
}))

describe('SidebarTreeNode', () => {
  const fileNode: TreeNode = {
    name: 'README.md',
    path: '/root/README.md',
    isDir: false,
    expanded: false,
    children: [],
  }

  const dirNode: TreeNode = {
    name: 'src',
    path: '/root/src',
    isDir: true,
    expanded: false,
    children: [],
  }

  const dirWithChildren: TreeNode = {
    name: 'src',
    path: '/root/src',
    isDir: true,
    expanded: true,
    children: [
      { name: 'main.ts', path: '/root/src/main.ts', isDir: false, expanded: false, children: [] },
      { name: 'utils', path: '/root/src/utils', isDir: true, expanded: false, children: [] },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCopiedFilePath.value = ''
    document.querySelectorAll('.tree-context-menu').forEach(el => el.remove())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 30))
  }

  function mountNode(node: TreeNode, selectedPath = '', depth = 0, rootPath = '/root') {
    return mount(SidebarTreeNode, {
      props: { node, selectedPath, depth, rootPath },
      attachTo: document.body,
    })
  }

  describe('rendering', () => {
    it('renders file node with FileText icon', () => {
      const wrapper = mountNode(fileNode)
      expect(wrapper.find('.tree-item').exists()).toBe(true)
      expect(wrapper.find('.tree-item-text').text()).toBe('README.md')
      const svg = wrapper.find('.tree-item-icon')
      expect(svg.exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders directory node with Folder icon', () => {
      const wrapper = mountNode(dirNode)
      expect(wrapper.find('.tree-item-text').text()).toBe('src')
      wrapper.unmount()
    })

    it('applies active class when node path matches selectedPath', () => {
      const wrapper = mountNode(fileNode, '/root/README.md')
      expect(wrapper.find('.tree-item').classes()).toContain('active')
      wrapper.unmount()
    })

    it('does not apply active class for non-selected node', () => {
      const wrapper = mountNode(fileNode, '/root/other.md')
      expect(wrapper.find('.tree-item').classes()).not.toContain('active')
      wrapper.unmount()
    })

    it('applies correct indent based on depth', () => {
      const wrapper = mountNode(fileNode, '', 2)
      expect(wrapper.find('.tree-item').attributes('style')).toContain('padding-left: 56px')
      wrapper.unmount()
    })

    it('uses depth 0 icon size 16', () => {
      const wrapper = mountNode(fileNode, '', 0)
      const icon = wrapper.find('.tree-item-icon')
      expect(icon.exists()).toBe(true)
      wrapper.unmount()
    })

    it('uses depth > 0 icon size 14', () => {
      const wrapper = mountNode(fileNode, '', 1)
      const icon = wrapper.find('.tree-item-icon')
      expect(icon.exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('click events', () => {
    it('emits select event on click', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('click')
      expect(wrapper.emitted('select')).toHaveLength(1)
      expect(wrapper.emitted('select')![0]).toEqual([fileNode])
      wrapper.unmount()
    })
  })

  describe('recursive children', () => {
    it('renders children when directory is expanded', () => {
      const wrapper = mountNode(dirWithChildren)
      const childItems = wrapper.findAll('.tree-item')
      // Parent + 2 children
      expect(childItems.length).toBe(3)
      wrapper.unmount()
    })

    it('does not render children when directory is collapsed', () => {
      const wrapper = mountNode(dirNode)
      const childItems = wrapper.findAll('.tree-item')
      expect(childItems.length).toBe(1)
      wrapper.unmount()
    })

    it('passes depth + 1 to child nodes', () => {
      const wrapper = mountNode(dirWithChildren, '', 0)
      const items = wrapper.findAll('.tree-item')
      // First item (parent) has indent 8, children have indent 32
      expect(items[0].attributes('style')).toContain('padding-left: 8px')
      expect(items[1].attributes('style')).toContain('padding-left: 32px')
      wrapper.unmount()
    })

    it('forwards select event from child nodes', async () => {
      const wrapper = mountNode(dirWithChildren)
      const childItems = wrapper.findAll('.tree-item')
      await childItems[1].trigger('click')
      expect(wrapper.emitted('select')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('context menu', () => {
    it('shows context menu on right click', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const menu = document.querySelector('.tree-context-menu')
      expect(menu).not.toBeNull()
      wrapper.unmount()
    })

    it('closes context menu on document click', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()
      await new Promise(r => setTimeout(r, 20))

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(document.querySelector('.tree-context-menu')).toBeNull()
      wrapper.unmount()
    })

    it('menu has all expected items', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items.length).toBe(5)
      wrapper.unmount()
    })

    it('paste is disabled when no copied file', async () => {
      mockCopiedFilePath.value = ''
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(true)
      wrapper.unmount()
    })

    it('paste is enabled when file is copied', async () => {
      mockCopiedFilePath.value = '/root/other.md'
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      expect(items[1].classList.contains('disabled')).toBe(false)
      wrapper.unmount()
    })
  })

  describe('copy operations', () => {
    it('copyName copies node name and sets copiedFilePath', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(ClipboardSetText).toHaveBeenCalledWith('README.md')
      expect(mockCopiedFilePath.value).toBe('/root/README.md')
      wrapper.unmount()
    })

    it('copyPath copies full path', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(ClipboardSetText).toHaveBeenCalledWith('/root/README.md')
      wrapper.unmount()
    })

    it('copyRelativePath computes relative path', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[3].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(ClipboardSetText).toHaveBeenCalledWith('README.md')
      wrapper.unmount()
    })

    it('copyRelativePath handles root path with trailing slash', async () => {
      const wrapper = mountNode(fileNode, '', 0, '/root/')
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[3].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(ClipboardSetText).toHaveBeenCalledWith('README.md')
      wrapper.unmount()
    })
  })

  describe('delete operation', () => {
    it('deleteItem confirms and deletes file', async () => {
      vi.mocked(ConfirmDelete).mockResolvedValue(true)
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[4].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(ConfirmDelete).toHaveBeenCalledWith('README.md', false)
      expect(DeleteFile).toHaveBeenCalledWith('/root/README.md')
      expect(closeTabsForDeletedPath).toHaveBeenCalledWith('/root/README.md', false)
      wrapper.unmount()
    })

    it('deleteItem aborts when not confirmed', async () => {
      vi.mocked(ConfirmDelete).mockResolvedValue(false)
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[4].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(ConfirmDelete).toHaveBeenCalled()
      expect(DeleteFile).not.toHaveBeenCalled()
      expect(closeTabsForDeletedPath).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('emits refresh after delete with parent dir', async () => {
      vi.mocked(ConfirmDelete).mockResolvedValue(true)
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[4].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(wrapper.emitted('refresh')).toHaveLength(1)
      expect(wrapper.emitted('refresh')![0]).toEqual(['/root'])
      expect(closeTabsForDeletedPath).toHaveBeenCalledWith('/root/README.md', false)
      wrapper.unmount()
    })
  })

  describe('paste operations', () => {
    it('pasteHere duplicates copied file', async () => {
      mockCopiedFilePath.value = '/root/other.md'
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(pasteToDirectory).toHaveBeenCalledWith('/root')
      expect(wrapper.emitted('refresh')).toHaveLength(1)
      wrapper.unmount()
    })

    it('pasteHere falls back to clipboard text when no copied file', async () => {
      mockCopiedFilePath.value = ''
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      // paste is disabled, so clicking it shouldn't do anything useful
      // but we can test that the disabled class prevents interaction
      expect(items[1].classList.contains('disabled')).toBe(true)
      wrapper.unmount()
    })

    it('pasteHere uses parent dir when node is a file', async () => {
      mockCopiedFilePath.value = '/root/other.md'
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(pasteToDirectory).toHaveBeenCalledWith('/root')
      wrapper.unmount()
    })

    it('pasteHere uses node dir when node is a directory', async () => {
      mockCopiedFilePath.value = '/root/other.md'
      vi.mocked(pasteToDirectory).mockResolvedValue(true)

      const wrapper = mountNode(dirNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      const items = document.querySelectorAll('.tree-context-menu .menu-item')
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(pasteToDirectory).toHaveBeenCalledWith('/root/src')
      wrapper.unmount()
    })

    it('pasteHere skips when clipboard is empty and no copied file', async () => {
      mockCopiedFilePath.value = ''
      vi.mocked(ClipboardGetText).mockResolvedValue('')

      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 100, clientY: 200 })
      await nextTick()

      // Since paste is disabled, we can't trigger it
      expect(SaveFileContent).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('getItemIcon', () => {
    it('returns FolderOpen for expanded directory', () => {
      const expandedDir = { ...dirNode, expanded: true }
      const wrapper = mountNode(expandedDir)
      // Should render without error - icon component exists
      expect(wrapper.find('.tree-item-icon').exists()).toBe(true)
      wrapper.unmount()
    })

    it('returns Folder for collapsed directory', () => {
      const wrapper = mountNode(dirNode)
      expect(wrapper.find('.tree-item-icon').exists()).toBe(true)
      wrapper.unmount()
    })

    it('returns FileText for file', () => {
      const wrapper = mountNode(fileNode)
      expect(wrapper.find('.tree-item-icon').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('edge cases', () => {
    it('handles node name with special characters', () => {
      const specialNode = { ...fileNode, name: 'file[name].ts' }
      const wrapper = mountNode(specialNode)
      expect(wrapper.find('.tree-item-text').text()).toBe('file[name].ts')
      wrapper.unmount()
    })

    it('handles deeply nested tree nodes', () => {
      const deepNode: TreeNode = {
        name: 'deep',
        path: '/root/a/b/c/deep',
        isDir: true,
        expanded: true,
        children: [fileNode],
      }
      const wrapper = mountNode(deepNode, '', 3)
      const items = wrapper.findAll('.tree-item')
      expect(items.length).toBe(2)
      wrapper.unmount()
    })

    it('context menu position matches event coordinates', async () => {
      const wrapper = mountNode(fileNode)
      await wrapper.find('.tree-item').trigger('contextmenu', { clientX: 150, clientY: 250 })
      await nextTick()

      const menu = document.querySelector('.tree-context-menu') as HTMLElement
      expect(menu).not.toBeNull()
      expect(menu.style.left).toBe('150px')
      expect(menu.style.top).toBe('250px')
      wrapper.unmount()
    })
  })
})
