import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor } from '../helpers/editor'

test.describe('Editor Table Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  async function setupTable(page: import('@playwright/test').Page, md?: string) {
    await setContent(page, md || '| A | B |\n|---|---|\n| 1 | 2 |')
    await page.waitForSelector('.cm-table-widget', { timeout: 3000 })
  }

  function getCell(page: import('@playwright/test').Page, row: number, col: number) {
    const selector = row === -1
      ? `.cm-table-widget th[data-row="-1"][data-col="${col}"]`
      : `.cm-table-widget td[data-row="${row}"][data-col="${col}"]`
    return page.locator(selector)
  }

  test('should add multiple rows via context menu', async ({ page }) => {
    await setupTable(page)
    const cell = getCell(page, 0, 0)
    // Add first row
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在下方插入行').click()
    await page.waitForTimeout(300)
    // Row insertion moves the cursor into the new row, hiding the widget.
    // Move the cursor out so the widget reappears for the next operation.
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(300)
    // Add second row
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在下方插入行').click()
    await page.waitForTimeout(300)
    const content = await getContent(page)
    const rows = content.split('\n').filter((line) => line.startsWith('|'))
    expect(rows.length).toBeGreaterThanOrEqual(4)
  })

  test('should add multiple columns via context menu', async ({ page }) => {
    await setupTable(page)
    const cell = getCell(page, 0, 0)
    // Add first column
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在右侧插入列').click()
    await page.waitForTimeout(300)
    // Add second column
    await cell.click({ button: 'right' })
    await page.locator('.context-menu').getByText('在右侧插入列').click()
    await page.waitForTimeout(300)
    const content = await getContent(page)
    const firstRow = content.split('\n')[0]
    const colCount = firstRow.split('|').length - 2
    expect(colCount).toBeGreaterThanOrEqual(3)
  })

  test('should delete rows until one remains', async ({ page }) => {
    await setupTable(page, '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |')
    // Delete second row (index 1)
    const cell2 = getCell(page, 1, 0)
    await cell2.click({ button: 'right' })
    await page.locator('.context-menu').getByText('删除行').click()
    await page.waitForTimeout(300)
    // Delete the next row
    const cellNext = getCell(page, 1, 0)
    await cellNext.click({ button: 'right' })
    await page.locator('.context-menu').getByText('删除行').click()
    await page.waitForTimeout(300)
    const content = await getContent(page)
    const rows = content.split('\n').filter((line) => line.startsWith('|'))
    // Should have header + separator + 1 data row = 3 lines
    expect(rows.length).toBe(3)
  })

  test('should delete columns until one remains', async ({ page }) => {
    await setupTable(page, '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |')
    // Delete column twice
    for (let i = 0; i < 2; i++) {
      const cell = getCell(page, 0, 0)
      await cell.click({ button: 'right' })
      await page.locator('.context-menu').getByText('删除列').click()
      await page.waitForTimeout(300)
    }
    const content = await getContent(page)
    const firstRow = content.split('\n')[0]
    const cols = firstRow.split('|').filter(c => c.trim())
    expect(cols.length).toBe(1)
  })

  test('should navigate between cells with Tab', async ({ page }) => {
    await setupTable(page)
    const cell = getCell(page, 0, 0)
    // Double-click to enter cell edit mode
    await cell.dblclick()
    await page.waitForTimeout(200)
    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible({ timeout: 2000 })
    // Press Tab to move to next cell
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    // Type a marker — if Tab worked, it goes into cell (0,1)
    await page.keyboard.type('Tabbed', { delay: 10 })
    await page.waitForTimeout(200)
    // Commit edit
    await page.locator('.cm-editor').click({ position: { x: 0, y: 0 } })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    // Cell (0,0) having "1" should be unchanged, "Tabbed" should be in second cell
    expect(content).toContain('Tabbed')
    expect(content).toMatch(/\|\s*1\s*\|/)
  })

  test('should navigate between cells with Shift+Tab', async ({ page }) => {
    await setupTable(page)
    const cell = getCell(page, 0, 1) // Second cell
    // Double-click to enter cell edit mode
    await cell.dblclick()
    await page.waitForTimeout(200)
    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible({ timeout: 2000 })
    // Press Shift+Tab to move back to first cell
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(200)
    // Type a marker — if Shift+Tab worked, it goes into cell (0,0)
    await page.keyboard.type('Shifted', { delay: 10 })
    await page.waitForTimeout(200)
    // Commit edit
    await page.locator('.cm-editor').click({ position: { x: 0, y: 0 } })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    // "Shifted" should be in first cell, cell (0,1) having "2" unchanged
    expect(content).toContain('Shifted')
    expect(content).toMatch(/\|\s*2\s*\|/)
  })

  test('should undo cell edit', async ({ page }) => {
    await setupTable(page)
    const cell = getCell(page, 0, 0)
    // Double-click to enter cell edit mode
    await cell.dblclick()
    await page.waitForTimeout(300)
    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible({ timeout: 2000 })
    // Edit the cell
    await input.click()
    await page.keyboard.type('99', { delay: 10 })
    // Commit by clicking outside
    await page.locator('.cm-content').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)
    const afterEdit = await getContent(page)
    expect(afterEdit).toContain('99')
    // Undo should revert the cell edit
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)
    const afterUndo = await getContent(page)
    expect(afterUndo).toMatch(/\|\s*1\s*\|/)
  })
})
