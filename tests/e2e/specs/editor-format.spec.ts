import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, focusEditor, clearEditor } from '../helpers/editor'

function toolbarBtn(page: import('@playwright/test').Page, label: string) {
  return page.locator(`[data-testid="toolbar-${label}"]`)
}

async function selectWordByDoubleClick(page: import('@playwright/test').Page): Promise<void> {
  const cmContent = page.locator('.cm-content')
  const box = await cmContent.boundingBox()
  if (box) {
    await page.mouse.dblclick(box.x + 30, box.y + 25)
    await page.waitForTimeout(300)
  }
}

test.describe('Editor Formatting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should show selection toolbar when text is selected', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
  })

  test('should apply bold via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Bold').click()

    const content = await getContent(page)
    expect(content).toContain('**')
  })

  test('should apply italic via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Italic').click()

    const content = await getContent(page)
    expect(content).toMatch(/\*[^*]+\*/)
  })

  test('should show heading buttons in toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await expect(toolbarBtn(page, 'H1')).toBeVisible()
    await expect(toolbarBtn(page, 'H2')).toBeVisible()
  })

  test('should apply H1 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'H1').click()

    const content = await getContent(page)
    expect(content).toContain('# ')
  })

  test('should show context menu on right click', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.locator('.editor-container').click({ button: 'right' })

    await expect(page.locator('.context-menu')).toBeVisible()
    await expect(page.locator('[data-testid="ctx-cut"]')).toContainText('剪切')
  })

  test('should apply strikethrough via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Strikethrough').click()
    const content = await getContent(page)
    expect(content).toContain('~~')
  })

  test('should apply H2 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'H2').click()
    const content = await getContent(page)
    expect(content).toContain('## ')
  })

  test('should apply H3 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'H3').click()
    const content = await getContent(page)
    expect(content).toContain('### ')
  })

  test('should apply H4 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'H4').click()
    const content = await getContent(page)
    expect(content).toContain('#### ')
  })

  test('should apply code via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Code').click()
    const content = await getContent(page)
    expect(content).toContain('`')
  })

  test('should apply blockquote via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Quote').click()
    const content = await getContent(page)
    expect(content).toContain('> ')
  })

  test('should insert link via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'Link').click()
    const content = await getContent(page)
    expect(content).toContain('](url)')
  })

  test('should convert to bullet list via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'List').click()
    const content = await getContent(page)
    expect(content).toContain('- ')
  })

  test('should convert to ordered list via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    await toolbarBtn(page, 'OrderedList').click()
    const content = await getContent(page)
    expect(content).toContain('1. ')
  })
})
