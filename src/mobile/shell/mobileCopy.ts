// Phone wording for the PC's own help text. src/pc is vendored byte-exact, so its strings (written for a mouse and keyboard:
// "click", "Ctrl+V", "double-click", "Shift-click", shortcut letters in tooltips) cannot be edited at the source. Instead they
// are rewritten as they appear: text nodes and the title / aria-label / data-tip attributes, once on start and then for
// whatever React adds or changes. Every rule is a plain wording change; nothing here alters what a control does.
const TEXT: [RegExp, string][] = [
  [/Click, drop files on the banner, or paste \(Ctrl\+V\)\.\s*Photos fill the collage slots in order\./, 'Tap Add to bring photos in from your gallery or camera. Photos fill the collage slots in order.'],
  [/Select a slot, then click a photo above to place it\./, 'Select a slot, then tap a photo above to place it.'],
  [/Click an element on the banner to edit it\.\s*Shift-click or drag a box to select several\./, 'Tap an element on the banner to edit it.'],
  [/Drag the header or footer on the banner to move it as one block; double-click to pick a single element inside it\./, 'Drag the header or footer on the banner to move it as one block; pick a single element from Layers.'],
  [/Photos from this article \(click to use\):/, 'Photos from this article (tap to use):'],
  [/Wording comes from the Story panel \(double-click the text to jump there\)\./, 'Wording comes from the Story panel: open Story below to edit it.'],
  [/Click or drag across words below to highlight on the banner/, 'Tap or drag across words below to highlight on the banner'],
  [/or drop image file here/, 'Opens your photo gallery'],
  [/Click to choose a photo \(or drop image files\)/, 'Choose a photo'],
  [/\s*Double-click a slider to zero it\./, ''],
  [/Drop an image here, or pick one of the story photos below/, 'Pick one of the story photos below, or add your own'],
  [/saved on this computer/, 'saved on this phone'],
  [/\bthis computer\b/g, 'this phone'],
  [/Billed to that Console account, separate from a Claude\.ai subscription\./, 'Billed separately from a Claude.ai subscription.'],
  [/Billed to the Platform account, separate from ChatGPT Plus\./, 'Billed separately from ChatGPT Plus.'],
  [/Publishing from the desktop app uploads the Web banner as the article image; alt text and caption go with it\./, 'Alt text and caption go to the site with the article.'],
]
// tooltips and labels carry the keyboard shortcut: "Undo (Ctrl+Z)", "Add text layer (T)"
const ATTR: [RegExp, string][] = [
  ...TEXT,
  [/\s*\((?:Ctrl|Cmd|Shift|Alt)(?:\s*\+\s*[A-Za-z0-9[\]\/.,=-]+)+\)/g, ''],
  [/\s*\([A-Z]\)$/, ''],
]
const ATTRS = ['title', 'aria-label', 'data-tip'] as const

function fix(value: string, rules: [RegExp, string][]): string {
  let v = value
  for (const [re, to] of rules) v = v.replace(re, to)
  return v
}

function text(node: Text) {
  const v = node.nodeValue
  if (!v || v.length < 4) return
  // never rewrite what the editor is writing or reading as the story itself
  if (node.parentElement?.closest('[contenteditable="true"], .ProseMirror, textarea, input, .rv, .article-body')) return
  const w = fix(v, TEXT)
  if (w !== v) node.nodeValue = w
}

function attrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (!v) continue
    const w = fix(v, ATTR)
    if (w !== v) el.setAttribute(a, w)
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { text(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  attrs(el)
  el.querySelectorAll('[title],[aria-label],[data-tip]').forEach(attrs)
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = tw.nextNode())) text(n as Text)
}

export function startMobileCopy(): () => void {
  walk(document.body)
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk)
      else if (m.type === 'characterData') text(m.target as Text)
      else if (m.type === 'attributes') attrs(m.target as Element)
    }
  })
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
  return () => mo.disconnect()
}
