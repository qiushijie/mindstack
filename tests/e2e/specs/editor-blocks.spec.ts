import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Editor Block Types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await clearEditor(page)
  })

  test('should create H1 when typing # ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('# ', { delay: 30 })
    await page.keyboard.type('Hello', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('# Hello')
  })

  test('should create H2 when typing ## ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('## ', { delay: 30 })
    await page.keyboard.type('Hello', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('## Hello')
  })

  test('should create H3 when typing ### ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('### ', { delay: 30 })
    await page.keyboard.type('Hello', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('### Hello')
  })

  test('should create H4 when typing #### ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('#### ', { delay: 30 })
    await page.keyboard.type('Hello', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('#### Hello')
  })

  test('should create bullet list when typing - ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('- ', { delay: 30 })
    await page.keyboard.type('item', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('- item')
  })

  test('should create numbered list when typing 1. ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('1. ', { delay: 30 })
    await page.keyboard.type('item', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('1. item')
  })

  test('should create todo when typing - [ ] ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('- [ ] ', { delay: 30 })
    await page.keyboard.type('task item', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('- [ ] task item')
  })

  test('should create blockquote when typing > ', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('> ', { delay: 30 })
    await page.keyboard.type('quote text', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('> quote text')
  })

  test('should create code block when typing ``` + Enter', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('```', { delay: 30 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('code here', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('```')
    expect(content).toContain('code here')
  })
})
