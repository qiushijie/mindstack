import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetDocumentMetas: vi.fn(),
  GetDocumentRelations: vi.fn(),
}))

import { GetDocumentMetas, GetDocumentRelations } from '../../../wailsjs/go/main/App'
import { useRelations } from '../useRelations'

// Reset module-level refs via the composable return values.
// metas and relations are exported directly; colorMap is not,
// so we use vi.resetModules + dynamic import to get a fresh module state
// for tests that need a clean colorMap.

describe('useRelations', () => {
  let metas: ReturnType<typeof useRelations>['metas']
  let relations: ReturnType<typeof useRelations>['relations']
  let nodes: ReturnType<typeof useRelations>['nodes']
  let allTags: ReturnType<typeof useRelations>['allTags']
  let loading: ReturnType<typeof useRelations>['loading']
  let error: ReturnType<typeof useRelations>['error']
  let loadData: ReturnType<typeof useRelations>['loadData']
  let getRelationsForDoc: ReturnType<typeof useRelations>['getRelationsForDoc']
  let getRelatedDocs: ReturnType<typeof useRelations>['getRelatedDocs']
  let getNode: ReturnType<typeof useRelations>['getNode']

  beforeEach(() => {
    vi.mocked(GetDocumentMetas).mockReset()
    vi.mocked(GetDocumentRelations).mockReset()

    const composable = useRelations()
    metas = composable.metas
    relations = composable.relations
    nodes = composable.nodes
    allTags = composable.allTags
    loading = composable.loading
    error = composable.error
    loadData = composable.loadData
    getRelationsForDoc = composable.getRelationsForDoc
    getRelatedDocs = composable.getRelatedDocs
    getNode = composable.getNode

    // Reset module-level state
    metas.value = new Map()
    relations.value = []
    loading.value = false
    error.value = ''
  })

  describe('loadData', () => {
    it('loads metas and relations successfully', async () => {
      const metasJSON = JSON.stringify([
        { path: 'a.md', title: 'Doc A', summary: 'Summary A', tags: ['tag1'], status: 'draft' },
        { path: 'b.md', title: 'Doc B', summary: 'Summary B', tags: ['tag2'], status: 'published' },
      ])
      const relsJSON = JSON.stringify({
        'a.md': [
          { source: 'a.md', target: 'b.md', score: 0.8, reason: 'related', sharedTags: ['tag1'] },
        ],
      })

      vi.mocked(GetDocumentMetas).mockResolvedValue(metasJSON)
      vi.mocked(GetDocumentRelations).mockResolvedValue(relsJSON)

      await loadData()

      expect(error.value).toBe('')
      expect(loading.value).toBe(false)
      expect(metas.value.size).toBe(2)
      expect(metas.value.get('a.md')?.title).toBe('Doc A')
      expect(metas.value.get('b.md')?.title).toBe('Doc B')
      expect(relations.value).toHaveLength(1)
      expect(relations.value[0]).toEqual({
        source: 'a.md',
        target: 'b.md',
        score: 0.8,
        reason: 'related',
        sharedTags: ['tag1'],
      })
    })

    it('sets error when metas API returns error', async () => {
      vi.mocked(GetDocumentMetas).mockResolvedValue(JSON.stringify({ error: 'no workspace open' }))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      await loadData()

      expect(error.value).toBe('no workspace open')
      expect(metas.value.size).toBe(0)
    })

    it('sets error when relations API returns error', async () => {
      vi.mocked(GetDocumentMetas).mockResolvedValue(JSON.stringify([
        { path: 'a.md', title: 'A', summary: '', tags: [], status: '' },
      ]))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify({ error: 'some error' }))

      await loadData()

      expect(error.value).toBe('some error')
      // metas should have been set before the relations error was detected
      expect(metas.value.size).toBe(1)
    })

    it('handles exception from API calls', async () => {
      vi.mocked(GetDocumentMetas).mockRejectedValue(new Error('network failure'))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      await loadData()

      expect(error.value).toBe('network failure')
      expect(loading.value).toBe(false)
    })

    it('handles exception without message', async () => {
      vi.mocked(GetDocumentMetas).mockRejectedValue('unknown')
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      await loadData()

      expect(error.value).toBe('Failed to load data')
    })

    it('sets loading to true during the call and false after', async () => {
      let resolveMetas!: (value: string) => void
      vi.mocked(GetDocumentMetas).mockReturnValue(
        new Promise<string>((resolve) => { resolveMetas = resolve }),
      )
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      const promise = loadData()
      expect(loading.value).toBe(true)

      resolveMetas(JSON.stringify([]))
      await promise

      expect(loading.value).toBe(false)
    })

    it('resets error before loading', async () => {
      error.value = 'previous error'

      vi.mocked(GetDocumentMetas).mockResolvedValue(JSON.stringify([]))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      await loadData()

      expect(error.value).toBe('')
    })

    it('sets loading to false even when error occurs', async () => {
      vi.mocked(GetDocumentMetas).mockRejectedValue(new Error('fail'))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify([]))

      await loadData()

      expect(loading.value).toBe(false)
      expect(error.value).toBe('fail')
    })

    it('handles relations with missing sharedTags', async () => {
      vi.mocked(GetDocumentMetas).mockResolvedValue(JSON.stringify([
        { path: 'a.md', title: 'A', summary: '', tags: [], status: '' },
      ]))
      vi.mocked(GetDocumentRelations).mockResolvedValue(JSON.stringify({
        'a.md': [
          { source: 'a.md', target: 'b.md', score: 0.5, reason: 'test' },
        ],
      }))

      await loadData()

      expect(relations.value[0].sharedTags).toEqual([])
    })
  })

  describe('nodes computed', () => {
    it('derives nodes from metas', () => {
      metas.value = new Map([
        ['a.md', { title: 'Doc A', summary: 'Sum A', tags: ['t1'], status: 'draft' }],
        ['b.md', { title: 'Doc B', summary: 'Sum B', tags: [], status: 'draft' }],
      ])

      expect(nodes.value).toHaveLength(2)
      expect(nodes.value[0].path).toBe('a.md')
      expect(nodes.value[0].title).toBe('Doc A')
      expect(nodes.value[0].summary).toBe('Sum A')
      expect(nodes.value[0].tags).toEqual(['t1'])
    })

    it('falls back title to path when title is empty', () => {
      metas.value = new Map([
        ['notes/hello.md', { title: '', summary: '', tags: [], status: '' }],
      ])

      expect(nodes.value[0].title).toBe('notes/hello.md')
    })

    it('assigns colors from the color palette', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [], status: '' }],
        ['b.md', { title: 'B', summary: '', tags: [], status: '' }],
      ])

      const nodeA = nodes.value.find(n => n.path === 'a.md')
      const nodeB = nodes.value.find(n => n.path === 'b.md')

      expect(nodeA?.color).toBe('#0066FF')
      expect(nodeB?.color).toBe('#22C55E')
    })

    it('defaults summary to empty string when missing', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [], status: '' }],
      ])

      expect(nodes.value[0].summary).toBe('')
    })

    it('defaults tags to empty array when missing', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [] as string[], status: '' }],
      ])

      expect(nodes.value[0].tags).toEqual([])
    })

    it('defaults tags to empty array when tags is undefined', () => {
      metas.value = new Map([
        // Simulate runtime data where tags may be missing from JSON
        ['a.md', { title: 'A', summary: '', tags: undefined as unknown as string[], status: '' }],
      ])

      expect(nodes.value[0].tags).toEqual([])
    })
  })

  describe('allTags computed', () => {
    it('aggregates tags from all metas', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: ['vue', 'react'], status: '' }],
        ['b.md', { title: 'B', summary: '', tags: ['angular', 'vue'], status: '' }],
      ])

      expect(allTags.value).toEqual(['angular', 'react', 'vue'])
    })

    it('returns sorted tags', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: ['zeta', 'alpha', 'mid'], status: '' }],
      ])

      expect(allTags.value).toEqual(['alpha', 'mid', 'zeta'])
    })

    it('returns empty array when no metas', () => {
      metas.value = new Map()

      expect(allTags.value).toEqual([])
    })

    it('deduplicates tags', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: ['foo', 'bar'], status: '' }],
        ['b.md', { title: 'B', summary: '', tags: ['bar', 'baz'], status: '' }],
      ])

      expect(allTags.value).toEqual(['bar', 'baz', 'foo'])
    })
  })

  describe('getRelationsForDoc', () => {
    it('returns outgoing relations for a doc', () => {
      relations.value = [
        { source: 'a.md', target: 'b.md', score: 0.8, reason: 'linked', sharedTags: [] },
        { source: 'a.md', target: 'c.md', score: 0.5, reason: 'ref', sharedTags: [] },
      ]

      const result = getRelationsForDoc('a.md')

      expect(result).toHaveLength(2)
      expect(result.map(r => r.target)).toEqual(['b.md', 'c.md'])
    })

    it('returns incoming relations when no outgoing', () => {
      relations.value = [
        { source: 'b.md', target: 'a.md', score: 0.9, reason: 'backlink', sharedTags: ['x'] },
      ]

      const result = getRelationsForDoc('a.md')

      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('b.md')
    })

    it('merges bidirectional relations with incomingScore and incomingReason', () => {
      relations.value = [
        { source: 'a.md', target: 'b.md', score: 0.8, reason: 'out', sharedTags: [] },
        { source: 'b.md', target: 'a.md', score: 0.6, reason: 'in', sharedTags: [] },
      ]

      const result = getRelationsForDoc('a.md')

      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('a.md')
      expect(result[0].target).toBe('b.md')
      expect(result[0].score).toBe(0.8)
      expect(result[0].reason).toBe('out')
      expect(result[0].incomingScore).toBe(0.6)
      expect(result[0].incomingReason).toBe('in')
    })

    it('returns empty array when no relations', () => {
      relations.value = []

      const result = getRelationsForDoc('a.md')

      expect(result).toEqual([])
    })

    it('handles multiple incoming only relations', () => {
      relations.value = [
        { source: 'b.md', target: 'a.md', score: 0.5, reason: 'r1', sharedTags: [] },
        { source: 'c.md', target: 'a.md', score: 0.3, reason: 'r2', sharedTags: [] },
      ]

      const result = getRelationsForDoc('a.md')

      expect(result).toHaveLength(2)
      const sources = result.map(r => r.source).sort()
      expect(sources).toEqual(['b.md', 'c.md'])
    })
  })

  describe('getRelatedDocs', () => {
    it('collects related doc paths from both directions', () => {
      relations.value = [
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
        { source: 'c.md', target: 'a.md', score: 0.5, reason: '', sharedTags: [] },
      ]

      const result = getRelatedDocs('a.md')

      expect(result.sort()).toEqual(['b.md', 'c.md'])
    })

    it('deduplicates when same doc appears in both directions', () => {
      relations.value = [
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
        { source: 'b.md', target: 'a.md', score: 0.6, reason: '', sharedTags: [] },
      ]

      const result = getRelatedDocs('a.md')

      expect(result).toEqual(['b.md'])
    })

    it('returns empty array when no relations', () => {
      relations.value = []

      expect(getRelatedDocs('a.md')).toEqual([])
    })
  })

  describe('getNode', () => {
    it('returns node by path', () => {
      metas.value = new Map([
        ['a.md', { title: 'Doc A', summary: '', tags: [], status: '' }],
      ])

      const node = getNode('a.md')

      expect(node).toBeDefined()
      expect(node?.title).toBe('Doc A')
      expect(node?.path).toBe('a.md')
    })

    it('returns undefined for unknown path', () => {
      metas.value = new Map()

      expect(getNode('nonexistent.md')).toBeUndefined()
    })
  })

  describe('color consistency', () => {
    it('colors remain stable across multiple computed evaluations', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [], status: '' }],
        ['b.md', { title: 'B', summary: '', tags: [], status: '' }],
      ])

      const firstA = nodes.value.find(n => n.path === 'a.md')
      const secondA = nodes.value.find(n => n.path === 'a.md')

      expect(firstA?.color).toBe(secondA?.color)
      expect(firstA?.color).toBe('#0066FF')
    })

    it('assigns same color to same path after metas reset', () => {
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [], status: '' }],
      ])

      const color1 = nodes.value[0].color

      // Re-set metas to same value
      metas.value = new Map([
        ['a.md', { title: 'A', summary: '', tags: [], status: '' }],
      ])

      const color2 = nodes.value[0].color

      // colorMap persists, so same path gets same color
      expect(color1).toBe(color2)
    })
  })
})

// Use vi.resetModules to test colorMap reset behavior in isolation
describe('useRelations with fresh module state', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../../wailsjs/go/main/App', () => ({
      GetDocumentMetas: vi.fn(),
      GetDocumentRelations: vi.fn(),
    }))
  })

  it('starts with fresh colorMap after module reset', async () => {
    const { useRelations: freshUseRelations } = await import('../useRelations')
    const { metas, nodes } = freshUseRelations()

    metas.value = new Map([
      ['x.md', { title: 'X', summary: '', tags: [], status: '' }],
    ])

    // Fresh module => first color in palette
    expect(nodes.value[0].color).toBe('#0066FF')
  })
})
