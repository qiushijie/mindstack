import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AppTabBar from '../AppTabBar.vue'

vi.mock('vue-i18n', () => ({
  createI18n: () => ({}),
  useI18n: () => ({ t: (key: string) => key }),
}))

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
  FileText: { template: '<span />', props: ['size'] },
  X: { template: '<span />', props: ['size'] },
  Settings: { template: '<span />', props: ['size'] },
  Minus: { template: '<span />', props: ['size'] },
  Square: { template: '<span />', props: ['size'] },
}))

// Mock wailsjs App API
vi.mock('../../wailsjs/go/main/App', () => ({
  WindowClose: vi.fn(),
  WindowMinimise: vi.fn(),
  WindowToggleMaximise: vi.fn(),
}))

// Shared reactive state for useTabs mock
const mockTabs = ref<Array<{ path: string; title: string }>>([])
const mockActiveTabIndex = ref(-1)

vi.mock('../../composables/useTabs', () => ({
  useTabs: () => ({
    tabs: mockTabs,
    activeTabIndex: mockActiveTabIndex,
  }),
  isPageTab: (path: string) => path === 'settings' || path === 'relations',
}))

vi.mock('../../composables/useSettings', () => ({
  useSettings: () => ({
    uiPlatform: ref('windows'),
  }),
}))

describe('AppTabBar', () => {
  beforeEach(() => {
    mockTabs.value = []
    mockActiveTabIndex.value = -1
  })

  function mountComponent(props = {}) {
    return mount(AppTabBar, { props })
  }

  describe('rendering', () => {
    it('renders no tabs when tabs is empty', () => {
      const wrapper = mountComponent()

      expect(wrapper.findAll('.tab-item')).toHaveLength(0)
    })

    it('renders each tab with icon and title', async () => {
      mockTabs.value = [
        { path: '/a.md', title: 'a' },
        { path: '/b.md', title: 'b' },
      ]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      const items = wrapper.findAll('.tab-item')
      expect(items).toHaveLength(2)
      expect(items[0].find('.tab-title').text()).toBe('a')
      expect(items[1].find('.tab-title').text()).toBe('b')
    })

    it('marks active tab with active class', async () => {
      mockTabs.value = [
        { path: '/a.md', title: 'a' },
        { path: '/b.md', title: 'b' },
      ]
      mockActiveTabIndex.value = 1

      const wrapper = mountComponent()
      await nextTick()

      const items = wrapper.findAll('.tab-item')
      expect(items[0].classes()).not.toContain('active')
      expect(items[1].classes()).toContain('active')
    })

    it('renders close button for each tab', async () => {
      mockTabs.value = [{ path: '/a.md', title: 'a' }]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.findAll('.tab-close')).toHaveLength(1)
    })

    it('renders window controls on windows platform', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.window-controls').exists()).toBe(true)
    })
  })

  describe('events', () => {
    it('emits switch when clicking inactive tab', async () => {
      mockTabs.value = [
        { path: '/a.md', title: 'a' },
        { path: '/b.md', title: 'b' },
      ]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      await wrapper.findAll('.tab-item')[1].trigger('click')

      expect(wrapper.emitted('switch')).toHaveLength(1)
      expect(wrapper.emitted('switch')![0]).toEqual([1])
    })

    it('does not emit switch when clicking active tab', async () => {
      mockTabs.value = [
        { path: '/a.md', title: 'a' },
        { path: '/b.md', title: 'b' },
      ]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      await wrapper.findAll('.tab-item')[0].trigger('click')

      expect(wrapper.emitted('switch')).toBeUndefined()
    })

    it('emits close when clicking close button', async () => {
      mockTabs.value = [{ path: '/a.md', title: 'a' }]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      await wrapper.find('.tab-close').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
      expect(wrapper.emitted('close')![0]).toEqual([0])
    })

    it('does not emit switch when close button is clicked', async () => {
      mockTabs.value = [{ path: '/a.md', title: 'a' }]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      await wrapper.find('.tab-close').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
      expect(wrapper.emitted('switch')).toBeUndefined()
    })

  })

  describe('page tabs', () => {
    it('renders page tabs alongside file tabs', async () => {
      mockTabs.value = [
        { path: '/a.md', title: 'a' },
        { path: 'settings', title: 'Settings' },
      ]
      mockActiveTabIndex.value = 0

      const wrapper = mountComponent()
      await nextTick()

      const items = wrapper.findAll('.tab-item')
      expect(items).toHaveLength(2)
      expect(items[0].find('.tab-title').text()).toBe('a')
      expect(items[1].find('.tab-title').text()).toBe('Settings')
    })
  })
})
