import { memo, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Rough, Cross, Check, Arrow, RoughBox, RoughAround } from './Sketch'
import { Bubble, Davor, Redar, ServerFace, Student, TrayDefs } from './Doodles'
import { Mark, SecHead, PropBolt } from './Bits'
import { BASE_GB, HC_FAILS, LbEngine, MARK_MS, QUEUE_MAX, SERVER_SPECS, SLOT_GB, TICK_MS, hr, type Algo, type ServerSnap, type SimSnap } from './lbModel'
import { along, cardHeight, corePos, layoutFor, lineCount, platePos, queuePos, routesFor, serverEntry, serverPoint, type CardGeo, type Pts, type Route, type SimLayout } from './simGeometry'
import { useInView, useWidth } from './useSize'
import s from './bj.module.css'
import m from './sim.module.css'

const ID = 'bjsim'
type Mood = 'calm' | 'busy' | 'panic' | 'dead'

/* ---------- the "brain" (one CPU core) ---------- */

function brainPts(w: number, h: number): [number, number][] {
  const sx = w / 26
  const sy = h / 22
  return (
    [
      [3, 15],
      [1, 9],
      [4, 4],
      [9, 1.5],
      [13, 4],
      [17, 1.5],
      [22, 3.5],
      [25, 9],
      [24, 15],
      [20, 20],
      [13, 18.5],
      [7, 20.5],
      [3, 15],
    ] as [number, number][]
  ).map(([x, y]) => [x * sx, y * sy])
}

/* ---------- static parts (memoised: drawn once per layout / state) ---------- */

const CardStatic = memo(function CardStatic({ i, g, layoutName, down }: { i: number; g: CardGeo; layoutName: string; down: boolean }) {
  const spec = SERVER_SPECS[i]
  const h = cardHeight(g, spec.slots)
  const anchor = g.align === 'center' ? 'middle' : 'start'
  return (
    <g>
      <defs>
        {Array.from({ length: spec.vcpu }, (_, c) => {
          const p = corePos(g, c, spec.vcpu)
          return (
            <clipPath key={c} id={`${ID}-${layoutName}-core${i}${c}`}>
              <ellipse cx={p.x + g.cpu.w / 2} cy={p.y + g.cpu.h / 2 + 0.5} rx={g.cpu.w / 2 - 0.5} ry={g.cpu.h / 2 - 1} />
            </clipPath>
          )
        })}
      </defs>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: g.w, h }} seed={3000 + i * 20} strokeWidth={2} fillColor="var(--paper)" fillStyle="solid" roughness={1.2} />
      <text x={g.name.x} y={g.name.y} textAnchor={anchor} className={s.svgDisplay} style={{ fontSize: g.nameSize }}>
        {spec.name}
      </text>
      <text x={g.spec.x} y={g.spec.y} textAnchor={anchor} className={s.svgMono} style={{ fontSize: g.specSize, fill: 'var(--ink-2)' }}>
        {spec.vcpu} vCPU · {spec.ramGB} GB
      </text>
      <g opacity={down ? 0.2 : 1}>
        {g.labels && (
          <>
            <text x={14} y={g.cpu.y + 16} className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
              CPU
            </text>
            <text x={14} y={g.plate.y0 + 6} className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
              RAM
            </text>
          </>
        )}
        {Array.from({ length: spec.vcpu }, (_, c) => {
          const p = corePos(g, c, spec.vcpu)
          const pts = brainPts(g.cpu.w, g.cpu.h).map(([x, y]) => [p.x + x, p.y + y] as [number, number])
          return (
            <g key={c}>
              <Rough shape={{ k: 'curve', pts }} seed={3001 + i * 20 + c} strokeWidth={1.4} roughness={0.7} />
              <Rough
                shape={{
                  k: 'curve',
                  pts: [
                    [p.x + g.cpu.w / 2, p.y + 4],
                    [p.x + g.cpu.w / 2 - 1, p.y + g.cpu.h / 2],
                    [p.x + g.cpu.w / 2 + 1, p.y + g.cpu.h - 3],
                  ],
                }}
                seed={3011 + i * 20 + c}
                strokeWidth={1}
                roughness={0.5}
              />
            </g>
          )
        })}
        {Array.from({ length: spec.slots }, (_, k) => {
          const p = platePos(g, k)
          return (
            <g key={k}>
              <circle cx={p.x} cy={p.y} r={g.plate.r} className={m.plate} />
              <circle cx={p.x} cy={p.y} r={g.plate.r * 0.62} className={m.plateRim} />
            </g>
          )
        })}
        {Array.from({ length: QUEUE_MAX }, (_, q) => (
          <rect key={q} x={g.queue.x0 + q * g.queue.gap} y={g.queue.y} width={g.queue.w} height={g.queue.h} rx={2} className={m.qslot} />
        ))}
        {g.queue.label && (
          <text x={g.queue.x0 + QUEUE_MAX * g.queue.gap + 2} y={g.queue.y + 14} className={s.svgHand} style={{ fontSize: 17, fill: 'var(--ink-3)' }}>
            red
          </text>
        )}
      </g>
    </g>
  )
})

/** The pencil roads: one lane from the students to the redar, one from the redar to each server. */
const Roads = memo(function Roads({ inRoute, out }: { inRoute: Route; out: Route[] }) {
  return (
    <g>
      <Rough shape={{ k: 'lin', pts: inRoute.pts.map((q) => [q.x, q.y] as [number, number]) }} seed={3101} stroke="var(--ink-3)" strokeWidth={1.5} roughness={0.8} />
      {out.map((r, i) => (
        <Rough
          key={i}
          shape={{ k: 'line', x1: r.pts[0].x, y1: r.pts[0].y, x2: r.pts[1].x, y2: r.pts[1].y }}
          seed={3110 + i}
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          roughness={0.8}
        />
      ))}
    </g>
  )
})

/** The queue of students in front of the canteen: its length follows the traffic slider. */
const StudentLine = memo(function StudentLine({ layout, count, tap }: { layout: SimLayout; count: number; tap: boolean }) {
  const { front, back, y, s: sc, maxGap } = layout.line
  const gap = Math.min(maxGap, (front - back) / Math.max(1, count - 1))
  const order = Array.from({ length: count }, (_, i) => count - 1 - i)
  return (
    <g>
      {order.map((i) => (
        <g key={i} className={m.student} style={{ transform: `translate(${front - i * gap}px, ${y + (i % 2) * 3}px) scale(${sc})` }}>
          <g className={m.popIn}>
            <Student variant={i} tap={tap && i > 0} mood={tap && i > 2 ? 'flat' : 'smile'} />
          </g>
        </g>
      ))}
    </g>
  )
})

const MenzaSign = memo(function MenzaSign({ sign }: { sign: NonNullable<SimLayout['sign']> }) {
  const { x, y, w, posts, top, floor } = sign
  return (
    <g>
      <Rough
        shape={{
          k: 'lin',
          pts: [
            [posts[0], floor],
            [posts[0], top],
            [posts[1], top],
            [posts[1], floor],
          ],
        }}
        seed={3121}
        strokeWidth={1.6}
        stroke="var(--ink-3)"
        roughness={1.1}
      />
      <Rough shape={{ k: 'line', x1: posts[0] - 20, y1: floor, x2: posts[1] + 20, y2: floor }} seed={3122} strokeWidth={1.3} stroke="var(--ink-3)" roughness={1.3} />
      <Rough shape={{ k: 'rect', x, y, w, h: 40 }} seed={3123} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + w / 2} y={y + 27} textAnchor="middle" className={s.svgDisplay} style={{ fontSize: 17, letterSpacing: '0.12em' }}>
        ULAZ · MENZA
      </text>
    </g>
  )
})

/** Croatian plural: 1 veza, 2–4 veze, 5+ veza (but 22 veze, 12 veza). */
function vezaWord(n: number): string {
  const d = n % 10
  const dd = n % 100
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'veze' : 'veza'
}

/* ---------- dynamic server card ---------- */

function ServerCard({ i, layout, sn, mood }: { i: number; layout: SimLayout; sn: ServerSnap; mood: Mood }) {
  const g = layout.card
  const spec = SERVER_SPECS[i]
  const place = layout.servers[i]
  const h = cardHeight(g, spec.slots)
  const inUse = sn.plates.filter(Boolean).length
  const cpuPct = Math.round((Math.min(sn.busy, spec.vcpu) / spec.vcpu) * 100)
  const ram = hr(sn.up ? BASE_GB + inUse * SLOT_GB : 0)
  const hot = cpuPct >= 95
  const down = !sn.up
  return (
    <g transform={`translate(${place.x} ${place.y})`}>
      <CardStatic i={i} g={g} layoutName={layout.name} down={down} />
      {!down && (
        <g>
          {Array.from({ length: spec.vcpu }, (_, c) => {
            const f = Math.max(0, Math.min(1, sn.busy - c))
            if (f < 0.02) return null
            const p = corePos(g, c, spec.vcpu)
            return (
              <g key={c} clipPath={`url(#${ID}-${layout.name}-core${i}${c})`}>
                <rect x={p.x} y={p.y + g.cpu.h * (1 - f)} width={g.cpu.w} height={g.cpu.h * f} className={m.coreFill} />
                <rect x={p.x} y={p.y + g.cpu.h * (1 - f)} width={g.cpu.w} height={g.cpu.h * f} fill={`url(#${ID}-hatch)`} />
              </g>
            )
          })}
          {sn.plates.map((on, k) => {
            if (!on) return null
            const p = platePos(g, k)
            return <circle key={k} cx={p.x} cy={p.y} r={g.plate.r * 0.55} className={m.food} />
          })}
          {Array.from({ length: sn.queue }, (_, q) => {
            const p = queuePos(g, q)
            const tw = g.queue.w * 1.15
            return <use key={q} href={`#${ID}-tray`} x={p.x - tw / 2} y={p.y - tw * 0.35} width={tw} height={tw * 0.7} />
          })}
          {g.readout && (
            <>
              <text x={14} y={h - 11} className={s.svgMono} style={{ fontSize: g.readout.size, fill: hot ? 'var(--red)' : 'var(--ink-2)', fontWeight: hot ? 600 : 400 }}>
                CPU {cpuPct} %
              </text>
              <text x={g.w - 12} y={h - 11} textAnchor="end" className={s.svgMono} style={{ fontSize: g.readout.size, fill: 'var(--ink-2)' }}>
                RAM {ram}/{spec.ramGB} GB
              </text>
            </>
          )}
          {g.conns && (
            <text x={g.conns.x} y={g.conns.y} textAnchor="end" className={s.svgHand} style={{ fontSize: 19, fill: 'var(--pen)' }}>
              {sn.active} {vezaWord(sn.active)}
            </text>
          )}
        </g>
      )}
      {down && (
        <g>
          <Rough
            shape={{ k: 'rect', x: 4, y: 4, w: g.w - 8, h: h - 8 }}
            seed={3200 + i}
            stroke="var(--red)"
            strokeWidth={2}
            fillColor="var(--red)"
            fillStyle="hachure"
            hachureGap={15}
            fillWeight={0.7}
            className={m.crashHatch}
          />
          <g transform={`translate(${g.w / 2} ${(g.plate.y0 + h) / 2 - 6}) rotate(-7)`}>
            <rect x={g.align === 'center' ? -48 : -62} y={-17} width={g.align === 'center' ? 96 : 124} height={32} className={m.stampBg} />
            <text textAnchor="middle" y={7} className={m.stamp} style={{ fontSize: g.align === 'center' ? 17 : 21 }}>
              SRUŠEN
            </text>
          </g>
        </g>
      )}
      <g transform={`translate(${g.face.x} ${g.face.y})`}>
        <ServerFace mood={mood} r={g.faceR} />
      </g>
    </g>
  )
}

/* ---------- the redar's clipboard: health checks ---------- */

function Clipboard({ layout, snap }: { layout: SimLayout; snap: SimSnap }) {
  const { x, y, w, h } = layout.clip
  const fresh = snap.probeAge < 220
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={3301} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w / 2 - 24, y: y - 7, w: 48, h: 13 }} seed={3302} strokeWidth={1.4} fillColor="var(--ink-3)" fillStyle="solid" />
      <text x={x + 12} y={y + 27} className={s.svgHand} style={{ fontSize: 21, fill: 'var(--pen)' }}>
        health check
      </text>
      <text x={x + w - 12} y={y + 27} textAnchor="end" className={`${s.svgHand} ${m.knock}`} style={{ fontSize: 18, opacity: fresh ? 1 : 0, fill: 'var(--pen)' }}>
        kuc-kuc!
      </text>
      {snap.servers.map((sv, i) => {
        const ry = y + 52 + i * 22
        let status = '✓ zdrav'
        let cls = m.ok
        if (!sv.healthy && !sv.up) {
          status = 'izbačen'
          cls = m.bad
        } else if (!sv.healthy && sv.up) {
          status = 'čeka provjeru'
          cls = m.wait
        } else if (!sv.up) {
          status = `✗ ${sv.fails}/${HC_FAILS}`
          cls = m.bad
        }
        return (
          <g key={i}>
            <text x={x + 14} y={ry} className={s.svgHand} style={{ fontSize: 19 }}>
              {SERVER_SPECS[i].name}
            </text>
            <text x={x + w - 14} y={ry} textAnchor="end" className={`${s.svgHand} ${cls}`} style={{ fontSize: 19 }}>
              {status}
            </text>
            {!sv.healthy && !sv.up && (
              <Rough shape={{ k: 'line', x1: x + 10, y1: ry - 5, x2: x + 80, y2: ry - 4 }} seed={3310 + i} stroke="var(--red)" strokeWidth={2} />
            )}
          </g>
        )
      })}
      <text x={x + 12} y={y + h - 12} className={s.svgHand} style={{ fontSize: 17, fill: 'var(--ink-2)' }}>
        2 s (sim) · stvarno npr. 30 s
      </text>
    </g>
  )
}

/* ---------- handwritten notes that react to what happens ---------- */

interface Note {
  key: string
  x: number
  y: number
  lines: string[]
  tone: 'red' | 'pen' | 'ink'
  arrow?: Pts
}

function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > max) {
      out.push(line)
      line = w
    } else line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out
}

function notesFor(snap: SimSnap, algo: Algo, layout: SimLayout): Note[] {
  const out: Note[] = []
  const v = snap.servers[2]
  const { mali, veliki, hint } = layout.notes
  const at = (key: string, spot: typeof mali, text: string, tone: Note['tone']): Note => {
    const lines = wrap(text, spot.wrap)
    return { key, x: spot.x, y: spot.y, lines, tone, arrow: spot.arrow?.(lines.length) }
  }
  if (!v.up && v.healthy) {
    const sec = (snap.t - v.downAt) / 1000
    out.push(at('undetected', veliki, `Veliki je pao prije ${hr(sec)}\u00a0s, a redar mu i dalje šalje!${algo === 'lc' ? ' (0 veza = „najslobodniji”)' : ''}`, 'red'))
  } else if (!v.up && !v.healthy) {
    const det = (v.detectedAt - v.downAt) / 1000
    out.push(at('detected', veliki, `Izbačen nakon ${hr(det)}\u00a0s (sim). Stvarno to traje i 30\u00a0s.`, 'pen'))
  } else if (v.up && !v.healthy) {
    out.push(at('back', veliki, 'Popravljen! Vraća se tek nakon uspješnog health checka.', 'pen'))
  }
  if (snap.errBy[0] > 0 && v.up) {
    out.push(at(`mali-${algo}`, mali, algo === 'rr' ? 'Mali se guši: kružno mu daje jednako zahtjeva kao Velikom.' : 'I „najmanje veza” ima granicu: prometa je naprosto previše.', 'red'))
  }
  if (!out.length) {
    out.push(at('hint', hint, layout.name === 'wide' ? 'svaki pladanj = jedan zahtjev' : 'svaki pladanj = jedan zahtjev. Pojačajte promet na 25/s!', 'ink'))
  }
  return out
}

function Notes({ notes, size }: { notes: Note[]; size: number }) {
  return (
    <AnimatePresence>
      {notes.map((n) => (
        <motion.g key={n.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {n.lines.map((l, i) => (
            <text key={i} x={n.x} y={n.y + i * (size + 2)} className={`${s.svgHand} ${m[`note_${n.tone}`]}`} style={{ fontSize: size }}>
              {l}
            </text>
          ))}
          {n.arrow && (
            <Arrow pts={n.arrow} stroke={n.tone === 'red' ? 'var(--red)' : n.tone === 'pen' ? 'var(--pen)' : 'var(--ink-2)'} seed={n.key.length * 13} strokeWidth={1.6} />
          )}
        </motion.g>
      ))}
    </AnimatePresence>
  )
}

/** Davor is on call: his pager buzzes on 502s and he says what he sees. */
function OnCall({ layout, snap, errs }: { layout: SimLayout; snap: SimSnap; errs: number }) {
  const v = snap.servers[2]
  const d = layout.davor
  let say: { key: string; lines: string[]; tone: 'ink' | 'red' } | null = null
  if (!v.up && v.healthy) say = { key: '502', lines: ['502! 502!'], tone: 'red' }
  else if (!v.up && !v.healthy) say = { key: 'out', lines: ['Izbačen.', 'Uf.'], tone: 'ink' }
  else if (v.up && !v.healthy) say = { key: 'back', lines: ['Ajde, javi se…'], tone: 'ink' }
  const head = { x: d.x + 40 * d.s, y: d.y + 38 * d.s }
  return (
    <g>
      <Davor x={d.x} y={d.y} scale={d.s} mood={!v.up || errs > 1.5 ? 'worry' : 'smile'} buzz={!v.up && v.healthy} />
      <AnimatePresence>
        {say && (
          <motion.g
            key={say.key}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ originX: `${head.x}px`, originY: `${head.y}px` }}
          >
            <Bubble {...d.bubble} tx={head.x} ty={head.y} lines={say.lines} size={layout.bubbleSize} tone={say.tone} seed={3901} tail={16} />
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  )
}

/* ---------- the simulation ---------- */

function moodOf(sn: ServerSnap, i: number, errs: number): Mood {
  if (!sn.up) return 'dead'
  const util = sn.busy / SERVER_SPECS[i].vcpu
  if (sn.queue >= QUEUE_MAX - 1 || errs > 0) return 'panic'
  if (util > 0.7 || sn.queue > 0) return 'busy'
  return 'calm'
}

function Metrics({ shown }: { shown: { ok: number; err: number; p95: number | null } }) {
  const bad = shown.err > 0.05
  return (
    <div className={m.metrics} aria-live="off">
      <RoughBox className={m.metric} seed={3701} strokeWidth={1.5} roughness={1.4}>
        <span className={m.metricLabel}>obrađeno/s</span>
        <span className={m.metricVal}>{hr(shown.ok)}</span>
      </RoughBox>
      <RoughBox className={m.metric} seed={3702} strokeWidth={1.5} roughness={1.4}>
        <span className={m.metricLabel} title="95 % zahtjeva završi brže od ovoga (čekanje u redu + obrada)">
          p95
        </span>
        <span className={m.metricVal}>{shown.p95 === null ? '—' : `${hr(shown.p95 / 1000, 2)} s`}</span>
      </RoughBox>
      <RoughBox className={`${m.metric} ${bad ? m.metricBad : ''}`} seed={3703} strokeWidth={bad ? 2 : 1.5} roughness={1.4} stroke={bad ? 'var(--red)' : 'var(--ink)'}>
        <span className={m.metricLabel}>greške/s</span>
        <span className={m.metricVal}>{hr(shown.err)}</span>
      </RoughBox>
    </div>
  )
}

function LbSim() {
  const reduce = useReducedMotion()
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [svgRef, visible] = useInView<HTMLDivElement>(0.05)
  const layout = layoutFor(width)
  const { inRoute, out } = useMemo(() => routesFor(layout), [layout])
  const [engine] = useState(() => new LbEngine(12, 'rr'))
  const [snap, setSnap] = useState<SimSnap>(() => engine.snapshot())
  const [shown, setShown] = useState<{ ok: number; err: number; p95: number | null }>({ ok: 0, err: 0, p95: null })
  const [lambda, setLambda] = useState(12)
  const [algo, setAlgo] = useState<Algo>('rr')
  const [userPaused, setUserPaused] = useState<boolean | null>(null)
  const paused = userPaused ?? !!reduce

  useEffect(() => {
    engine.setDurations(
      (inRoute.len / layout.speed) * 1000,
      out.map((r) => (r.len / layout.speed) * 1000),
    )
  }, [engine, inRoute, out, layout.speed])

  useEffect(() => {
    if (paused || !visible) return
    let raf = 0
    let last = performance.now()
    let lastShown = 0
    const loop = (now: number) => {
      const dt = now - last
      last = now
      if (!document.hidden) {
        engine.advance(dt)
        const sn = engine.snapshot()
        setSnap(sn)
        if (now - lastShown > 350) {
          lastShown = now
          setShown({ ok: sn.okRate, err: sn.errRate, p95: sn.p95 })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, visible, engine])

  const v = snap.servers[2]
  const lbPlace = layout.lb
  const shoulder = { x: lbPlace.x + 13 * lbPlace.s, y: lbPlace.y - 28 * lbPlace.s }
  const target = snap.lastTarget >= 0 ? serverEntry(layout, snap.lastTarget) : { x: shoulder.x + 100, y: shoulder.y }
  const angle = Math.atan2(target.y - shoulder.y, target.x - shoulder.x)
  const notes = notesFor(snap, algo, layout)
  const tw = layout.tray
  const fullest = Math.max(...snap.servers.map((sv) => (sv.up ? sv.queue / QUEUE_MAX : 0)))
  const sweat = fullest > 0.8 ? 3 : fullest > 0.5 ? 2 : fullest > 0.15 ? 1 : 0
  const count = lineCount(lambda, layout.line.max)

  // a finished request = a green tick in the margin next to its server; only the newest two per server are drawn
  const recentTicks: SimSnap['ticks'] = []
  const seen = [0, 0, 0]
  for (let k = snap.ticks.length - 1; k >= 0; k--) {
    const t = snap.ticks[k]
    if (seen[t.srv] < 2) {
      seen[t.srv]++
      recentTicks.push(t)
    }
  }

  const update = () => setSnap(engine.snapshot())

  const head = (
    <div className={layout.overlay ? m.headOverlay : m.sheetHead}>
      <div className={m.sheetTitleRow}>
        <span className={m.sheetTitle}>simulacija · redar na ulazu</span>
        <button type="button" className={m.pauseBtn} onClick={() => setUserPaused(!paused)} aria-pressed={paused}>
          {paused ? '▶ pokreni' : '❚❚ pauza'}
        </button>
      </div>
      <Metrics shown={shown} />
    </div>
  )

  return (
    <div className={m.sim} ref={wrapRef} data-layout={layout.name}>
      {!layout.overlay && head}
      <div className={m.stage} ref={svgRef} style={{ maxWidth: layout.maxW ?? undefined }}>
        {layout.overlay && head}
        <svg
          className={m.svg}
          viewBox={`0 0 ${layout.vb.w} ${layout.vb.h}`}
          role="img"
          aria-label={`Simulacija: studenti šalju ${lambda} zahtjeva u sekundi, load balancer ih raspoređuje (${algo === 'rr' ? 'kružno' : 'najmanje aktivnih veza'}) na poslužitelje Mali, Srednji i Veliki.`}
        >
          <TrayDefs id={ID} />
          {layout.sign && <MenzaSign sign={layout.sign} />}
          <Roads inRoute={inRoute} out={out} />
          {/* routes the health check has removed */}
          {out.map((r, i) =>
            snap.servers[i].healthy ? null : (
              <g key={i}>
                <Rough
                  shape={{ k: 'line', x1: r.pts[0].x, y1: r.pts[0].y, x2: r.pts[1].x, y2: r.pts[1].y }}
                  seed={3120 + i}
                  stroke="var(--red)"
                  strokeWidth={1.8}
                  dash="8 7"
                />
                <Cross x={(r.pts[0].x + r.pts[1].x) / 2} y={(r.pts[0].y + r.pts[1].y) / 2} size={12} seed={3130 + i} strokeWidth={2.6} />
              </g>
            ),
          )}
          <StudentLine layout={layout} count={count} tap={lambda >= 24} />
          {layout.lineLabel && (
            <text x={layout.lineLabel.x} y={layout.lineLabel.y} className={s.svgHand} style={{ fontSize: layout.lineLabel.size, fill: 'var(--ink-2)' }}>
              red pred menzom · {lambda} narudžbi u sekundi
            </text>
          )}
          <Redar x={lbPlace.x} y={lbPlace.y} scale={lbPlace.s} angle={angle} mood={shown.err > 1.5 ? 'worry' : 'smile'} sweat={sweat} />
          {layout.lbLabel && (
            <text x={layout.lbLabel.x} y={layout.lbLabel.y} textAnchor="middle" className={s.svgHand} style={{ fontSize: layout.lbLabel.size, fill: 'var(--ink-2)' }}>
              redar = load balancer
            </text>
          )}
          <Clipboard layout={layout} snap={snap} />
          {SERVER_SPECS.map((_, i) => (
            <ServerCard key={i} i={i} layout={layout} sn={snap.servers[i]} mood={moodOf(snap.servers[i], i, snap.errBy[i])} />
          ))}
          <OnCall layout={layout} snap={snap} errs={shown.err} />

          {/* requests in flight: plain SVG, positions from the model */}
          <g>
            {snap.flights.map((f) => {
              const p = along(f.leg === 'in' ? inRoute : out[f.srv], f.p)
              return <use key={f.id} href={`#${ID}-tray`} x={p.x - tw / 2} y={p.y - tw * 0.35} width={tw} height={tw * 0.7} />
            })}
          </g>
          {/* finished requests: a green tick in the margin of the server, rising and fading */}
          <g>
            {recentTicks.map((t) => {
              const base = serverPoint(layout, t.srv, layout.card.tick)
              const a = t.age / TICK_MS
              return (
                <g key={t.id} transform={`translate(${base.x} ${base.y - a * 16})`} opacity={1 - a * a}>
                  <Check x={0} y={0} size={7} seed={t.id % 4} strokeWidth={2.2} />
                </g>
              )
            })}
          </g>
          {/* failed requests: the tray falls at the door, a red ✗ stays for a moment */}
          <g>
            {snap.marks.map((mk) => {
              const door = mk.srv < 0 ? layout.lbPoint : serverEntry(layout, mk.srv)
              const jitter = ((mk.id * 37) % 5) - 2
              const base = { x: door.x + (mk.srv < 0 ? -6 : layout.card.markDx) + jitter * 4, y: door.y + 4 + jitter * 2 }
              const a = mk.age / MARK_MS
              const fall = mk.age * mk.age * 0.00009
              return (
                <g key={mk.id}>
                  <g transform={`translate(${base.x} ${base.y + fall}) rotate(${mk.age * 0.22})`} opacity={1 - a}>
                    <use href={`#${ID}-tray`} x={-tw * 0.4} y={-tw * 0.28} width={tw * 0.8} height={tw * 0.56} />
                  </g>
                  <g opacity={a < 0.75 ? 1 : (1 - a) * 4}>
                    <Cross x={base.x} y={base.y} size={layout.name === 'tall' ? 9 : 11} seed={(mk.id % 5) * 7 + 3400} strokeWidth={2.6} />
                  </g>
                </g>
              )
            })}
          </g>
          <Notes notes={notes} size={layout.notes.size} />
        </svg>
      </div>

      <div className={m.panel}>
        <div className={m.controls}>
          <label className={m.slider}>
            <span className={m.ctlLabel}>Promet</span>
            <input
              type="range"
              min={2}
              max={40}
              step={1}
              value={lambda}
              onChange={(e) => {
                const val = Number(e.target.value)
                setLambda(val)
                engine.setLambda(val)
              }}
              style={{ ['--p' as string]: `${((lambda - 2) / 38) * 100}%` }}
              aria-valuetext={`${lambda} zahtjeva u sekundi`}
            />
            <output className={m.sliderVal}>
              {lambda} <small>zahtjeva/s</small>
            </output>
          </label>

          <div className={m.algo} role="radiogroup" aria-label="Algoritam raspoređivanja">
            <span className={m.ctlLabel}>Algoritam</span>
            <div className={m.algoBtns}>
              {(
                [
                  ['rr', 'Kružno'],
                  ['lc', 'Najmanje aktivnih veza'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={algo === key}
                  className={m.algoBtn}
                  onClick={() => {
                    setAlgo(key)
                    engine.setAlgo(key)
                  }}
                >
                  {algo === key ? (
                    <RoughAround key={key} seed={key === 'rr' ? 3501 : 3502} padX={14} padY={6}>
                      {label}
                    </RoughAround>
                  ) : (
                    label
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className={m.breakers}>
            <button
              type="button"
              className={`${m.btn} ${m.btnCrash}`}
              disabled={!v.up}
              onClick={() => {
                engine.crash(2)
                update()
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <Rough
                  shape={{
                    k: 'lin',
                    pts: [
                      [12, 1],
                      [5, 11],
                      [11, 11],
                      [7, 19],
                    ],
                  }}
                  seed={3601}
                  stroke="currentColor"
                  strokeWidth={2}
                  roughness={0.6}
                />
              </svg>
              Sruši poslužitelj
            </button>
            <button
              type="button"
              className={`${m.btn} ${m.btnFix}`}
              disabled={v.up}
              onClick={() => {
                engine.repair(2)
                update()
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <Rough shape={{ k: 'rect', x: 2, y: 7, w: 16, h: 7 }} seed={3602} stroke="currentColor" strokeWidth={1.6} roughness={0.8} />
                <Rough shape={{ k: 'line', x1: 8, y1: 9, x2: 8, y2: 12 }} seed={3603} stroke="currentColor" strokeWidth={1.4} roughness={0.4} />
                <Rough shape={{ k: 'line', x1: 12, y1: 9, x2: 12, y2: 12 }} seed={3604} stroke="currentColor" strokeWidth={1.4} roughness={0.4} />
              </svg>
              Popravi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LbSimSection() {
  return (
    <section className={`${s.section} ${s.secSim}`} aria-labelledby="sim-title">
      <SecHead n="2" kicker="isprobajte · pokvarite" title="Redar na ulazu" id="sim-title" prop={<PropBolt />} />
      <p className={s.lede}>
        Svaki pladanj je jedan zahtjev, a red studenata raste s prometom. Pojačajte promet, promijenite pravilo po kojem redar dijeli i onda <Mark c="pink">srušite Velikog</Mark>.
        Pratite gdje pladnjevi završavaju i koliko dugo redar šalje studente na zatvoren pult.
      </p>
      <LbSim />
      <ul className={m.legend} aria-label="Legenda">
        <li>
          <svg viewBox="-10 -7 20 14" width="30" height="21" aria-hidden="true">
            <use href={`#${ID}-tray`} x={-10} y={-7} width={20} height={14} />
          </svg>
          zahtjev (pladanj)
        </li>
        <li>
          <span className={m.legendCore} aria-hidden="true" /> mozak = jezgra (CPU), šrafura = zauzeta
        </li>
        <li>
          <span className={m.legendPlate} aria-hidden="true" /> tanjur = mjesto u RAM-u
        </li>
        <li>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <Cross x={10} y={10} size={7} seed={3801} />
          </svg>
          odbijen zahtjev (502 / 503)
        </li>
        <li>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <Check x={10} y={11} size={7} seed={3802} />
          </svg>
          obrađen zahtjev (kvačica na margini)
        </li>
        <li className={m.legendWide}>p95: 95 % zahtjeva završi brže od ovoga (čekanje u redu + obrada)</li>
      </ul>
    </section>
  )
}
