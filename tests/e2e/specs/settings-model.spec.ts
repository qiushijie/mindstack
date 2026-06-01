import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Model', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
    await page.waitForTimeout(300)
  })

  test('should have add model button', async ({ page }) => {
    const addBtn = page.locator('.add-model-btn')
    await expect(addBtn).toBeVisible()
  })

  test('should add a new model card on click', async ({ page }) => {
    const initialCount = await page.locator('.model-card').count()

    await page.locator('.add-model-btn').click()
    await page.waitForTimeout(300)

    const newCount = await page.locator('.model-card').count()
    expect(newCount).toBe(initialCount + 1)
  })

  test('should show API inputs on added model', async ({ page }) => {
    await page.locator('.add-model-btn').click()
    await page.waitForTimeout(300)

    const apiInputs = page.locator('.api-row-input')
    expect(await apiInputs.count()).toBeGreaterThan(0)

    const keyInputs = page.locator('.api-key-input')
    expect(await keyInputs.count()).toBeGreaterThan(0)
  })

  test('should show API Key input as password', async ({ page }) => {
    await page.locator('.add-model-btn').click()
    await page.waitForTimeout(300)

    const keyInput = page.locator('.api-key-input').first()
    const type = await keyInput.getAttribute('type')
    expect(type).toBe('password')
  })

  test('should toggle API Key visibility', async ({ page }) => {
    await page.locator('.add-model-btn').click()
    await page.waitForTimeout(300)

    const keyInput = page.locator('.api-key-input').first()
    const toggleBtn = page.locator('.model-card').last().locator('.icon-btn').first()

    // Initially password type
    let type = await keyInput.getAttribute('type')
    expect(type).toBe('password')

    // Click eye icon to show
    await toggleBtn.click()
    await page.waitForTimeout(200)

    type = await keyInput.getAttribute('type')
    expect(type).toBe('text')
  })

  test('should delete a model card', async ({ page }) => {
    // First add a model to ensure we have one to delete
    await page.locator('.add-model-btn').click()
    await page.waitForTimeout(300)

    const initialCount = await page.locator('.model-card').count()
    expect(initialCount).toBeGreaterThan(0)

    // Click delete button on the last model card
    const deleteBtns = page.locator('.icon-btn.delete')
    await deleteBtns.last().click()
    await page.waitForTimeout(300)

    const newCount = await page.locator('.model-card').count()
    expect(newCount).toBe(initialCount - 1)
  })
})
