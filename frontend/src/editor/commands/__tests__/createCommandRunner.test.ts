import { describe, it, expect, afterEach } from 'vitest'
import { createView } from '../../../test-utils/helpers'
import { createCommandRunner } from '../createCommandRunner'
import { insertBlockCommand } from '../block/InsertBlockCommand'
import type { EditorView } from '@codemirror/view'

const views: EditorView[] = []

describe('createCommandRunner', () => {
  afterEach(() => {
    views.forEach(v => v.destroy())
    views.length = 0
    document.body.innerHTML = ''
  })

  function createRunner(doc: string) {
    const view = createView(doc)
    views.push(view)
    return { view, runner: createCommandRunner(view) }
  }

  it('returns a CommandRunner', () => {
    const { runner } = createRunner('Hello world')
    expect(runner).toBeDefined()
    expect(typeof runner.run).toBe('function')
  })

  it('runs a command through the factory and mutates the document', () => {
    const { view, runner } = createRunner('Line one\nLine two')
    runner.run(insertBlockCommand, { lineFrom: 1, prefix: '- ', example: 'New item' })
    expect(view.state.doc.toString()).toBe('Line one\n\n- New item\nLine two')
  })
})
