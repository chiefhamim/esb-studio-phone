// Vite transform: the vendored PC stylesheets (src/pc/**/*.css, except the global tokens and fonts) are wrapped in
// `@scope (.pc-host)` so the PC components keep their exact look inside phone sheets, and the PC's desktop rules can
// never restyle the phone shell. At-rules that cannot live inside @scope (@keyframes, @font-face, @property, @import,
// @charset, @layer statements) are hoisted out unchanged; html/body/:root-only rules are kept global only when they
// declare custom properties (token overrides), otherwise they are dropped (the phone shell owns the page).
import type { Plugin } from 'vite'

const GLOBAL_FILES = [/\/src\/pc\/fonts\.css$/, /\/src\/pc\/styles\/tokens\.css$/]
export const SCOPE = '.pc-host'
/** PC components portal some layers straight into <body> (controls.tsx Dialog/Popover/Tooltip, the translate popover):
 *  those roots are styling scopes too, or the PC dialogs and menus would show unstyled on the phone. */
export const PORTAL_ROOTS = ['body > .modal-bg', 'body > .popover', 'body > .tooltip', 'body > .ed-tp-pop']
const THEME_PREFIX = /^((?::root|html)?\[data-theme[^\]]*\](?:\.[\w-]+)*)\s*(.*)$/

/** Split a stylesheet into its top-level statements, respecting comments, strings and nested braces. */
export function topLevel(css: string): string[] {
  const out: string[] = []
  let depth = 0, start = 0, i = 0
  while (i < css.length) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue }
    if (c === '"' || c === "'") { let j = i + 1; while (j < css.length && css[j] !== c) { if (css[j] === '\\') j++; j++ } i = j + 1; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1 } }
    else if (c === ';' && depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1 }
    i++
  }
  const rest = css.slice(start).trim()
  if (rest) out.push(rest)
  return out.map((s) => s.trim()).filter(Boolean)
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').trim()

/** `:root[data-theme=dark] .x` cannot match inside @scope (the selector is implicitly relative to the scope root), so
 *  theme-prefixed rules are rewritten as `:root[data-theme=dark] :is(.pc-host, portal roots) .x` and kept outside. */
function rewriteThemed(head: string, body: string, roots: string): string | null {
  const sels = head.split(',').map((x) => x.trim())
  if (!sels.some((x) => THEME_PREFIX.test(x))) return null
  // `X` inside the scope, and X being the scope root itself (a portal root such as .modal-bg); a pseudo-element
  // stays outside :is(), where it is not allowed
  const both = (pre: string, rest: string) => {
    const i = rest.indexOf('::')
    const [base, pseudo] = i < 0 ? [rest, ''] : [rest.slice(0, i), rest.slice(i)]
    const self = base.trim() && !/[\s>+~]/.test(base.trim()) ? `, ${pre}:is(${roots}):is(${base.trim()})${pseudo}` : ''
    return `${pre} :is(${roots}) ${rest}${self}`
  }
  const out = sels.map((sel) => {
    const m = THEME_PREFIX.exec(sel)
    if (!m) return both('', sel).replace(/^ /, '')
    const rest = m[2].trim()
    return rest ? both(m[1], rest) : `${m[1]} :is(${roots})`
  })
  return `${out.join(', ')} ${body}`
}

export function scopeCss(css: string, scope = SCOPE): string {
  const roots = [scope, ...PORTAL_ROOTS].join(', ')
  const hoisted: string[] = []
  const scoped: string[] = []
  for (const stmt of topLevel(css)) {
    const head = stripComments(stmt.slice(0, stmt.indexOf('{') < 0 ? stmt.length : stmt.indexOf('{')))
    if (/^@(keyframes|-webkit-keyframes|font-face|property|import|charset|namespace)\b/i.test(head) || (/^@layer\b/i.test(head) && !stmt.includes('{'))) { hoisted.push(stmt); continue }
    if (!head) continue
    const sels = head.split(',').map((s) => s.trim())
    const pageOnly = sels.every((s) => /^(html|body|#root|:root)(\[[^\]]*\])?$/.test(s) || /^html(\[[^\]]*\])?\s*,?\s*body$/.test(s))
    const pageSels = sels.filter((x) => /^(html|body|#root|:root)(\[[^\]]*\])?$/.test(x))
    if (!pageOnly && pageSels.length && stmt.includes('{')) {
      // `:root, .app { --sel: … }`: the :root part must stay global so the tokens reach the phone
      const body = stmt.slice(stmt.indexOf('{') + 1, stmt.lastIndexOf('}'))
      const vars = body.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--'))
      if (vars.length) hoisted.push(`${pageSels.join(', ')} { ${vars.join('; ')}; }`)
    }
    if (pageOnly) {
      // keep only custom-property declarations (theme tokens); page layout rules belong to the phone shell
      const body = stmt.slice(stmt.indexOf('{') + 1, stmt.lastIndexOf('}'))
      const vars = body.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--'))
      if (vars.length) hoisted.push(`${head} { ${vars.join('; ')}; }`)
      continue
    }
    if (!head.startsWith('@')) {
      const themed = rewriteThemed(head, stmt.slice(stmt.indexOf('{')), roots)
      if (themed) { hoisted.push(themed); continue }
    }
    scoped.push(stmt)
  }
  const rules = scoped.join('\n')
  // a scope root never matches its own selectors, so the portal layers (direct children of <body>) are covered by a
  // body scope whose limit stops at every other child of <body> (the phone app itself)
  const portals = PORTAL_ROOTS.map((r) => r.replace('body > ', '')).join(', ')
  return `${hoisted.join('\n')}\n@scope (${scope}) {\n${rules}\n}\n@scope (body) to (:scope > :not(${portals})) {\n${rules}\n}\n`
}

export function pcCssScope(): Plugin {
  return {
    name: 'esb-pc-css-scope',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/')
      if (!file.includes('/src/pc/') || !file.endsWith('.css')) return null
      if (id.includes('?raw') || id.includes('?url')) return null
      if (GLOBAL_FILES.some((r) => r.test(file))) return null
      return { code: scopeCss(code), map: null }
    },
  }
}
