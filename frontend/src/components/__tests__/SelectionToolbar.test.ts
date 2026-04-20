import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionToolbar from '../SelectionToolbar.vue'
import type { EditorBlock } from '../../types/editor'

describe('SelectionToolbar', () => {
  const paragraphBlock: EditorBlock = {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Hello' }],
  }

  const boldBlock: EditorBlock = {
    type: 'paragraph',
    content: [{ type: 'strong', text: 'Bold' }],
  }

  const headingBlock: EditorBlock = {
    type: 'heading',
    level: 2,
    content: [{ type: 'text', text: 'Title' }],
  }

  it('emits select when Bold button is clicked', async () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    // Row 1: Bold, Italic, Strikethrough, Text
    const boldBtn = buttons[0]
    await boldBtn.trigger('pointerdown')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['Bold'])
  })

  it('emits select when Italic button is clicked', async () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    const italicBtn = buttons[1]
    await italicBtn.trigger('pointerdown')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['Italic'])
  })

  it('emits select when H2 button is clicked', async () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    // Row 2: H1, H2, H3, H4 → indices 4, 5, 6, 7
    const h2Btn = buttons[5]
    await h2Btn.trigger('pointerdown')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['H2'])
  })

  it('highlights Text button for plain paragraph', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    // Row 1: Bold(0), Italic(1), Strikethrough(2), Text(3)
    expect(buttons[0].classes()).not.toContain('active') // Bold
    expect(buttons[1].classes()).not.toContain('active') // Italic
    expect(buttons[2].classes()).not.toContain('active') // Strikethrough
    expect(buttons[3].classes()).toContain('active')     // Text
  })

  it('highlights Bold button for bold paragraph, not Text', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: boldBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[0].classes()).toContain('active')     // Bold
    expect(buttons[3].classes()).not.toContain('active') // Text
  })

  it('highlights H2 button for heading level 2', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: headingBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    // Row 2: H1(4), H2(5), H3(6), H4(7)
    expect(buttons[4].classes()).not.toContain('active') // H1
    expect(buttons[5].classes()).toContain('active')     // H2
    expect(buttons[6].classes()).not.toContain('active') // H3
  })

  it('emits multiple select events for multiple clicks', async () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    await buttons[0].trigger('pointerdown') // Bold
    await buttons[4].trigger('pointerdown') // H1

    expect(wrapper.emitted('select')).toHaveLength(2)
    expect(wrapper.emitted('select')![0]).toEqual(['Bold'])
    expect(wrapper.emitted('select')![1]).toEqual(['H1'])
  })

  it('renders correct number of buttons', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: paragraphBlock },
    })

    const buttons = wrapper.findAll('.toolbar-btn')
    // Row 1: 4 (Bold, Italic, Strikethrough, Text)
    // Row 2: 4 (H1, H2, H3, H4)
    // Row 3: 3 (List, OrderedList, Todo)
    // Row 4: 3 (Code, Quote, Link)
    expect(buttons).toHaveLength(14)
  })

  it('highlights H1 for heading level 1', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'heading', level: 1, content: [{ type: 'text', text: '' }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[4].classes()).toContain('active') // H1
    expect(buttons[5].classes()).not.toContain('active') // H2
  })

  it('highlights List for bullet_list', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'bullet_list', items: [{ content: [{ type: 'text', text: '' }] }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[8].classes()).toContain('active') // List
    expect(buttons[9].classes()).not.toContain('active') // OrderedList
  })

  it('highlights OrderedList for ordered_list', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'ordered_list', items: [{ content: [{ type: 'text', text: '' }] }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[9].classes()).toContain('active') // OrderedList
    expect(buttons[8].classes()).not.toContain('active') // List
  })

  it('highlights Todo for todo_list', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'todo_list', items: [{ checked: false, content: [{ type: 'text', text: '' }] }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[10].classes()).toContain('active') // Todo
  })

  it('highlights Code for code_block', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'code_block', language: 'ts', code: 'x' } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[11].classes()).toContain('active') // Code
  })

  it('highlights Quote for blockquote', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'blockquote', content: [{ type: 'text', text: '' }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[12].classes()).toContain('active') // Quote
  })

  it('highlights Italic for em content', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'paragraph', content: [{ type: 'em', text: 'italic' }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[1].classes()).toContain('active') // Italic
    expect(buttons[3].classes()).not.toContain('active') // Text
  })

  it('highlights Strikethrough for del content', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: { type: 'paragraph', content: [{ type: 'del', text: 'strike' }] } },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    expect(buttons[2].classes()).toContain('active') // Strikethrough
    expect(buttons[3].classes()).not.toContain('active') // Text
  })

  it('no active highlights for null block', () => {
    const wrapper = mount(SelectionToolbar, {
      props: { block: null },
    })
    const buttons = wrapper.findAll('.toolbar-btn')
    for (const btn of buttons) {
      expect(btn.classes()).not.toContain('active')
    }
  })
})
