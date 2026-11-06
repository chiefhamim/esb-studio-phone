// Draw the blueprint on the phone (inspectable build, `adb forward tcp:9444 localabstract:webview_devtools_remote_<pid>`)
// and save its values.
//   node tools/layout-lab/bp.mjs <name> <outDir>     overlay on, values -> <outDir>/<name>.json
//   node tools/layout-lab/bp.mjs --clear             overlay off (take the clean screenshot after this)
//   node tools/layout-lab/bp.mjs --where             prints what is on screen (the open dialog/sheet titles), to name a shot
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [, , name, outDir] = process.argv
const PORT = process.env.CDP_PORT || 9444

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
if (!page) { console.error('No WebView page on port ' + PORT); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const evaluate = (expression) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })) })
  .then((d) => { if (d.result?.exceptionDetails) throw new Error(JSON.stringify(d.result.exceptionDetails).slice(0, 400)); return d.result?.result?.value })

const lib = readFileSync(join(here, 'blueprint.js'), 'utf8')
try {
  if (name === '--clear') { await evaluate(`(${lib.trim().replace(/;$/, '')}, window.__bp && window.__bp.clear(), 'cleared')`); console.log('overlay off') }
  else if (name === '--where') {
    console.log(await evaluate(`[...document.querySelectorAll('h1, h2, [role=dialog] [class*=title], .m-sheet-title')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.top < innerHeight }).map(e => e.textContent.trim().slice(0, 50)).slice(0, 8).join(' | ')`))
  } else {
    if (!name || !outDir) { console.error('usage: node bp.mjs <name> <outDir> | --clear | --where'); process.exit(1) }
    const res = await evaluate(`(${lib.trim().replace(/;$/, '')}, JSON.stringify(window.__bp.draw({ text: true, name: ${JSON.stringify(name)} })))`)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, name + '.json'), res)
    console.log(`${name}: ${JSON.parse(res).items.length} measured`)
  }
} finally { ws.close() }
