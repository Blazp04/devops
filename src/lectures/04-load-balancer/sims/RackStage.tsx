import { memo, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Brain, Check, Cross, Davor, Plate, Redar, Rough, ServerFace, SpeechBubble, Student, StudentQueue, SvgStamp, TrayDefs, fmt } from '../../../kit'
import { TIMING, fmtDuration, nowMs, serversView, type Flight, type ServerView, type TrafficState } from '../../../engines/traffic'
import { wrapWords, zahtjeva } from '../lb'
import { QUEUE_SLOTS, along, alongBoth, brainBox, lineCount, platePos, queueSlot, stageLayout, type CardGeo, type CardPlace, type P, type Route, type StageLayout } from './stage'
import css from '../styles.module.css'

/* =====================================================================
   „Redar na ulazu”: the E1 engine state drawn in the notebook's grammar.
   Students in line = traffic · redar = load balancer · tray = request ·
   server card: face (load), brains (cores), plates (radnici = RAM),
   queue slots above. Successes are a quiet ✓ in the margin, failures a
   falling tray with a red ✗ at the door.
   ===================================================================== */

export interface StageNote {
  key: string
  text: string
  tone: 'red' | 'pen' | 'ink' | 'green'
}

export interface DavorSay {
  key: string
  lines: string[]
  buzz: boolean
  worried: boolean
}

type Mood = 'calm' | 'busy' | 'panic' | 'dead'

const NOTE_COLOR: Record<StageNote['tone'], string> = { red: 'var(--red)', pen: 'var(--pen)', ink: 'var(--ink-2)', green: 'var(--green)' }
const FAIL_MS = 900

function moodOf(v: ServerView): Mood {
  if (v.proc !== 'up') return v.proc === 'starting' || v.proc === 'booting' ? 'busy' : 'dead'
  if ((v.queueMax > 0 && v.queue >= v.queueMax - 1) || v.errors10s.full > 0) return 'panic'
  if (v.cpuSmooth > 0.7 || v.queue > 0) return 'busy'
  return 'calm'
}

function isDown(v: ServerView): boolean {
  return v.proc === 'crashed' || v.proc === 'off' || v.proc === 'exited'
}

/** Where a tray stands at the back of a server's queue (stage coordinates). */
function doorOf(L: StageLayout, c: CardPlace): P {
  const r = L.outRoutes[c.id]
  return r ? r.pts[r.pts.length - 1] : { x: c.x, y: c.y }
}

function cardRight(L: StageLayout, c: CardPlace): number {
  return c.x + L.geo.w * c.scale
}

/* ---------- static pieces (memoised) ---------- */

const Roads = memo(function Roads({ inRoute, out, states }: { inRoute: Route; out: [string, Route][]; states: string }) {
  const st = states.split(',')
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'lin', pts: inRoute.pts.map((q) => [q.x, q.y] as [number, number]) }} seed={4101} stroke="var(--ink-3)" strokeWidth={1.5} roughness={0.8} />
      {out.map(([id, r], i) => {
        const bad = st[i] === 'unhealthy'
        const wait = st[i] === 'initial'
        const pts = r.pts.map((q) => [q.x, q.y] as [number, number])
        const mid = along(r, 0.55)
        return (
          <g key={id}>
            <Rough shape={{ k: 'lin', pts }} seed={4110 + i} stroke={bad ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={bad ? 1.8 : 1.5} roughness={0.8} dash={bad || wait ? '7 6' : undefined} />
            {bad && <Cross x={mid.x} y={mid.y} size={11} seed={4130 + i} strokeWidth={2.6} />}
          </g>
        )
      })}
    </g>
  )
})

const MenzaSign = memo(function MenzaSign({ sign }: { sign: NonNullable<StageLayout['sign']> }) {
  const { x, y, w, posts, top, floor, size } = sign
  return (
    <g aria-hidden="true">
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
        seed={4121}
        strokeWidth={1.6}
        stroke="var(--ink-3)"
      />
      <Rough shape={{ k: 'line', x1: posts[0] - 24, y1: floor, x2: posts[1] + 24, y2: floor }} seed={4122} strokeWidth={1.3} stroke="var(--ink-3)" roughness={1.3} />
      <Rough shape={{ k: 'rect', x, y, w, h: 38 }} seed={4123} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" className="k-svg-display" style={{ fontSize: size, letterSpacing: '0.12em' }}>
        ULAZ · MENZA
      </text>
    </g>
  )
})

const Students = memo(function Students({ front, y, scale, count, gap, tap }: { front: number; y: number; scale: number; count: number; gap: number; tap: boolean }) {
  return (
    <g aria-hidden="true">
      <StudentQueue x={front} y={y} count={count} scale={scale} gap={gap} tap={tap} />
    </g>
  )
})

interface CardStaticProps {
  geo: CardGeo
  h: number
  name: string
  spec: string
  vcpu: number
  plates: number
  per: number
  queueShown: number
  queueLabel: string
  down: boolean
  fontName: number
  fontSpec: number
  fontHand: number
  seed: number
}

/** The card's paper, lettering, plate rims and queue slots. Brains are drawn by the dynamic layer (they fill). */
const CardStatic = memo(function CardStatic({ geo, h, name, spec, plates, per, queueShown, queueLabel, down, fontName, fontSpec, fontHand, seed }: CardStaticProps) {
  const wide = geo.kind === 'wide'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: geo.w, h }} seed={seed} strokeWidth={2} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" roughness={1.15} />
      {wide ? (
        <>
          <text x={14} y={29} className="k-svg-display" style={{ fontSize: fontName }}>
            {name}
          </text>
          <text x={14} y={50} className="k-svg-mono" style={{ fontSize: fontSpec, fill: 'var(--ink-2)' }}>
            {spec}
          </text>
        </>
      ) : (
        <>
          <text x={geo.w / 2} y={19} textAnchor="middle" className="k-svg-display" style={{ fontSize: fontName }}>
            {name}
          </text>
          <text x={geo.w / 2} y={34} textAnchor="middle" className="k-svg-mono" style={{ fontSize: fontSpec, fill: 'var(--ink-2)' }}>
            {spec}
          </text>
        </>
      )}
      {/* a crashed server: the drawing fades, the lettering stays readable (--ink-3 instead of opacity) */}
      {wide && (
        <>
          <text x={14} y={geo.brainY + 16} className="k-svg-hand" style={{ fontSize: fontHand - 2, fill: down ? 'var(--ink-3)' : 'var(--ink-2)' }}>
            CPU
          </text>
          <text x={14} y={geo.plateY0 + 6} className="k-svg-hand" style={{ fontSize: fontHand - 2, fill: down ? 'var(--ink-3)' : 'var(--ink-2)' }}>
            RAM
          </text>
        </>
      )}
      <g opacity={down ? 0.25 : 1}>
        {Array.from({ length: plates }, (_, k) => {
          const p = platePos(geo, k)
          return <Plate key={k} cx={p.x} cy={p.y} r={geo.plateR} />
        })}
        {Array.from({ length: queueShown }, (_, q) => {
          const r = queueSlot(geo, q)
          return <rect key={q} x={r.x} y={r.y} width={r.w} height={r.h} rx={2} className={css.qslot} />
        })}
      </g>
      {per > 1 && (
        <text x={geo.w - (wide ? 10 : 4)} y={geo.plateY0 + (wide ? 7 : 5)} textAnchor="end" className={wide ? 'k-svg-hand' : 'k-svg-mono'} style={{ fontSize: wide ? fontHand - 2 : fontSpec, fill: down ? 'var(--ink-3)' : 'var(--ink-2)' }}>
          ×{per}
        </text>
      )}
      {wide && queueLabel && (
        <text x={queueShown ? queueSlot(geo, queueShown - 1).x + 26 : 4} y={-14} className="k-svg-hand" style={{ fontSize: fontHand - 2, fill: 'var(--ink-3)' }}>
          {queueLabel}
        </text>
      )}
    </g>
  )
})

/* ---------- the redar's clipboard: health checks (a teaser for lecture 05) ---------- */

type ClipStatus = 'ok' | 'failing' | 'out' | 'wait'

function clipStatus(v: ServerView): ClipStatus {
  if (v.routing === 'unhealthy' || v.routing === 'ejected') return 'out'
  if (v.routing === 'initial') return 'wait'
  return v.proc === 'up' ? 'ok' : 'failing'
}

const CLIP_TEXT: Record<ClipStatus, string> = { ok: 'ispravan', failing: 'ne odgovara', out: 'izbačen', wait: 'čeka provjeru' }
const CLIP_COLOR: Record<ClipStatus, string> = { ok: 'var(--green)', failing: 'var(--red)', out: 'var(--red)', wait: 'var(--orange)' }

function HealthClip({ s, views, clip }: { s: TrafficState; views: ServerView[]; clip: NonNullable<StageLayout['clip']> }) {
  const { x, y, w, h, row } = clip
  const now = s.t
  // „kuc-kuc!” right after any probe was sent (probes are staggered, so this flickers on every ~0,7 s)
  const knock = s.servers.some((v) => {
    const last = v.probes[v.probes.length - 1]
    return !!last && now - last.t < 260
  })
  const hc = s.cfg.healthCheck
  const every = hc.intervalMs === TIMING.healthInterval.real ? fmtDuration(hc.intervalMs) : `${fmtDuration(hc.intervalMs)} (sim) · stvarno: ${fmtDuration(TIMING.healthInterval.real ?? 30_000)}`
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={4601} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w / 2 - 22, y: y - 7, w: 44, h: 12 }} seed={4602} strokeWidth={1.3} fillColor="var(--ink-3)" fillStyle="solid" />
      <text x={x + 12} y={y + 28} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--pen)' }}>
        provjera ispravnosti
      </text>
      <text x={x + w - 10} y={y + 28} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--pen)', opacity: knock ? 1 : 0 }}>
        kuc-kuc!
      </text>
      {views.map((v, i) => {
        const ry = y + 54 + i * row
        const st = clipStatus(v)
        return (
          <g key={v.id}>
            {st === 'ok' ? (
              <Check x={x + 20} y={ry - 6} size={6.5} seed={4610 + i} strokeWidth={2} />
            ) : st === 'wait' ? (
              <Rough shape={{ k: 'rect', x: x + 14, y: ry - 12, w: 12, h: 12 }} seed={4610 + i} strokeWidth={1.3} stroke="var(--orange)" />
            ) : (
              <Cross x={x + 20} y={ry - 6} size={6.5} seed={4610 + i} strokeWidth={2.2} />
            )}
            <text x={x + 36} y={ry} className="k-svg-display" style={{ fontSize: 17 }}>
              {v.name.length > 9 ? `${v.name.slice(0, 8)}…` : v.name}
            </text>
            {st === 'out' && <Rough shape={{ k: 'line', x1: x + 32, y1: ry - 6, x2: x + 112, y2: ry - 5 }} seed={4620 + i} stroke="var(--red)" strokeWidth={2} />}
            <text x={x + w - 12} y={ry} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: CLIP_COLOR[st] }}>
              {CLIP_TEXT[st]}
            </text>
          </g>
        )
      })}
      <text x={x + 12} y={y + h - 12} className="k-svg-hand" style={{ fontSize: 17, fill: 'var(--ink-2)' }}>
        svake {every}
      </text>
    </g>
  )
}

/* ---------- one server card (dynamic layer) ---------- */

function ServerCardSketch({ L, c, v, idx, onPick }: { L: StageLayout; c: CardPlace; v: ServerView; idx: number; onPick?: (id: string) => void }) {
  const geo = L.geo
  const wide = geo.kind === 'wide'
  const down = isDown(v)
  const booting = v.proc === 'starting' || v.proc === 'booting'
  const mood = moodOf(v)
  const busyCores = Math.min(v.vcpu, v.cpuSmooth * v.vcpu)
  const filled = Math.ceil(v.busy / c.plan.per)
  const queueShown = Math.min(QUEUE_SLOTS, v.queueMax)
  const queueLabel = v.queueMax === 0 ? 'bez reda' : v.queueMax > QUEUE_SLOTS ? `red ${v.queue}/${v.queueMax}` : 'red'
  const spec = wide ? `${fmt.num(v.vcpu)} vCPU · ${fmt.num(v.ramGB)} GB` : `${fmt.num(v.vcpu)} vCPU·${fmt.num(v.ramGB)} GB`
  const cpuPct = Math.round(v.cpuSmooth * 100)
  const hot = cpuPct >= 95
  const pickable = !!onPick && !down
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (!onPick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(v.id)
    }
  }
  const body = (
    <g transform={`translate(${c.x} ${c.y}) scale(${c.scale})`}>
      <CardStatic
        geo={geo}
        h={c.h / c.scale}
        name={v.name}
        spec={spec}
        vcpu={v.vcpu}
        plates={c.plan.n}
        per={c.plan.per}
        queueShown={queueShown}
        queueLabel={queueLabel}
        down={down}
        fontName={L.font.name}
        fontSpec={L.font.spec}
        fontHand={L.font.hand}
        seed={4200 + idx * 17}
      />
      {!down && (
        <g>
          {/* a booting server: the drawing is pale, the lettering keeps full contrast */}
          <g opacity={booting ? 0.45 : 1}>
            {Array.from({ length: Math.max(1, Math.round(v.vcpu)) }, (_, k) => {
              const b = brainBox(geo, k, v.vcpu)
              return <Brain key={k} x={b.x} y={b.y} w={b.w} h={b.h} busy={Math.max(0, Math.min(1, busyCores - k))} seed={4300 + k} />
            })}
            {Array.from({ length: Math.min(filled, c.plan.n) }, (_, k) => {
              const p = platePos(geo, k)
              return <circle key={k} cx={p.x} cy={p.y} r={geo.plateR * 0.55} className="k-food" />
            })}
            {Array.from({ length: Math.min(v.queue, queueShown) }, (_, q) => {
              const r = queueSlot(geo, q)
              const tw = r.w * 1.05
              return <use key={q} href={`#${L.kind}-tray`} x={r.x + r.w / 2 - tw / 2} y={r.y + r.h / 2 - tw * 0.38} width={tw} height={tw * 0.7} />
            })}
          </g>
          {wide ? (
            <>
              <text x={14} y={c.h / c.scale - 13} className="k-svg-mono" style={{ fontSize: L.font.mono, fill: hot ? 'var(--red)' : 'var(--ink-2)', fontWeight: hot ? 600 : 400 }}>
                CPU {cpuPct} %
              </text>
              <text x={geo.w - 12} y={c.h / c.scale - 13} textAnchor="end" className="k-svg-mono" style={{ fontSize: L.font.mono, fill: 'var(--ink-2)' }}>
                RAM {fmt.num(v.ramUsedMB / 1024, 1)}/{fmt.num(v.ramGB)} GB
              </text>
              <text x={geo.w - 10} y={geo.brainY + 15} textAnchor="end" className="k-svg-hand" style={{ fontSize: L.font.hand, fill: 'var(--pen)' }}>
                {v.active === 1 ? '1 veza' : `${v.active} ${v.active % 10 >= 2 && v.active % 10 <= 4 && (v.active % 100 < 12 || v.active % 100 > 14) ? 'veze' : 'veza'}`}
              </text>
              {v.slowFactor > 1 && (
                <text x={geo.w - 64} y={30} textAnchor="end" className="k-svg-hand" style={{ fontSize: L.font.hand, fill: 'var(--orange)' }}>
                  {fmt.num(v.slowFactor)}× sporiji
                </text>
              )}
            </>
          ) : (
            <>
              <text x={geo.w / 2} y={c.h / c.scale - 9} textAnchor="middle" className="k-svg-mono" style={{ fontSize: L.font.mono, fill: hot ? 'var(--red)' : 'var(--ink-2)', fontWeight: hot ? 600 : 400 }}>
                CPU {cpuPct} %
              </text>
              {v.slowFactor > 1 && (
                <text x={4} y={60} className="k-svg-hand" style={{ fontSize: L.font.hand, fill: 'var(--orange)' }}>
                  spor
                </text>
              )}
            </>
          )}
        </g>
      )}
      {down && (
        <g>
          <Rough shape={{ k: 'rect', x: 4, y: 4, w: geo.w - 8, h: c.h / c.scale - 8 }} seed={4400 + idx} stroke="var(--red)" strokeWidth={1.4} fillColor="var(--red)" fillStyle="hachure" hachureGap={15} fillWeight={0.7} />
          <SvgStamp x={geo.w / 2} y={c.h / c.scale * 0.66} text="SRUŠEN" size={wide ? 21 : 15} />
        </g>
      )}
      {booting && <SvgStamp x={geo.w / 2} y={c.h / c.scale * 0.66} text="POKREĆE SE" tone="pen" size={wide ? 18 : 12.5} rotate={-5} />}
      <g transform={wide ? `translate(${geo.w - 36} 34)` : `translate(${geo.w / 2} 54)`}>
        <ServerFace mood={mood} r={wide ? 20 : 14} />
      </g>
    </g>
  )
  if (!pickable) return body
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Pošalji zahtjev na ${v.name} (${v.vcpu} vCPU, ${v.ramGB} GB; u obradi ${v.busy}, u redu ${v.queue})`}
      className={css.pick}
      onClick={() => onPick?.(v.id)}
      onKeyDown={onKey}
    >
      <rect x={c.x - 6} y={c.y - L.geo.queueH * c.scale} width={L.geo.w * c.scale + 12} height={c.h + L.geo.queueH * c.scale + 6} rx={8} className={css.pickHalo} />
      {body}
    </g>
  )
}

/* ---------- trays in flight, ticks and crosses ---------- */

function flightPoint(L: StageLayout, f: Flight, p: number): P | null {
  if (f.dir !== 'in') return null
  const out = L.outRoutes[f.to]
  if (f.from === 'client' && f.via === 'lb' && out) return alongBoth(L.inRoute, out, p)
  if (f.from === 'client' && f.to === 'lb') return along(L.inRoute, p)
  if (f.from === 'lb' && out) return along(out, p)
  return null
}

function Traffic({ s, L }: { s: TrafficState; L: StageLayout }) {
  const now = nowMs(s)
  const tw = L.tray
  const trays: { id: number; p: P }[] = []
  const falls: { id: number; at: P; age: number }[] = []
  const ticks: { id: number; at: P; p: number }[] = []
  const perServer = new Map<string, number>()
  const cardOf = new Map(L.cards.map((c) => [c.id, c]))
  for (let i = s.flights.length - 1; i >= 0; i--) {
    const f = s.flights[i]
    const p = f.durationMs > 0 ? (now - f.t0) / f.durationMs : 1
    if (p < 0) continue
    const failed = f.outcome !== 'ok' && f.outcome !== 'waiting'
    if (f.dir === 'in') {
      if (p <= 1) {
        const at = flightPoint(L, f, p)
        if (at) trays.push({ id: f.id, p: at })
      } else if (failed && (p - 1) * f.durationMs < FAIL_MS) {
        const end = flightPoint(L, f, 1)
        if (end) falls.push({ id: f.id, at: end, age: (p - 1) * f.durationMs })
      }
      continue
    }
    // responses: ✓ in the margin (newest two per server), a timeout = ✗ at the door
    const c = cardOf.get(String(f.from))
    if (f.outcome === 'ok' && c && p <= 1) {
      const n = perServer.get(c.id) ?? 0
      if (n >= 2) continue
      perServer.set(c.id, n + 1)
      const at = L.kind === 'narrow' ? { x: c.x + L.geo.w - 9, y: c.y + 12 } : { x: cardRight(L, c) + 13, y: c.y + 34 * c.scale }
      ticks.push({ id: f.id, at, p })
    } else if (failed && p <= FAIL_MS / f.durationMs) {
      const at = c ? doorOf(L, c) : f.from === 'lb' ? L.lbPoint : null
      if (at) falls.push({ id: f.id, at, age: p * f.durationMs })
    }
  }
  return (
    <g aria-hidden="true">
      {trays.map((t) => (
        <use key={t.id} href={`#${L.kind}-tray`} x={t.p.x - tw / 2} y={t.p.y - tw * 0.35} width={tw} height={tw * 0.7} />
      ))}
      {ticks.map((t) => (
        <g key={t.id} transform={`translate(${t.at.x} ${t.at.y - t.p * 14})`} opacity={1 - t.p * t.p}>
          <Check x={0} y={0} size={L.kind === 'narrow' ? 5 : 7} seed={t.id % 4} strokeWidth={2.2} />
        </g>
      ))}
      {falls.map((m) => {
        const a = m.age / FAIL_MS
        const jitter = ((m.id * 37) % 5) - 2
        const base = { x: m.at.x - 8 + jitter * 3, y: m.at.y + 4 + jitter }
        const fall = m.age * m.age * 0.00008
        return (
          <g key={m.id}>
            <g transform={`translate(${base.x} ${base.y + fall}) rotate(${m.age * 0.2})`} opacity={1 - a}>
              <use href={`#${L.kind}-tray`} x={-tw * 0.4} y={-tw * 0.28} width={tw * 0.8} height={tw * 0.56} />
            </g>
            <g opacity={a < 0.75 ? 1 : (1 - a) * 4}>
              <Cross x={base.x} y={base.y} size={L.kind === 'narrow' ? 7 : 10} seed={(m.id % 5) * 7 + 4500} strokeWidth={2.6} />
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** Requests waiting at the redar (manual mode): a pile of trays; on top a red clock once the oldest has waited long. */
function Pending({ s, L }: { s: TrafficState; L: StageLayout }) {
  const n = s.pending.length
  if (!n) return null
  const tw = L.tray * 0.9
  const shown = Math.min(n, L.pendingMax)
  const oldest = (s.t - s.pending[0].t0) / s.cfg.clientTimeoutMs
  const topY = L.pending.y - (shown - 1) * tw * 0.4 - tw * 0.35
  const clock = { x: L.pending.x, y: topY - 13 }
  return (
    <g aria-hidden="true">
      {Array.from({ length: shown }, (_, k) => (
        <use key={k} href={`#${L.kind}-tray`} x={L.pending.x - tw / 2 + (k % 2 ? 2 : -2)} y={L.pending.y - k * tw * 0.4 - tw * 0.35} width={tw} height={tw * 0.7} />
      ))}
      {n > shown && (
        <text
          x={L.pendingLabel === 'left' ? L.pending.x - 13 : L.pending.x}
          y={L.pendingLabel === 'left' ? clock.y + 5 : clock.y - 15}
          textAnchor={L.pendingLabel === 'left' ? 'end' : 'middle'}
          className="k-svg-mono" style={{ fontSize: L.font.mono, fill: 'var(--tray-ink)', fontWeight: 700 }}>
          +{n - shown}
        </text>
      )}
      {oldest > 0.4 && (
        <g transform={`translate(${clock.x} ${clock.y})`}>
          <circle r={9} className={css.clockFace} />
          <path d={`M0 0 L0 -6 M0 0 L${Math.sin(oldest * Math.PI * 2) * 6} ${-Math.cos(oldest * Math.PI * 2) * 6}`} className={css.clockHands} />
        </g>
      )}
    </g>
  )
}

/** A long-lived connection drawn as a pen „pipe”: client → redar, and on to the server it is pinned to (L4). */
function Pinned({ L, server }: { L: StageLayout; server: string | null }) {
  const out = server ? L.outRoutes[server] : undefined
  const pts = [...L.inRoute.pts, ...(out ? out.pts.slice(1) : [])].map((q) => [q.x, q.y] as [number, number])
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'lin', pts }} seed={4701} stroke="var(--pen)" strokeWidth={5} roughness={0.5} />
      <Rough shape={{ k: 'lin', pts }} seed={4702} stroke="var(--paper)" strokeWidth={1.6} roughness={0.5} />
    </g>
  )
}

/* ---------- the whole stage ---------- */

export interface RackStageProps {
  s: TrafficState
  width: number | null
  /** offered rate, for the length of the student line */
  lambda: number
  /** manual mode: clicking a card routes the oldest waiting request there */
  onPick?: (id: string) => void
  note?: StageNote | null
  davor?: DavorSay | null
  label: string
  /** draw the redar's health-check clipboard (wide layout only) */
  health?: boolean
  /** one client instead of the student line (keep-alive demo), with its own label under it */
  single?: string
  /** a client's long-lived connection: undefined = none drawn; null = it ends at the redar (L7); a server id = pinned there (L4) */
  pinned?: string | null
}

export function RackStage({ s, width, lambda, onPick, note, davor, label, health, single, pinned }: RackStageProps) {
  const views = serversView(s)
  const L = stageLayout(
    width,
    views.map((v) => ({ id: v.id, vcpu: v.vcpu, slots: v.slots })),
  )
  const byId = new Map(views.map((v) => [v.id, v]))
  // the redar's arm points where the last tray went
  let lastTo: string | null = null
  for (let i = s.flights.length - 1; i >= 0; i--) {
    const f = s.flights[i]
    if (f.dir === 'in' && L.outRoutes[f.to]) {
      lastTo = f.to
      break
    }
  }
  const shoulder = { x: L.lb.x + 13 * L.lb.s, y: L.lb.y - 28 * L.lb.s }
  const lastCard = lastTo ? L.cards.find((c) => c.id === lastTo) : null
  const target = lastCard ? doorOf(L, lastCard) : { x: shoulder.x + 100, y: shoulder.y }
  const angle = Math.atan2(target.y - shoulder.y, target.x - shoulder.x)
  const fullest = Math.max(0, ...views.map((v) => (v.proc === 'up' && v.queueMax > 0 ? v.queue / v.queueMax : 0)))
  const sweat = fullest > 0.8 ? 3 : fullest > 0.5 ? 2 : fullest > 0.15 ? 1 : 0
  const count = lineCount(lambda, L.students.max)
  const outPairs: [string, Route][] = L.cards.map((c) => [c.id, L.outRoutes[c.id]])
  const states = L.cards.map((c) => byId.get(c.id)?.routing ?? 'healthy').join(',')
  const noteLines = note ? wrapWords(note.text, L.note.wrap) : []
  const head = L.davor ? { x: L.davor.x + 40 * L.davor.s, y: L.davor.y + 30 * L.davor.s } : null

  return (
    <svg className={css.stageSvg} viewBox={`0 0 ${L.vb.w} ${L.vb.h}`} style={L.maxW ? { maxWidth: L.maxW } : undefined} role={onPick ? 'group' : 'img'} aria-label={label}>
      <TrayDefs id={L.kind} />
      {L.sign && <MenzaSign sign={L.sign} />}
      <Roads inRoute={L.inRoute} out={outPairs} states={states} />
      {pinned !== undefined && <Pinned L={L} server={pinned} />}
      {single !== undefined ? (
        <g aria-hidden="true">
          <Student variant={2} x={L.students.front - 40 * L.students.scale} y={L.students.y - 146 * L.students.scale} scale={L.students.scale} />
        </g>
      ) : (
        <Students front={L.students.front} y={L.students.y} scale={L.students.scale} count={count} gap={L.students.gap} tap={lambda >= 24} />
      )}
      {L.lineLabel && (
        <text x={L.lineLabel.x} y={L.lineLabel.y} className="k-svg-hand" style={{ fontSize: L.lineLabel.size, fill: 'var(--ink-2)' }}>
          {single ?? `red pred menzom · ${zahtjeva(Math.round(lambda))}/s`}
        </text>
      )}
      {health && L.clip && <HealthClip s={s} views={views} clip={L.clip} />}
      <Redar x={L.lb.x} y={L.lb.y} scale={L.lb.s} angle={angle} sweat={sweat} mood={sweat >= 3 ? 'worry' : 'smile'} />
      {L.lbLabel && (
        <text x={L.lbLabel.x} y={L.lbLabel.y} textAnchor={L.lbLabel.anchor ?? 'middle'} className="k-svg-hand" style={{ fontSize: L.lbLabel.size, fill: 'var(--ink-2)' }}>
          redar = load balancer
        </text>
      )}
      {L.cards.map((c, i) => {
        const v = byId.get(c.id)
        return v ? <ServerCardSketch key={c.id} L={L} c={c} v={v} idx={i} onPick={onPick} /> : null
      })}
      <Pending s={s} L={L} />
      <Traffic s={s} L={L} />
      {L.davor && davor && head && (
        <g aria-hidden="true">
          <Davor x={L.davor.x} y={L.davor.y} scale={L.davor.s} mood={davor.worried ? 'worry' : 'smile'} buzz={davor.buzz} />
          <AnimatePresence mode="wait">
            {davor.lines.length > 0 && (
              <motion.g key={davor.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <SpeechBubble {...L.davor.bubble} tx={head.x} ty={head.y} lines={davor.lines} size={L.bubbleSize} seed={4901} tail={16} tone={davor.worried ? 'red' : 'ink'} />
              </motion.g>
            )}
          </AnimatePresence>
        </g>
      )}
      <AnimatePresence mode="wait">
        {note && (
          <motion.g key={note.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-hidden="true">
            {noteLines.map((l, i) => (
              <text key={i} x={L.note.x} y={L.note.y + i * (L.note.size + 2)} className="k-svg-hand" style={{ fontSize: L.note.size, fill: NOTE_COLOR[note.tone] }}>
                {l}
              </text>
            ))}
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  )
}
