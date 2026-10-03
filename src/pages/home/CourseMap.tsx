import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Boil, Doodle, Lana, Rough, useNarrow, type Pt } from '../../kit'
import { MAP_PATH, STATIONS } from './course'

const SPEED = 110 // px per second, constant (things that travel move linearly); long walks are capped at 4 s

/** Lana's walk: the path from the start to just before the current station, ending at her stop. */
function walkPoints(current: number): Pt[] {
  const st = STATIONS[current]
  return [...MAP_PATH.slice(0, st.pathIdx), st.lana]
}

/**
 * The course map: six modules as stations on a dotted pencil path. Lana walks (once, at constant speed) to the
 * station of the module you are in; that station is circled in red with "ovdje ste!".
 */
export function CourseMap({ current, lectures, minutes }: { current: number; lectures: number; minutes: number }) {
  const reduce = useReducedMotion()
  const pts = walkPoints(current)
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const total = lens.reduce((a, b) => a + b, 0)
  const times = [0]
  lens.forEach((l) => times.push(times[times.length - 1] + l / total))
  const dur = reduce ? 0 : Math.min(4, Math.max(1.2, total / SPEED))
  const here = STATIONS[current]
  // footprints every ~26 px along the walk
  const steps: { x: number; y: number; t: number }[] = []
  let acc = 0
  pts.slice(1).forEach((p, i) => {
    const a = pts[i]
    const n = Math.floor(lens[i] / 26)
    for (let k = 1; k <= n; k++) {
      const f = k / (n + 1)
      steps.push({ x: a[0] + (p[0] - a[0]) * f + (steps.length % 2 ? 3 : -3), y: a[1] + (p[1] - a[1]) * f + 2, t: (acc + lens[i] * f) / total })
    }
    acc += lens[i]
  })
  // phones: a little more room on the left, so the larger lettering of station 6 stays on screen
  const phone = useNarrow(561)
  const lanaScale = 0.46
  const toBox = (p: Pt): Pt => [p[0] - 40 * lanaScale, p[1] - 118 * lanaScale]
  const boxes = pts.map(toBox)
  return (
    <svg
      className="nb-map"
      viewBox={phone ? '-84 -6 570 368' : '-14 -6 500 368'}
      role="img"
      aria-label={`Karta tečaja: šest modula, od jednog poslužitelja preko kontejnera, Kubernetesa, rada u pogonu i isporuke do završnog projekta. Lana stoji na stanici ${current + 1}: ${here.label}.`}
    >
      <text x={486} y={22} textAnchor="end" className="k-svg-hand" style={{ fontSize: 30, fill: 'var(--pen)' }}>
        karta tečaja
      </text>
      <text x={486} y={47} textAnchor="end" className="k-svg-hand nb-map__count" style={{ fill: 'var(--ink-2)' }}>
        6 modula · {lectures} predavanja · ~{Math.round(minutes / 60)} h
      </text>
      <Rough shape={{ k: 'curve', pts: MAP_PATH }} seed={1660} stroke="var(--ink-2)" strokeWidth={1.7} dash="2 8" roughness={0.6} />
      {STATIONS.map((st, i) => (
        <g key={st.module}>
          <Doodle kind={st.glyph} x={st.x - 25.6} y={st.y - 19.2} scale={0.8} />
          <text x={st.lx} y={st.ly} textAnchor={st.anchor} className="k-svg-hand nb-map__label" style={{ fill: i === current ? 'var(--red)' : 'var(--ink)' }}>
            {i + 1} · {st.label}
          </text>
          <text x={st.lx} y={st.ly + 19} textAnchor={st.anchor} className="k-svg-hand nb-map__sub" style={{ fontSize: 18, fill: 'var(--ink-3)' }}>
            {st.sub}
          </text>
        </g>
      ))}
      {/* footprints, then Lana; the red ring and the note once she has arrived */}
      {steps.map((s, i) => (
        <motion.ellipse
          key={i}
          cx={s.x}
          cy={s.y}
          rx={3.2}
          ry={2.1}
          className="nb-map__foot"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.75 }}
          transition={{ delay: reduce ? 0 : 0.2 + s.t * dur, duration: 0.15 }}
        />
      ))}
      <Rough shape={{ k: 'ellipse', cx: here.ring.cx, cy: here.ring.cy, w: here.ring.w, h: here.ring.h }} seed={1670} stroke="var(--red)" strokeWidth={2.2} multi draw="mount" delay={reduce ? 0 : dur + 0.3} duration={0.7} />
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : dur + 0.6, duration: 0.3 }}>
        <text x={here.note.x} y={here.note.y} textAnchor={here.note.anchor} className="k-svg-hand" style={{ fontSize: phone ? 29 : 27, fill: 'var(--red)', fontWeight: 700 }}>
          ovdje ste!
        </text>
        <Arrow pts={here.note.arrow} stroke="var(--red)" strokeWidth={1.8} seed={1681} head={7} />
      </motion.g>
      <motion.g
        initial={reduce ? false : { x: boxes[0][0], y: boxes[0][1] }}
        animate={{ x: boxes.map((b) => b[0]), y: boxes.map((b) => b[1]) }}
        transition={{ duration: dur, times, ease: 'linear', delay: 0.2 }}
      >
        <motion.g animate={reduce ? undefined : { y: Array.from({ length: Math.max(3, Math.round(dur * 4)) * 2 + 1 }, (_, k) => (k % 2 ? -3 : 0)) }} transition={{ duration: dur, delay: 0.2, ease: 'linear' }}>
          <Boil slow>
            <Lana x={0} y={0} scale={lanaScale} mood="grin" holding="none" flip={current === 4 || current === 5} />
          </Boil>
        </motion.g>
      </motion.g>
    </svg>
  )
}
