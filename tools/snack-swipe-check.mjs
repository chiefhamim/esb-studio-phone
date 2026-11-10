// Snackbar swipe check (dev server): a snack follows a sideways drag and is dismissed past a third of its width; a short
// drag springs back. Usage: npx vite --port 5199 (in another shell), then node tools/snack-swipe-check.mjs
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://localhost:5199/'); await page.waitForTimeout(3000)
const show = (t) => page.evaluate((t) => import('/src/mobile/shell/core.ts').then((m) => m.snack(t, { ms: 20000, action: { label: 'Undo', run: () => {} } })), t)
const count = () => page.locator('.m-snack:not(.is-out)').count()
const drag = async (dx) => {
  const b = await page.locator('.m-snack').first().boundingBox()
  const x = b.x + 40, y = b.y + b.height / 2
  await page.mouse.move(x, y); await page.mouse.down()
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x + (dx * i) / 8, y); await page.waitForTimeout(16) }
  const mid = await page.locator('.m-snack').first().evaluate((e) => e.style.transform)
  await page.mouse.up(); await page.waitForTimeout(500)
  return mid
}
await show('Short drag springs back'); await page.waitForTimeout(500)
console.log('during a short drag:', await drag(40), '| still shown:', await count())
console.log('during a long drag:', await drag(220), '| left after:', await count())
await show('Swipe left too'); await page.waitForTimeout(500)
console.log('swipe left:', await drag(-220), '| left after:', await count())
await browser.close()
