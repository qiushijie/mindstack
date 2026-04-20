import { ref, readonly, nextTick, type Ref } from 'vue'
import type { EditorBlock } from '../types/editor'

interface DragState {
  isDragging: boolean
  dragIndex: number
  dropIndex: number
  currentY: number
}

export function useBlockDrag(blocks: Ref<EditorBlock[]>) {
  const dragState = ref<DragState>({
    isDragging: false,
    dragIndex: -1,
    dropIndex: -1,
    currentY: 0,
  })

  const blockRefs = new Map<number, HTMLElement>()

  function registerBlockRef(index: number, el: HTMLElement) {
    blockRefs.set(index, el)
  }

  function startDrag(index: number, event: PointerEvent) {
    dragState.value = {
      isDragging: true,
      dragIndex: index,
      dropIndex: index,
      currentY: event.clientY,
    }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(event: PointerEvent) {
    dragState.value.currentY = event.clientY
    const dropIndex = computeDropIndex()
    if (dropIndex !== dragState.value.dropIndex) {
      dragState.value.dropIndex = dropIndex
    }
  }

  function computeDropIndex(): number {
    const { dragIndex, currentY } = dragState.value
    const len = blocks.value.length
    if (len === 0) return 0

    const sortedIndices = Array.from(blockRefs.keys()).sort((a, b) => a - b)

    for (let i = 0; i < sortedIndices.length; i++) {
      const idx = sortedIndices[i]
      if (idx === dragIndex) continue
      const el = blockRefs.get(idx)
      if (!el) continue

      const rect = el.getBoundingClientRect()
      const midY = rect.top + rect.height / 2

      if (currentY < midY) {
        if (idx <= dragIndex) return idx
        return idx - 1
      }
    }

    return len - 1
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)

    const { dragIndex, dropIndex } = dragState.value
    if (dragIndex !== dropIndex && dragIndex >= 0 && dropIndex >= 0) {
      animateReorder(dragIndex, dropIndex)
    } else {
      resetState()
    }
  }

  function animateReorder(fromIndex: number, toIndex: number) {
    const firstRects = new Map<number, { top: number }>()
    blockRefs.forEach((el, idx) => {
      const rect = el.getBoundingClientRect()
      firstRects.set(idx, { top: rect.top })
    })

    const block = blocks.value.splice(fromIndex, 1)[0]
    blocks.value.splice(toIndex, 0, block)

    dragState.value.isDragging = false

    nextTick(() => {
      blockRefs.forEach((el, idx) => {
        const first = firstRects.get(idx)
        if (!first) return

        const last = el.getBoundingClientRect()
        const deltaY = first.top - last.top

        if (deltaY !== 0) {
          el.style.transform = `translateY(${deltaY}px)`
          el.style.transition = 'none'
        }
      })

      requestAnimationFrame(() => {
        blockRefs.forEach((el) => {
          if (el.style.transform) {
            el.style.transition = 'transform 0.15s ease'
            el.style.transform = ''
          }
        })
      })

      setTimeout(() => {
        blockRefs.forEach((el) => {
          el.style.transition = ''
          el.style.transform = ''
        })
        resetState()
      }, 160)
    })
  }

  function resetState() {
    dragState.value = {
      isDragging: false,
      dragIndex: -1,
      dropIndex: -1,
      currentY: 0,
    }
  }

  function cleanup() {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    blockRefs.clear()
  }

  return {
    dragState: readonly(dragState),
    registerBlockRef,
    startDrag,
    cleanup,
  }
}
