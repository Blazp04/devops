import type { DoodleKind, Pt } from '../../kit'
import type { LectureMeta } from '../../curriculum/types'

/** One station of the course map (a module), in the map's own coordinates (viewBox −14 −6 500 368). */
export interface Station {
  module: string
  glyph: DoodleKind
  label: string
  sub: string
  x: number
  y: number
  /** label position and anchor */
  lx: number
  ly: number
  anchor: 'start' | 'middle' | 'end'
  /** index of this station in MAP_PATH */
  pathIdx: number
  /** where Lana stops (her feet), the red circle and the "ovdje ste!" note */
  lana: Pt
  ring: { cx: number; cy: number; w: number; h: number }
  note: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; arrow: Pt[] }
}

/** The dotted pencil path through the six stations. */
export const MAP_PATH: Pt[] = [
  [14, 300],
  [70, 262],
  [132, 234],
  [200, 226],
  [268, 248],
  [334, 262],
  [408, 236],
  [444, 172],
  [398, 124],
  [318, 110],
  [244, 100],
  [196, 72],
  [160, 70],
]

export const STATIONS: Station[] = [
  {
    module: 'm1',
    glyph: 'server',
    label: 'sustavi',
    sub: 'jedan poslužitelj',
    x: 70,
    y: 262,
    lx: 58,
    ly: 330,
    anchor: 'middle',
    pathIdx: 1,
    lana: [26, 291],
    ring: { cx: 52, cy: 250, w: 140, h: 100 },
    note: { x: -8, y: 186, anchor: 'start', arrow: [[102, 176], [122, 186], [114, 204]] },
  },
  {
    module: 'm2',
    glyph: 'box',
    label: 'kontejneri',
    sub: 'Docker',
    x: 200,
    y: 226,
    lx: 200,
    ly: 278,
    anchor: 'middle',
    pathIdx: 3,
    lana: [150, 236],
    ring: { cx: 180, cy: 214, w: 128, h: 100 },
    note: { x: 108, y: 146, anchor: 'start', arrow: [[194, 140], [212, 148], [204, 164]] },
  },
  {
    module: 'm3',
    glyph: 'helm',
    label: 'Kubernetes',
    sub: 'temelji',
    x: 334,
    y: 262,
    lx: 334,
    ly: 316,
    anchor: 'middle',
    pathIdx: 5,
    lana: [288, 260],
    ring: { cx: 314, cy: 242, w: 122, h: 84 },
    note: { x: 146, y: 348, anchor: 'start', arrow: [[262, 336], [262, 312], [270, 290]] },
  },
  {
    module: 'm4',
    glyph: 'gauge',
    label: 'pogon',
    sub: 'skaliranje',
    x: 444,
    y: 172,
    lx: 480,
    ly: 116,
    anchor: 'end',
    pathIdx: 7,
    lana: [398, 236],
    ring: { cx: 426, cy: 196, w: 112, h: 100 },
    note: { x: 254, y: 214, anchor: 'start', arrow: [[352, 204], [362, 196], [374, 196]] },
  },
  {
    module: 'm5',
    glyph: 'loop',
    label: 'isporuka',
    sub: 'CI/CD · Argo CD',
    x: 318,
    y: 110,
    lx: 318,
    ly: 160,
    anchor: 'middle',
    pathIdx: 9,
    lana: [356, 128],
    ring: { cx: 330, cy: 104, w: 118, h: 88 },
    note: { x: 140, y: 142, anchor: 'start', arrow: [[244, 136], [262, 130], [276, 112]] },
  },
  {
    module: 'm6',
    glyph: 'flag',
    label: 'sve zajedno',
    sub: 'cilj!',
    x: 160,
    y: 70,
    lx: 112,
    ly: 62,
    anchor: 'end',
    pathIdx: 12,
    lana: [200, 92],
    ring: { cx: 176, cy: 68, w: 112, h: 84 },
    note: { x: 24, y: 150, anchor: 'start', arrow: [[100, 134], [116, 122], [128, 106]] },
  },
]

/**
 * Page numbers for the handwritten table of contents: the notebook starts on page 4 and every lecture takes
 * about one page per five minutes of study.
 */
export function pageNumbers(lectures: LectureMeta[]): Record<string, number> {
  const out: Record<string, number> = {}
  let page = 4
  for (const l of lectures) {
    out[l.slug] = page
    page += Math.max(4, Math.round(l.durationMin / 5))
  }
  return out
}
