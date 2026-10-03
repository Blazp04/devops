/** Drawing geometry for the load-balancer simulation: a wide (landscape) and a narrow (portrait) layout. */
import type { Pt } from './geo'
import { GB_PER_REQ, QUEUE_PER_CORE, SPECS } from './lbModel'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface SrvGeo {
  nameY: number
  barX: number
  barW: number
  bars: Box[]
  queue: Pt[]
  ram: Box[]
  statsY: number
  entry: Pt
  box: Box
}

export interface LbGeo {
  w: number
  h: number
  narrow: boolean
  students: { x: number; y: number; ink: 'pink' | 'blue'; s: number }[]
  studentsLabel: Pt | null
  srcRoute: Pt[]
  lb: Pt
  lbR: number
  routes: Pt[][]
  srv: SrvGeo[]
  health: { x: number; y: number; w: number }
  dotR: number
  /** narrow layout: the rule name is set as a chip (right edge at x) instead of rim text */
  ruleChip: Pt | null
}

function server(i: number, nameY: number, barX: number, barW: number, qStep: number, entryX: number, barH: number, barGap: number, ramH: number): SrvGeo {
  const spec = SPECS[i]
  const top = nameY + 13
  const bars = Array.from({ length: spec.cores }, (_, k) => ({ x: barX, y: top + k * (barH + barGap), w: barW, h: barH }))
  const last = bars[bars.length - 1]
  const queue: Pt[] = []
  for (let k = 0; k < spec.cores * QUEUE_PER_CORE; k++) {
    const row = Math.floor(k / QUEUE_PER_CORE)
    const col = k % QUEUE_PER_CORE
    queue.push({ x: barX - 17 - col * qStep, y: bars[row].y + barH / 2 })
  }
  const slots = spec.ram / GB_PER_REQ
  const step = barW / 16
  const ramY = last.y + barH + 8
  const ram = Array.from({ length: slots }, (_, k) => ({ x: barX + k * step, y: ramY, w: step - 3.5, h: ramH }))
  const midY = (bars[0].y + last.y + barH) / 2
  return {
    nameY,
    barX,
    barW,
    bars,
    queue,
    ram,
    statsY: ramY + ramH + 20,
    entry: { x: entryX, y: midY },
    box: { x: entryX - 6, y: top - 6, w: barX + barW - entryX + 12, h: last.y + barH - top + 12 },
  }
}

export function buildGeo(narrow: boolean): LbGeo {
  if (!narrow) {
    const lb = { x: 432, y: 196 }
    const barX = 692
    const barW = 284
    const entryX = barX - 17 - 2 * 16 - 22
    const srv = [
      server(0, 40, barX, barW, 16, entryX, 24, 8, 12),
      server(1, 172, barX, barW, 16, entryX, 24, 8, 12),
      server(2, 330, barX, barW, 16, entryX, 24, 8, 12),
    ]
    return {
      w: 1000,
      h: 520,
      narrow,
      students: [
        { x: 58, y: 160, ink: 'blue', s: 1.25 },
        { x: 124, y: 142, ink: 'pink', s: 1.4 },
        { x: 190, y: 162, ink: 'blue', s: 1.2 },
        { x: 66, y: 252, ink: 'pink', s: 1.3 },
        { x: 132, y: 236, ink: 'blue', s: 1.35 },
        { x: 196, y: 254, ink: 'pink', s: 1.2 },
      ],
      studentsLabel: { x: 30, y: 292 },
      srcRoute: [
        { x: 226, y: 196 },
        { x: lb.x, y: lb.y },
      ],
      lb,
      lbR: 104,
      routes: srv.map((s) => [{ x: lb.x, y: lb.y }, s.entry]),
      srv,
      health: { x: lb.x - 112, y: 336, w: 224 },
      dotR: 7.5,
      ruleChip: null,
    }
  }
  // Portrait: students on the left, the dispatcher disc big on the right (it is the star), the rule name
  // as a chip under it, then the three servers stacked, fed from a bus down the left edge.
  const lb = { x: 284, y: 114 }
  const barX = 112
  const barW = 272
  const entryX = barX - 17 - 2 * 15 - 18
  const srv = [
    server(0, 276, barX, barW, 15, entryX, 20, 6, 10),
    server(1, 380, barX, barW, 15, entryX, 20, 6, 10),
    server(2, 510, barX, barW, 15, entryX, 20, 6, 10),
  ]
  const busX = 22
  return {
    w: 400,
    h: 744,
    narrow,
    students: [
      { x: 34, y: 66, ink: 'blue', s: 0.9 },
      { x: 84, y: 60, ink: 'pink', s: 1 },
      { x: 134, y: 66, ink: 'blue', s: 0.9 },
      { x: 34, y: 140, ink: 'pink', s: 0.95 },
      { x: 84, y: 134, ink: 'blue', s: 1 },
      { x: 134, y: 140, ink: 'pink', s: 0.9 },
    ],
    studentsLabel: { x: 16, y: 172 },
    srcRoute: [
      { x: 160, y: 104 },
      { x: lb.x, y: lb.y },
    ],
    lb,
    lbR: 84,
    routes: srv.map((s) => [{ x: lb.x, y: lb.y }, { x: lb.x, y: 232 }, { x: busX, y: 232 }, { x: busX, y: s.entry.y }, s.entry]),
    srv,
    health: { x: 24, y: 688, w: 352 },
    dotR: 6.5,
    ruleChip: { x: 270, y: 215 },
  }
}
