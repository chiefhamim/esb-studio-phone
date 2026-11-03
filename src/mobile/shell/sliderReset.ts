// Every slider in the PC panels gets a reset button on its label line, so an accidental drag is one tap from undone.
// src/pc is vendored, so this is added from outside: a reset writes the slider's value the way a finger would (native setter +
// an input event), and React's own onChange does the rest. The default is the known neutral for the control (100 %, 0 px,
// centred ...); for any other slider it is the value the slider first showed.
const KNOWN: [RegExp, number][] = [
  [/^letter spacing/i, 0], [/^opacity/i, 100], [/^blur/i, 0], [/^zoom/i, 0], [/^horizontal/i, 0], [/^vertical/i, 0], [/^size\b/i, 100],
]
const first = new WeakMap<HTMLInputElement, number>()

function label(el: HTMLInputElement): string {
  const f = el.closest('.field')
  const l = f?.querySelector('label')
  return (l?.textContent ?? el.getAttribute('aria-label') ?? '').trim()
}

function setValue(el: HTMLInputElement, v: number) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  set?.call(el, String(v))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function enhance(el: HTMLInputElement) {
  const field = el.closest('.field') as HTMLElement | null
  if (!field || !el.closest('.gx-panel')) return
  if (!first.has(el)) first.set(el, Number(el.value))
  let btn = field.querySelector<HTMLButtonElement>(':scope > .sl-reset')
  if (!btn) {
    btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sl-reset'
    btn.setAttribute('aria-label', 'Reset to default')
    btn.title = 'Reset to default'
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
    btn.addEventListener('click', () => { const s = field.querySelector<HTMLInputElement>('input[type=range]'); if (s) setValue(s, defaultOf(s)) })
    field.appendChild(btn)
  }
  btn.disabled = Math.abs(Number(el.value) - defaultOf(el)) < Number(el.step || 1) / 2
}

function defaultOf(el: HTMLInputElement): number {
  const t = label(el)
  const k = KNOWN.find(([re]) => re.test(t))
  const raw = k ? k[1] : first.get(el) ?? Number(el.value)
  return Math.min(Number(el.max), Math.max(Number(el.min), raw))
}

export function startSliderReset(): () => void {
  const run = () => document.querySelectorAll<HTMLInputElement>('.gx-panel input[type=range]').forEach(enhance)
  run()
  const mo = new MutationObserver(() => requestAnimationFrame(run))
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'style'] })
  const on = () => requestAnimationFrame(run)
  document.addEventListener('input', on, true)
  return () => { mo.disconnect(); document.removeEventListener('input', on, true) }
}
