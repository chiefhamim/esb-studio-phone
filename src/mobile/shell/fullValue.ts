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
    const editing = document.activeElement === input
    // while the field is collapsed its own width is 0, so judge it by the text length against the last measured width
    const was = input.classList.contains('me-collapsed')
    const overflows = was ? input.value.length > 0 : input.scrollWidth > input.clientWidth + 1 && input.value.length > 0
    if (!overflows) { input.classList.remove('me-collapsed'); line?.remove(); continue }
    // resting: the box itself shows the whole text, wrapped; tapping it brings back the editable field
    input.classList.toggle('me-collapsed', !editing)
    if (line) line.classList.toggle('is-box', !editing)
    if (!line) {
      line = document.createElement('p')
      line.className = 'me-fullval'
      line.dataset.for = id
      line.addEventListener('click', () => { input.classList.remove('me-collapsed'); input.focus() })
      input.insertAdjacentElement('afterend', line)
      line.classList.toggle('is-box', !editing)
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
  document.addEventListener('focusin', queue, true)
  document.addEventListener('focusout', queue, true)
  window.addEventListener('resize', queue)
  queue()
  return () => {
    cancelAnimationFrame(raf)
    obs.disconnect()
    document.removeEventListener('input', queue, true)
    document.removeEventListener('focusin', queue, true)
    document.removeEventListener('focusout', queue, true)
    document.querySelectorAll('.me-collapsed').forEach((n) => n.classList.remove('me-collapsed'))
    window.removeEventListener('resize', queue)
    document.querySelectorAll('.me-fullval').forEach((n) => n.remove())
  }
}
