// Undo / redo for one draft, kept in memory only. Typing in the same field within `windowMs` is one undo step,
// so undo goes back by phrases, not by letters. Pure (the clock is passed in), unit-tested.

export class UndoStack<T> {
  private past: T[] = []
  private future: T[] = []
  private lastKey = ''
  private lastAt = 0
  private readonly limit: number
  private readonly windowMs: number

  constructor(limit = 100, windowMs = 1000) {
    this.limit = limit
    this.windowMs = windowMs
  }

  /** Call BEFORE a change is applied, with the state as it is now. `key` names the field being typed in ('' = never merge). */
  record(before: T, key = '', now = Date.now()): void {
    const merge = key !== '' && key === this.lastKey && now - this.lastAt < this.windowMs && this.past.length > 0
    this.lastKey = key
    this.lastAt = now
    if (merge) return
    this.past.push(before)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  /** Step back; `current` goes onto the redo side. Returns the state to show, or null when there is nothing to undo. */
  undo(current: T): T | null {
    const prev = this.past.pop()
    if (prev === undefined) return null
    this.future.push(current)
    this.lastKey = ''
    return prev
  }

  redo(current: T): T | null {
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(current)
    this.lastKey = ''
    return next
  }

  clear(): void { this.past = []; this.future = []; this.lastKey = '' }
}
