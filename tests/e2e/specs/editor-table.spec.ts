import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor } from '../helpers/editor'

const TABLE_MD = `| A | B |
| --- | --- |
| 1 | 2 |`

async function setupTable(page: import('@playwright/test').Page) {
  await setContent(page, TABLE_MD)
  await page.waitForSelector('.cm-table-widget', { timeout: 3000 })
}

test.describe('Editor Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render table from markdown', async ({ page }) => {
    await setupTable(page)
    await expect(page.locator('.cm-table-widget')).toBeVisible()
  })

  test('should display table cells', async ({ page }) => {
    await setupTable(page)
    const widget = page.locator('.cm-table-widget')
    await expect(widget.locator('th[data-row="-1"][data-col="0"]')).toHaveText('A')
    await expect(widget.locator('th[data-row="-1"][data-col="1"]')).toHaveText('B')
    await expect(widget.locator('td[data-row="0"][data-col="0"]')).toHaveText('1')
    await expect(widget.locator('td[data-row="0"][data-col="1"]')).toHaveText('2')
  })

  test('should allow editing a table cell', async ({ page }) => {
    await setupTable(page)
    const cell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
    await cell.dblclick()
    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible()
    await input.fill('99')
    await page.locator('.cm-editor').click({ position: { x: 0, y: 0 } })
    const content = await getContent(page)
    expect(content).toContain('99')
  })

  test('should show table context menu', async ({ page }) => {
    await setupTable(page)
    const cell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
    await cell.click({ button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByText('在上方插入行')).toBeVisible()
    await expect(menu.getByText('在下方插入行')).toBeVisible()
    await expect(menu.getByText('删除行')).toBeVisible()
    await expect(menu.getByText('在左侧插入列')).toBeVisible()
    await expect(menu.getByText('在右侧插入列')).toBeVisible()
    await expect(menu.getByText('删除列')).toBeVisible()
  })

  test('should add row via context menu', async ({ page }) => {
    await setupTable(page)
    const cell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在下方插入行').click()
    const content = await getContent(page)
    const rows = content.split('\n').filter((line) => line.startsWith('|'))
    expect(rows.length).toBeGreaterThanOrEqual(4)
  })

  test('should add column via context menu', async ({ page }) => {
    await setupTable(page)
    const cell = page.locator('.cm-table-widget td[data-row="0"][data-col="0"]')
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在右侧插入列').click()
    const content = await getContent(page)
    const firstRow = content.split('\n')[0]
    const colCount = firstRow.split('|').length - 2
    expect(colCount).toBe(3)
  })
})
