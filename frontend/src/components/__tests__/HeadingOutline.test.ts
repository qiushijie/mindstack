import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HeadingOutline from '../HeadingOutline.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: vi.fn((key: string) => key),
  }),
}))

describe('HeadingOutline', () => {
  const mockHeadings = [
    { line: 1, level: 1, text: 'Title 1' },
    { line: 5, level: 2, text: 'Subtitle A' },
    { line: 10, level: 3, text: 'Sub-subtitle' },
    { line: 15, level: 2, text: 'Subtitle B' },
    { line: 20, level: 4, text: 'Deep heading' },
  ]

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountComponent(props: { headings?: typeof mockHeadings; selectedLine?: number } = {}) {
    return mount(HeadingOutline, {
      props: {
        headings: props.headings ?? mockHeadings,
        selectedLine: props.selectedLine,
      },
      attachTo: document.body,
    })
  }

  describe('rendering', () => {
    it('renders all heading items', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      expect(items).toHaveLength(mockHeadings.length)
      wrapper.unmount()
    })

    it('renders heading text correctly', () => {
      const wrapper = mountComponent()
      const texts = wrapper.findAll('.heading-text').map(el => el.text())
      expect(texts).toEqual(mockHeadings.map(h => h.text))
      wrapper.unmount()
    })

    it('renders empty state when no headings', () => {
      const wrapper = mountComponent({ headings: [] })
      expect(wrapper.find('.heading-empty').exists()).toBe(true)
      expect(wrapper.find('.empty-text').text()).toBe('sidebar.noHeadings')
      expect(wrapper.findAll('.heading-item')).toHaveLength(0)
      wrapper.unmount()
    })

    it('does not render empty state when headings exist', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.heading-empty').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('active state', () => {
    it('marks matching line as active', () => {
      const wrapper = mountComponent({ selectedLine: 5 })
      const items = wrapper.findAll('.heading-item')
      expect(items[1].classes()).toContain('active')
      wrapper.unmount()
    })

    it('does not mark non-matching lines as active', () => {
      const wrapper = mountComponent({ selectedLine: 5 })
      const items = wrapper.findAll('.heading-item')
      expect(items[0].classes()).not.toContain('active')
      expect(items[2].classes()).not.toContain('active')
      wrapper.unmount()
    })

    it('no item is active when selectedLine is not provided', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      for (const item of items) {
        expect(item.classes()).not.toContain('active')
      }
      wrapper.unmount()
    })

    it('no item is active when selectedLine does not match any heading', () => {
      const wrapper = mountComponent({ selectedLine: 999 })
      const items = wrapper.findAll('.heading-item')
      for (const item of items) {
        expect(item.classes()).not.toContain('active')
      }
      wrapper.unmount()
    })
  })

  describe('click events', () => {
    it('emits select event with line number on click', async () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      await items[0].trigger('click')
      expect(wrapper.emitted('select')).toHaveLength(1)
      expect(wrapper.emitted('select')![0]).toEqual([1])
      wrapper.unmount()
    })

    it('emits correct line for each heading', async () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      for (let i = 0; i < items.length; i++) {
        await items[i].trigger('click')
        expect(wrapper.emitted('select')![i]).toEqual([mockHeadings[i].line])
      }
      wrapper.unmount()
    })
  })

  describe('style helpers', () => {
    it('applies correct indent based on level', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      // level 1: 8 + 0 * 16 = 8px
      expect(items[0].attributes('style')).toContain('padding-left: 8px')
      // level 2: 8 + 1 * 16 = 24px
      expect(items[1].attributes('style')).toContain('padding-left: 24px')
      // level 3: 8 + 2 * 16 = 40px
      expect(items[2].attributes('style')).toContain('padding-left: 40px')
      // level 4: 8 + 3 * 16 = 56px
      expect(items[4].attributes('style')).toContain('padding-left: 56px')
      wrapper.unmount()
    })

    it('applies correct font size based on level', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      // level 1: 14px
      expect(items[0].attributes('style')).toContain('font-size: 14px')
      // level 2: 13px
      expect(items[1].attributes('style')).toContain('font-size: 13px')
      // level 3: 12px
      expect(items[2].attributes('style')).toContain('font-size: 12px')
      // level 4: 12px
      expect(items[4].attributes('style')).toContain('font-size: 12px')
      wrapper.unmount()
    })

    it('applies correct font weight based on level', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      // level 1: 600
      expect(items[0].attributes('style')).toContain('font-weight: 600')
      // level 2: 500
      expect(items[1].attributes('style')).toContain('font-weight: 500')
      // level 3: normal
      expect(items[2].attributes('style')).toContain('font-weight: normal')
      // level 4: normal
      expect(items[4].attributes('style')).toContain('font-weight: normal')
      wrapper.unmount()
    })
  })

  describe('edge cases', () => {
    it('handles single heading', () => {
      const wrapper = mountComponent({ headings: [{ line: 1, level: 1, text: 'Only' }] })
      expect(wrapper.findAll('.heading-item')).toHaveLength(1)
      expect(wrapper.find('.heading-text').text()).toBe('Only')
      wrapper.unmount()
    })

    it('handles deeply nested headings (level > 4)', () => {
      const wrapper = mountComponent({ headings: [{ line: 1, level: 6, text: 'H6' }] })
      const item = wrapper.find('.heading-item')
      expect(item.attributes('style')).toContain('padding-left: 88px')
      expect(item.attributes('style')).toContain('font-size: 12px')
      expect(item.attributes('style')).toContain('font-weight: normal')
      wrapper.unmount()
    })

    it('handles heading with empty text', () => {
      const wrapper = mountComponent({ headings: [{ line: 1, level: 1, text: '' }] })
      expect(wrapper.find('.heading-text').text()).toBe('')
      wrapper.unmount()
    })

    it('uses heading line as key', () => {
      const wrapper = mountComponent()
      const items = wrapper.findAll('.heading-item')
      // Vue uses :key internally; just verify rendering works with duplicate lines not possible
      expect(items.length).toBe(mockHeadings.length)
      wrapper.unmount()
    })
  })
})
