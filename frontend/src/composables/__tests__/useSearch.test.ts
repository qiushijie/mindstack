import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SearchDocs: vi.fn(),
}))

import { SearchDocs } from '../../../wailsjs/go/main/App'
import { useSearch } from '../useSearch'

beforeEach(() => {
  vi.mocked(SearchDocs).mockReset()
})

describe('useSearch', () => {
  describe('searchDocs', () => {
    it('returns parsed result on successful search', async () => {
      const docs = [{ path: '/notes.md', title: 'Notes', matches: ['hello'] }]
      vi.mocked(SearchDocs).mockResolvedValue(JSON.stringify({ results: docs }))

      const { searchDocs, searchLoading, searchError } = useSearch()
      const result = await searchDocs('hello')

      expect(result).toEqual({ results: docs })
      expect(searchError.value).toBe('')
      expect(searchLoading.value).toBe(false)
      expect(SearchDocs).toHaveBeenCalledWith('hello')
    })

    it('sets loading during the call and clears after', async () => {
      let resolveSearch!: (value: string) => void
      vi.mocked(SearchDocs).mockReturnValue(new Promise<string>((resolve) => { resolveSearch = resolve }))

      const { searchDocs, searchLoading } = useSearch()
      const promise = searchDocs('test')

      expect(searchLoading.value).toBe(true)

      resolveSearch(JSON.stringify({ results: [] }))
      await promise

      expect(searchLoading.value).toBe(false)
    })

    it('returns null and sets error when response contains error', async () => {
      vi.mocked(SearchDocs).mockResolvedValue(JSON.stringify({ error: 'Index not found' }))

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Index not found')
    })

    it('returns null and sets error when SearchDocs throws', async () => {
      vi.mocked(SearchDocs).mockRejectedValue(new Error('Network failure'))

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Network failure')
    })

    it('returns null and sets error for non-Error rejection', async () => {
      vi.mocked(SearchDocs).mockRejectedValue('raw failure')

      const { searchDocs, searchError } = useSearch()
      const result = await searchDocs('query')

      expect(result).toBeNull()
      expect(searchError.value).toBe('Search failed')
    })

    it('clears previous error on new successful call', async () => {
      vi.mocked(SearchDocs)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(JSON.stringify({ results: [] }))

      const { searchDocs, searchError } = useSearch()
      await searchDocs('fail-query')
      expect(searchError.value).toBe('fail')

      await searchDocs('ok-query')
      expect(searchError.value).toBe('')
    })

    it('handles empty tag', async () => {
      vi.mocked(SearchDocs).mockResolvedValue(JSON.stringify({ results: [] }))

      const { searchDocs } = useSearch()
      const result = await searchDocs('')

      expect(result).toEqual({ results: [] })
      expect(SearchDocs).toHaveBeenCalledWith('')
    })
  })
})
