import { ref } from 'vue'
import { SearchDocs } from '../../wailsjs/go/main/App'

export function useSearch() {
  const searchLoading = ref(false)
  const searchError = ref('')

  async function searchDocs(tag: string) {
    searchLoading.value = true
    searchError.value = ''
    try {
      const result = await SearchDocs(tag)
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
