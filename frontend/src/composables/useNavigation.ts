import { ref } from 'vue'

export type PageName = 'editor' | 'settings'

const currentPage = ref<PageName>('editor')

export function useNavigation() {
  function navigateTo(page: PageName) {
    currentPage.value = page
  }

  return { currentPage, navigateTo }
}

if (import.meta.env.DEV) {
  ;(window as any).__navigateTo = (page: string) => {
    if (page === 'settings' || page === 'editor') {
      currentPage.value = page
    }
  }
}
