import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

test.describe('Confirm Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should show confirm dialog with title and message', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__triggerConfirm({
        title: 'Test Title',
        message: 'Test message content',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      })
    })
    await page.waitForTimeout(200)

    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
    await expect(page.locator('.confirm-dialog-header')).toContainText('Test Title')
    await expect(page.locator('.confirm-dialog-body')).toContainText('Test message content')
  })

  test('should confirm and hide dialog', async ({ page }) => {
    const confirmed = await page.evaluate(() => {
      const promise = (window as any).__triggerConfirm({
        title: 'Delete?',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No',
      })
      // Click confirm after a short delay
      setTimeout(() => {
        const btn = document.querySelector('.confirm-dialog .btn-confirm')
        if (btn) (btn as HTMLElement).click()
      }, 300)
      return promise
    })

    await page.waitForTimeout(500)
    await expect(page.locator('.confirm-dialog-overlay')).toBeHidden()
    expect(confirmed).toBe(true)
  })

  test('should cancel and hide dialog', async ({ page }) => {
    const confirmed = await page.evaluate(() => {
      const promise = (window as any).__triggerConfirm({
        title: 'Delete?',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No',
      })
      // Click cancel after a short delay
      setTimeout(() => {
        const btn = document.querySelector('.confirm-dialog .btn-cancel')
        if (btn) (btn as HTMLElement).click()
      }, 300)
      return promise
    })

    await page.waitForTimeout(500)
    await expect(page.locator('.confirm-dialog-overlay')).toBeHidden()
    expect(confirmed).toBe(false)
  })

  test('should close on overlay click', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__triggerConfirm({
        title: 'Test',
        message: 'Message',
        confirmText: 'OK',
        cancelText: 'Cancel',
      })
    })
    await page.waitForTimeout(200)

    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()

    // Click overlay outside dialog
    await page.locator('.confirm-dialog-overlay').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(200)

    await expect(page.locator('.confirm-dialog-overlay')).toBeHidden()
  })
})
