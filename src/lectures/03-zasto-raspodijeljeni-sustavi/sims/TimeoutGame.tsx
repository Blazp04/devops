/**
 * „Spor ili mrtav?” — pick a timeout for a failure detector. 1000 seeded heartbeats from the engine's timeoutTradeoff:
 * healthy answers (~100 ms), stop-the-world GC pauses (0,2–3 s), lost packets and crashed servers. Answer times are
 * shown first without their causes (that is all a detector sees), then revealed. Everything right of the timeout is
 * declared dead: a crash is always caught (late), a slow but alive server becomes a false alarm.
 */
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, ControlGroup, Cross, Davor, Goals, Legend, Rough, SimFrame, Slider, SpeechBubble, Stat, StatRow, plural, useWidth } from '../../../kit'
import { HIST_EDGES, TIMEOUT_STEPS, num, timeoutHistogram, tradeoffAt } from '../model'
import { FitCurve } from './parts'
import styles from '../styles.module.css'

const fmtMs = (v: number) => (v >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)} s` : `${num(v)} ms`)

const C = {
  healthy: 'var(--hl-blue-ink)',
  gc: 'var(--hl-orange-ink)',
  lost: 'var(--hl-pink-ink)',
  crash: 'var(--red)',
  hidden: 'var(--ink-3)',
}

function Histogram({ timeout, reveal, width }: { timeout: number; reveal: boolean; width: number }) {
  const h = timeoutHistogram()
  const W = Math.max(300, Math.min(760, width))
  const H = 250
  const pad = { l: 42, r: 8, t: 38, b: 44 }
  const neverW = Math.max(34, (W - pad.l - pad.r) * 0.08)
  const plotR = W - pad.r - neverW - 16
  const lo = 5.62
  const hi = HIST_EDGES[HIST_EDGES.length - 1]
  const X = (v: number) => pad.l + (Math.log(v / lo) / Math.log(hi / lo)) * (plotR - pad.l)
  const max = 200
  const Y = (c: number) => H - pad.b - (Math.min(c, max) / max) * (H - pad.t - pad.b)
  const base = Y(0)
  const bins = [{ lo, hi: HIST_EDGES[0], healthy: h.under.healthy, gc: h.under.gc }, ...h.bins]
  const tx = X(timeout)
  const neverX = plotR + 16
  const bar = (key: string, x: number, w: number, c0: number, c1: number, color: string, angle: number, solid?: boolean) =>
    c1 > c0 ? <rect key={key} x={x} y={Y(c1)} width={w} height={Y(c0) - Y(c1)} style={{ fill: solid ? color : `url(#l03to-h-${angle}-${color.replace(/[^a-z0-9]/gi, '')})`, stroke: color, strokeWidth: 1.2 }} /> : null
  const patterns = [
    [C.healthy, -41],
    [C.gc, 41],
    [C.lost, 41],
    [C.hidden, -41],
  ] as const
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Vremena odgovora 1000 provjera. Timeout ${fmtMs(timeout)}: sve desno od crte proglašava se mrtvim.${reveal ? ' Uzroci su otkriveni: GC pauze i izgubljeni paketi su živi poslužitelji.' : ''}`} style={{ display: 'block', height: 'auto' }}>
      <defs>
        {patterns.map(([color, angle]) => (
          <pattern key={`${color}${angle}`} id={`l03to-h-${angle}-${color.replace(/[^a-z0-9]/gi, '')}`} width={4.5} height={4.5} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
            <line x1={0} y1={0} x2={0} y2={4.5} style={{ stroke: color, strokeWidth: 1.6 }} />
          </pattern>
        ))}
      </defs>
      {/* the "declared dead" side */}
      <rect x={tx} y={pad.t - 8} width={W - pad.r - tx} height={base - pad.t + 8} style={{ fill: 'var(--hl-pink)', opacity: 0.35 }} />
      <text x={tx + 6} y={pad.t - 14} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--red)' }}>
        {tx > W * 0.62 ? '„mrtav” →' : 'proglašen mrtvim →'}
      </text>
      <text x={tx - 6} y={pad.t - 14} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--green)' }}>
        ← živ ✓
      </text>
      {[0, 50, 100, 150, 200].map((t) => (
        <text key={t} x={pad.l - 6} y={Y(t) + 4} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }}>
          {t}
        </text>
      ))}
      {bins.map((b, i) => {
        const x = X(b.lo) + 1.5
        const w = Math.max(2, X(b.hi) - X(b.lo) - 3)
        return reveal ? (
          <g key={i}>
            {bar(`h${i}`, x, w, 0, b.healthy, C.healthy, -41)}
            {bar(`g${i}`, x, w, b.healthy, b.healthy + b.gc, C.gc, 41)}
          </g>
        ) : (
          bar(`a${i}`, x, w, 0, b.healthy + b.gc, C.hidden, -41)
        )
      })}
      {/* never answered */}
      {reveal ? (
        <g>
          {bar('crash', neverX, neverW, 0, h.crashes, C.crash, 0, true)}
          <Cross x={neverX + neverW / 2} y={(Y(0) + Y(h.crashes)) / 2} size={4.5} stroke="var(--paper)" />
          {bar('lost', neverX, neverW, h.crashes, h.crashes + h.lost, C.lost, 41)}
        </g>
      ) : (
        bar('never', neverX, neverW, 0, h.crashes + h.lost, C.hidden, -41)
      )}
      <text x={neverX + neverW / 2} y={base + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
        nikad
      </text>
      {[10, 100, 1000, 10000].map((v) => (
        <text key={v} x={X(v)} y={base + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
          {fmtMs(v)}
        </text>
      ))}
      <text x={plotR} y={H - 4} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
        kad je stigao odgovor →
      </text>
      <text x={4} y={16} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
        ↑ provjera
      </text>
      <Rough shape={{ k: 'line', x1: pad.l - 2, y1: base, x2: W - pad.r, y2: base }} seed={9101} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.8} />
      <Rough shape={{ k: 'line', x1: tx, y1: pad.t - 10, x2: tx, y2: base + 4 }} seed={9102} stroke="var(--red)" strokeWidth={2.2} dash="7 5" roughness={0.7} />
    </svg>
  )
}

/** Davor holds the pager the detector rings: it buzzes on every false alarm, and he says what the setting costs. */
function DavorPager({ falseAlarmRate, waitMs }: { falseAlarmRate: number; waitMs: number }) {
  const loud = falseAlarmRate >= 0.12
  const alarms = falseAlarmRate >= 0.05
  const slow = waitMs >= 250
  const lines = loud ? ['Zvoni, a sve', 'radi!'] : alarms ? ['Opet lažna', 'uzbuna…'] : slow ? ['Studenti', 'predugo čekaju.'] : ['Ovo mogu', 'podnijeti.']
  const mood = loud ? 'worry' : alarms || slow ? 'flat' : 'smile'
  return (
    <svg viewBox="0 0 250 150" role="img" aria-label={`Davor: ${lines.join(' ')}`} style={{ display: 'block', width: '100%', maxWidth: 260, height: 'auto', overflow: 'visible' }}>
      <Davor x={158} y={30} scale={0.9} mood={mood} buzz={alarms} />
      <SpeechBubble x={2} y={8} w={140} h={60} tx={190} ty={58} lines={lines} size={18} seed={9150 + lines[0].length} />
    </svg>
  )
}

export function TimeoutGame() {
  const [ti, setTi] = useState(3)
  const [reveal, setReveal] = useState(false)
  const [done, setDone] = useState({ balance: false, loss: false })
  const [ref, width] = useWidth<HTMLDivElement>()
  const T = TIMEOUT_STEPS[ti]
  const r = tradeoffAt(T)
  const alivePct = r.falseAlarmRate * 100
  const check = (t: number, rev: boolean) => {
    const x = tradeoffAt(t)
    setDone((d) => ({ balance: d.balance || (x.falseAlarmRate < 0.05 && x.meanUserWaitMs < 250), loss: d.loss || (rev && t === 5000) }))
  }
  const xs = [...TIMEOUT_STEPS]
  return (
    <SimFrame
      title="Spor ili mrtav?"
      subtitle="Detektor kvarova šalje provjeru i čeka odgovor najviše onoliko koliko kaže timeout. Iza 1000 provjera kriju se zdravi odgovori, GC pauze, izgubljeni paketi i srušeni poslužitelji (seed 42)."
      hint="postavite timeout tako da lažnih uzbuna bude manje od 5 %, a korisnici u prosjeku ne čekaju više od 250 ms. Onda otkrijte uzroke."
      minHeight={280}
      controls={
        <>
          <ControlGroup title="Detektor">
            <Slider
              label="Timeout"
              value={ti}
              min={0}
              max={TIMEOUT_STEPS.length - 1}
              onChange={(i) => {
                setTi(i)
                check(TIMEOUT_STEPS[i], reveal)
              }}
              format={(i) => fmtMs(TIMEOUT_STEPS[i])}
              hint="bez odgovora do tada → „mrtav”"
            />
          </ControlGroup>
          <Button
            variant={reveal ? 'secondary' : 'primary'}
            icon={reveal ? EyeOff : Eye}
            active={reveal}
            onClick={() => {
              setReveal(!reveal)
              check(T, !reveal)
            }}
          >
            {reveal ? 'Sakrij uzroke' : 'Otkrij skrivene kvarove'}
          </Button>
          <DavorPager falseAlarmRate={r.falseAlarmRate} waitMs={r.meanUserWaitMs} />
        </>
      }
      stats={
        <div>
          <StatRow>
            <Stat label="Lažne uzbune" value={`${num(alivePct, 1)} %`} tone={alivePct < 5 ? 'ok' : alivePct < 12 ? 'warn' : 'bad'} sub={plural(r.falseAlarms, ['živi proglašen mrtvim', 'živa proglašena mrtvima', 'živih proglašeno mrtvima'])} />
            <Stat label="Pad otkriven nakon" value={fmtMs(r.detectMs)} sub={`svih ${r.crashes} padova, ali tek tada`} />
            <Stat label="Korisnik čeka u prosjeku" value={fmtMs(Math.round(r.meanUserWaitMs))} tone={r.meanUserWaitMs < 250 ? 'ok' : 'warn'} sub="odgovor ili istek timeouta" />
          </StatRow>
          <div className={styles.goalsGrid} style={{ marginTop: 18 }}>
            <FitCurve
              maxWidth={560}
              height={170}
              xs={xs}
              log
              series={[{ label: 'lažne uzbune', ys: xs.map((t) => tradeoffAt(t).falseAlarmRate * 100), color: 'var(--red)' }]}
              yMax={70}
              yTicks={[0, 20, 40, 60]}
              formatY={(v) => `${v} %`}
              xTicks={[50, 200, 1000, 5000].map((v) => ({ v, label: fmtMs(v) }))}
              vline={{ x: T, label: fmtMs(T), color: 'var(--pen)' }}
              yLabel="lažne uzbune"
              label="Lažne uzbune padaju kako timeout raste."
              seed={9120}
            />
            <FitCurve
              maxWidth={560}
              height={170}
              xs={xs}
              log
              series={[{ label: 'čekanje', ys: xs.map((t) => tradeoffAt(t).meanUserWaitMs), color: 'var(--pen)', dash: '6 4' }]}
              yMax={400}
              yTicks={[0, 100, 200, 300, 400]}
              formatY={(v) => `${v}`}
              xTicks={[50, 200, 1000, 5000].map((v) => ({ v, label: fmtMs(v) }))}
              vline={{ x: T, label: fmtMs(T), color: 'var(--pen)' }}
              yLabel="prosječno čekanje (ms)"
              label="Prosječno čekanje korisnika raste kako timeout raste."
              seed={9130}
            />
          </div>
          <div className={styles.goalsGrid}>
            <Goals
              goals={[
                { text: 'Lažne uzbune ispod 5 %, a prosječno čekanje ispod 250 ms.', done: done.balance },
                { text: 'Otkrijte uzroke i postavite timeout na 5 s: koje lažne uzbune ostaju?', done: done.loss },
              ]}
            />
            <p className={styles.handNote}>
              {reveal
                ? `${plural(r.byCause.loss, ['izgubljen paket', 'izgubljena paketa', 'izgubljenih paketa'])}: pomaže samo ponovni pokušaj`
                : 'Detektor vidi samo kad je odgovor stigao – ne i zašto kasni.'}
            </p>
          </div>
        </div>
      }
    >
      <div ref={ref} className={styles.stage}>
        <Histogram timeout={T} reveal={reveal} width={width ?? 700} />
        <Legend
          items={
            reveal
              ? [
                  { color: C.healthy, label: 'zdrav odgovor', shape: 'square' },
                  { color: C.gc, label: 'GC pauza (živ!)', shape: 'square' },
                  { color: C.lost, label: 'izgubljen paket (živ!)', shape: 'square' },
                  { color: C.crash, label: 'srušen poslužitelj', shape: 'cross' },
                ]
              : [{ color: C.hidden, label: 'odgovor (uzrok skriven)', shape: 'square' }]
          }
        />
      </div>
    </SimFrame>
  )
}
