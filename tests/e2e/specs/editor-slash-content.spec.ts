import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Editor Slash Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  async function selectSlashItem(page: import('@playwright/test').Page, labelText: string) {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })
    await page.locator('.cm-slash-item').filter({ hasText: labelText }).click()
    await page.waitForTimeout(300)
  }

  async function selectSlashItemByFilter(page: import('@playwright/test').Page, filter: string) {
    await focusEditor(page)
    await page.keyboard.type('/' + filter, { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })
    // Click the first filtered item
    await page.locator('.cm-slash-item').first().click()
    await page.waitForTimeout(300)
  }

  test('should insert correct H1 markdown via slash command', async ({ page }) => {
    await selectSlashItem(page, '标题 1')
    const content = await getContent(page)
    expect(content.startsWith('# ')).toBe(true)
  })

  test('should insert correct bullet list markdown via slash command', async ({ page }) => {
    await selectSlashItem(page, '无序列表')
    const content = await getContent(page)
    expect(content.startsWith('- ')).toBe(true)
  })

  test('should insert correct blockquote markdown via slash command', async ({ page }) => {
    await selectSlashItem(page, '引用块')
    const content = await getContent(page)
    expect(content.startsWith('> ')).toBe(true)
  })

  test('should insert correct code block markdown via slash command', async ({ page }) => {
    await selectSlashItem(page, '代码块')
    const content = await getContent(page)
    // Code block must have proper fence with "text" language marker
    expect(content).toMatch(/```text\n?/)
    expect(content).toContain('\n```')
  })

  test('should insert correct math block markdown via slash command', async ({ page }) => {
    // Math Block has no zh translation, use filter-by-keyword instead
    await selectSlashItemByFilter(page, 'math')
    const content = await getContent(page)
    // Math block must start with $$ delimiter
    expect(content).toMatch(/^\$\$/)
  })

  test('should insert correct mermaid markdown via slash command', async ({ page }) => {
    await selectSlashItem(page, '流程图')
    const content = await getContent(page)
    expect(content).toContain('```mermaid')
  })
})
