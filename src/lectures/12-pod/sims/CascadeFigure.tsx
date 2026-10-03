/**
 * Scene 4 „Kaskada”: one 60 s database outage replayed with three probe designs (E3 engine, seed 42). A snapshot at
 * the cursor (three Pods, endpoints, what the client gets) above swimlanes for the whole run.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Cross, Cylinder, Legend, PodShape, Rough, Segmented, ServiceTag, Slider, Stat, StatRow, plural, useWidth } from '../../../kit'
import { CASCADE_DESIGNS, CASCADE_LENGTH_S, DB_DOWN_AT, DB_DOWN_S, runCascade } from '../lib/cascade'
import type { CascadeDesign, CascadeRun, CascadeSample, PodLaneState } from '../lib/cascade'

interface Geo {
  W: number
  H: number
  db: { x: number; y: number }
  dbText: [number, number]
  tag: { x: number; y: number; w: number; h: number }
  epText: [number, number]
  pods: [number, number][]
  client: [number, number]
  axis: { x0: number; x1: number }
  laneLabelX: number
  lanes: { db: number; pods: number[]; ep: number; client: number; axis: number }
  hand: number
  mono: number
  short: boolean
}

const WIDE: Geo = {
  W: 720,
  H: 400,
  db: { x: 22, y: 28 },
  dbText: [44, 112],
  tag: { x: 110, y: 52, w: 122, h: 42 },
  epText: [176, 118],
  pods: [
    [312, 74],
    [402, 74],
    [492, 74],
  ],
  client: [626, 70],
  axis: { x0: 118, x1: 704 },
  laneLabelX: 12,
  lanes: { db: 182, pods: [214, 242, 270], ep: 306, client: 346, axis: 376 },
  hand: 19,
  mono: 14.5,
  short: false,
}

const NARROW: Geo = {
  W: 360,
  H: 500,
  db: { x: 16, y: 24 },
  dbText: [38, 106],
  tag: { x: 80, y: 36, w: 124, h: 40 },
  epText: [146, 100],
  pods: [
    [80, 168],
    [180, 168],
    [280, 168],
  ],
  client: [288, 44],
  axis: { x0: 86, x1: 350 },
  laneLabelX: 8,
  lanes: { db: 272, pods: [302, 328, 354], ep: 388, client: 428, axis: 462 },
  hand: 20.5,
  mono: 15,
  short: true,
}

const DESIGN_TEXT: Record<CascadeDesign, string> = {
  liveDb: 'Provjera živosti pita bazu. Nakon 3 × 10 s sva tri Poda padnu istodobno i kubelet ih restarta. Restart ne popravlja bazu, pa padaju opet, a pauza raste. I kad se baza vrati, klijenti još dvadesetak sekundi dobivaju odbijene veze.',
  readyDb: 'Provjera spremnosti pita bazu. Nitko se ne restarta, ali sva tri Poda istodobno postanu NotReady: Service ostane bez ijednog endpointa i klijenti dobivaju odbijene veze umjesto jasnog odgovora.',
  correct: 'Živost pita samo proces, spremnost samo ovaj Pod. Podovi ostaju Ready i na narudžbe brzo odgovaraju 503 „baza trenutačno nije dostupna”. Čim se baza vrati, sve radi – bez restarta i bez čekanja.',
}

function segments(samples: CascadeSample[], pod: number): { from: number; to: number; state: PodLaneState }[] {
  const out: { from: number; to: number; state: PodLaneState }[] = []
  for (const s of samples) {
    const st = s.pods[pod].state
    const last = out[out.length - 1]
    if (last && last.state === st) last.to = s.t + 1
    else out.push({ from: s.t, to: s.t + 1, state: st })
  }
  return out
}

function shapeOf(st: PodLaneState): 'running' | 'notready' | 'crash' {
  return st === 'ready' ? 'running' : st === 'notready' ? 'notready' : 'crash'
}

function clientAnswer(s: CascadeSample): { text: string; color: string } {
  if (s.ok >= s.http503 && s.ok >= s.conn && s.ok > 0) return { text: '200 OK', color: 'var(--green)' }
  if (s.http503 >= s.conn && s.http503 > 0) return { text: '503 brzo', color: 'var(--orange)' }
  if (s.conn > 0) return { text: 'veza odbijena', color: 'var(--red)' }
  return { text: '—', color: 'var(--ink-3)' }
}

/** [from, to) seconds in which some clients got a refused connection – runs of ≥ 3 s */
function silentRuns(samples: CascadeSample[]): [number, number][] {
  const out: [number, number][] = []
  let start: number | null = null
  for (const s of samples) {
    if (s.conn > 0) start ??= s.t
    else if (start !== null) {
      if (s.t - start >= 3) out.push([start, s.t])
      start = null
    }
  }
  const last = samples[samples.length - 1]
  if (start !== null && last && last.t + 1 - start >= 3) out.push([start, last.t + 1])
  return out
}

function Lanes({ run, g, t }: { run: CascadeRun; g: Geo; t: number }) {
  const { x0, x1 } = g.axis
  const sx = (sec: number) => x0 + (sec / CASCADE_LENGTH_S) * (x1 - x0)
  const L = g.lanes
  const maxRate = 30
  const epPts = run.samples.flatMap((s) => {
    const y = L.ep + 10 - (s.endpoints / 3) * 22
    return [
      [sx(s.t), y],
      [sx(s.t + 1), y],
    ] as [number, number][]
  })
  const labels: [string, number][] = [
    ['baza', L.db],
    [g.short ? 'api-1' : 'klopa-api-1', L.pods[0]],
    [g.short ? 'api-2' : 'klopa-api-2', L.pods[1]],
    [g.short ? 'api-3' : 'klopa-api-3', L.pods[2]],
    ['endpointi', L.ep],
    ['klijenti', L.client],
  ]
  return (
    <g>
      {labels.map(([text, y]) => (
        <text key={text} x={g.laneLabelX} y={y + 5} className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
          {text}
        </text>
      ))}
      {/* database */}
      <line x1={sx(0)} y1={L.db} x2={sx(DB_DOWN_AT)} y2={L.db} stroke="var(--green)" strokeWidth={3} />
      <Rough shape={{ k: 'rect', x: sx(DB_DOWN_AT), y: L.db - 9, w: sx(DB_DOWN_AT + DB_DOWN_S) - sx(DB_DOWN_AT), h: 18 }} seed={12600} stroke="var(--red)" strokeWidth={1.5} fillColor="var(--red)" hachureGap={4} />
      <line x1={sx(DB_DOWN_AT + DB_DOWN_S)} y1={L.db} x2={sx(CASCADE_LENGTH_S + 1)} y2={L.db} stroke="var(--green)" strokeWidth={3} />
      <text x={(sx(DB_DOWN_AT) + sx(DB_DOWN_AT + DB_DOWN_S)) / 2} y={L.db - 14} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
        baza pala 60 s
      </text>
      {/* Pods */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {segments(run.samples, i).map((seg, k) => {
            const xa = sx(seg.from)
            const xb = sx(seg.to)
            const y = L.pods[i]
            if (seg.state === 'ready') return <line key={k} x1={xa} y1={y} x2={xb} y2={y} stroke="var(--green)" strokeWidth={4} strokeLinecap="butt" />
            if (seg.state === 'notready') return <rect key={k} x={xa} y={y - 7} width={Math.max(1, xb - xa)} height={14} fill="none" stroke="var(--ink-3)" strokeWidth={1.4} strokeDasharray="3 3" />
            return <rect key={k} x={xa} y={y - 8} width={Math.max(1, xb - xa)} height={16} fill="url(#l12-cascade-hatch)" stroke="var(--red)" strokeWidth={1.4} />
          })}
          {run.samples.map((s, k) =>
            k > 0 && s.pods[i].restarts > run.samples[k - 1].pods[i].restarts ? (
              <text key={`r${k}`} x={sx(s.t)} y={L.pods[i] - 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1.5, fill: 'var(--red)', fontWeight: 700 }}>
                ↻
              </text>
            ) : null,
          )}
        </g>
      ))}
      {/* ready endpoints */}
      <Rough shape={{ k: 'lin', pts: epPts }} seed={12610} stroke="var(--pen)" strokeWidth={1.8} roughness={0.4} />
      {/* what clients got, per second */}
      {run.samples.map((s) => {
        const x = sx(s.t)
        const w = Math.max(1, sx(s.t + 1) - x - 0.6)
        const h = (n: number) => (Math.min(n, maxRate) / maxRate) * 22
        const ok = h(s.ok)
        const e5 = h(s.http503)
        const ec = h(s.conn)
        return (
          <g key={s.t}>
            {ok > 0 && <rect x={x} y={L.client + 10 - ok} width={w} height={ok} fill="var(--green)" />}
            {e5 > 0 && <rect x={x} y={L.client + 10 - ok - e5} width={w} height={e5} fill="url(#l12-cascade-503)" />}
            {ec > 0 && <rect x={x} y={L.client + 10 - ok - e5 - ec} width={w} height={ec} fill="url(#l12-cascade-silent)" />}
          </g>
        )
      })}
      {/* ✗ over every stretch of seconds in which clients got no answer at all */}
      {silentRuns(run.samples).map(([a, b]) => (
        <g key={`x${a}`} transform={`translate(${(sx(a) + sx(b)) / 2} ${L.client - 22})`}>
          <Cross x={0} y={0} size={5} seed={12640 + (a % 5)} strokeWidth={2} />
        </g>
      ))}
      {/* time axis + cursor */}
      <Rough shape={{ k: 'line', x1: x0, y1: L.axis, x2: x1, y2: L.axis }} seed={12620} stroke="var(--ink-2)" strokeWidth={1.3} />
      {[0, 30, 60, 90, 120].map((v) => (
        <text key={v} x={sx(v)} y={L.axis + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1.5 }}>
          {v} s
        </text>
      ))}
      <line x1={sx(t + 0.5)} y1={L.db - 24} x2={sx(t + 0.5)} y2={L.axis} stroke="var(--pen)" strokeWidth={1.6} strokeDasharray="5 3" />
    </g>
  )
}

function Snapshot({ s, g }: { s: CascadeSample; g: Geo }) {
  const ans = clientAnswer(s)
  return (
    <g>
      <Cylinder x={g.db.x} y={g.db.y} w={44} h={52} seed={12630} />
      <text x={g.db.x + 22} y={g.db.y + 35} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        db
      </text>
      {!s.dbUp && <Cross x={g.db.x + 22} y={g.db.y + 30} size={13} seed={12631} strokeWidth={3} />}
      <text x={g.dbText[0]} y={g.dbText[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: s.dbUp ? 'var(--ink-2)' : 'var(--red)', fontWeight: 700 }}>
        {s.dbUp ? 'radi' : 'pala'}
      </text>
      <ServiceTag x={g.tag.x} y={g.tag.y} w={g.tag.w} h={g.tag.h} seed={12632}>
        <text x={g.tag.x + g.tag.w / 2 + 8} y={g.tag.y + g.tag.h / 2 + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700 }}>
          klopa-api
        </text>
      </ServiceTag>
      <text x={g.epText[0]} y={g.epText[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: s.endpoints === 0 ? 'var(--red)' : 'var(--ink)' }}>
        endpointi: {s.endpoints}/3
      </text>
      {g.pods.map(([x, y], i) => (
        <g key={i}>
          <PodShape x={x} y={y} size={g.short ? 48 : 44} status={shapeOf(s.pods[i].state)} tone="blue" label="api" />
          <text x={x} y={y + 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: s.pods[i].restarts > 0 ? 'var(--red)' : 'var(--ink-3)' }}>
            ↻ {s.pods[i].restarts}
          </text>
        </g>
      ))}
      <text x={g.client[0]} y={g.client[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        klijent dobiva
      </text>
      <text x={g.client[0]} y={g.client[1] + 28} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono + 3, fontWeight: 800, fill: ans.color }}>
        {ans.text}
      </text>
      <text x={g.client[0]} y={g.client[1] + 50} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1.5, fill: 'var(--ink-3)' }}>
        t = {s.t} s
      </text>
    </g>
  )
}

export function CascadeFigure() {
  const runs = useMemo(() => Object.fromEntries(CASCADE_DESIGNS.map((d) => [d.id, runCascade(d.id)])) as Record<CascadeDesign, CascadeRun>, [])
  const [design, setDesign] = useState<CascadeDesign>('liveDb')
  const [t, setT] = useState(DB_DOWN_AT + 34)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  })
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 680 ? NARROW : WIDE
  const run = runs[design]
  const sample = run.samples[Math.max(0, Math.min(run.samples.length - 1, t))]

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current)
    },
    [],
  )
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    setPlaying(false)
  }
  const play = () => {
    if (timer.current !== null) return stop()
    if (tRef.current >= CASCADE_LENGTH_S) setT(0)
    setPlaying(true)
    timer.current = window.setInterval(() => {
      const v = tRef.current
      if (v >= CASCADE_LENGTH_S) {
        stop()
        return
      }
      setT(v + 1)
    }, 80)
  }

  return (
    <div ref={ref} className="l12-cascade">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 10 }}>
        <Segmented
          label="Što provjere pitaju"
          value={design}
          options={CASCADE_DESIGNS.map((d, i) => ({ value: d.id, label: `${['①', '②', '③'][i]} ${d.label}` }))}
          onChange={setDesign}
        />
        <Button variant="secondary" onClick={play}>
          {playing ? 'Zaustavi' : 'Odvrti ispad'}
        </Button>
      </div>
      <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Ispad baze od 60 s, dizajn „${CASCADE_DESIGNS.find((d) => d.id === design)!.label}”: ${plural(run.restarts, ['restart', 'restarta', 'restarta'])}, ${run.zeroEndpointS} s bez endpointa, ${plural(run.conn, ['odbijena veza', 'odbijene veze', 'odbijenih veza'])}, ${plural(run.http503, ['brzi odgovor', 'brza odgovora', 'brzih odgovora'])} 503.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <pattern id="l12-cascade-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-41)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--red)" strokeWidth="1.6" />
            </pattern>
            {/* fast 503: orange hatching at +41° · no answer: red cross-hatching (they differ without colour too) */}
            <pattern id="l12-cascade-503" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(41)">
              <rect width="4" height="4" fill="var(--orange)" opacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--orange)" strokeWidth="2" />
            </pattern>
            <pattern id="l12-cascade-silent" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--red)" strokeWidth="1.4" />
              <line x1="0" y1="0" x2="4" y2="0" stroke="var(--red)" strokeWidth="1.4" />
            </pattern>
          </defs>
          <Snapshot s={sample} g={g} />
          <Lanes run={run} g={g} t={t} />
        </svg>
      </div>
      <Legend
        items={[
          { color: 'var(--green)', label: 'Ready, prima promet', shape: 'line' },
          { color: 'var(--ink-3)', label: 'NotReady, izvan prometa', shape: 'dashed' },
          { color: 'var(--red)', label: 'kontejner ne radi (restart, pauza)', shape: 'square' },
          { color: 'var(--green)', label: 'klijent dobiva 200 OK', shape: 'dot' },
          { color: 'var(--orange)', label: 'klijent dobiva brzi 503', shape: 'square' },
          { color: 'var(--red)', label: 'klijent ne dobiva odgovor (✗)', shape: 'cross' },
        ]}
      />
      <Slider label="Trenutak" value={t} min={0} max={CASCADE_LENGTH_S} format={(v) => `${v} s`} onChange={(v) => setT(v)} />
      <p style={{ marginTop: 10 }}>{DESIGN_TEXT[design]}</p>
      <StatRow>
        <Stat label="Restarti" value={run.restarts} tone={run.restarts > 0 ? 'bad' : 'ok'} />
        <Stat label="Bez ijednog endpointa" value={run.zeroEndpointS} unit="s" tone={run.zeroEndpointS > 0 ? 'bad' : 'ok'} />
        <Stat label="Odbijene veze" value={run.conn} tone={run.conn > 0 ? 'bad' : 'ok'} sub="klijent ne dobije nikakav odgovor" />
        <Stat label="Brzi 503" value={run.http503} tone="warn" sub="jasan odgovor „probajte kasnije”" />
        <Stat label="Oporavak nakon baze" value={run.recoveryS ?? '–'} unit="s" tone={(run.recoveryS ?? 0) > 0 ? 'bad' : 'ok'} />
      </StatRow>
    </div>
  )
}
