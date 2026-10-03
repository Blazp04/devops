/**
 * The flagship stage: students → redar (load balancer, with the clipboard of what it believes) → S1 · S2 · S3 server
 * cards (the truth). Trays are drawn from the engine's flights in one pooled layer; a failed tray falls at the door
 * with its ✗ and code; a probe shows as „kuc-kuc” at the door. Pure function of the engine state.
 */
import { Check, Cross, Cylinder, Davor, Redar, Rough, SpeechBubble, StudentQueue, SvgStamp, TrayDefs, fmt, plural } from '../../../kit'
import { flightProgress, nowMs, serversView, type ServerView, type TrafficState } from '../../../engines/traffic'
import { menzaClock, type SessionMode } from '../lib/flagship'
import { DROP_MS, along, lbLine, recentProbe, type DropLog, type P } from '../lib/rack'
import { queueCount, type StageGeo } from '../lib/stage'
import { DroppedTray, LbClipboard, ServerSheet, TimeoutClock } from './parts'

const TRAY = 'l05f'
const TRAY_HREF = `#${TRAY}-tray`

function davorLine(s: TrafficState, views: ServerView[], drops: DropLog, now: number): string[] | null {
  if (!s.lbUp) return ['Sve stoji!']
  if (!s.redisUp) return ['Svi su', 'odjavljeni!']
  // 502s from a dead server the redar still believes in
  for (const d of drops.list) {
    if (d.code !== '502') continue
    const v = views.find((x) => x.id === d.at)
    if (v && v.inRotation && now >= d.t && now - d.t < 1500) return ['502! 502!']
  }
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i]
    if (s.t / 1000 - e.t > 3) break
    if (e.kind === 'unhealthy' || e.kind === 'ejected') return ['Izbačen.', 'Uf.']
  }
  return null
}

export function FlagshipStage({ s, geo, sessions, drops }: { s: TrafficState; geo: StageGeo; sessions: SessionMode; drops: DropLog }) {
  const now = nowMs(s)
  const views = serversView(s)
  const idx = (id: string) => s.servers.findIndex((v) => v.id === id)
  const sc = geo.lbScale
  const shoulder: P = [geo.lb[0] + 13 * sc, geo.lb[1] - 28 * sc]

  // the redar's arm points at the server the latest tray went to
  let target = -1
  let latest = -Infinity
  for (const f of s.flights) {
    if (f.dir === 'in' && f.via === 'lb' && f.t0 > latest && f.t0 <= now) {
      const i = idx(f.to)
      if (i >= 0) {
        latest = f.t0
        target = i
      }
    }
  }
  const aim = target >= 0 ? geo.road(target)[1] : geo.door(1)
  const angle = Math.atan2(aim[1] - shoulder[1], aim[0] - shoulder[0])
  const fullest = Math.max(0, ...s.servers.map((v) => (v.queue.length + v.parked.length) / Math.max(1, s.cfg.queueMax)))
  const sweat = Math.min(3, Math.floor(fullest * 3.2))

  // trays and ✓ pops from the engine's flights; failed trays from the drop log (the engine prunes landed flights)
  const trays: { key: number; p: P }[] = []
  const pops: { key: number; i: number; k: number }[] = []
  const popCount: Record<string, number> = {}
  for (const f of s.flights) {
    const p = flightProgress(s, f)
    if (p < 0 || p > 1) continue
    if (f.dir === 'in') {
      if (f.to === 'lb') {
        trays.push({ key: f.id, p: along([geo.client, geo.lb], p) })
        continue
      }
      const i = idx(f.to)
      if (i < 0) continue
      const road = geo.road(i)
      trays.push({ key: f.id, p: f.via === 'lb' ? (p < 0.5 ? along([geo.client, geo.lb], p * 2) : along(road, (p - 0.5) * 2)) : along(road, p) })
    } else if (f.bounce) {
      const i = idx(f.from)
      if (i >= 0) trays.push({ key: f.id, p: along([...geo.road(i)].reverse(), p) })
    } else if (f.outcome === 'ok' && f.from !== 'lb') {
      const i = idx(f.from)
      const c = popCount[f.from] ?? 0
      if (i >= 0 && p <= 0.7 && c < 2) {
        popCount[f.from] = c + 1
        pops.push({ key: f.id, i, k: p / 0.7 })
      }
    }
  }
  const fallen: { key: number; p: P; k: number; code: string; door: number }[] = []
  let errorsNow = false
  for (const d of drops.list) {
    const age = now - d.t
    if (age < 0 || age >= DROP_MS) continue
    const i = d.at === 'lb' ? -1 : idx(d.at)
    if (d.at !== 'lb' && i < 0) continue
    fallen.push({ key: d.id, p: i < 0 ? geo.lb : geo.door(i), k: age / DROP_MS, code: d.code === 'refused' ? '✗' : d.code, door: i })
    errorsNow = true
  }
  // many drops at one door: spread the trays a little and letter only the newest one („503 ×4”)
  const newest = new Map<number, number>()
  const count = new Map<number, number>()
  for (const f of fallen) {
    newest.set(f.door, Math.max(newest.get(f.door) ?? -1, f.key))
    count.set(f.door, (count.get(f.door) ?? 0) + 1)
  }
  const dropLabel = (f: { key: number; code: string; door: number }) => {
    const n = count.get(f.door) ?? 1
    return n > 1 ? `${f.code} ×${n}` : f.code
  }

  const bubble = geo.davor ? davorLine(s, views, drops, now) : null
  const lines = s.servers.map((v) => ({ name: v.name, ...lbLine(s, v, geo.narrow) }))
  const mono = geo.narrow ? 15 : 14
  const hand = geo.narrow ? 21 : 20
  const carts = s.clients.length
  const redisHome = s.clients.filter((c) => c.session.home === 'redis').length

  return (
    <svg
      viewBox={`0 0 ${geo.W} ${geo.H}`}
      role="img"
      aria-label={`Klopa u ${menzaClock(now)}: studenti šalju ${fmt.num(s.offeredNow, 0)} narudžbi u sekundi load balanceru, a on ih dijeli na tri poslužitelja. ${views
        .map((v) => `${v.name}: ${v.proc === 'up' ? 'radi' : v.proc === 'crashed' ? 'proces je pao' : v.proc === 'off' ? 'ugašen' : v.proc === 'hung' ? 'zamrznut' : 'pokreće se'}, load balancer ga ${v.inRotation ? 'smatra ispravnim' : 'ne koristi'}`)
        .join('; ')}.`}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <TrayDefs id={TRAY} />
      {/* roads from the redar to every server; a road the LB stopped using is dashed red with a ✗ */}
      {s.servers.map((v, i) => {
        const road = geo.road(i)
        const out = !views[i].inRotation
        const mid = along(road, 0.72)
        return (
          <g key={v.id}>
            <Rough shape={{ k: 'lin', pts: road }} seed={5300 + i} stroke={out ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={out ? 1.6 : 1.3} dash={out ? '5 6' : undefined} roughness={0.7} />
            {out && (
              <g transform={`translate(${mid[0]} ${mid[1]})`}>
                <Cross x={0} y={0} size={8} seed={5310 + i} />
              </g>
            )}
          </g>
        )
      })}
      <Rough shape={{ k: 'lin', pts: [geo.client, geo.lb] }} seed={5320} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.7} />

      {/* clock and the students (traffic) */}
      <text x={geo.clock[0]} y={geo.clock[1]} className="k-svg-mono" style={{ fontSize: 17, fontWeight: 700 }}>
        {menzaClock(now)}
      </text>
      <StudentQueue x={geo.students.x} y={geo.students.y} count={queueCount(s.cfg.lambda, geo.students.max)} scale={geo.students.scale} direction={geo.students.dir} tap={s.cfg.lambda >= 15} />
      <text x={geo.rateLabel[0]} y={geo.rateLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--tray-ink)' }}>
        {fmt.num(s.offeredNow, 0)} narudžbi/s
      </text>

      {/* the redar = load balancer, and its clipboard = what it believes */}
      <Redar x={geo.lb[0]} y={geo.lb[1]} scale={sc} angle={angle} sweat={s.lbUp ? sweat : 0} mood={s.lbUp ? 'smile' : 'worry'} />
      {!s.lbUp && <SvgStamp x={geo.lb[0]} y={geo.lb[1] - 20} text="NE RADI" size={18} rotate={-10} />}
      <g transform={`translate(${geo.clip.x} ${geo.clip.y})`}>
        <LbClipboard w={geo.clip.w} lines={lines} mono={mono} hand={hand} />
      </g>

      {/* the session store (Redis) when carts live there */}
      {sessions === 'redis' && (
        <g>
          <Cylinder x={geo.redis.x} y={geo.redis.y} w={geo.redis.w} h={geo.redis.h} seed={5330} />
          {/* own lettering: the kit's Cylinder label is a fixed 13 units, too small on a phone */}
          <text x={geo.redis.x + geo.redis.w / 2} y={geo.redis.y + geo.redis.h / 2 + 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fontWeight: 600 }}>
            Redis
          </text>
          {!s.redisUp && (
            <g transform={`translate(${geo.redis.x + geo.redis.w + 2} ${geo.redis.y + 2})`}>
              <Cross x={0} y={0} size={geo.redis.w * 0.24} seed={5331} strokeWidth={2.8} />
            </g>
          )}
          <text x={geo.redis.label[0]} y={geo.redis.label[1]} textAnchor={geo.redis.anchor} className="k-svg-mono" style={{ fontSize: mono, fill: s.redisUp ? 'var(--pen)' : 'var(--red)' }}>
            {geo.narrow ? (
              <>
                <tspan x={geo.redis.label[0]}>{s.redisUp ? redisHome : 0}</tspan>
                <tspan x={geo.redis.label[0]} dy={17}>
                  {plural(s.redisUp ? redisHome : 0, ['košarica', 'košarice', 'košarica'], false)}
                </tspan>
              </>
            ) : (
              `košarice: ${s.redisUp ? redisHome : 0}/${carts}`
            )}
          </text>
        </g>
      )}

      {/* Davor on call: the pager buzzes while errors arrive */}
      {geo.davor && (
        <g>
          <Davor x={geo.davor.x} y={geo.davor.y} scale={geo.davor.scale} buzz={errorsNow} mood={bubble ? 'worry' : 'flat'} />
          {bubble && (
            <SpeechBubble
              x={geo.davor.bubble.x}
              y={geo.davor.bubble.y}
              w={geo.davor.bubble.w}
              h={geo.davor.bubble.h}
              tx={geo.davor.x + 40 * geo.davor.scale + 10}
              ty={geo.davor.y + 30 * geo.davor.scale}
              lines={bubble}
              size={21}
              tone={bubble[0].startsWith('Izbačen') ? 'ink' : 'red'}
              seed={5340}
            />
          )}
        </g>
      )}

      {/* the servers: the truth */}
      {s.servers.map((v, i) => {
        const y = geo.cardY(i)
        const door = geo.door(i)
        const probe = recentProbe(v, now)
        return (
          <g key={v.id}>
            <g transform={`translate(${geo.card.x} ${y})`}>
              <ServerSheet v={v} sv={views[i]} w={geo.card.w} h={geo.card.h} seed={5400 + i * 40} now={now} trayHref={TRAY_HREF} timeoutMs={s.cfg.clientTimeoutMs} carts={sessions === 'redis' ? null : views[i].sessions} narrow={geo.narrow} />
            </g>
            {/* the LB is still connecting to a machine that is off: trays wait at the door with a clock */}
            {v.connecting.slice(0, 4).map((r, q) => {
              const f = 1 - (r.connectUntil - now) / Math.max(1, s.cfg.connectTimeoutMs)
              // wide: side by side in front of the door; narrow: stacked in the thin lane left of the card
              return geo.narrow ? (
                <g key={r.id}>
                  <use href={TRAY_HREF} x={0} y={door[1] - 46 + q * 16} width={20} height={14} />
                  <TimeoutClock x={16} y={door[1] - 46 + q * 16} f={f} r={5} />
                </g>
              ) : (
                <g key={r.id}>
                  <use href={TRAY_HREF} x={door[0] - 34 - q * 16} y={door[1] + 8} width={26} height={18} />
                  <TimeoutClock x={door[0] - 22 - q * 16} y={door[1] + 6} f={f} r={5.5} />
                </g>
              )
            })}
            {/* the probe: by the door on the wide stage; on a phone in the card's top line, between the name and the face */}
            {probe && (
              <g>
                <text x={geo.narrow ? geo.card.x + 156 : door[0] - 8} y={geo.narrow ? y + 26 : door[1] - 24} textAnchor={geo.narrow ? 'start' : 'end'} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--pen)' }}>
                  kuc-kuc{probe === 'pending' ? '…' : ''}
                </text>
                {probe !== 'pending' && (
                  <g transform={`translate(${geo.narrow ? geo.card.x + 240 : door[0] + 2} ${geo.narrow ? y + 20 : door[1] - 30})`}>
                    {probe === 'pass' ? <Check x={0} y={0} size={7} seed={5350 + i} /> : <Cross x={0} y={0} size={7} seed={5360 + i} />}
                  </g>
                )}
              </g>
            )}
          </g>
        )
      })}

      {/* ✓ pops on the margin: answers going back (at most two per server) */}
      {pops.map(({ key, i, k }) => (
        <g key={key} transform={`translate(${geo.card.x + geo.card.w + 11} ${geo.cardY(i) + 46 - k * 22})`} style={{ opacity: 1 - k }} aria-hidden="true">
          <Check x={0} y={0} size={7} seed={5370} strokeWidth={2.2} />
        </g>
      ))}

      {/* requests in flight: one pooled layer of trays */}
      {trays.map(({ key, p }) => (
        <use key={key} href={TRAY_HREF} x={p[0] - 15} y={p[1] - 10.5} width={30} height={21} />
      ))}
      {fallen.map((f) => {
        const { key, p, k } = f
        const dx = (key % 4) * 7
        const dy = (key % 3) * 5
        const label = newest.get(f.door) === key
        return geo.narrow ? (
          <DroppedTray key={`d${key}`} x={(p[0] > geo.card.x ? p[0] : 11) + dx} y={p[1] + 14 + dy} k={k} code={dropLabel(f)} label={label} trayHref={TRAY_HREF} size={22} above fontSize={15} />
        ) : (
          <DroppedTray key={`d${key}`} x={p[0] - 22 - dx} y={p[1] + 2 + dy} k={k} code={dropLabel(f)} label={label} trayHref={TRAY_HREF} size={26} />
        )
      })}
    </svg>
  )
}
