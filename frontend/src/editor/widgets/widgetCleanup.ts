export interface CleanupHandle {
  dispose(): void
}

class ListenerCleanupHandle implements CleanupHandle {
  private disposed = false

  constructor(
    private readonly target: EventTarget,
    private readonly type: string,
    private readonly listener: EventListener,
    private readonly options?: AddEventListenerOptions,
  ) {}

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.target.removeEventListener(this.type, this.listener, this.options)
  }
}

export function trackListener(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions,
): CleanupHandle {
  target.addEventListener(type, listener, options)
  return new ListenerCleanupHandle(target, type, listener, options)
}

export function trackDocumentListener(
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions,
): CleanupHandle {
  return trackListener(document, type, listener, options)
}

export function trackWindowListener(
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions,
): CleanupHandle {
  return trackListener(window, type, listener, options)
}

export function combineCleanup(...handles: CleanupHandle[]): CleanupHandle {
  return {
    dispose() {
      handles.forEach(h => h.dispose())
    },
  }
}

export function trackTimeout(handle: ReturnType<typeof setTimeout>): CleanupHandle {
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      clearTimeout(handle)
    },
  }
}

export function trackInterval(handle: ReturnType<typeof setInterval>): CleanupHandle {
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      clearInterval(handle)
    },
  }
}
