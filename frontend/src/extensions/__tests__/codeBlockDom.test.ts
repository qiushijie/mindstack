import { describe, it, expect, afterEach } from 'vitest'
import { markdownStyles } from '../markdownStyles'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('code block DOM structure', () => {
  it('applies cm-code-block to all code block lines', () => {
    const view = createView('```js\nconst x = 1\n```', [markdownStyles])
    const lines = view.dom.querySelectorAll('.cm-line.cm-code-block')
    expect(lines.length).toBe(3)
  })

  it('applies cm-code-first to opening fence line', () => {
    const view = createView('```js\nconst x = 1\n```', [markdownStyles])
    const firstLine = view.dom.querySelector('.cm-line.cm-code-first')
    expect(firstLine).not.toBeNull()
  })

  it('applies cm-code-last to closing fence line', () => {
    const view = createView('```js\nconst x = 1\n```', [markdownStyles])
    const lastLine = view.dom.querySelector('.cm-line.cm-code-last')
    expect(lastLine).not.toBeNull()
  })

  it('applies cm-code-line to code content lines only', () => {
    const view = createView('```js\nconst x = 1\n```', [markdownStyles])
    const codeLine = view.dom.querySelector('.cm-line.cm-code-line')
    expect(codeLine).not.toBeNull()
    expect(codeLine!.textContent).toContain('const x = 1')
  })

  it('renders code header widget with correct language', () => {
    const view = createView('```python\nprint("hi")\n```', [markdownStyles])
    const lang = view.dom.querySelector('.cm-code-lang')
    expect(lang).not.toBeNull()
    expect(lang!.textContent).toBe('python')
  })

  it('shows text for code block without language', () => {
    const view = createView('```\nplain code\n```', [markdownStyles])
    const lang = view.dom.querySelector('.cm-code-lang')
    expect(lang).not.toBeNull()
    expect(lang!.textContent).toBe('text')
  })

  it('multi-line code block: all lines have cm-code-block', () => {
    const view = createView('```js\nline1\nline2\nline3\n```', [markdownStyles])
    const codeBlockLines = view.dom.querySelectorAll('.cm-line.cm-code-block')
    expect(codeBlockLines.length).toBe(5)
    // Only the 3 middle lines should have cm-code-line
    const codeLines = view.dom.querySelectorAll('.cm-line.cm-code-line')
    expect(codeLines.length).toBe(3)
  })
})
