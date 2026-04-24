import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, setContent, typeInEditor, selectAll, focusEditor, clearEditor } from '../helpers/editor'

// Toolbar row 1: Bold(0), Italic(1), Strikethrough(2), Text(3)
// Toolbar row 2: H1(4), H2(5), H3(6), H4(7)
function toolbarBtn(page: import('@playwright/test').Page, index: number) {
  return page.locator('.selection-toolbar .toolbar-btn').nth(index)
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
    // Bold is the first button (row 1, index 0)
    await toolbarBtn(page, 0).click()

    const content = await getContent(page)
    expect(content).toContain('**')
  })

  test('should apply italic via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // Italic is the second button (row 1, index 1)
    await toolbarBtn(page, 1).click()

    const content = await getContent(page)
    expect(content).toMatch(/\*[^*]+\*/)
  })

  test('should show heading buttons in toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    // Use double-click to reliably trigger toolbar
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // H1 is the 5th button (index 4), H2 is 6th (index 5)
    await expect(toolbarBtn(page, 4)).toBeVisible()
    await expect(toolbarBtn(page, 5)).toBeVisible()
  })

  test('should apply H1 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)

    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // H1 is the 5th button (index 4)
    await toolbarBtn(page, 4).click()

    const content = await getContent(page)
    expect(content).toContain('# ')
  })

  test('should show context menu on right click', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.locator('.editor-container').click({ button: 'right' })

    await expect(page.locator('.context-menu')).toBeVisible()
    await expect(page.locator('.context-menu .ctx-item').first()).toContainText('Cut')
  })

  test('should apply strikethrough via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // Strikethrough is the third button (row 1, index 2)
    await toolbarBtn(page, 2).click()
    const content = await getContent(page)
    expect(content).toContain('~~')
  })

  test('should apply H2 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // H2 is the 6th button (row 2, index 5)
    await toolbarBtn(page, 5).click()
    const content = await getContent(page)
    expect(content).toContain('## ')
  })

  test('should apply H3 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // H3 is the 7th button (row 2, index 6)
    await toolbarBtn(page, 6).click()
    const content = await getContent(page)
    expect(content).toContain('### ')
  })

  test('should apply H4 via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // H4 is the 8th button (row 2, index 7)
    await toolbarBtn(page, 7).click()
    const content = await getContent(page)
    expect(content).toContain('#### ')
  })

  test('should apply code via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // Code is the 12th button (row 3, index 11)
    await toolbarBtn(page, 11).click()
    const content = await getContent(page)
    expect(content).toContain('`')
  })

  test('should apply blockquote via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // Quote is the 13th button (row 3, index 12)
    await toolbarBtn(page, 12).click()
    const content = await getContent(page)
    expect(content).toContain('> ')
  })

  test('should insert link via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // Link is the 14th button (row 3, index 13)
    await toolbarBtn(page, 13).click()
    const content = await getContent(page)
    expect(content).toContain('](url)')
  })

  test('should convert to bullet list via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // List is the 9th button (row 2, index 8)
    await toolbarBtn(page, 8).click()
    const content = await getContent(page)
    expect(content).toContain('- ')
  })

  test('should convert to ordered list via toolbar', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await expect(page.locator('.selection-toolbar')).toBeVisible({ timeout: 5000 })
    // OrderedList is the 10th button (row 2, index 9)
    await toolbarBtn(page, 9).click()
    const content = await getContent(page)
    expect(content).toContain('1. ')
  })
})
