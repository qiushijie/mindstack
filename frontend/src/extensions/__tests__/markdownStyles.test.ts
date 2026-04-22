import { describe, it, expect, afterEach } from 'vitest'
import { markdownStyles } from '../markdownStyles'
import { createView, getVisibleText } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('markdownStyles - mark hiding', () => {
  it('hides # in heading 1', () => {
    const view = createView('# Hello World', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Hello World')
    expect(visible).not.toContain('#')
  })

  it('hides ## in heading 2', () => {
    const view = createView('## Section Title', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Section Title')
    expect(visible).not.toContain('##')
  })

  it('hides ### in heading 3', () => {
    const view = createView('### Sub Section', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Sub Section')
    expect(visible).not.toContain('###')
  })

  it('hides ** in bold', () => {
    const view = createView('This is **bold** text', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('bold')
    expect(visible).not.toContain('**')
  })

  it('hides * in italic', () => {
    const view = createView('This is *italic* text', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('italic')
    expect(visible).not.toContain('*')
  })

  it('hides ~~ in strikethrough', () => {
    const view = createView('This is ~~deleted~~ text', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('deleted')
    expect(visible).not.toContain('~~')
  })

  it('hides ` in inline code', () => {
    const view = createView('Use `config.yaml` file', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('config.yaml')
    expect(visible).not.toContain('`')
  })

  it('hides > in blockquote', () => {
    const view = createView('> This is a quote', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('This is a quote')
    expect(visible).not.toContain('>')
  })

  it('hides - in bullet list', () => {
    const view = createView('- Item one\n- Item two', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Item one')
    expect(visible).toContain('Item two')
    expect(visible).not.toMatch(/^- /m)
  })

  it('hides 1. in ordered list', () => {
    const view = createView('1. First\n2. Second\n3. Third', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('First')
    expect(visible).toContain('Second')
    expect(visible).toContain('Third')
    expect(visible).not.toMatch(/^\d+\./m)
  })

  it('hides [x] [ ] in task list', () => {
    const view = createView('- [x] Done\n- [ ] Todo', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Done')
    expect(visible).toContain('Todo')
    expect(visible).not.toContain('[x]')
    expect(visible).not.toContain('[ ]')
  })

  it('hides ``` fences in code block', () => {
    const view = createView('```js\nconsole.log("hi")\n```', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('console.log("hi")')
    expect(visible).not.toContain('```')
  })

  it('hides link marks and URL', () => {
    const view = createView('[Click here](https://example.com)', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Click here')
    expect(visible).not.toContain('https://')
    expect(visible).not.toContain('[')
    expect(visible).not.toContain(']')
    expect(visible).not.toContain('(')
    expect(visible).not.toContain(')')
  })

  it('hides all marks in mixed content', () => {
    const doc = `# Title

A paragraph with **bold** and *italic*.

- List item
> Quote

\`\`\`js
code
\`\`\``

    const view = createView(doc, [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)

    expect(visible).toContain('Title')
    expect(visible).toContain('bold')
    expect(visible).toContain('italic')
    expect(visible).toContain('List item')
    expect(visible).toContain('Quote')
    expect(visible).toContain('code')

    expect(visible).not.toContain('#')
    expect(visible).not.toContain('**')
    expect(visible).not.toContain('```')
  })

  it('handles empty document', () => {
    const view = createView('', [markdownStyles])
    expect(() => getVisibleText(view, markdownStyles)).not.toThrow()
  })

  it('handles plain text without markdown', () => {
    const view = createView('Just plain text here', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Just plain text here')
  })

  it('handles nested bold and italic', () => {
    const view = createView('***bold italic***', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('bold italic')
    expect(visible).not.toContain('*')
  })

  it('handles multi-line blockquote', () => {
    const view = createView('> Line one\n> Line two\n> Line three', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Line one')
    expect(visible).toContain('Line two')
    expect(visible).toContain('Line three')
    expect(visible).not.toContain('>')
  })

  it('handles code block without language', () => {
    const view = createView('```\nplain code\n```', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('plain code')
    expect(visible).not.toContain('```')
  })

  it('handles multiple inline formats in one line', () => {
    const view = createView('**bold** and *italic* and `code`', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('bold')
    expect(visible).toContain('italic')
    expect(visible).toContain('code')
    expect(visible).not.toContain('**')
    expect(visible).not.toContain('*')
    expect(visible).not.toContain('`')
  })

  it('preserves text content accurately', () => {
    const view = createView('Hello **World**', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
  })

  it('handles heading with inline format', () => {
    const view = createView('## **Bold** Heading', [markdownStyles])
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Bold')
    expect(visible).toContain('Heading')
    expect(visible).not.toContain('##')
    expect(visible).not.toContain('**')
  })
})
