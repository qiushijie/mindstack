export function interceptWidgetPointer(e: Event): void {
  e.preventDefault()
  e.stopPropagation()
}

export function interceptWidgetMouse(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
}

export function isInsideWidget(target: EventTarget | null, cls: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest(`.${cls}`)
}

export function addWidgetClickHandler(element: HTMLElement, handler: (e: MouseEvent) => void): () => void {
  const wrapped = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handler(e)
  }
  element.addEventListener('click', wrapped)
  return () => element.removeEventListener('click', wrapped)
}

export function addWidgetMouseDownHandler(element: HTMLElement, handler: (e: MouseEvent) => void): () => void {
  const wrapped = (e: MouseEvent) => {
    e.stopPropagation()
    handler(e)
  }
  element.addEventListener('mousedown', wrapped)
  return () => element.removeEventListener('mousedown', wrapped)
}
