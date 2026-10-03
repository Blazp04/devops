import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Rough, Boil, Arrow, Cross, Check, RoughBox } from './Sketch'
import { Crowd, Davor, Lana, Redar, ServerFace, TrayDefs, Bubble, Helm } from './Doodles'
import { Tape } from './Bits'
import s from './bj.module.css'

type XY = [number, number]

/** One tray travelling along a polyline at constant speed, forever. */
function Flow({ pts, dur, delay = 0, tray, fadeAt = 0.94 }: { pts: XY[]; dur: number; delay?: number; tray: string; fadeAt?: number }) {
  const reduce = useReducedMotion()
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const total = lens.reduce((a, b) => a + b, 0)
  const times = [0]
  lens.forEach((l) => times.push(times[times.length - 1] + l / total))
  if (reduce) {
    const mid = pts[Math.floor(pts.length / 2)]
    return <use href={`#${tray}`} x={mid[0] - 9} y={mid[1] - 6} width={18} height={12} />
  }
  return (
    <motion.g
      initial={{ x: pts[0][0], y: pts[0][1], opacity: 0 }}
      animate={{ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), opacity: [0, 1, 1, 0] }}
      transition={{
        x: { duration: dur, times, ease: 'linear', repeat: Infinity, delay },
        y: { duration: dur, times, ease: 'linear', repeat: Infinity, delay },
        opacity: { duration: dur, times: [0, 0.04, fadeAt, 1], ease: 'linear', repeat: Infinity, delay },
      }}
    >
      <use href={`#${tray}`} x={-9} y={-6} width={18} height={12} />
    </motion.g>
  )
}

/** Something that blinks on for part of a loop (✗ marks, state layers). */
function Phase({ dur, at, delay = 0, children }: { dur: number; at: [number, number, number, number]; delay?: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
      transition={{ duration: dur, times: [0, at[0], at[1], at[2], at[3], 1], repeat: Infinity, ease: 'linear', delay }}
    >
      {children}
    </motion.g>
  )
}

function Box({ x, y, w, h, seed, mood, label }: { x: number; y: number; w: number; h: number; seed: number; mood: 'calm' | 'busy' | 'panic' | 'dead'; label?: string }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 8, y1: y + h - 14, x2: x + w - 8, y2: y + h - 14 }} seed={seed + 1} strokeWidth={1.2} />
      <circle cx={x + w - 14} cy={y + h - 7} r={2} fill={mood === 'panic' ? 'var(--red)' : 'var(--green)'} />
      <g transform={`translate(${x + w / 2} ${y + h / 2 - 6})`}>
        <ServerFace mood={mood} r={w > 80 ? 17 : 12} />
      </g>
      {label && (
        <text x={x + w / 2} y={y - 6} textAnchor="middle" className={s.svgHand} style={{ fontSize: 19 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/* ---------- Panel 1: one server at noon ---------- */
function Smoke({ x, seed }: { x: number; seed: number }) {
  return (
    <Rough
      shape={{
        k: 'curve',
        pts: [
          [x, 74],
          [x - 6, 62],
          [x + 2, 50],
          [x - 4, 38],
        ],
      }}
      seed={seed}
      strokeWidth={1.5}
      stroke="var(--ink-3)"
    />
  )
}

function PanelOne() {
  const tray = 'hero1-tray'
  const door: XY = [170, 168]
  const ticks = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2
    return { x1: 36 + Math.sin(a) * 17, y1: 34 - Math.cos(a) * 17, x2: 36 + Math.sin(a) * 21, y2: 34 - Math.cos(a) * 21 }
  })
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Prva sličica: u 12:00 svi studenti šalju zahtjeve jednom poslužitelju koji se zagušuje.">
      <TrayDefs id="hero1" />
      {/* clock 12:00 */}
      <Boil slow>
        <Rough shape={{ k: 'ellipse', cx: 36, cy: 34, w: 50, h: 50 }} seed={1101} strokeWidth={1.9} />
        {ticks.map((tk, i) => (
          <Rough key={i} shape={{ k: 'line', ...tk }} seed={1104 + i} strokeWidth={1.5} roughness={0.4} />
        ))}
        <Rough shape={{ k: 'line', x1: 36, y1: 34, x2: 36, y2: 16 }} seed={1102} strokeWidth={2.2} />
        <Rough shape={{ k: 'line', x1: 36, y1: 34, x2: 37, y2: 22 }} seed={1103} strokeWidth={3.2} />
      </Boil>
      <text x={68} y={32} className={s.svgHand} style={{ fontSize: 28, fill: 'var(--red)' }}>
        12:00!
      </text>
      <Crowd x={-4} y={70} scale={0.72} label={false} />
      {/* the one server */}
      <Boil>
        <Box x={180} y={78} w={90} h={116} seed={1110} mood="panic" />
        <Smoke x={198} seed={1111} />
        <Smoke x={224} seed={1112} />
        <Smoke x={250} seed={1113} />
      </Boil>
      <text x={225} y={173} textAnchor="middle" className={s.svgMono} style={{ fontSize: 15.5, fontWeight: 600, fill: 'var(--red)' }}>
        CPU 100 %
      </text>
      {/* queue piling up at the door */}
      {[0, 1, 2].map((i) => (
        <use key={i} href={`#${tray}`} x={152 - i * 3} y={182 - i * 9} width={20} height={13} />
      ))}
      <Flow tray={tray} pts={[[124, 140], door]} dur={0.9} />
      <Flow tray={tray} pts={[[120, 156], door]} dur={0.9} delay={0.3} />
      <Flow tray={tray} pts={[[124, 146], door, [176, 224]]} dur={1.5} delay={0.6} fadeAt={0.9} />
      <Phase dur={1.5} at={[0.58, 0.66, 0.9, 0.98]} delay={0.6}>
        <Cross x={175} y={214} size={9} seed={1120} />
      </Phase>
      {/* Davor */}
      <Boil>
        <Davor x={282} y={118} scale={0.7} mood="worry" buzz />
      </Boil>
      <Bubble x={258} y={22} w={100} h={74} tx={310} ty={146} lines={['Opet', 'pada?!']} size={25} seed={1130} tail={16} />
    </svg>
  )
}

/* ---------- Panel 2: a redar shares the load ---------- */
function PanelTwo() {
  const tray = 'hero2-tray'
  const reduce = useReducedMotion()
  const lb: XY = [166, 168]
  const sc = 0.8
  const shoulder: XY = [lb[0] + 13 * sc, lb[1] - 28 * sc]
  const hand: XY = [lb[0], lb[1] + 14 * sc]
  const targets: XY[] = [
    [270, 50],
    [270, 124],
    [270, 198],
  ]
  const cycle = 2.4
  const angles = targets.map(([x, y]) => (Math.atan2(y - shoulder[1], x - shoulder[0]) * 180) / Math.PI)
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Druga sličica: redar (load balancer) šalje studente redom na tri poslužitelja.">
      <TrayDefs id="hero2" />
      <Crowd x={-4} y={70} scale={0.72} label={false} />
      {targets.map(([x, y], i) => (
        <Boil key={i}>
          <Box x={x + 6} y={y - 26} w={74} h={52} seed={1200 + i * 10} mood="calm" />
        </Boil>
      ))}
      {targets.map(([x, y], i) => (
        <Rough key={i} shape={{ k: 'line', x1: hand[0] + 20, y1: hand[1] - 4, x2: x, y2: y }} seed={1240 + i} strokeWidth={1} stroke="var(--ink-3)" dash="3 5" />
      ))}
      {/* the redar: its arm follows the trays */}
      {reduce ? (
        <Redar x={lb[0]} y={lb[1]} scale={sc} angle={(angles[1] * Math.PI) / 180} />
      ) : (
        <g transform={`translate(${lb[0]} ${lb[1]}) scale(${sc})`}>
          <Boil>
            <Redar x={0} y={0} arm={false} />
          </Boil>
          <g transform="translate(13 -28)">
            <motion.g
              style={{ originX: 0, originY: 0 }}
              animate={{ rotate: [angles[0], angles[0], angles[1], angles[1], angles[2], angles[2], angles[0]] }}
              transition={{ duration: cycle * 3, times: [0, 0.3, 0.33, 0.63, 0.66, 0.96, 1], repeat: Infinity, ease: 'easeInOut' }}
            >
              <Rough shape={{ k: 'line', x1: 0, y1: 0, x2: 34, y2: 0 }} seed={409} strokeWidth={1.9} />
              <Rough shape={{ k: 'line', x1: 34, y1: 0, x2: 46, y2: 0 }} seed={410} strokeWidth={1.6} />
              <Rough shape={{ k: 'ellipse', cx: 53, cy: 0, w: 15, h: 15 }} seed={411} strokeWidth={1.7} fillColor="var(--red)" fillStyle="solid" />
            </motion.g>
          </g>
        </g>
      )}
      {targets.map((tg, i) => (
        <Flow key={i} tray={tray} pts={[[124, 146], hand, tg]} dur={cycle * 3} delay={i * cycle} fadeAt={0.32} />
      ))}
      {targets.map(([x, y], i) => (
        <Phase key={`c${i}`} dur={cycle * 3} at={[0.31, 0.34, 0.5, 0.56]} delay={i * cycle}>
          <Check x={x + 68} y={y - 30} size={8} seed={1250 + i} />
        </Phase>
      ))}
      <text x={lb[0] - 6} y={246} textAnchor="middle" className={s.svgHand} style={{ fontSize: 21 }}>
        load balancer = redar
      </text>
    </svg>
  )
}

/* ---------- Panel 3: a cluster that heals itself ---------- */
function Lunchbox({ x, y, seed, state = 'run', v = 'v1' }: { x: number; y: number; seed: number; state?: 'run' | 'crash' | 'pending'; v?: 'v1' | 'v2' }) {
  const stroke = state === 'crash' ? 'var(--red)' : 'var(--ink)'
  return (
    <g opacity={state === 'pending' ? 0.75 : 1}>
      <Rough shape={{ k: 'arc', cx: x + 20, cy: y + 2, w: 16, h: 12, start: Math.PI, stop: Math.PI * 2 }} seed={seed} strokeWidth={1.5} stroke={stroke} />
      <Rough
        shape={{ k: 'rect', x, y: y + 2, w: 40, h: 30 }}
        seed={seed + 1}
        strokeWidth={1.7}
        stroke={stroke}
        fillColor={state === 'crash' ? 'var(--red)' : v === 'v1' ? 'var(--hl-blue-ink)' : 'var(--hl-green-ink)'}
        hachureGap={state === 'crash' ? 3 : 5}
        fillWeight={state === 'crash' ? 1.2 : 0.8}
        dash={state === 'pending' ? '4 4' : undefined}
      />
      {state !== 'crash' && (
        <text x={x + 20} y={y + 23} textAnchor="middle" className={s.svgMono} style={{ fontSize: 15.5, fontWeight: 600 }}>
          {v}
        </text>
      )}
    </g>
  )
}

function PanelThree() {
  const tray = 'hero3-tray'
  const loop = 8
  const pods: { x: number; y: number }[] = [
    { x: 134, y: 96 },
    { x: 134, y: 152 },
    { x: 246, y: 96 },
    { x: 246, y: 152 },
  ]
  const entry: XY = [116, 192]
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Treća sličica: klaster s kontejnerima. Jedan se sruši, Kubernetes odmah pokrene novi.">
      <TrayDefs id="hero3" />
      <Rough shape={{ k: 'rect', x: 120, y: 44, w: 232, h: 186 }} seed={1301} strokeWidth={1.8} roughness={1.6} multi />
      <text x={344} y={222} textAnchor="end" className={s.svgHand} style={{ fontSize: 20, fill: 'var(--pen)' }}>
        klaster
      </text>
      <Rough shape={{ k: 'rect', x: 126, y: 76, w: 104, h: 128 }} seed={1302} strokeWidth={1.3} stroke="var(--ink-2)" />
      <Rough shape={{ k: 'rect', x: 238, y: 76, w: 104, h: 128 }} seed={1303} strokeWidth={1.3} stroke="var(--ink-2)" />
      <text x={130} y={70} className={s.svgHand} style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        čvor 1
      </text>
      <text x={242} y={70} className={s.svgHand} style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        čvor 2
      </text>
      {/* control plane: the helm watching */}
      <Boil slow>
        <Helm x={300} y={22} r={12} />
      </Boil>
      <circle cx={295} cy={21} r={1.6} className={s.inkFill} />
      <circle cx={305} cy={21} r={1.6} className={s.inkFill} />
      <Lunchbox x={pods[0].x} y={pods[0].y} seed={1310} />
      <Lunchbox x={pods[1].x} y={pods[1].y} seed={1320} />
      <Lunchbox x={pods[2].x} y={pods[2].y} seed={1330} />
      {/* the pod that crashes and comes back */}
      <PodCycle x={pods[3].x} y={pods[3].y} loop={loop} />
      <Lunchbox x={pods[0].x + 48} y={pods[0].y} seed={1340} v="v2" />
      <Lunchbox x={pods[2].x + 48} y={pods[3].y} seed={1350} v="v2" />
      {/* traffic only to running pods */}
      {pods.slice(0, 3).map((p, i) => (
        <Flow key={i} tray={tray} pts={[[64, 206], entry, [p.x + 20, p.y + 16]]} dur={2} delay={i * 0.66} fadeAt={0.9} />
      ))}
      <Boil slow>
        <Lana x={2} y={150} scale={0.62} mood="grin" />
      </Boil>
      <Bubble x={-2} y={64} w={112} h={72} tx={27} ty={170} lines={['Sam se', 'popravio!']} size={21} seed={1360} tail={16} />
    </svg>
  )
}

function PodCycle({ x, y, loop }: { x: number; y: number; loop: number }) {
  const reduce = useReducedMotion()
  if (reduce) return <Lunchbox x={x} y={y} seed={1370} />
  return (
    <g>
      <Phase dur={loop} at={[0, 0.001, 0.4, 0.42]}>
        <Lunchbox x={x} y={y} seed={1370} />
      </Phase>
      <Phase dur={loop} at={[0.72, 0.76, 0.999, 1]}>
        <Lunchbox x={x} y={y} seed={1370} />
      </Phase>
      <Phase dur={loop} at={[0.4, 0.42, 0.56, 0.6]}>
        <Lunchbox x={x} y={y} seed={1371} state="crash" />
        <Cross x={x + 20} y={y + 17} size={9} seed={1372} />
      </Phase>
      <Phase dur={loop} at={[0.6, 0.63, 0.72, 0.76]}>
        <Lunchbox x={x} y={y} seed={1373} state="pending" />
        <text x={x + 20} y={y + 50} textAnchor="middle" className={s.svgHand} style={{ fontSize: 18, fill: 'var(--pen)' }}>
          novi!
        </text>
      </Phase>
    </g>
  )
}

/* ---------- The route map: six modules as stops on a dotted pencil path ---------- */

type Stop = { x: number; y: number; n: number; label: string; sub: string; lx: number; ly: number; anchor?: 'start' | 'end' | 'middle' }

const STOPS: Stop[] = [
  { x: 70, y: 262, n: 1, label: 'sustavi', sub: 'jedan poslužitelj', lx: 58, ly: 330, anchor: 'middle' },
  { x: 200, y: 226, n: 2, label: 'Docker', sub: 'kontejneri', lx: 200, ly: 274, anchor: 'middle' },
  { x: 334, y: 262, n: 3, label: 'Kubernetes', sub: 'klaster', lx: 334, ly: 312, anchor: 'middle' },
  { x: 444, y: 172, n: 4, label: 'CI/CD', sub: 'cjevovod', lx: 444, ly: 220, anchor: 'middle' },
  { x: 318, y: 110, n: 5, label: 'Argo CD', sub: 'GitOps', lx: 318, ly: 156, anchor: 'middle' },
  { x: 160, y: 70, n: 6, label: 'praksa', sub: 'cilj!', lx: 118, ly: 62, anchor: 'end' },
]

const PATH: [number, number][] = [
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

function StopGlyph({ n, x, y }: { n: number; x: number; y: number }) {
  switch (n) {
    case 1:
      return (
        <g>
          <Rough shape={{ k: 'rect', x: x - 20, y: y - 20, w: 40, h: 36 }} seed={1601} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
          <circle cx={x - 6} cy={y - 6} r={2} className={s.inkFill} />
          <circle cx={x + 6} cy={y - 6} r={2} className={s.inkFill} />
          <Rough shape={{ k: 'curve', pts: [[x - 6, y + 2], [x, y + 6], [x + 6, y + 2]] }} seed={1602} strokeWidth={1.5} roughness={0.5} />
          <Rough shape={{ k: 'line', x1: x - 14, y1: y + 11, x2: x + 14, y2: y + 11 }} seed={1603} strokeWidth={1.1} />
        </g>
      )
    case 2:
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: x, cy: y - 14, w: 16, h: 12, start: Math.PI, stop: Math.PI * 2 }} seed={1611} strokeWidth={1.6} />
          <Rough shape={{ k: 'rect', x: x - 20, y: y - 14, w: 40, h: 28 }} seed={1612} strokeWidth={1.8} fillColor="var(--hl-blue-ink)" hachureGap={4.5} />
        </g>
      )
    case 3:
      return <Helm x={x} y={y - 2} r={15} seed={1621} />
    case 4:
      return (
        <g>
          {[0, 1, 2].map((k) => (
            <Rough key={k} shape={{ k: 'rect', x: x - 30 + k * 22, y: y - 10, w: 16, h: 18 }} seed={1631 + k} strokeWidth={1.5} fillColor={k === 2 ? 'var(--hl-green-ink)' : undefined} hachureGap={3.5} />
          ))}
          <Rough shape={{ k: 'line', x1: x - 34, y1: y + 14, x2: x + 34, y2: y + 14 }} seed={1635} strokeWidth={1.6} />
          <Check x={x + 24} y={y - 18} size={6} seed={1636} />
        </g>
      )
    case 5:
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: x, cy: y, w: 36, h: 32, start: 0.3, stop: 2.9 }} seed={1641} strokeWidth={1.9} stroke="var(--pen)" />
          <Rough shape={{ k: 'arc', cx: x, cy: y, w: 36, h: 32, start: 3.45, stop: 6.0 }} seed={1642} strokeWidth={1.9} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[x - 22, y - 2], [x - 17, y - 9], [x - 11, y - 3]] }} seed={1643} strokeWidth={1.7} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[x + 22, y + 2], [x + 17, y + 9], [x + 11, y + 3]] }} seed={1644} strokeWidth={1.7} stroke="var(--pen)" />
        </g>
      )
    default:
      return (
        <g>
          <Rough shape={{ k: 'line', x1: x - 8, y1: y + 18, x2: x - 8, y2: y - 22 }} seed={1651} strokeWidth={2} />
          <Rough shape={{ k: 'poly', pts: [[x - 8, y - 22], [x + 20, y - 14], [x - 8, y - 5]] }} seed={1652} strokeWidth={1.7} stroke="var(--red)" fillColor="var(--red)" hachureGap={3} />
          <Rough shape={{ k: 'arc', cx: x - 6, cy: y + 24, w: 46, h: 16, start: Math.PI, stop: Math.PI * 2 }} seed={1653} strokeWidth={1.5} />
        </g>
      )
  }
}

function RouteMap() {
  const reduce = useReducedMotion()
  const start = PATH[0]
  const here = STOPS[0]
  /** Lana stands next to the first stop (the one server), not behind it */
  const lanaAt: XY = [here.x - 62, here.y - 40]
  const steps = [0.25, 0.5, 0.75].map((t) => [start[0] + (lanaAt[0] + 18 - start[0]) * t, start[1] + (lanaAt[1] + 52 - start[1]) * t] as XY)
  return (
    <svg className={s.mapSvg} viewBox="-14 -6 500 368" role="img" aria-label="Karta tečaja: šest modula od jednog poslužitelja preko Dockera, Kubernetesa, CI/CD-a i Argo CD-a do prakse. Lana stoji na prvoj stanici.">
      <text x={486} y={22} textAnchor="end" className={s.svgHand} style={{ fontSize: 30, fill: 'var(--pen)' }}>
        karta tečaja
      </text>
      <text x={486} y={47} textAnchor="end" className={s.svgHand} style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        6 modula · 24 predavanja
      </text>
      <Rough shape={{ k: 'curve', pts: PATH }} seed={1660} stroke="var(--ink-2)" strokeWidth={1.7} dash="2 8" roughness={0.6} />
      {STOPS.map((st) => (
        <g key={st.n}>
          <StopGlyph n={st.n} x={st.x} y={st.y} />
          <text x={st.lx} y={st.ly} textAnchor={st.anchor} className={s.svgHand} style={{ fontSize: 24, fill: st.n === 1 ? 'var(--red)' : 'var(--ink)' }}>
            {st.n} · {st.label}
          </text>
          <text x={st.lx} y={st.ly + 19} textAnchor={st.anchor} className={`${s.svgHand} ${s.mapSub}`} style={{ fontSize: 18, fill: 'var(--ink-3)' }}>
            {st.sub}
          </text>
        </g>
      ))}
      {/* current stop: Lana and the first server, circled in red; the labels sit below the circle */}
      <Rough shape={{ k: 'ellipse', cx: 52, cy: 250, w: 140, h: 100 }} seed={1670} stroke="var(--red)" strokeWidth={2.2} multi draw="mount" delay={reduce ? 0 : 2.3} duration={0.7} />
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 2.6, duration: 0.3 }}>
        <text x={-8} y={186} className={s.svgHand} style={{ fontSize: 27, fill: 'var(--red)', fontWeight: 700 }}>
          ovdje ste!
        </text>
        <Arrow
          pts={[
            [102, 176],
            [122, 186],
            [114, 204],
          ]}
          stroke="var(--red)"
          strokeWidth={1.8}
          seed={1681}
          head={7}
        />
      </motion.g>
      {/* footprints from the start */}
      {steps.map(([x, y], i) => (
        <motion.ellipse
          key={i}
          cx={x + (i % 2 ? 4 : -4)}
          cy={y}
          rx={3.4}
          ry={2.2}
          className={s.foot}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ delay: reduce ? 0 : 0.4 + i * 0.55, duration: 0.2 }}
        />
      ))}
      <motion.g
        initial={reduce ? false : { x: start[0] - 50, y: start[1] - 40 }}
        animate={{ x: lanaAt[0], y: lanaAt[1] }}
        transition={{ duration: reduce ? 0 : 2, ease: 'linear', delay: 0.2 }}
      >
        <motion.g animate={reduce ? undefined : { y: [0, -3, 0, -3, 0, -3, 0, -3, 0] }} transition={{ duration: 2, delay: 0.2, ease: 'linear' }}>
          <Boil slow>
            <Lana x={0} y={0} scale={0.46} mood="grin" holding="none" />
          </Boil>
        </motion.g>
      </motion.g>
    </svg>
  )
}

export function Hero() {
  return (
    <section className={s.hero} id="vrh" aria-labelledby="hero-title">
      <div className={s.heroHead}>
        <p className={s.heroKicker}>bilježnica br. 1 · raspodijeljeni sustavi</p>
        <h1 className={s.heroTitle} id="hero-title">
          Kubernetes{' '}
          <span className={s.heroTitleHand}>
            od nule
            <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
              <Rough
                shape={{ k: 'ellipse', cx: 100, cy: 41, w: 190, h: 70 }}
                seed={1401}
                stroke="var(--red)"
                strokeWidth={2.4}
                multi
                roughness={1.6}
                draw="mount"
                duration={0.9}
                delay={0.4}
              />
            </svg>
          </span>
        </h1>
      </div>
      <div className={s.heroLead}>
        <p className={s.heroTagline}>Od jednog poslužitelja do platforme koja se sama popravlja.</p>
        <p className={s.heroDesc}>
          Pratimo Klopu, studentsku aplikaciju za naručivanje ručka u menzi, od prvog poslužitelja ispod Lanina stola do Kubernetes klastera koji preživi podnevnu gužvu. Svaki
          pojam prvo nacrtamo, zatim ga namjerno pokvarimo u simulaciji, a tek onda pišemo YAML.
        </p>
        <div className={s.ctaRow}>
          <a className={s.cta} href="#kurikulum">
            <svg viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
              <Rough shape={{ k: 'rect', x: 4, y: 4, w: 232, h: 56 }} seed={1410} stroke="var(--ink)" strokeWidth={2} fillColor="var(--ink)" fillStyle="solid" roughness={1.2} />
            </svg>
            Kreni od početka
            <span aria-hidden="true">→</span>
          </a>
          <span className={s.ctaNote}>
            <svg width="54" height="30" viewBox="0 0 54 30" aria-hidden="true" style={{ overflow: 'visible' }}>
              <Arrow
                pts={[
                  [52, 22],
                  [30, 26],
                  [6, 14],
                ]}
                stroke="var(--ink-2)"
                seed={1420}
                draw
                delay={1}
              />
            </svg>
            01 · Klopa izlazi na internet · 20 min
          </span>
        </div>
      </div>
      <figure className={s.heroMap}>
        <RouteMap />
      </figure>

      <figure className={s.strip} aria-label="Priča tečaja u tri sličice">
        <Tape style={{ top: -12, left: 24, transform: 'rotate(-8deg)' }} />
        <Tape c="blue" style={{ top: -12, right: 30, transform: 'rotate(6deg)' }} />
        <div className={s.stripInner}>
          <RoughBox className={`${s.panel} ${s.p1}`} seed={1501} strokeWidth={2} roughness={1.2}>
            <PanelOne />
            <p className={s.panelCap}>
              <b>①</b>12:00 — jedan poslužitelj ne stiže sve.
            </p>
          </RoughBox>
          <RoughBox className={`${s.panel} ${s.p2}`} seed={1502} strokeWidth={2} roughness={1.2}>
            <PanelTwo />
            <p className={s.panelCap}>
              <b>②</b>Redar na ulazu dijeli promet na više poslužitelja.
            </p>
          </RoughBox>
          <RoughBox className={`${s.panel} ${s.p3}`} seed={1503} strokeWidth={2} roughness={1.2}>
            <PanelThree />
            <p className={s.panelCap}>
              <b>③</b>Klaster: srušeni kontejner zamijeni se sam.
            </p>
          </RoughBox>
        </div>
        <span className={s.swipeHint} aria-hidden="true">
          povucite →
        </span>
      </figure>
    </section>
  )
}
