/**
 * „Gdje živi košarica”: 20 students, each cart drawn where its session lives – as numbered chips inside a server's
 * memory, or in Redis. Model: E1 Promet, preset l05-sessions-local with the store as a control (lib/carts.ts).
 */
import { useState } from 'react'
import { Plus, Power } from 'lucide-react'
import { Button, Cross, Cylinder, EventLog, Goals, MiniPerson, Redar, Rough, Segmented, ServerFace, SimFrame, Stat, StatRow, SvgStamp, fmt, useSimulation, useWidth } from '../../../kit'
import { configure, pushEvent, serversView, setRedisUp, type ServerState } from '../../../engines/traffic'
import { addFourth, createCarts, offS3, onS3, stepCarts, type CartState } from '../lib/carts'
import { SESSION_NAME, sessionsInput, type SessionMode } from '../lib/flagship'
import { moodOf } from '../lib/rack'

const MODES: { value: SessionMode; label: string; title: string }[] = [
  { value: 'local', label: 'U memoriji', title: 'Košarica u memoriji poslužitelja koji je obradio zahtjev' },
  { value: 'cookie', label: 'Ljepljivo', title: 'Košarica u memoriji, a kolačić load balancera vraća studenta na isti poslužitelj' },
  { value: 'redis', label: 'U Redisu', title: 'Košarica u zajedničkom Redisu' },
]

const SHIRTS = ['var(--hl-pink-ink)', 'var(--hl-green-ink)', 'var(--hl-blue-ink)', 'var(--hl-yellow-ink)', 'var(--hl-orange-ink)']
const HAIRS = ['short', 'bun', 'pony', 'none'] as const
const CW = 178
const CH = 170
const CHIP_W = 25
const CHIP_H = 19

function Chip({ x, y, n, wiped, seed }: { x: number; y: number; n: number; wiped: boolean; seed: number }) {
  // 15 units: legible (≥ 12 px) also in the narrow layout, which is ~320 px wide on a phone
  return (
    <g transform={`translate(${x} ${y})`}>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: CHIP_W, h: CHIP_H }} seed={seed} strokeWidth={1.3} stroke={wiped ? 'var(--red)' : 'var(--pen)'} fillColor="var(--note-blue)" fillStyle="solid" />
      <text x={CHIP_W / 2} y={14.5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fontWeight: 600, fill: wiped ? 'var(--red)' : 'var(--note-ink)' }}>
        {n}
      </text>
      {wiped && <line x1={2} y1={CHIP_H - 3} x2={CHIP_W - 2} y2={3} style={{ stroke: 'var(--red)', strokeWidth: 2 }} />}
    </g>
  )
}

function CartCard({ v, cpu, perSec, chips, seed, narrow }: { v: ServerState; cpu: number; perSec: number; chips: { n: number; wiped: boolean }[]; seed: number; narrow: boolean }) {
  const down = v.proc !== 'up'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: CW, h: CH }} seed={seed} strokeWidth={1.8} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <text x={10} y={24} className="k-svg-display" style={{ fontSize: 16 }}>
        {v.name} · {v.label}
      </text>
      <g transform={`translate(${CW - 22} 24)`}>
        <ServerFace mood={moodOf(v.proc, cpu)} r={14} />
      </g>
      <text x={10} y={48} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--ink-2)' }}>
        {down ? 'ne radi' : `${fmt.num(perSec, 1)} zahtjeva/s`}
      </text>
      <text x={10} y={70} className="k-svg-hand" style={{ fontSize: narrow ? 21 : 20, fill: 'var(--ink-2)' }}>
        {narrow ? 'u memoriji:' : 'košarice u memoriji:'}
      </text>
      {chips.map((c, i) => (
        <Chip key={c.n} x={10 + (i % 6) * 27.5} y={80 + Math.floor(i / 6) * 22} n={c.n} wiped={c.wiped} seed={seed + 10 + i} />
      ))}
      {down && <SvgStamp x={CW / 2} y={CH / 2 + 18} text={v.proc === 'off' ? 'UGAŠEN' : v.proc === 'crashed' ? 'SRUŠEN' : 'POKREĆE SE'} size={17} rotate={-7} />}
    </g>
  )
}

export function CartSim() {
  const [mode, setMode] = useState<SessionMode>('local')
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 650
  const sim = useSimulation<CartState>({ init: () => createCarts(mode), step: (st, dt) => stepCarts(st, dt, mode) })
  const st = sim.state
  const s = st.s
  const now = s.t
  const views = serversView(s)
  const n = s.servers.length

  const W = narrow ? 380 : 760
  const userPos = (i: number): [number, number] => (narrow ? [19 + (i % 10) * 38, 52 + Math.floor(i / 10) * 104] : [19 + i * 38, 52])
  const usersBottom = narrow ? 224 : 122
  const redar: [number, number] = narrow ? [70, usersBottom + 78] : [150, usersBottom + 88]
  const cardsTop = usersBottom + (narrow ? 132 : 140)
  const cardPos = (i: number): [number, number] => {
    if (narrow) {
      const row = Math.floor(i / 2)
      const inRow = Math.min(2, n - row * 2)
      const x0 = (W - (inRow * CW + (inRow - 1) * 16)) / 2
      return [x0 + (i % 2) * (CW + 16), cardsTop + row * (CH + 16)]
    }
    const x0 = (W - (n * CW + (n - 1) * 16)) / 2
    return [x0 + i * (CW + 16), cardsTop]
  }
  const cardsBottom = narrow ? cardsTop + Math.ceil(n / 2) * (CH + 16) : cardsTop + CH + 16
  const redisY = cardsBottom + 22
  const redisW = narrow ? 340 : 380
  const redisX = (W - redisW) / 2
  const redisRow = narrow ? 9 : 10
  const H = redisY + 130

  const homes = new Map<string, { n: number; wiped: boolean }[]>()
  s.clients.forEach((c, i) => {
    const h = c.session.home
    if (!h) return
    const list = homes.get(h) ?? []
    list.push({ n: i + 1, wiped: c.session.wiped })
    homes.set(h, list)
  })
  if (st.ghosts) {
    const list = homes.get(st.ghosts.server) ?? []
    for (const id of st.ghosts.users) list.push({ n: id + 1, wiped: true })
    homes.set(st.ghosts.server, list)
  }
  const inRedis = homes.get('redis') ?? []
  const lostTotal = s.totals.sessionLost
  const goals = [
    { text: 'Nađite način spremanja u kojem gašenje poslužitelja S3 nikoga ne odjavi (10 s nakon gašenja).', done: st.redisCrashAt !== null && now - st.redisCrashAt >= 10_000 && lostTotal === st.redisCrashLost },
    { text: 'S ljepljivim sesijama dodajte S4. Koliko prometa dobiva?', done: st.stickyAddAt !== null && now - st.stickyAddAt >= 10_000 },
  ]

  const changeMode = (m: SessionMode) => {
    setMode(m)
    sim.mutate((x) => {
      configure(x.s, { sessions: sessionsInput(m) })
      if (m === 'cookie') pushEvent(x.s, 'Ljepljive sesije: load balancer pri prvom zahtjevu daje kolačić i dalje šalje studenta istom poslužitelju.', 'info')
    })
  }
  const s3Off = s.servers.find((v) => v.id === 's3')?.proc === 'off'
  const toggleS3 = () => sim.mutate((x) => (s3Off ? onS3(x) : offS3(x, mode)))

  return (
    <SimFrame
      title="gdje živi košarica"
      subtitle="20 studenata naručuje, 10 narudžbi u sekundi, težinsko kružno raspoređivanje. Brojčana kartica = košarica tog studenta, nacrtana ondje gdje je spremljena."
      sim={sim}
      showTime
      hint="pogledajte koliko se studenata odjavljuje kad je košarica u memoriji poslužitelja. Zatim uključite ljepljivu sesiju i ugasite stroj S3, pa probajte Redis."
      controls={
        <>
          <Segmented label="Gdje je košarica" value={mode} options={MODES} onChange={changeMode} size="sm" />
          <Button variant={s3Off ? 'success' : 'danger'} icon={Power} onClick={toggleS3}>
            {s3Off ? 'Upali S3' : 'Ugasi stroj S3'}
          </Button>
          <Button icon={Plus} onClick={() => sim.mutate((x) => addFourth(x, mode))} disabled={n >= 4}>
            Dodaj poslužitelj S4
          </Button>
          {s.redisUp ? (
            <Button variant="danger" onClick={() => sim.mutate((x) => setRedisUp(x.s, false))} disabled={mode !== 'redis'}>
              Ugasi Redis
            </Button>
          ) : (
            <Button variant="success" icon={Power} onClick={() => sim.mutate((x) => setRedisUp(x.s, true))}>
              Upali Redis
            </Button>
          )}
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="odjave (ukupno)" value={fmt.num(lostTotal)} tone={lostTotal > 0 ? 'bad' : 'ok'} sub={`košarice ${SESSION_NAME[mode]}`} />
            <Stat label="zahtjeva/s po poslužitelju" value={views.map((v) => fmt.num(v.handledPerSec, 0)).join(' · ')} sub={views.map((v) => v.name).join(' · ')} />
          </StatRow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 28, alignItems: 'start', marginTop: 22 }}>
            <Goals goals={goals} />
            <EventLog events={s.events.slice(-20)} />
          </div>
        </>
      }
      minHeight={0}
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Košarice ${SESSION_NAME[mode]}: ${views.map((v) => `${v.name} drži ${(homes.get(v.id) ?? []).length}`).join(', ')}${mode === 'redis' ? `, Redis drži ${inRedis.length}` : ''}. Odjava ukupno: ${lostTotal}.`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}
        >
          <text x={0} y={18} className="k-svg-hand" style={{ fontSize: narrow ? 21 : 20, fill: 'var(--ink-2)' }}>
            {narrow ? (mode === 'cookie' ? 'studenti, košarice i kolačići' : 'studenti i stvari u košarici') : `studenti i broj stvari u košarici${mode === 'cookie' ? ' (ispod: kolačić)' : ''}`}
          </text>
          {s.clients.map((c, i) => {
            const [cx, cy] = userPos(i)
            const fresh = now - st.lostAt[i] < 1500
            return (
              <g key={c.id}>
                <MiniPerson cx={cx} cy={cy} s={30} seed={7100 + i * 7} hair={HAIRS[i % HAIRS.length]} shirt={SHIRTS[i % SHIRTS.length]} />
                {fresh && (
                  <g transform={`translate(${cx + 11} ${cy - 13})`}>
                    <Cross x={0} y={0} size={6} seed={7300 + i} strokeWidth={2.2} />
                  </g>
                )}
                <text x={cx} y={cy + 44} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700, fill: fresh ? 'var(--red)' : 'var(--ink)' }}>
                  {c.session.home ? c.session.cart : c.session.wiped || fresh ? 0 : '–'}
                </text>
                <text x={cx} y={cy + 62} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--ink-3)' }}>
                  {i + 1}
                </text>
                {mode === 'cookie' && c.cookie && (
                  <text x={cx} y={cy + 80} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--pen)' }}>
                    {c.cookie.toUpperCase()}
                  </text>
                )}
              </g>
            )
          })}
          {/* roads from the redar to every server (wide layout; on a phone the cards stack and the roads would cross them) */}
          {!narrow &&
            s.servers.map((v, i) => {
              const [x, y] = cardPos(i)
              return <Rough key={v.id} shape={{ k: 'lin', pts: [[redar[0] + 14, redar[1] + 10], [x + CW / 2, y]] }} seed={7380 + i} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.7} />
            })}
          {/* big enough that the „LB” on his vest stays ≥ 12 px */}
          <Redar x={redar[0]} y={redar[1]} scale={narrow ? 0.82 : 0.72} angle={Math.PI / 2.4} />
          <text x={redar[0] + (narrow ? 46 : 40)} y={redar[1] - 20} className="k-svg-hand" style={{ fontSize: narrow ? 21 : 20, fill: 'var(--ink-2)' }}>
            {narrow ? (mode === 'cookie' ? 'redar čita kolačić' : 'redar dijeli po težinama') : mode === 'cookie' ? 'redar čita kolačić i vraća studenta istom poslužitelju' : 'redar dijeli narudžbe po težinama'}
          </text>
          {s.servers.map((v, i) => {
            const [x, y] = cardPos(i)
            return (
              <g key={v.id} transform={`translate(${x} ${y})`}>
                <CartCard v={v} cpu={views[i].cpuSmooth} perSec={views[i].handledPerSec} chips={homes.get(v.id) ?? []} seed={7400 + i * 40} narrow={narrow} />
              </g>
            )
          })}
          {/* the shared session store */}
          {mode === 'redis' ? (
            <g>
              <Cylinder x={redisX} y={redisY} w={redisW} h={112} seed={7600} />
              <text x={redisX + 14} y={redisY + 42} className="k-svg-display" style={{ fontSize: 16 }}>
                Redis
              </text>
              {s.redisUp ? (
                inRedis.map((c, i) => <Chip key={c.n} x={redisX + (narrow ? 64 : 70) + (i % redisRow) * 28} y={redisY + 30 + Math.floor(i / redisRow) * 24} n={c.n} wiped={false} seed={7610 + i} />)
              ) : (
                <>
                  <g transform={`translate(${redisX + redisW / 2} ${redisY + 62})`}>
                    <Cross x={0} y={0} size={22} seed={7650} strokeWidth={3} />
                  </g>
                  <SvgStamp x={redisX + redisW / 2} y={redisY + 66} text="UGAŠEN" size={17} rotate={-6} />
                </>
              )}
            </g>
          ) : (
            <g>
              <Rough shape={{ k: 'rect', x: redisX, y: redisY + 8, w: redisW, h: 92 }} seed={7660} stroke="var(--ink-3)" strokeWidth={1.2} dash="5 6" />
              <text x={W / 2} y={redisY + 48} textAnchor="middle" className="k-svg-display" style={{ fontSize: 16, fill: 'var(--ink-2)' }}>
                Redis
              </text>
              <text x={W / 2} y={redisY + 76} textAnchor="middle" className="k-svg-hand" style={{ fontSize: narrow ? 21 : 20, fill: 'var(--ink-2)' }}>
                {narrow ? 'zajedničko, još se ne koristi' : 'zajedničko spremište – još se ne koristi'}
              </text>
            </g>
          )}
        </svg>
      </div>
    </SimFrame>
  )
}
