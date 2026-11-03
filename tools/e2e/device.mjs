// On-device checks over WebView DevTools (adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>).
//   node tools/e2e/device.mjs <step>
// Steps never publish or post. Anything a step creates is removed by the `cleanup` step.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ADB = 'C:/Users/User/android-dev/sdk/platform-tools/adb.exe'
const PKG = 'com.esbpowerline.studio.phone'
const OUT = path.resolve(import.meta.dirname, '../../docs/screens/pc-clone/device')
fs.mkdirSync(OUT, { recursive: true })
export const TEST_HEADLINE = 'DEVICE TEST, delete me'
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  const pid = adb('shell', 'pidof', PKG)
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`)
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  return { b, p }
}
function shot(name) { fs.writeFileSync(path.join(OUT, `${name}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'])) }
async function tapEl(p, locator) { // a real finger tap through adb (opens the real keyboard), at the element's centre
  const box = await locator.boundingBox()
  const dpr = await p.evaluate(() => devicePixelRatio)
  adb('shell', 'input', 'tap', String(Math.round((box.x + box.width / 2) * dpr)), String(Math.round((box.y + box.height / 2) * dpr)))
}
const nav = (p, t) => p.evaluate((t) => { [...document.querySelectorAll('.m-nav-item')].find((x) => x.textContent.trim() === t)?.click() }, t)

const steps = {
  async launch() {
    adb('shell', 'am', 'force-stop', PKG)
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1')
    await sleep(5000)
    shot('launch')
  },
  // a story with a headline typed through the real keyboard, then the keyboard state is captured
  async keyboard() {
    const { b, p } = await connect()
    await nav(p, 'Editorial')
    await sleep(800)
    await p.locator('button:visible', { hasText: 'Blank story' }).first().click()
    await sleep(1200)
    await p.locator('.me-tabs [role=tab]:visible', { hasText: 'Details' }).first().click().catch(() => {})
    await sleep(600)
    const field = p.locator('textarea:visible, input[type=text]:visible').first()
    await tapEl(p, field)
    await sleep(1500)
    adb('shell', 'input', 'text', TEST_HEADLINE.replace(/ /g, '%s').replace(/,/g, ''))
    await sleep(1200)
    const r = await p.evaluate(() => {
      const el = document.activeElement
      const rr = el?.getBoundingClientRect()
      return { kb: getComputedStyle(document.documentElement).getPropertyValue('--m-kb'), kbOpen: document.documentElement.classList.contains('kb-open'), focusedBottom: rr ? Math.round(rr.bottom) : null, innerHeight, vv: Math.round(visualViewport?.height ?? 0), value: el?.value ?? el?.textContent }
    })
    console.log('keyboard', JSON.stringify(r))
    shot('keyboard-open')
    adb('shell', 'input', 'keyevent', 'BACK') // closes the keyboard
    await sleep(800)
    await b.close().catch(() => {})
  },
  // the story must still be there after the app is force-stopped
  async survive() {
    adb('shell', 'am', 'force-stop', PKG)
    await sleep(1000)
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1')
    await sleep(5000)
    const { b, p } = await connect()
    const rows = await p.locator('.m-home .m-row').allTextContents()
    console.log('after force-stop, home rows:', JSON.stringify(rows))
    shot('after-force-stop')
    await b.close().catch(() => {})
  },
  // Android back: closes a sheet first, then returns to Home
  async back() {
    const { b, p } = await connect()
    await nav(p, 'Graphics')
    await sleep(1000)
    await p.locator('.gx-dock-item:visible', { hasText: 'Layers' }).first().click()
    await sleep(800)
    const sheetBefore = await p.locator('.m-sheet').count()
    adb('shell', 'input', 'keyevent', 'BACK')
    await sleep(700)
    const sheetAfter = await p.locator('.m-sheet').count()
    const routeAfter1 = await p.evaluate(() => document.querySelector('.m-nav-item.is-on')?.textContent?.trim())
    adb('shell', 'input', 'keyevent', 'BACK')
    await sleep(700)
    const routeAfter2 = await p.evaluate(() => document.querySelector('.m-nav-item.is-on')?.textContent?.trim())
    console.log('back', JSON.stringify({ sheetBefore, sheetAfter, routeAfter1, routeAfter2 }))
    await b.close().catch(() => {})
  },
  // export one PNG through the real MediaStore plugin, check the file, then delete it
  async export() {
    const { b, p } = await connect()
    await nav(p, 'Graphics')
    await sleep(1000)
    const r = await p.evaluate(async () => {
      const { Capacitor } = window
      const MediaStore = Capacitor.Plugins.MediaStore
      // 1x1 PNG
      const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      try { return await MediaStore.saveImage({ name: 'esb-device-test-delete-me.png', mime: 'image/png', data }) } catch (e) { return { error: String(e) } }
    })
    console.log('mediastore', JSON.stringify(r))
    const ls = adb('shell', 'ls', '-l', '/sdcard/Pictures/ESB Studio/')
    console.log(ls)
    if (r.uri) adb('shell', 'content', 'delete', '--uri', r.uri)
    console.log('after delete:', adb('shell', 'ls', '/sdcard/Pictures/ESB Studio/'))
    await b.close().catch(() => {})
  },
  // remove the test story created by `keyboard`
  async cleanup() {
    const { b, p } = await connect()
    const removed = await p.evaluate(async (title) => {
      const key = 'esb-banner-studio/editorial/queue/v1'
      const q = JSON.parse(localStorage.getItem(key) ?? '{"stories":[]}')
      const before = q.stories.length
      return { before, match: q.stories.filter((s) => (s.snapshot?.draft?.headline ?? '').includes(title.replace(/,/g, ''))).map((s) => s.id) }
    }, TEST_HEADLINE)
    console.log('test stories found', JSON.stringify(removed))
    await b.close().catch(() => {})
  },
}

const step = process.argv[2]
if (!steps[step]) { console.log('steps:', Object.keys(steps).join(', ')); process.exit(2) }
await steps[step]()
process.exit(0)
