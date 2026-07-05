import { describe, it, expect } from 'vitest'
import {
  cursorInsideRange,
  rangesOverlap,
  selectionInsideRange,
  selectionIntersectsRange,
  widgetEditingState,
} from '../widgetMode'

describe('widgetMode', () => {
  describe('selectionIntersectsRange', () => {
    it('returns true when selection is fully inside range', () => {
      expect(selectionIntersectsRange({ from: 3, to: 5 }, { from: 0, to: 10 })).toBe(true)
    })

    it('returns true when selection overlaps start', () => {
      expect(selectionIntersectsRange({ from: -2, to: 3 }, { from: 0, to: 10 })).toBe(true)
    })

    it('returns true when selection overlaps end', () => {
      expect(selectionIntersectsRange({ from: 8, to: 12 }, { from: 0, to: 10 })).toBe(true)
    })

    it('returns true when selection covers range', () => {
      expect(selectionIntersectsRange({ from: -1, to: 11 }, { from: 0, to: 10 })).toBe(true)
    })

    it('returns false when selection is before range', () => {
      expect(selectionIntersectsRange({ from: -5, to: 0 }, { from: 0, to: 10 })).toBe(false)
    })

    it('returns false when selection is after range', () => {
      expect(selectionIntersectsRange({ from: 10, to: 15 }, { from: 0, to: 10 })).toBe(false)
    })

    it('treats collapsed cursor inside range as intersecting', () => {
      expect(selectionIntersectsRange({ from: 5, to: 5 }, { from: 0, to: 10 })).toBe(true)
    })

    it('treats collapsed cursor at range boundary as not intersecting', () => {
      expect(selectionIntersectsRange({ from: 0, to: 0 }, { from: 0, to: 10 })).toBe(false)
      expect(selectionIntersectsRange({ from: 10, to: 10 }, { from: 0, to: 10 })).toBe(false)
    })
  })

  describe('selectionInsideRange', () => {
    it('returns true when selection is fully contained', () => {
      expect(selectionInsideRange({ from: 2, to: 8 }, { from: 0, to: 10 })).toBe(true)
    })

    it('returns false when selection crosses boundary', () => {
      expect(selectionInsideRange({ from: -1, to: 5 }, { from: 0, to: 10 })).toBe(false)
    })

    it('returns true for collapsed cursor inside range', () => {
      expect(selectionInsideRange({ from: 5, to: 5 }, { from: 0, to: 10 })).toBe(true)
    })
  })

  describe('cursorInsideRange', () => {
    it('returns true for cursor inside range', () => {
      expect(cursorInsideRange(5, { from: 0, to: 10 })).toBe(true)
    })

    it('returns false for cursor at end boundary', () => {
      expect(cursorInsideRange(10, { from: 0, to: 10 })).toBe(false)
    })

    it('returns true for cursor at start boundary', () => {
      expect(cursorInsideRange(0, { from: 0, to: 10 })).toBe(true)
    })
  })

  describe('rangesOverlap', () => {
    it('returns true for overlapping ranges', () => {
      expect(rangesOverlap({ from: 0, to: 5 }, { from: 3, to: 8 })).toBe(true)
    })

    it('returns false for adjacent ranges', () => {
      expect(rangesOverlap({ from: 0, to: 5 }, { from: 5, to: 10 })).toBe(false)
    })
  })

  describe('widgetEditingState', () => {
    it('returns editing when selection intersects', () => {
      expect(widgetEditingState({ from: 2, to: 5 }, { from: 0, to: 10 })).toBe('editing')
    })

    it('returns preview when selection does not intersect', () => {
      expect(widgetEditingState({ from: 12, to: 15 }, { from: 0, to: 10 })).toBe('preview')
    })
  })
})
