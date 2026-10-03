#!/usr/bin/env node
/**
 * Headless screenshots of the running dev server (http://localhost:5173), using the local Google Chrome.
 *
 *   node scripts/shot.mjs /predavanje/load-balancer --out /tmp/lb.png
 *   node scripts/shot.mjs /predavanje/load-balancer --sections --out-dir /tmp/lb      # one PNG per <Section>
 *   node scripts/shot.mjs /kit --theme dark --width 390 --full --out /tmp/kit-mobile.png
 *   node scripts/shot.mjs /predavanje/x --section simulacija --wait 4000 --out /tmp/sim.png
 *   node scripts/shot.mjs /predavanje/x --section simulacija --click "Nalet prometa" --wait 3000 --out /tmp/after.png
 *   node scripts/shot.mjs /predavanje/x --section simulacija --click "8 puta" --out /tmp/fast.png   # a speed radio
 *
 * --click finds a button by its accessible name, then a radio / switch / tab (Segmented options, the sim's speed
 * picker), then any element with that aria-label or text. Element shots hide the sticky header and the reading-progress
 * pencil, stop CSS animations, and fall back to a clipped page shot when the element never settles (a looping drawing).
 * --scale 0.5 halves the PNG (deviceScaleFactor). Always prints browser console errors / page errors, so it doubles as
 * a runtime smoke test.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const path = args.find((a) => !a.startsWith('--') && !isValueOf(a)) ?? '/'
function isValueOf(a) {
  const i = args.indexOf(a)
  return i > 0 && args[i - 1].startsWith('--') && !['--full', '--sections'].includes(args[i - 1])
}
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
function optAll(name) {
  const out = []
  args.forEach((a, i) => a === `--${name}` && out.push(args[i + 1]))
  return out
}
const flag = (name) => args.includes(`--${name}`)

const base = opt('base', 'http://localhost:5173')
const width = Number(opt('width', 1440))
const height = Number(opt('height', 900))
const theme = opt('theme', 'light')
const wait = Number(opt('wait', 1200))
const out = opt('out', '/tmp/shot.png')
const outDir = opt('out-dir', '/tmp/shots')
const section = opt('section')
const clicks = optAll('click')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: Number(opt('scale', 1)),
  colorScheme: theme === 'dark' ? 'dark' : 'light',
  reducedMotion: flag('reduced-motion') ? 'reduce' : 'no-preference',
})
await context.addInitScript((t) => {
  try {
    localStorage.setItem('k8s-lekcije:theme', t)
  } catch {}
}, theme)
const page = await context.newPage()
const problems = []
page.on('console', (m) => {
  if (m.text().includes('You have Reduced Motion enabled')) return // Motion's informational dev notice
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

await page.goto(base + path, { waitUntil: 'networkidle' })
// Element screenshots: keep the sticky header and the fixed reading-progress pencil out of the captured element.
if (section || flag('sections'))
  await page.addStyleTag({ content: '.nb-lbar,.nb-ltabs ol,.nb-tabs{position:static !important} .nb-progress,.nb-ltabs{display:none !important}' })
await page.waitForTimeout(400)

/** Click a control by name: a button first, then a radio / switch / tab, then anything labelled or showing that text. */
async function clickByName(scope, text) {
  for (const role of ['button', 'radio', 'switch', 'tab', 'checkbox']) {
    const loc = scope.getByRole(role, { name: text })
    if (await loc.count()) return loc.first().click()
  }
  const byLabel = scope.getByLabel(text, { exact: false })
  if (await byLabel.count()) return byLabel.first().click()
  const byText = scope.getByText(text, { exact: false })
  if (await byText.count()) return byText.first().click()
  console.log(`  --click "${text}": no button, radio, switch, tab, label or text with that name here — skipped`)
}

/** Element screenshot that tolerates elements that never stop moving (falls back to a clip of the page). */
async function shootElement(el, path) {
  try {
    await el.screenshot({ path, animations: 'disabled', timeout: 8000 })
  } catch (e) {
    const box = await el.boundingBox()
    if (!box) throw e
    console.log(`  (element not stable, clipped page shot instead: ${String(e.message).split('\n')[0].slice(0, 80)})`)
    // boundingBox is relative to the viewport; a full-page clip needs page coordinates
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
    await page.screenshot({ path, fullPage: true, animations: 'disabled', clip: { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height } })
  }
}

async function scrollThrough() {
  // Trigger whileInView animations and lazy sims by scrolling the whole page once.
  const h = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += Math.round(height * 0.7)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(120)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

if (section) {
  await scrollThrough()
  const el = page.locator(`section#${section}`)
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  for (const text of clicks) {
    await clickByName(el, text)
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(wait)
  mkdirSync(dirname(out), { recursive: true })
  await shootElement(el, out)
  console.log(`saved ${out}`)
} else if (flag('sections')) {
  await scrollThrough()
  mkdirSync(outDir, { recursive: true })
  const hero = page.locator('.lecture-hero')
  if (await hero.count()) {
    await hero.screenshot({ path: join(outDir, '00-hero.png') })
    console.log(`saved ${join(outDir, '00-hero.png')}`)
  }
  const ids = await page.$$eval('section.k-section', (els) => els.map((e) => e.id))
  let i = 1
  for (const id of ids) {
    const el = page.locator(`section#${id}`)
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(wait)
    const file = join(outDir, `${String(i).padStart(2, '0')}-${id}.png`)
    await shootElement(el, file)
    console.log(`saved ${file}`)
    i++
  }
} else {
  if (flag('full')) await scrollThrough()
  for (const text of clicks) {
    await clickByName(page, text)
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(wait)
  mkdirSync(dirname(out), { recursive: true })
  await page.screenshot({ path: out, fullPage: flag('full') })
  console.log(`saved ${out}`)
}

if (problems.length) {
  console.log(`\n${problems.length} browser problem(s):`)
  for (const p of [...new Set(problems)]) console.log('  ' + p)
} else {
  console.log('no console errors')
}
await browser.close()
