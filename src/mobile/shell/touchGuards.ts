// Touch guards for the vendored PC controls, which were made for a mouse.
//  1. Sliders: a tap or a swipe that lands on the TRACK used to jump the value. Now a slider only moves when the finger lands on
//     (or right next to) its handle; a swipe that starts anywhere else just scrolls the page.
//  2. The featured photo and its controls stay locked until the editor taps "Adjust photo" (see FramingLock in StoryEditor).

const HANDLE_REACH = 30 // px either side of the handle centre that still counts as grabbing it
const HANDLE_HALF = 12 // half the handle's width: the handle centre never reaches the very end of the track

export function startTouchGuards(): () => void {
  let held: { el: HTMLInputElement; value: string } | null = null

  const onDown = (e: PointerEvent) => {
    held = null
    const el = e.target
    if (!(el instanceof HTMLInputElement) || el.type !== 'range' || e.pointerType === 'mouse') return
    const r = el.getBoundingClientRect()
    const min = Number(el.min || 0), max = Number(el.max || 100)
    const frac = max > min ? (Number(el.value) - min) / (max - min) : 0
    const cx = r.left + HANDLE_HALF + frac * Math.max(0, r.width - 2 * HANDLE_HALF)
    if (Math.abs(e.clientX - cx) > HANDLE_REACH) held = { el, value: el.value }
  }
  const setNative = (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    set?.call(el, v)
  }
  const onChange = (e: Event) => {
    if (!held || e.target !== held.el) return
    // the finger did not land on the handle: undo the jump and keep React from ever seeing it
    e.stopImmediatePropagation()
    setNative(held.el, held.value)
  }
  const onUp = () => { held = null }

  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('input', onChange, true)
  document.addEventListener('change', onChange, true)
  document.addEventListener('pointerup', onUp, true)
  document.addEventListener('pointercancel', onUp, true)
  return () => {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('input', onChange, true)
    document.removeEventListener('change', onChange, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onUp, true)
  }
}
