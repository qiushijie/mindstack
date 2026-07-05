import { describe, it, expect, vi } from 'vitest'
import {
  combineCleanup,
  trackDocumentListener,
  trackInterval,
  trackListener,
  trackTimeout,
  trackWindowListener,
} from '../widgetCleanup'

describe('widgetCleanup', () => {
  it('trackListener removes event listener on dispose', () => {
    const target = new EventTarget()
    const listener = vi.fn()
    const handle = trackListener(target, 'test', listener)

    target.dispatchEvent(new Event('test'))
    expect(listener).toHaveBeenCalledTimes(1)

    handle.dispose()
    target.dispatchEvent(new Event('test'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('trackDocumentListener registers on document', () => {
    const listener = vi.fn()
    const handle = trackDocumentListener('click', listener)

    document.dispatchEvent(new MouseEvent('click'))
    expect(listener).toHaveBeenCalledTimes(1)

    handle.dispose()
  })

  it('trackWindowListener registers on window', () => {
    const listener = vi.fn()
    const handle = trackWindowListener('resize', listener)

    window.dispatchEvent(new Event('resize'))
    expect(listener).toHaveBeenCalledTimes(1)

    handle.dispose()
  })

  it('combineCleanup disposes all handles', () => {
    const target = new EventTarget()
    const l1 = vi.fn()
    const l2 = vi.fn()
    const h1 = trackListener(target, 'a', l1)
    const h2 = trackListener(target, 'b', l2)

    combineCleanup(h1, h2).dispose()

    target.dispatchEvent(new Event('a'))
    target.dispatchEvent(new Event('b'))
    expect(l1).not.toHaveBeenCalled()
    expect(l2).not.toHaveBeenCalled()
  })

  it('trackTimeout clears timeout on dispose', () => {
    const callback = vi.fn()
    const handle = trackTimeout(setTimeout(callback, 0) as unknown as ReturnType<typeof setTimeout>)
    handle.dispose()

    return new Promise(resolve => setTimeout(() => {
      expect(callback).not.toHaveBeenCalled()
      resolve(undefined)
    }, 10))
  })

  it('trackInterval clears interval on dispose', () => {
    const callback = vi.fn()
    const handle = trackInterval(setInterval(callback, 0) as unknown as ReturnType<typeof setInterval>)
    handle.dispose()

    return new Promise(resolve => setTimeout(() => {
      expect(callback).not.toHaveBeenCalled()
      resolve(undefined)
    }, 10))
  })
})
