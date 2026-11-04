// A single-line field cannot show a long SEO title or slug: the end is cut off. For those fields (the vendored PC inputs) a small
// line under the field shows the complete text whenever it does not fit. Plain DOM, outside React's tree, removed on cleanup.
const FIELDS = ['draft-meta-title', 'draft-slug', 'draft-keyphrase']

function refresh() {
  for (const id of FIELDS) {
    const input = document.getElementById(id) as HTMLInputElement | null
    if (!input) continue
    const host = input.parentElement
    if (!host) continue
    let line = host.querySelector<HTMLElement>(`:scope > .me-fullval[data-for="${id}"]`)
    const overflows = input.scrollWidth > input.clientWidth + 1 && input.value.length > 0
    if (!overflows) { line?.remove(); continue }
    if (!line) {
      line = document.createElement('p')
      line.className = 'me-fullval'
      line.dataset.for = id
      input.insertAdjacentElement('afterend', line)
    }
    if (line.textContent !== input.value) line.textContent = input.value
  }
}

export function startFullValue(): () => void {
  let raf = 0
  const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh) }
  const obs = new MutationObserver(queue)
  obs.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('input', queue, true)
  window.addEventListener('resize', queue)
  queue()
  return () => {
    cancelAnimationFrame(raf)
    obs.disconnect()
    document.removeEventListener('input', queue, true)
    window.removeEventListener('resize', queue)
    document.querySelectorAll('.me-fullval').forEach((n) => n.remove())
  }
}
