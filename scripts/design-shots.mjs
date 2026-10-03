// Viewport screenshots of a design-lab prototype: hero, LB sim, cluster — for side-by-side comparison.
import { chromium } from 'playwright-core'
const [key, theme = 'light', outDir] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: 1 })
await ctx.addInitScript((t) => { try { localStorage.setItem('k8s-lekcije:theme', t) } catch {} }, theme)
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto(`http://localhost:5173/dizajn/${key}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}/${key}-${theme}-1-hero.png` })
const h = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(80) }
async function shotAt(text, name, extraWait = 2500) {
  const loc = page.getByText(text, { exact: false }).first()
  if (!(await loc.count())) { console.log('not found', text); return }
  await loc.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -200))
  await page.waitForTimeout(extraWait)
  await page.screenshot({ path: `${outDir}/${key}-${theme}-${name}.png` })
}
if (await page.getByText('Sruši poslužitelj').count()) await shotAt('Sruši poslužitelj', '2-sim', 4000); else await shotAt('Najmanje', '2-sim', 4000)
await shotAt('Podne u menzi', '3-prose', 800)
await shotAt('CrashLoopBackOff', '4-cluster', 1500)
console.log(key, theme, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'ok')
await browser.close()
