#!/usr/bin/env node
/**
 * Legibility check of a page on the running dev server (http://localhost:5173): effective on-screen text sizes,
 * including SVG lettering scaled by its viewBox. Prints every text that breaks the notebook's rules:
 *   any text < 12 px · Caveat (handwriting) < 17 px · Kalam (speech) < 18 px · Newsreader reading text < 17 px
 *   (16 px is fine for figcaptions) · handwriting longer than 110 characters.
 * Decorations marked aria-hidden="true" (line numbers, section props) are skipped; repeats are counted once.
 *
 *   node scripts/legibility.mjs /predavanje/load-balancer                    # 1440 px, light
 *   node scripts/legibility.mjs /predavanje/load-balancer --width 390 --theme dark
 *   node scripts/legibility.mjs /kit --width 768 --section simulacija        # one <Section> only
 *
 * Exit code 1 when something is reported (so it can gate a lecture). Also prints console errors.
 */
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (n, f) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : f)
const path = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? '/'
const width = Number(opt('width', 1440))
const theme = opt('theme', 'light')
const section = opt('section')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce' })
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem('k8s-lekcije:theme', t)
  } catch {}
}, theme)
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.text().includes('Reduced Motion')) return
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
// scroll once so lazy pieces and in-view drawings render
const H = await page.evaluate(() => document.documentElement.scrollHeight)
for (let y = 0; y < H; y += 600) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await page.waitForTimeout(60)
}
await page.waitForTimeout(400)

const found = await page.evaluate((sectionId) => {
  const root = sectionId ? document.getElementById(sectionId) : document.querySelector('.nb-main') ?? document.body
  if (!root) return { error: `no element #${sectionId}` }
  const out = []
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
      if (e.classList?.contains('visually-hidden')) return false
    }
    return true
  }
  const pathOf = (el) => {
    const parts = []
    for (let e = el; e && e !== root && parts.length < 4; e = e.parentElement) {
      const c = [...(e.classList ?? [])].find((x) => x.startsWith('k-') || x.startsWith('nb-'))
      parts.unshift(c ? `.${c}` : e.tagName.toLowerCase())
    }
    return parts.join(' ')
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const el = n.parentElement
    if (!el || seen.has(el) || !visible(el) || el.closest('[aria-hidden="true"]')) continue
    seen.add(el)
    const cs = getComputedStyle(el)
    let size = parseFloat(cs.fontSize)
    const svgText = el.closest('svg')
    // (<title> / <desc> are SVGElements without a CTM)
    if (svgText && el instanceof SVGElement && typeof el.getScreenCTM === 'function') {
      const m = el.getScreenCTM()
      if (m) size *= Math.hypot(m.a, m.b)
    }
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    const font = cs.fontFamily.split(',')[0].replace(/["']/g, '')
    const hand = /caveat/i.test(font)
    const kalam = /kalam/i.test(font)
    const body = /newsreader/i.test(font)
    const caption = !!el.closest('figcaption, .k-figure__caption')
    const problems = []
    if (size < 11.95) problems.push('< 12 px')
    if (hand && size < 16.95) problems.push('Caveat < 17 px')
    if (kalam && size < 17.95) problems.push('Kalam < 18 px')
    if (body && !caption && text.length > 40 && size < 16.95) problems.push('reading text < 17 px')
    if ((hand || kalam) && text.length > 110) problems.push(`handwriting ${text.length} chars`)
    if (problems.length) out.push({ problems: problems.join(', '), size: Math.round(size * 10) / 10, font, svg: !!svgText, text: text.slice(0, 50), where: pathOf(el) })
  }
  return { out }
}, section)

await browser.close()
if (found.error) {
  console.error(found.error)
  process.exit(2)
}
console.log(`${path} · ${theme} · ${width} px${section ? ` · #${section}` : ''}`)
const groups = new Map()
for (const f of found.out) {
  const k = `${f.problems}|${f.size}|${f.font}|${f.where}`
  const g = groups.get(k)
  if (g) g.n++
  else groups.set(k, { ...f, n: 1 })
}
for (const f of groups.values())
  console.log(`  ${f.problems.padEnd(22)} ${String(f.size).padStart(5)} px  ${f.font}${f.svg ? ' (svg)' : ''}  "${f.text}"${f.n > 1 ? ` (+${f.n - 1} more)` : ''}  ${f.where}`)
console.log(found.out.length ? `${found.out.length} problem(s)` : 'legibility ok')
if (errors.length) console.log(errors.join('\n'))
else console.log('no console errors')
process.exit(found.out.length || errors.length ? 1 : 0)
