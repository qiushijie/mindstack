import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'

test.describe('Settings Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should preserve model settings after file tree operations', async ({ page }) => {
    // 1. Navigate to Settings → Model section
    await navigateTo(page, 'settings')
    await page.locator('.nav-item').filter({ hasText: 'Model' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Model')

    // 2. Clean up existing models from previous test runs
    const deleteButtons = page.locator('.model-card .icon-btn.delete')
    while (await deleteButtons.count() > 0) {
      await deleteButtons.first().click()
      await page.waitForTimeout(200)
    }

    // 3. Add a fresh model
    await page.locator('.add-model-btn').click()
    const modelCard = page.locator('.model-card').first()
    await expect(modelCard).toBeVisible()

    // 4. Fill in test values
    const apiUrlInput = modelCard.locator('.api-row-input')
    await apiUrlInput.click()
    await apiUrlInput.fill('https://test.example.com/v1')
    await apiUrlInput.press('Enter')

    const apiKeyInput = modelCard.locator('.api-key-input')
    await apiKeyInput.click()
    await apiKeyInput.fill('test-key-123')
    await apiKeyInput.press('Enter')

    // 5. Activate the model (only model, so it should show inactive badge)
    await modelCard.locator('.model-inactive-badge').click()
    await expect(modelCard.locator('.model-active-badge')).toBeVisible()
    await page.waitForTimeout(300)

    // 6. Go back to editor and open a file (triggers saveAppConfig)
    await navigateTo(page, 'editor')
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    const fileItem = getTreeItem(page, 'readme.md')
    await fileItem.click()
    await page.waitForTimeout(300)

    // 7. Go back to Settings → Model section
    await navigateTo(page, 'settings')
    await page.locator('.nav-item').filter({ hasText: 'Model' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Model')

    // 8. Verify model settings survived the file tree operation
    const persistedCard = page.locator('.model-card').first()
    await expect(persistedCard).toBeVisible()
    await expect(persistedCard.locator('.model-active-badge')).toBeVisible()
    await expect(persistedCard.locator('.api-row-input')).toHaveValue('https://test.example.com/v1')
    await expect(persistedCard.locator('.api-key-input')).toHaveValue('test-key-123')
  })
})
