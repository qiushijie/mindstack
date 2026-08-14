import { ref } from 'vue'
import { SearchDocsV2 } from '../../wailsjs/go/main/App'

// The AI chat panel's /search uses hybrid mode, matching the CLI's
// `mindstack search --mode hybrid` (tag + fulltext combined).
const SEARCH_MODE = 'hybrid'

export function useSearch() {
  const searchLoading = ref(false)
  const searchError = ref('')

  async function searchDocs(query: string) {
    searchLoading.value = true
    searchError.value = ''
    try {
      const result = await SearchDocsV2(query, SEARCH_MODE)
      const parsed = JSON.parse(result)
      if (parsed.error) {
        searchError.value = parsed.error
        return null
      }
      return parsed
    } catch (err: any) {
      searchError.value = err.message || 'Search failed'
      return null
    } finally {
      searchLoading.value = false
    }
  }

  return { searchLoading, searchError, searchDocs }
}
