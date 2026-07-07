import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openAIChatPanel, closeAIChatPanel, mockWailsRuntime } from '../helpers/chat'

async function dragPanelHeaderBy(page: import('@playwright/test').Page, dx: number, dy: number) {
  const header = page.locator('.ai-chat-panel .chat-header')
  const box = await header.boundingBox()
  expect(box).not.toBeNull()

  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

test.describe('AI Chat Panel Drag', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockWailsRuntime(page)
    await openAIChatPanel(page)
  })

  test('should be positioned on screen initially', async ({ page }) => {
    const panel = page.locator('.ai-chat-panel')
    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThan(0)
    expect(box!.y).toBeGreaterThan(0)
  })

  test('should move panel by dragging header', async ({ page }) => {
    const panel = page.locator('.ai-chat-panel')

    const beforeBox = await panel.boundingBox()
    expect(beforeBox).not.toBeNull()

    await dragPanelHeaderBy(page, -80, 60)

    const afterBox = await panel.boundingBox()
    expect(afterBox).not.toBeNull()
    expect(afterBox!.x).toBeCloseTo(beforeBox!.x - 80, 0)
    expect(afterBox!.y).toBeCloseTo(beforeBox!.y + 60, 0)
  })

  test('should reset position after close and reopen', async ({ page }) => {
    const panel = page.locator('.ai-chat-panel')

    const initialBox = await panel.boundingBox()
    expect(initialBox).not.toBeNull()

    await dragPanelHeaderBy(page, 120, 100)

    const movedBox = await panel.boundingBox()
    expect(movedBox).not.toBeNull()
    expect(movedBox!.x).not.toBe(initialBox!.x)

    await closeAIChatPanel(page)
    await openAIChatPanel(page)

    const resetBox = await panel.boundingBox()
    expect(resetBox).not.toBeNull()
    expect(Math.abs(resetBox!.x - initialBox!.x)).toBeLessThan(2)
    expect(Math.abs(resetBox!.y - initialBox!.y)).toBeLessThan(2)
  })
})
