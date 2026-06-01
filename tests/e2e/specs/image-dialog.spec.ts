import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { clearEditor } from '../helpers/editor'

test.describe('Image Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should open image dialog via hook', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-overlay')).toBeVisible()
    await expect(page.locator('.image-dialog')).toBeVisible()
  })

  test('should show insert title and insert button by default', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-title')).toHaveText('插入图片')
    await expect(page.locator('.image-dialog-btn-insert')).toBeVisible()
    await expect(page.locator('.image-dialog-btn-cancel')).toBeVisible()
  })

  test('should have URL input and alt text input', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-input').first()).toBeVisible()
    await expect(page.locator('.image-dialog-input').nth(1)).toBeVisible()
  })

  test('should disable insert button when URL is empty', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    const insertBtn = page.locator('.image-dialog-btn-insert')
    await expect(insertBtn).toBeDisabled()
  })

  test('should enable insert button when URL is entered', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await page.locator('.image-dialog-input').first().fill('https://example.com/image.png')
    await page.waitForTimeout(100)

    const insertBtn = page.locator('.image-dialog-btn-insert')
    await expect(insertBtn).toBeEnabled()
  })

  test('should close dialog on cancel button click', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await page.locator('.image-dialog-btn-cancel').click()
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-overlay')).toBeHidden()
  })

  test('should close dialog on overlay click', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await page.locator('.image-dialog-overlay').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-overlay')).toBeHidden()
  })

  test('should close dialog on close button click', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await page.locator('.image-dialog-close').click()
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-overlay')).toBeHidden()
  })

  test('should close dialog on Escape key', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-overlay')).toBeHidden()
  })

  test('should show drop zone area', async ({ page }) => {
    await page.evaluate(() => (window as any).__showImageDialog?.())
    await page.waitForTimeout(300)

    await expect(page.locator('.image-dialog-dropzone')).toBeVisible()
  })
})
