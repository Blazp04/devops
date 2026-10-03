#!/usr/bin/env node
/**
 * Smoke test: open every page (home, glossary, kit, all lectures) in light + dark at 1440 and 390 px,
 * scroll through it, and report console errors, page errors and horizontal overflow.
 *   node scripts/smoke.mjs            (dev server must run on http://localhost:5173)
 *   node scripts/smoke.mjs --only load-balancer,docker
 */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = 'http://localhost:5173'
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 ? process.argv[i + 1].split(',') : null
})()

const data = readFileSync(join(root, 'src/curriculum/data.ts'), 'utf8')
const slugs = [...data.matchAll(/"slug":\s*"([^"]+)"/g)].map((m) => m[1])
const paths = ['/', '/pojmovnik', '/kit', '/kit/crtezi', ...slugs.map((s) => `/predavanje/${s}`)].filter(
  (p) => !only || only.some((o) => p.endsWith(o)),
)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
let failures = 0
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('k8s-lekcije:theme', t)
      } catch {}
    }, theme)
    for (const path of paths) {
      const page = await ctx.newPage()
      const problems = []
      page.on('console', (m) => {
        if (m.text().includes('You have Reduced Motion enabled')) return
        if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text().slice(0, 200)}`)
      })
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`))
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 })
        const h = await page.evaluate(() => document.body.scrollHeight)
        for (let y = 0; y < h; y += 700) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y)
          await page.waitForTimeout(60)
        }
        await page.waitForTimeout(400)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) problems.push(`horizontal overflow: ${overflow}px`)
      } catch (e) {
        problems.push(`load failed: ${e.message.slice(0, 160)}`)
      }
      const tag = `${theme.padEnd(5)} ${String(width).padStart(4)} ${path}`
      if (problems.length) {
        failures++
        console.log(`✗ ${tag}`)
        for (const p of [...new Set(problems)].slice(0, 6)) console.log(`    ${p}`)
      } else console.log(`✓ ${tag}`)
      await page.close()
    }
    await ctx.close()
  }
}
await browser.close()
console.log(failures ? `\n${failures} page run(s) with problems` : '\nall pages clean')
process.exit(failures ? 1 : 0)
