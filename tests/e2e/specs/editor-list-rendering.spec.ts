import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor } from '../helpers/editor'

test.describe('List Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render bullet list with cm-list-item class', async ({ page }) => {
    await setContent(page, '- item one\n- item two\n- item three')
    await page.waitForTimeout(200)

    const listItems = page.locator('.cm-line.cm-list-item')
    expect(await listItems.count()).toBe(3)
  })

  test('should render bullet widget with cm-bullet class', async ({ page }) => {
    await setContent(page, '- item one')
    await page.waitForTimeout(200)

    const bullets = page.locator('.cm-bullet')
    expect(await bullets.count()).toBeGreaterThanOrEqual(1)
    await expect(bullets.first()).toContainText('•')
  })

  test('should render ordered list with cm-list-item class', async ({ page }) => {
    await setContent(page, '1. first\n2. second\n3. third')
    await page.waitForTimeout(200)

    const listItems = page.locator('.cm-line.cm-list-item')
    expect(await listItems.count()).toBe(3)
  })

  test('should render number widget with cm-list-num class', async ({ page }) => {
    await setContent(page, '1. first item')
    await page.waitForTimeout(200)

    const numWidgets = page.locator('.cm-list-num')
    expect(await numWidgets.count()).toBeGreaterThanOrEqual(1)
    await expect(numWidgets.first()).toContainText('1.')
  })

  test('should show correct numbering for ordered list', async ({ page }) => {
    await setContent(page, '1. first\n2. second\n3. third')
    await page.waitForTimeout(200)

    const numWidgets = page.locator('.cm-list-num')
    expect(await numWidgets.count()).toBeGreaterThanOrEqual(3)

    const texts = await numWidgets.allTextContents()
    expect(texts[0]).toBe('1.')
    expect(texts[1]).toBe('2.')
    expect(texts[2]).toBe('3.')
  })

  test('should hide list markers from display', async ({ page }) => {
    await setContent(page, '- item one')
    await page.waitForTimeout(200)

    // The raw '- ' should be hidden; only bullet widget and text should show
    const listItem = page.locator('.cm-line.cm-list-item')
    const text = await listItem.textContent()
    expect(text?.trim()).not.toMatch(/^-\s/)
  })

  test('should render nested bullet lists', async ({ page }) => {
    await setContent(page, '- parent\n  - child\n  - another child')
    await page.waitForTimeout(200)

    const listItems = page.locator('.cm-line.cm-list-item')
    expect(await listItems.count()).toBe(3)

    const bullets = page.locator('.cm-bullet')
    expect(await bullets.count()).toBeGreaterThanOrEqual(2)
  })

  test('should render ordered list starting from arbitrary number', async ({ page }) => {
    await setContent(page, '5. fifth\n6. sixth')
    await page.waitForTimeout(200)

    const numWidgets = page.locator('.cm-list-num')
    expect(await numWidgets.count()).toBeGreaterThanOrEqual(2)

    const texts = await numWidgets.allTextContents()
    expect(texts[0]).toBe('1.')
    expect(texts[1]).toBe('2.')
  })
})
