import { createContext, useContext, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Boil, Check, Crowd, Cross, Davor, Helm, Lana, Lunchbox, Redar, Rough, RoughBox, ServerCard, SpeechBubble, Tape, TrayDefs, type Pt } from '../../kit'

/** The reader paused the strip (or prefers reduced motion): panels show their still frame. */
const StillCtx = createContext(false)
function useStill(): boolean {
  const reduce = useReducedMotion()
  const paused = useContext(StillCtx)
  return !!reduce || paused
}

/** One tray travelling along a polyline at constant speed, forever (decorative loop of the comic strip). */
function Flow({ pts, dur, delay = 0, tray, fadeAt = 0.94 }: { pts: Pt[]; dur: number; delay?: number; tray: string; fadeAt?: number }) {
  const reduce = useStill()
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

/** Something that blinks on for part of a loop (✗ marks, state layers). Hidden under reduced motion. */
function Phase({ dur, at, delay = 0, children }: { dur: number; at: [number, number, number, number]; delay?: number; children: ReactNode }) {
  const reduce = useStill()
  if (reduce) return null
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1, 0, 0] }} transition={{ duration: dur, times: [0, at[0], at[1], at[2], at[3], 1], repeat: Infinity, ease: 'linear', delay }}>
      {children}
    </motion.g>
  )
}

function Smoke({ x, seed }: { x: number; seed: number }) {
  return <Rough shape={{ k: 'curve', pts: [[x, 74], [x - 6, 62], [x + 2, 50], [x - 4, 38]] }} seed={seed} strokeWidth={1.5} stroke="var(--ink-3)" />
}

/* ---------- ① 12:00 — one server can't keep up ---------- */
function PanelOne() {
  const tray = 'hero1-tray'
  const door: Pt = [170, 168]
  const ticks = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2
    return { x1: 36 + Math.sin(a) * 17, y1: 34 - Math.cos(a) * 17, x2: 36 + Math.sin(a) * 21, y2: 34 - Math.cos(a) * 21 }
  })
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Prva sličica: u 12:00 svi studenti šalju zahtjeve jednom poslužitelju koji se zagušuje.">
      <TrayDefs id="hero1" />
      <Boil slow>
        <Rough shape={{ k: 'ellipse', cx: 36, cy: 34, w: 50, h: 50 }} seed={1101} strokeWidth={1.9} />
        {ticks.map((tk, i) => (
          <Rough key={i} shape={{ k: 'line', ...tk }} seed={1104 + i} strokeWidth={1.5} roughness={0.4} />
        ))}
        <Rough shape={{ k: 'line', x1: 36, y1: 34, x2: 36, y2: 16 }} seed={1102} strokeWidth={2.2} />
        <Rough shape={{ k: 'line', x1: 36, y1: 34, x2: 37, y2: 22 }} seed={1103} strokeWidth={3.2} />
      </Boil>
      <text x={68} y={32} className="k-svg-hand" style={{ fontSize: 28, fill: 'var(--red)' }}>
        12:00!
      </text>
      <Crowd x={-4} y={70} scale={0.72} />
      <Boil>
        <ServerCard x={180} y={78} w={90} h={116} seed={1110} mood="panic" />
        <Smoke x={198} seed={1111} />
        <Smoke x={224} seed={1112} />
        <Smoke x={250} seed={1113} />
      </Boil>
      <text x={225} y={173} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15.5, fontWeight: 600, fill: 'var(--red)' }}>
        CPU 100 %
      </text>
      {[0, 1, 2].map((i) => (
        <use key={i} href={`#${tray}`} x={152 - i * 3} y={182 - i * 9} width={20} height={13} />
      ))}
      <Flow tray={tray} pts={[[124, 140], door]} dur={0.9} />
      <Flow tray={tray} pts={[[120, 156], door]} dur={0.9} delay={0.3} />
      <Flow tray={tray} pts={[[124, 146], door, [176, 224]]} dur={1.5} delay={0.6} fadeAt={0.9} />
      <Phase dur={1.5} at={[0.58, 0.66, 0.9, 0.98]} delay={0.6}>
        <Cross x={175} y={214} size={9} seed={1120} />
      </Phase>
      <Boil>
        <Davor x={282} y={118} scale={0.7} mood="worry" buzz />
      </Boil>
      <SpeechBubble x={258} y={22} w={100} h={74} tx={310} ty={146} lines={['Opet', 'pada?!']} size={25} seed={1130} tail={16} />
    </svg>
  )
}

/* ---------- ② a redar shares the load ---------- */
function PanelTwo() {
  const tray = 'hero2-tray'
  const reduce = useStill()
  const lb: Pt = [166, 168]
  const sc = 0.8
  const shoulder: Pt = [lb[0] + 13 * sc, lb[1] - 28 * sc]
  const hand: Pt = [lb[0], lb[1] + 14 * sc]
  const targets: Pt[] = [
    [270, 50],
    [270, 124],
    [270, 198],
  ]
  const cycle = 2.4
  const angles = targets.map(([x, y]) => (Math.atan2(y - shoulder[1], x - shoulder[0]) * 180) / Math.PI)
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Druga sličica: redar (load balancer) šalje studente redom na tri poslužitelja.">
      <TrayDefs id="hero2" />
      <Crowd x={-4} y={70} scale={0.72} />
      {targets.map(([x, y], i) => (
        <Boil key={i}>
          <ServerCard x={x + 6} y={y - 26} w={74} h={52} seed={1200 + i * 10} mood="calm" />
        </Boil>
      ))}
      {targets.map(([x, y], i) => (
        <Rough key={i} shape={{ k: 'line', x1: hand[0] + 20, y1: hand[1] - 4, x2: x, y2: y }} seed={1240 + i} strokeWidth={1} stroke="var(--ink-3)" dash="3 5" />
      ))}
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
      <text x={lb[0] - 6} y={246} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21 }}>
        load balancer = redar
      </text>
    </svg>
  )
}

/* ---------- ③ a cluster that heals itself ---------- */
function PodCycle({ x, y, loop }: { x: number; y: number; loop: number }) {
  const reduce = useStill()
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
      </Phase>
      <Phase dur={loop} at={[0.6, 0.63, 0.72, 0.76]}>
        <Lunchbox x={x} y={y} seed={1373} state="pending" />
        <text x={x + 20} y={y + 50} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--pen)' }}>
          novi!
        </text>
      </Phase>
    </g>
  )
}

function PanelThree() {
  const tray = 'hero3-tray'
  const pods: Pt[] = [
    [134, 96],
    [134, 152],
    [246, 96],
    [246, 152],
  ]
  const entry: Pt = [116, 192]
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="Treća sličica: klaster s kontejnerima. Jedan se sruši, Kubernetes odmah pokrene novi.">
      <TrayDefs id="hero3" />
      <Rough shape={{ k: 'rect', x: 120, y: 44, w: 232, h: 186 }} seed={1301} strokeWidth={1.8} roughness={1.6} multi />
      <text x={344} y={222} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21.5, fill: 'var(--pen)' }}>
        klaster
      </text>
      <Rough shape={{ k: 'rect', x: 126, y: 76, w: 104, h: 128 }} seed={1302} strokeWidth={1.3} stroke="var(--ink-2)" />
      <Rough shape={{ k: 'rect', x: 238, y: 76, w: 104, h: 128 }} seed={1303} strokeWidth={1.3} stroke="var(--ink-2)" />
      <text x={130} y={70} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        čvor 1
      </text>
      <text x={242} y={70} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        čvor 2
      </text>
      <Boil slow>
        <Helm x={300} y={22} r={12} />
      </Boil>
      <circle cx={295} cy={21} r={1.6} className="k-ink-fill" />
      <circle cx={305} cy={21} r={1.6} className="k-ink-fill" />
      <Lunchbox x={pods[0][0]} y={pods[0][1]} seed={1310} />
      <Lunchbox x={pods[1][0]} y={pods[1][1]} seed={1320} />
      <Lunchbox x={pods[2][0]} y={pods[2][1]} seed={1330} />
      <PodCycle x={pods[3][0]} y={pods[3][1]} loop={8} />
      <Lunchbox x={pods[0][0] + 48} y={pods[0][1]} seed={1340} version="v2" />
      <Lunchbox x={pods[2][0] + 48} y={pods[3][1]} seed={1350} version="v2" />
      {pods.slice(0, 3).map((p, i) => (
        <Flow key={i} tray={tray} pts={[[64, 206], entry, [p[0] + 20, p[1] + 16]]} dur={2} delay={i * 0.66} fadeAt={0.9} />
      ))}
      <Boil slow>
        <Lana x={2} y={150} scale={0.62} mood="grin" />
      </Boil>
      <SpeechBubble x={-2} y={64} w={112} h={72} tx={27} ty={170} lines={['Sam se', 'popravio!']} size={22.5} seed={1360} tail={16} />
    </svg>
  )
}

/** The course's story in three comic panels, taped onto the page. Below 1200 px it becomes a swipeable film strip. */
export function HeroStrip() {
  const [paused, setPaused] = useState(false)
  const reduce = useReducedMotion()
  return (
    <StillCtx.Provider value={paused}>
    <figure className="nb-strip" aria-label="Priča tečaja u tri sličice">
      <Tape style={{ top: -12, left: 24, transform: 'rotate(-8deg)' }} />
      <Tape c="blue" style={{ top: -12, right: 30, transform: 'rotate(6deg)' }} />
      {/* below 1200 px the strip scrolls sideways: a tab stop so keyboard users can scroll it */}
      <div className="nb-strip__inner" tabIndex={0} role="region" aria-label="Tri sličice priče (povucite vodoravno)">
        <RoughBox className="nb-panel" seed={1501} strokeWidth={2} roughness={1.2}>
          <PanelOne />
          <p className="nb-panel__cap">
            <b>①</b>12:00 — jedan poslužitelj ne stiže sve.
          </p>
        </RoughBox>
        <RoughBox className="nb-panel" seed={1502} strokeWidth={2} roughness={1.2}>
          <PanelTwo />
          <p className="nb-panel__cap">
            <b>②</b>Redar na ulazu dijeli promet na više poslužitelja.
          </p>
        </RoughBox>
        <RoughBox className="nb-panel" seed={1503} strokeWidth={2} roughness={1.2}>
          <PanelThree />
          <p className="nb-panel__cap">
            <b>③</b>Klaster: srušeni kontejner zamijeni se sam.
          </p>
        </RoughBox>
      </div>
      <span className="nb-strip__hint" aria-hidden="true">
        povucite →
      </span>
      {/* the comic loops: the reader can stop it (WCAG 2.2.2) */}
      {!reduce && (
        <button type="button" className="nb-strip__pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ pokreni crtež' : '❚❚ zaustavi crtež'}
        </button>
      )}
    </figure>
    </StillCtx.Provider>
  )
}
