/**
 * Four ways a server stops serving, side by side on the same traffic (lib/faults.ts, E1 Promet): crashed process
 * (instant 502), machine off (504 after the connect timeout), frozen process (hollow 504 after 5 s) and a drain
 * (in-flight requests finish, nothing new arrives).
 */
import { Zap, RotateCcw } from 'lucide-react'
import { Button, Check, Cross, Rough, ServerFace, SimFrame, SvgStamp, TrayDefs, fmt, useSimulation, useWidth } from '../../../kit'
import { lastIncident, nowMs, flightProgress, type CompletedReq } from '../../../engines/traffic'
import { FAULTS, applyFaults, createFaults, stepFaults, type FaultsState, type Lane } from '../lib/faults'
import { DROP_MS, along, moodOf, stampOf, type P } from '../lib/rack'
import { DroppedTray, TimeoutClock } from './parts'

const LW = 190
const LH = 372
const TRAY = 'l05ff'
const HREF = `#${TRAY}-tray`
const ROAD: P[] = [
  [95, 56],
  [95, 106],
]

function secs(ms: number): string {
  const v = Math.round(ms / 100) / 10
  return `${fmt.num(v, Number.isInteger(v) ? 0 : 1)} s`
}

type Mark = 'ok' | 'bad' | 'warn' | 'drain'
const MARK_FILL: Record<Mark, string> = { ok: 'var(--ink)', bad: 'var(--red)', warn: 'var(--orange)', drain: 'var(--pen)' }

function lbStatus(l: Lane, faultAt: number | null): { mark: Mark; text: string } {
  const a = l.s.servers.find((v) => v.id === 'a')
  if (!a) return { mark: 'bad', text: 'nema ga' }
  if (l.id === 'drain' && a.draining) return l.safeAt !== null ? { mark: 'ok', text: 'smije se ugasiti' } : { mark: 'drain', text: 'ne šalje nove' }
  const inc = lastIncident(l.s)
  if (faultAt !== null && inc && inc.server === 'a' && inc.detectedAt !== null) return { mark: 'bad', text: `izbačen za ${secs(inc.detectedAt - inc.t0)}` }
  if (a.hcFails > 0) return { mark: 'warn', text: `provjere ${a.hcFails}/${l.s.cfg.healthCheck.unhealthyThreshold} ✗` }
  return { mark: 'ok', text: 'u prometu' }
}

function outcomes(l: Lane, faultAt: number | null): CompletedReq[] {
  const out: CompletedReq[] = []
  for (let i = l.s.recent.length - 1; i >= 0 && out.length < 4; i--) {
    const r = l.s.recent[i]
    if (r.server !== 'a') continue
    if (faultAt !== null && r.tEnd < faultAt) break
    out.push(r)
  }
  return out
}

function LaneDrawing({ l, faultAt, index, narrow }: { l: Lane; faultAt: number | null; index: number; narrow: boolean }) {
  const s = l.s
  const now = nowMs(s)
  const a = s.servers.find((v) => v.id === 'a')
  const f = FAULTS[index]
  if (!a) return null
  const stamp = stampOf(a)
  const waiting = [...a.queue, ...a.parked].sort((x, y) => x.t0 - y.t0).slice(0, 6)
  const status = lbStatus(l, faultAt)
  const rows = outcomes(l, faultAt)
  const trays: { key: number; p: P }[] = []
  for (const fl of s.flights) {
    if (fl.dir !== 'in' || fl.to !== 'a') continue
    const p = flightProgress(s, fl)
    if (p >= 0.5 && p <= 1) trays.push({ key: fl.id, p: along(ROAD, (p - 0.5) * 2) })
  }
  const drops = l.drops.list.filter((d) => d.at === 'a' && now - d.t >= 0 && now - d.t < DROP_MS)
  const down = a.proc !== 'up'
  // narrow: two lanes side by side are ~160 px each on a phone, so the lettering is one size up
  const mono = narrow ? 15 : 14
  const hand = narrow ? 21 : 20
  return (
    <g>
      <text x={LW / 2} y={22} textAnchor="middle" className="k-svg-display" style={{ fontSize: 17 }}>
        {f.title}
      </text>
      <text x={LW / 2} y={45} textAnchor="middle" className="k-svg-hand" style={{ fontSize: hand, fill: f.id === 'drain' ? 'var(--pen)' : 'var(--red)' }}>
        {f.note}
      </text>
      <Rough shape={{ k: 'lin', pts: ROAD }} seed={6500 + index} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.6} />
      <Rough shape={{ k: 'rect', x: 15, y: 106, w: 160, h: 92 }} seed={6510 + index} strokeWidth={1.8} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <text x={28} y={132} className="k-svg-display" style={{ fontSize: 18 }}>
        A
      </text>
      <g transform="translate(150 132)">
        <ServerFace mood={moodOf(a.proc, a.cpuShown)} r={15} />
      </g>
      {/* requests A is working on right now (a drain lets exactly these finish); the stamp takes over once A stops */}
      {!stamp && (
        <text x={28} y={159} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
          u obradi: {a.inflight.length}
        </text>
      )}
      {Array.from({ length: 6 }, (_, q) => (
        <rect key={q} x={28 + q * 23} y={168} width={19} height={14} rx={2} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '2.5 2.5' }} />
      ))}
      {waiting.map((r, q) => (
        <g key={r.id}>
          <use href={HREF} x={28 + q * 23} y={169} width={19} height={13} />
          {(a.proc === 'hung' || a.proc === 'off') && <TimeoutClock x={28 + q * 23 + 15} y={167} f={(now - r.t0) / s.cfg.clientTimeoutMs} r={5.5} />}
        </g>
      ))}
      {stamp && <SvgStamp x={LW / 2 + 4} y={146} text={stamp.text} tone={stamp.tone} size={15} rotate={-6} />}
      {/* the LB is still trying to connect to a machine that is off */}
      {a.connecting.slice(0, 3).map((r, q) => (
        <g key={r.id}>
          <use href={HREF} x={18 + q * 26} y={80} width={24} height={17} />
          <TimeoutClock x={36 + q * 26} y={78} f={1 - (r.connectUntil - now) / Math.max(1, s.cfg.connectTimeoutMs)} r={5.5} />
        </g>
      ))}
      {trays.map(({ key, p }) => (
        <use key={key} href={HREF} x={p[0] - 13} y={p[1] - 9} width={26} height={18} />
      ))}
      {drops.map((d) => (
        <DroppedTray key={d.id} x={154} y={84} k={(now - d.t) / DROP_MS} code={d.code} trayHref={HREF} size={22} fontSize={narrow ? 15 : 14} />
      ))}
      {/* what the load balancer believes */}
      <text x={15} y={226} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
        load balancer:
      </text>
      <g transform="translate(22 245)">{status.mark === 'ok' ? <Check x={0} y={0} size={6} seed={6520 + index} /> : status.mark === 'bad' ? <Cross x={0} y={0} size={6} seed={6530 + index} /> : null}</g>
      {(status.mark === 'warn' || status.mark === 'drain') && (
        <text x={22} y={250} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 16, fontWeight: 700, fill: MARK_FILL[status.mark] }}>
          {status.mark === 'warn' ? '!' : '↘'}
        </text>
      )}
      <text x={34} y={250} className="k-svg-mono" style={{ fontSize: mono, fill: MARK_FILL[status.mark] }}>
        {status.text}
      </text>
      {/* what the clients got from A, newest first */}
      <text x={15} y={282} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
        {faultAt === null ? 'klijenti dobivaju:' : 'nakon kvara:'}
      </text>
      {rows.map((r, i) => {
        const y = 306 + i * 21
        const ok = r.outcome === 'ok'
        return (
          <g key={r.id}>
            <g transform={`translate(22 ${y - 5})`}>{ok ? <Check x={0} y={0} size={5.5} seed={6540 + i} /> : <Cross x={0} y={0} size={5.5} seed={6550 + i} />}</g>
            <text x={34} y={y} className="k-svg-mono" style={{ fontSize: mono, fill: ok ? 'var(--ink)' : 'var(--red)' }}>
              {ok ? '200' : r.outcome === 'refused' ? 'odbijeno' : r.outcome} · {narrow ? '' : 'čekao '}
              {secs(r.tEnd - r.t0)}
            </text>
          </g>
        )
      })}
      {faultAt !== null && rows.length === 0 && (
        <text x={34} y={306} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
          još ništa…
        </text>
      )}
    </g>
  )
}

export function FourFaults() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 650
  const sim = useSimulation<FaultsState>({ init: createFaults, step: stepFaults })
  const st = sim.state
  const W = narrow ? LW * 2 : LW * 4
  const H = narrow ? LH * 2 + 10 : LH
  const pos = (i: number): P => (narrow ? [(i % 2) * LW, Math.floor(i / 2) * (LH + 10)] : [i * LW, 0])
  const since = st.faultAt === null ? null : st.lanes[0].s.t - st.faultAt
  return (
    <SimFrame
      title="isti promet, četiri kvara"
      subtitle="Četiri jednaka ručka. U svakom load balancer dijeli 8 narudžbi u sekundi na dva jednaka poslužitelja, A i B (2 vCPU · 4 GB; B se ne crta). Kad pritisnete „Pokreni kvarove”, poslužitelj A u svakom ručku zakaže na drukčiji način."
      sim={sim}
      showTime
      hint="pokrenite kvarove i gledajte koliko dugo čekaju klijenti i što dobiju. Koji je kvar najgori za korisnika, a koji za load balancer?"
      toolbar={
        st.faultAt === null ? (
          <Button variant="danger" size="sm" icon={Zap} onClick={() => sim.mutate(applyFaults)}>
            Pokreni kvarove
          </Button>
        ) : (
          <Button variant="success" size="sm" icon={RotateCcw} onClick={sim.reset}>
            Vrati sve
          </Button>
        )
      }
      minHeight={0}
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Četiri kvara jedan do drugoga${since === null ? ', još nijedan nije pokrenut' : `, ${secs(since)} nakon kvara`}: srušen proces odmah vraća 502, ugašen stroj daje 504 nakon isteka spajanja, zamrznut proces 504 nakon 5 sekundi, a pražnjenje dovrši započete zahtjeve.`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}
        >
          <TrayDefs id={TRAY} />
          {st.lanes.map((l, i) => {
            const [x, y] = pos(i)
            return (
              <g key={l.id} transform={`translate(${x} ${y})`}>
                {i > 0 && (narrow ? i % 2 === 1 : true) && <Rough shape={{ k: 'line', x1: 0, y1: 8, x2: 0, y2: LH - 8 }} seed={6600 + i} stroke="var(--ink-3)" strokeWidth={1} dash="4 6" />}
                <LaneDrawing l={l} faultAt={st.faultAt} index={i} narrow={narrow} />
              </g>
            )
          })}
        </svg>
      </div>
    </SimFrame>
  )
}
