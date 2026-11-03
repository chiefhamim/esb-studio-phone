// Vite transform: the vendored PC stylesheets (src/pc/**/*.css, except the global tokens and fonts) are wrapped in
// `@scope (.pc-host)` so the PC components keep their exact look inside phone sheets, and the PC's desktop rules can
// never restyle the phone shell. At-rules that cannot live inside @scope (@keyframes, @font-face, @property, @import,
// @charset, @layer statements) are hoisted out unchanged; html/body/:root-only rules are kept global only when they
// declare custom properties (token overrides), otherwise they are dropped (the phone shell owns the page).
import type { Plugin } from 'vite'

const GLOBAL_FILES = [/\/src\/pc\/fonts\.css$/, /\/src\/pc\/styles\/tokens\.css$/]
export const SCOPE = '.pc-host'

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

export function scopeCss(css: string, scope = SCOPE): string {
  const hoisted: string[] = []
  const scoped: string[] = []
  for (const stmt of topLevel(css)) {
    const head = stripComments(stmt.slice(0, stmt.indexOf('{') < 0 ? stmt.length : stmt.indexOf('{')))
    if (/^@(keyframes|-webkit-keyframes|font-face|property|import|charset|namespace)\b/i.test(head) || (/^@layer\b/i.test(head) && !stmt.includes('{'))) { hoisted.push(stmt); continue }
    if (!head) continue
    const sels = head.split(',').map((s) => s.trim())
    const pageOnly = sels.every((s) => /^(html|body|#root|:root)(\[[^\]]*\])?$/.test(s) || /^html(\[[^\]]*\])?\s*,?\s*body$/.test(s))
    if (pageOnly) {
      // keep only custom-property declarations (theme tokens); page layout rules belong to the phone shell
      const body = stmt.slice(stmt.indexOf('{') + 1, stmt.lastIndexOf('}'))
      const vars = body.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--'))
      if (vars.length) hoisted.push(`${head} { ${vars.join('; ')}; }`)
      continue
    }
    scoped.push(stmt)
  }
  return `${hoisted.join('\n')}\n@scope (${scope}) {\n${scoped.join('\n')}\n}\n`
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
