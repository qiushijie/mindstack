import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor } from '../helpers/editor'

async function setupTable(page: import('@playwright/test').Page, md: string) {
  await setContent(page, md)
  await page.waitForSelector('.cm-table-widget', { timeout: 3000 })
}

test.describe('Table Extreme - Empty & Single Cell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle table with only header row', async ({ page }) => {
    await setContent(page, '| A | B |\n| --- | --- |')
    await page.waitForTimeout(300)

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    // Should have 2 header cells, no data cells
    const headers = widget.locator('th')
    expect(await headers.count()).toBeGreaterThanOrEqual(2)
  })

  test('should handle table with empty cells', async ({ page }) => {
    const md = '| A | B |\n| --- | --- |\n| 1 | |\n| | 2 |'
    await setupTable(page, md)

    const cells = page.locator('.cm-table-widget td')
    expect(await cells.count()).toBeGreaterThanOrEqual(4)
  })

  test('should handle single column table', async ({ page }) => {
    await setupTable(page, '| Col |\n| --- |\n| 1 |\n| 2 |')

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const content = await getContent(page)
    expect(content).toContain('| Col |')
  })

  test('should handle single row single column', async ({ page }) => {
    await setupTable(page, '| A |\n| --- |')

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()
  })
})

test.describe('Table Extreme - Delete to Empty', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should delete row until one row left', async ({ page }) => {
    await setupTable(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')

    const cell = page.locator('.cm-table-widget td[data-row="1"][data-col="0"]')
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('删除行').click()
    await page.waitForTimeout(200)

    // Delete the remaining data row
    const remainingCell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
    await remainingCell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('删除行').click()
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // Table should still have header
    expect(content).toContain('| A | B |')
    // Separator may be normalized to different dash count and spacing
    expect(content).toMatch(/\|\s*--+\s*\|\s*--+\s*\|/)
  })

  test('should delete all columns one by one', async ({ page }) => {
    await setupTable(page, '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |')

    for (let i = 0; i < 3; i++) {
      const cell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
      await cell.click({ button: 'right' })
      await page.locator('.context-menu').getByText('删除列').click()
      await page.waitForTimeout(200)
    }

    // After deleting all columns, table collapses to a single column (the last one)
    // Verify only 1 column remains
    const headers = page.locator('.cm-table-widget th')
    expect(await headers.count()).toBe(1)
    const dataCells = page.locator('.cm-table-widget td')
    expect(await dataCells.count()).toBe(1)

    // Original columns A and B should be gone, only C remains
    const content = await getContent(page)
    expect(content).not.toContain('| A |')
    expect(content).not.toContain('| B |')

    // Editor should remain functional
    await expect(page.locator('.cm-content')).toBeVisible()
  })
})

test.describe('Table Extreme - Large Tables', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render table with 10 columns', async ({ page }) => {
    const cols = Array.from({ length: 10 }, (_, i) => `C${i}`).join(' | ')
    const sep = Array.from({ length: 10 }, () => '---').join(' | ')
    const row = Array.from({ length: 10 }, (_, i) => `${i}`).join(' | ')
    const md = `| ${cols} |\n| ${sep} |\n| ${row} |`

    await setupTable(page, md)

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const headerCells = widget.locator('th')
    expect(await headerCells.count()).toBeGreaterThanOrEqual(10)
  })

  test('should render table with 20 rows', async ({ page }) => {
    const lines = ['| A | B |', '| --- | --- |']
    for (let i = 0; i < 20; i++) {
      lines.push(`| row${i}-a | row${i}-b |`)
    }
    await setupTable(page, lines.join('\n'))

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const dataCells = widget.locator('td')
    expect(await dataCells.count()).toBeGreaterThanOrEqual(40)
  })
})
