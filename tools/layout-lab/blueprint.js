// Layout blueprint: draws redlines over the app as it is on screen and returns every value it drew.
// Used three ways: injected on the phone over CDP (tools/layout-lab/bp.mjs), by the Layout Lab page (lab.html) inside
// its app frame, and by the gallery crawler. Plain browser JS, no imports: it is evaluated as one expression.
//
//   window.__bp.draw({ text: true })  -> { screen, viewport, items: [...] }   overlay on
//   window.__bp.clear()                                                    overlay off
//   window.__bp.selectorOf(el)                                             the selector the Lab edits for an element
// The Lab runs it from its own page against the app frame (the app's CSP blocks eval): it wraps this text in
// new Function('window', 'document', 'getComputedStyle', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'location', ...).
//
// What it marks, per visible container (an element with a fill, a border, a shadow, rounded corners, or a flex/grid gap):
//   outline (dashed) · padding (green bands, px) · corner radius (r) · gap between its children (magenta, measured
//   from the real boxes, so margins count) · and for text (with text: true) the size/line height (blue).
(() => {
  if (window.__bp) return window.__bp
  const px = (v) => Math.round(parseFloat(v) * 10) / 10 || 0
  const visible = (r) => r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth

  function selectorOf(el) {
    const part = (e) => {
      const cls = [...e.classList].filter((c) => !/^(is-|has-|me-pane-in|me-pane-out|m-view-)/.test(c)).slice(0, 3)
      return cls.length ? '.' + cls.join('.') : e.tagName.toLowerCase()
    }
    const own = part(el)
    let p = el.parentElement
    while (p && !p.classList.length && p !== document.body) p = p.parentElement
    return p && p !== document.body ? `${part(p)} > ${own}`.replace(/ > (?=[a-z])/, ' > ') : own
  }

  function isContainer(el, cs) {
    if (el.closest('svg') || el.id === '__bp') return false
    const bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'
    const img = cs.backgroundImage && cs.backgroundImage !== 'none'
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0)
    const radius = parseFloat(cs.borderTopLeftRadius) > 0
    const shadow = cs.boxShadow && cs.boxShadow !== 'none'
    const flexGap = /flex|grid/.test(cs.display) && (parseFloat(cs.rowGap) > 0 || parseFloat(cs.columnGap) > 0)
    const padded = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['padding' + s]) >= 4) && el.children.length > 0
    return bg || img || border || radius || shadow || flexGap || padded
  }

  let layer = null
  function clear() { layer?.remove(); layer = null }

  function draw(opts = {}) {
    clear()
    layer = document.createElement('div')
    layer.id = '__bp'
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 9.5px/1 system-ui,sans-serif'
    const items = []
    const add = (html) => layer.insertAdjacentHTML('beforeend', html)
    const tag = (x, y, text, color) => add(`<span style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);padding:1px 3px;border-radius:3px;background:${color};color:#fff;white-space:nowrap">${text}</span>`)
    const band = (x, y, w, h, color) => add(`<i style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${color}"></i>`)

    const all = [...document.body.querySelectorAll('*')]
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (!visible(r)) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue
      const textOnly = opts.text && el.children.length === 0 && el.textContent.trim().length > 1 && !el.closest('svg')
      const cont = isContainer(el, cs)
      if (!cont && !textOnly) continue
      const pad = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) }
      const item = {
        sel: selectorOf(el), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        pad, radius: px(cs.borderTopLeftRadius), gap: px(cs.rowGap) || px(cs.columnGap) || 0,
        font: textOnly ? `${px(cs.fontSize)}/${cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight)} ${cs.fontWeight}` : undefined,
        text: textOnly ? el.textContent.trim().slice(0, 40) : undefined, spacing: [],
      }
      if (cont) {
        add(`<i style="position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1px dashed rgba(255,80,0,.75);outline-offset:-1px;border-radius:${cs.borderTopLeftRadius}"></i>`)
        // a screen-sized wrapper would flood the view: its padding is labelled, not shaded
        const G = r.width * r.height > innerWidth * innerHeight * 0.45 ? 'transparent' : 'rgba(16,185,129,.28)'
        if (pad.t >= 2) { band(r.left, r.top, r.width, pad.t, G); if (pad.t >= 4) tag(r.left + r.width / 2, r.top + pad.t / 2, pad.t, '#059669') }
        if (pad.b >= 2) { band(r.left, r.bottom - pad.b, r.width, pad.b, G); if (pad.b >= 4) tag(r.left + r.width / 2, r.bottom - pad.b / 2, pad.b, '#059669') }
        if (pad.l >= 2) { band(r.left, r.top + pad.t, pad.l, r.height - pad.t - pad.b, G); if (pad.l >= 4) tag(r.left + pad.l / 2, r.top + r.height / 2, pad.l, '#059669') }
        if (pad.r >= 2) { band(r.right - pad.r, r.top + pad.t, pad.r, r.height - pad.t - pad.b, G); if (pad.r >= 4) tag(r.right - pad.r / 2, r.top + r.height / 2, pad.r, '#059669') }
        if (item.radius >= 2) tag(r.left + 12, r.top + 7, 'r' + item.radius, '#ea580c')
        // spacing between consecutive visible children, measured from their boxes (gap + margins, what the eye sees)
        const kids = [...el.children].map((k) => [k, k.getBoundingClientRect()]).filter(([k, kr]) => visible(kr) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed')
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1][1], b = kids[i][1]
          if (b.top >= a.bottom - 0.5) { // stacked
            const d = Math.round(b.top - a.bottom)
            item.spacing.push(d)
            if (d >= 1) { band(Math.max(a.left, b.left), a.bottom, 2, d, '#c026d3'); tag(Math.max(a.left, b.left) + 14, a.bottom + d / 2, d, '#c026d3') }
          } else if (b.left >= a.right - 0.5) { // side by side
            const d = Math.round(b.left - a.right)
            item.spacing.push(d)
            if (d >= 1) tag(a.right + d / 2, Math.max(a.top, b.top) + 8, d, '#c026d3')
          }
        }
      }
      if (textOnly) tag(r.right - 18, r.top + 5, item.font.split(' ')[0], '#2563eb')
      items.push(item)
    }
    document.documentElement.appendChild(layer)
    return { screen: opts.name || location.hash || 'screen', viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, items }
  }

  window.__bp = { draw, clear, selectorOf }
  return window.__bp
})()
