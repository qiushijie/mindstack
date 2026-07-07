import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

const MOCK_METAS = [
  {
    path: 'docs/architecture.md',
    title: 'Architecture Overview',
    summary: 'System architecture documentation',
    tags: ['architecture', 'system', 'design'],
    status: 'active',
    contentHash: 'abc123',
  },
  {
    path: 'docs/api-design.md',
    title: 'API Design',
    summary: 'REST API design guidelines',
    tags: ['api', 'architecture', 'rest'],
    status: 'active',
    contentHash: 'def456',
  },
  {
    path: 'docs/getting-started.md',
    title: 'Getting Started',
    summary: 'Quick start guide for new developers',
    tags: ['guide', 'setup', 'onboarding'],
    status: 'active',
    contentHash: 'ghi789',
  },
  {
    path: 'docs/deployment.md',
    title: 'Deployment Guide',
    summary: 'How to deploy the application',
    tags: ['deployment', 'devops', 'guide'],
    status: 'active',
    contentHash: 'jkl012',
  },
  {
    path: 'docs/security.md',
    title: 'Security Policy',
    summary: 'Security best practices and policies',
    tags: ['security', 'architecture', 'policy'],
    status: 'active',
    contentHash: 'mno345',
  },
]

const MOCK_RELATIONS = {
  'docs/architecture.md': [
    {
      source: 'docs/architecture.md',
      target: 'docs/api-design.md',
      score: 0.85,
      reason: 'API design follows architecture patterns',
      sharedTags: ['architecture'],
    },
    {
      source: 'docs/architecture.md',
      target: 'docs/security.md',
      score: 0.72,
      reason: 'Security considerations in architecture',
      sharedTags: ['architecture'],
    },
  ],
  'docs/api-design.md': [
    {
      source: 'docs/api-design.md',
      target: 'docs/architecture.md',
      score: 0.85,
      reason: 'API aligned with system architecture',
      sharedTags: ['architecture'],
    },
  ],
  'docs/getting-started.md': [
    {
      source: 'docs/getting-started.md',
      target: 'docs/deployment.md',
      score: 0.65,
      reason: 'Setup leads to deployment',
      sharedTags: ['guide'],
    },
  ],
  'docs/deployment.md': [
    {
      source: 'docs/deployment.md',
      target: 'docs/security.md',
      score: 0.55,
      reason: 'Deployment includes security configuration',
      sharedTags: [],
    },
  ],
}

async function setupRelationGraphMocks(page: import('@playwright/test').Page) {
  await page.evaluate((data) => {
    if (!(window as any).go) {
      (window as any).go = { main: { App: {} } }
    }
    ;(window as any).go.main.App.GetDocumentMetas = () =>
      Promise.resolve(JSON.stringify(data.metas))
    ;(window as any).go.main.App.GetDocumentRelations = () =>
      Promise.resolve(JSON.stringify(data.relations))
    ;(window as any).go.main.App.SetWorkspaceRoot = () => Promise.resolve()
    ;(window as any).go.main.App.GetFileServerPort = () => Promise.resolve(9876)
  }, { metas: MOCK_METAS, relations: MOCK_RELATIONS })
}

async function waitForGraphReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (window as any).__graphReady === true, { timeout: 10000 })
}

async function selectGraphNode(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((p) => (window as any).__selectGraphNode?.(p), path)
}

test.describe('Relation Graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await setupRelationGraphMocks(page)
    await navigateTo(page, 'relations')
    await waitForGraphReady(page)
  })

  test('should render the relation graph page', async ({ page }) => {
    await expect(page.locator('.relation-graph')).toBeVisible()
    await expect(page.locator('.graph-area')).toBeVisible()
    await expect(page.locator('.graph-search-input')).toBeVisible()
  })

  test('should render the force-graph canvas', async ({ page }) => {
    const canvas = page.locator('.graph-container canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('should hide detail panel when no node is selected', async ({ page }) => {
    await expect(page.locator('.detail-panel')).toBeHidden()
  })

  test('should select a node and show details', async ({ page }) => {
    await selectGraphNode(page, 'docs/architecture.md')

    await expect(page.locator('.detail-panel')).toBeVisible()
    await expect(page.locator('.detail-title')).toHaveText('Architecture Overview')
    await expect(page.locator('.detail-tags')).toContainText('architecture')
  })

  test('should show stats in detail panel after node selection', async ({ page }) => {
    await selectGraphNode(page, 'docs/architecture.md')

    const statLabels = page.locator('.stat-label')
    await expect(statLabels).toHaveCount(3)
    await expect(statLabels.first()).toContainText('文档')
  })

  test('should show legend in detail panel after node selection', async ({ page }) => {
    await selectGraphNode(page, 'docs/architecture.md')

    const legendItems = page.locator('.detail-legend .legend-item')
    await expect(legendItems).toHaveCount(2)
    await expect(legendItems.nth(0)).toContainText('出向')
    await expect(legendItems.nth(1)).toContainText('入向')
  })

  test('should filter via search by title', async ({ page }) => {
    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('API')

    await page.waitForFunction(() => (window as any).__getFilteredNodeCount() === 1, { timeout: 5000 })

    await expect(page.locator('.graph-container')).toBeVisible()
    await expect(page.locator('.graph-container canvas')).toBeVisible()
  })

  test('should show no results overlay when search matches nothing', async ({ page }) => {
    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')

    await page.waitForFunction(() => (window as any).__getFilteredNodeCount() === 0, { timeout: 5000 })

    await expect(page.locator('.graph-empty-overlay')).toBeVisible()
    await expect(page.locator('.graph-empty-overlay')).toContainText('未找到匹配的文档')
  })

  test('should restore all nodes when search is cleared', async ({ page }) => {
    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')
    await page.waitForFunction(() => (window as any).__getFilteredNodeCount() === 0, { timeout: 5000 })
    await expect(page.locator('.graph-empty-overlay')).toBeVisible()

    await page.locator('.graph-search-clear').click()
    await page.waitForFunction(() => (window as any).__getFilteredNodeCount() === 5, { timeout: 5000 })

    await expect(page.locator('.graph-empty-overlay')).toBeHidden()
    await expect(page.locator('.graph-container canvas')).toBeVisible()
  })

  test('should hide zoom controls when no search results', async ({ page }) => {
    await expect(page.locator('.zoom-controls')).toBeVisible()

    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')
    await page.waitForFunction(() => (window as any).__getFilteredNodeCount() === 0, { timeout: 5000 })

    await expect(page.locator('.zoom-controls')).toBeHidden()
  })

  test('should have search input functional', async ({ page }) => {
    const searchInput = page.locator('.graph-search-input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', '搜索文档...')
  })
})
