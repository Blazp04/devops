#!/usr/bin/env node
/**
 * Generates the favicon set from the hand-drawn helm wheel (same roughjs pen as the site's brand mark).
 *
 *   node scripts/gen-favicon.mjs        # public/favicon.svg, favicon-32.png, apple-touch-icon.png, icon-512.png
 *
 * PNGs are rendered with the local Google Chrome (playwright-core), like scripts/shot.mjs.
 */
import rough from 'roughjs'
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const PAPER = '#fbf6ea'
const EDGE = '#26231d'
const PEN = '#2148b0'

const gen = rough.generator()
const pen = (seed, strokeWidth, extra = {}) => ({
  seed, stroke: PEN, strokeWidth, roughness: 1.1, bowing: 1, disableMultiStroke: true, preserveVertices: false, ...extra,
})
const toPaths = (d) => gen.toPaths(d).map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')

// Helm wheel, centre (32, 32): rim, hub, seven spokes (as in src/kit/doodles/Things.tsx Helm).
const cx = 32, cy = 32, r = 17
const parts = [
  gen.ellipse(cx, cy, r * 2, r * 2, pen(801, 3.6)),
  gen.ellipse(cx, cy, r * 0.7, r * 0.7, pen(802, 3.2, { roughness: 0.7 })),
  ...Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2
    return gen.line(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35, cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25, pen(803 + i, 3.2, { roughness: 0.6 }))
  }),
]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="${PAPER}" stroke="${EDGE}" stroke-width="2"/>
${parts.map(toPaths).join('\n')}
</svg>
`
writeFileSync('public/favicon.svg', svg)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [file, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-512.png', 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block" width="${size}" height="${size}" `)}</body></html>`)
  await page.locator('svg').screenshot({ path: `public/${file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log('public/favicon.svg + PNGs written')
