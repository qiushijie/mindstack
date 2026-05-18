import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Rapid Operations - Typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid Enter presses', async ({ page }) => {
    await focusEditor(page)

    // Type a word then rapid Enter
    await page.keyboard.type('Hello')
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Enter')
    }
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('Hello')
    // Should have multiple lines
    expect(content.split('\n').length).toBeGreaterThan(1)
  })

  test('should handle rapid Backspace presses', async ({ page }) => {
    await setContent(page, 'abcdefghij')
    await focusEditor(page)
    await page.keyboard.press('End')

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Backspace')
    }
    await page.waitForTimeout(300)

    expect(await getContent(page)).toBe('')
  })

  test('should handle alternating type-delete-type', async ({ page }) => {
    await focusEditor(page)

    await page.keyboard.type('abc')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('def')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('ghi')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('abdeghi')
  })

  test('should handle rapid format toggle sequence', async ({ page }) => {
    await setContent(page, 'test')
    await focusEditor(page)

    await page.keyboard.press('Control+a')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // After toggling bold 3 times, text should be bold (odd number of toggles)
    expect(content).toContain('**test**')
  })
})

test.describe('Rapid Operations - List Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid Enter at end of list', async ({ page }) => {
    await setContent(page, '- Item 1')
    await focusEditor(page)
    await page.keyboard.press('End')

    // Press Enter multiple times at end of list
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    const content = await getContent(page)
    // Should not crash and should maintain some structure
    expect(content).toContain('Item 1')
  })

  test('should handle rapid Enter at empty list item', async ({ page }) => {
    await setContent(page, '- Item 1\n- ')
    await focusEditor(page)
    await page.keyboard.press('End')

    // Multiple Enter on empty list item
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(100)
    }

    const content = await getContent(page)
    expect(content).toContain('Item 1')
  })

  test('should handle Tab on list then rapid typing', async ({ page }) => {
    await setContent(page, '- Parent')
    await focusEditor(page)
    await page.keyboard.press('End')

    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.type('Child')
    await page.waitForTimeout(100)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
    await page.keyboard.type(' text')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Parent')
    expect(content).toContain('Child')
  })
})

test.describe('Rapid Operations - Blockquote', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid Enter in blockquote', async ({ page }) => {
    await setContent(page, '> Quote line')
    await focusEditor(page)
    await page.keyboard.press('End')

    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.type('More quote')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Quote line')
    expect(content).toContain('More quote')
    // Both lines should have blockquote markers
    expect(content).toContain('> Quote line')
    expect(content).toContain('> More quote')
  })

  test('should handle backspace at start of blockquote line', async ({ page }) => {
    await setContent(page, '> First\n> Second')
    await focusEditor(page)

    // Position at start of second line (after '> ')
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const text = view.state.doc.toString()
        const pos = text.indexOf('> Second') + 2
        view.dispatch({ selection: { anchor: pos } })
      }
    })
    await page.waitForTimeout(100)

    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('First')
    expect(content).toContain('Second')
  })
})

test.describe('Rapid Operations - Heading Conversion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid heading level changes', async ({ page }) => {
    await setContent(page, 'Title')
    await focusEditor(page)

    await page.keyboard.press('Control+1')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+3')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // Final state should be H3
    expect(content).toBe('### Title')
  })

  test('should handle heading then immediate Enter', async ({ page }) => {
    await setContent(page, 'Title')
    await focusEditor(page)

    await page.keyboard.press('Control+1')
    await page.waitForTimeout(100)
    await page.keyboard.press('End')
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.type('Body')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('# Title')
    expect(content).toContain('Body')
  })
})

test.describe('Rapid Operations - Empty Document', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid operations on empty doc', async ({ page }) => {
    await focusEditor(page)

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Delete')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Now typing')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('\nNow typing')
  })

  test('should handle format shortcut on empty doc', async ({ page }) => {
    await focusEditor(page)

    await page.keyboard.press('Control+b')
    await page.waitForTimeout(100)
    await page.keyboard.type('bold')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // On empty doc, bold inserts markers and typed text falls between them
    expect(content).toContain('bold')
    expect(content).toContain('**')
  })
})
