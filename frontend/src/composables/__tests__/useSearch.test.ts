import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SearchDocsV2: vi.fn(),
}))

import { SearchDocsV2 } from '../../../wailsjs/go/main/App'
import { useSearch } from '../useSearch'

beforeEach(() => {
  vi.mocked(SearchDocsV2).mockReset()
})

describe('useSearch', () => {
  describe('searchDocs', () => {
    it('returns parsed result on successful search', async () => {
      const docs = [{ path: '/notes.md', title: 'Notes', matches: ['hello'] }]
      vi.mocked(SearchDocsV2).mockResolvedValue(JSON.stringify({ results: docs }))

      const { searchDocs, searchLoading, searchError } = useSearch()
      const result = await searchDocs('hello')

      expect(result).toEqual({ results: docs })
      expect(searchError.value).toBe('')
      expect(searchLoading.value).toBe(false)
      expect(SearchDocsV2).toHaveBeenCalledWith('hello', 'hybrid')
    })

    it('sets loading during the call and clears after', async () => {
      let resolveSearch!: (value: string) => void
      vi.mocked(SearchDocsV2).mockReturnValue(new Promise<string>((resolve) => { resolveSearch = resolve }))

      const { searchDocs, searchLoading } = useSearch()
      const promise = searchDocs('test')

      expect(searchLoading.value).toBe(true)

      resolveSearch(JSON.stringify({ results: [] }))
      await promise

      expect(searchLoading.value).toBe(false)
    })

    it('returns null and sets error when response contains error', async () => {
      vi.mocked(SearchDocsV2).mockResolvedValue(JSON.stringify({ error: 'Index not found' }))

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Index not found')
    })

    it('returns null and sets error when SearchDocsV2 throws', async () => {
      vi.mocked(SearchDocsV2).mockRejectedValue(new Error('Network failure'))

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Network failure')
    })

    it('returns null and sets error for non-Error rejection', async () => {
      vi.mocked(SearchDocsV2).mockRejectedValue('raw failure')

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Search failed')
    })

    it('clears previous error on new successful call', async () => {
      vi.mocked(SearchDocsV2)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))

      const { searchDocs, searchError } = useSearch()
      await searchDocs('fail-query')
      expect(searchError.value).toBe('fail')

      await searchDocs('ok-query')
      expect(searchError.value).toBe('')
    })

    it('handles empty query', async () => {
      vi.mocked(SearchDocsV2).mockResolvedValue(JSON.stringify({ results: [] }))

      const { searchDocs } = useSearch()
      const result = await searchDocs('')

      expect(result).toEqual({ results: [] })
      expect(SearchDocsV2).toHaveBeenCalledWith('', 'hybrid')
    })
  })
})
