/**
 * "Tko sluša na kojim vratima": a machine drawn as a building with two rows of doors — its public (or Wi-Fi)
 * address and 127.0.0.1 — and the processes holding doors. Change the bind address, the firewall and the sender;
 * every change sends one request (a tray) that enters, bounces (refused) or vanishes (timeout).
 * Model: ../doors.ts. Geometry: ../doorsGeo.ts.
 */
import { useState } from 'react'
import { Play, Zap } from 'lucide-react'
import { Button, Cloud, DiagramDefs, Goals, MiniLaptop, Petra, Rough, Segmented, SimFrame, Toggle, diagramIds, pointAt, useWidth, type Pt } from '../../../kit'
import { knock, senderValid, type Bind, type DoorHost, type DoorsParams, type Sender } from '../doors'
import { doorsGeo, type DoorsGeo } from '../doorsGeo'
import { pathLength, SPEED } from '../geometry'
import { useElapsed } from '../useElapsed'
import { HollowClock, RefusedBurst, Road, RouterDoodle, TraySprite } from './parts'
import styles from '../styles.module.css'

const WAIT = 2.4

/** the route of one knock: to the door, or cut at the firewall / lost on the internet */
function routeOf(g: DoorsGeo, p: DoorsParams): Pt[] {
  const r = g.routes[p.sender] ?? []
  const k = knock(p)
  if (k.stop !== 'fence') return r
  const inside = (q: Pt) => (g.wall.side === 'left' ? q[0] >= g.wall.at : q[1] >= g.wall.at)
  const cut: Pt[] = []
  for (const q of r) {
    if (inside(q)) break
    cut.push(q)
  }
  const fence: Pt = g.wall.side === 'left' ? [g.wall.at - 20, g.wall.gap] : [g.wall.gap, g.wall.at - 18]
  return [...cut.slice(0, -1), fence]
}

function DoorsStage({ p, clash, narrow }: { p: DoorsParams; clash: boolean; narrow: boolean }) {
  const g = doorsGeo(p.host, narrow)
  const ids = diagramIds(`l01doors${narrow ? 'n' : 'w'}`)
  const k = knock(p)
  const route = routeOf(g, p)
  const travel = pathLength(route) / SPEED
  const back = k.outcome === 'timeout' ? WAIT : travel
  const total = clash ? 0 : travel + back
  const t = useElapsed(total, 0.25)
  const done = !clash && t >= total - 1e-6
  const f = g.font
  const vps = p.host === 'vps'
  const [d22, d8000] = g.doorX
  const dw = g.door.w
  const dh = g.door.h
  const pubBound = p.bind === '0.0.0.0'
  // the tray
  let tray: { at: Pt; tone: 'req' | 'ok' | 'bad'; label?: string; faded?: boolean } | null = null
  if (!clash) {
    if (t < travel) tray = { at: pointAt(route, t / travel), tone: 'req', label: 'GET /' }
    else if (k.outcome === 'timeout') tray = { at: route[route.length - 1], tone: 'req', faded: done }
    else {
      const f2 = Math.min(1, (t - travel) / back)
      tray = { at: pointAt([...route].reverse(), f2), tone: k.outcome === 'ok' ? 'ok' : 'bad', label: k.outcome === 'ok' ? '200 OK' : 'RST' }
    }
  }
  const arrived = !clash && t >= travel
  const doorY = (row: 'pub' | 'lo') => (row === 'pub' ? g.rowPub.y : g.rowLo.y)
  const clock = k.stop === 'lost' ? g.clock.lost : g.clock.fence
  const senderLabel = k.url
  const doorRect = (x: number, row: 'pub' | 'lo') => ({ k: 'rect' as const, x: x - dw / 2, y: doorY(row) - dh / 2, w: dw, h: dh })
  const holds = (x: number, row: 'pub' | 'lo') => (x === d22 ? vps : row === 'lo' || pubBound)
  const procBox = (x: number, w: number) => ({ x: x - w / 2, y: g.procY, w, h: g.procH })
  return (
    <svg
      viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`}
      role="img"
      aria-label={`${vps ? 'VPS' : 'Lanin laptop'} s dvije adrese. gunicorn sluša na ${p.bind}:8000. ${clash ? 'Drugi gunicorn ne može se pokrenuti: adresa je zauzeta.' : `Zahtjev ${senderLabel}: ${k.head}.`}`}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <DiagramDefs id={ids.id} />
      {g.flat && <Rough shape={{ k: 'rect', x: g.flat.x, y: g.flat.y, w: g.flat.w, h: g.flat.h }} seed={9020} strokeWidth={1.4} stroke="var(--ink-3)" dash="6 6" />}
      {g.flatLabel && (
        <text x={g.flatLabel[0]} y={g.flatLabel[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
          Lanin stan
        </text>
      )}
      <Cloud x={g.cloud.x} y={g.cloud.y} w={g.cloud.w} h={g.cloud.h} seed={9021} />
      <text x={g.cloudLabel[0]} y={g.cloudLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
        internet
      </text>
      {g.router && <RouterDoodle box={g.router} />}
      {g.routerLabel && (
        <text x={g.routerLabel.x} y={g.routerLabel.y} textAnchor={g.routerLabel.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
          usmjerivač (NAT)
        </text>
      )}

      {/* the machine: frame, firewall wall with one door to the outside, two rows of doors */}
      <Rough shape={{ k: 'rect', x: g.frame.x, y: g.frame.y, w: g.frame.w, h: g.frame.h }} seed={9022} strokeWidth={1.9} roughness={1.3} />
      <text x={g.title[0]} y={g.title[1]} className="k-svg-display" style={{ fontSize: f.name }}>
        {g.titleText}
      </text>
      <WallStrip g={g} open={p.fwOpen} />
      <text x={g.fwLabel.x} y={g.fwLabel.y} textAnchor={g.fwLabel.anchor} className="k-svg-hand" style={{ fontSize: f.hand, fill: p.fwOpen ? 'var(--ink-2)' : 'var(--red)' }}>
        {p.fwOpen ? 'vatrozid' : 'vatrozid: DROP'}
      </text>
      {/* corridors */}
      <Rough shape={{ k: 'line', x1: g.rowPub.x0, y1: g.rowPub.y, x2: g.frame.x + g.frame.w - 12, y2: g.rowPub.y }} seed={9023} strokeWidth={1.2} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'line', x1: g.rowLo.x0, y1: g.rowLo.y, x2: g.frame.x + g.frame.w - 12, y2: g.rowLo.y }} seed={9024} strokeWidth={1.2} stroke="var(--ink-3)" />
      {g.wall.side === 'top' && <Rough shape={{ k: 'line', x1: g.wall.gap, y1: g.wall.at, x2: g.wall.gap, y2: g.rowPub.y }} seed={9025} strokeWidth={1.2} stroke="var(--ink-3)" />}
      <text x={g.rowPub.label[0]} y={g.rowPub.label[1]} className="k-svg-mono" style={{ fontSize: f.mono }}>
        {g.rowPub.ip}
      </text>
      <text x={g.rowPub.note[0]} y={g.rowPub.note[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: vps ? 'var(--ink-2)' : 'var(--orange)' }}>
        {g.rowPub.noteText}
      </text>
      <text x={g.rowLo.label[0]} y={g.rowLo.label[1]} className="k-svg-mono" style={{ fontSize: f.mono }}>
        127.0.0.1
      </text>
      <text x={g.rowLo.note[0]} y={g.rowLo.note[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
        lo · samo iznutra
      </text>

      {/* doors: solid and shaded when someone listens behind them, dashed when nobody does */}
      {(['pub', 'lo'] as const).map((row) =>
        [d22, d8000].map((x, i) => {
          const held = holds(x, row)
          return (
            <g key={`${row}${i}`}>
              <Rough shape={doorRect(x, row)} seed={9030 + i + (row === 'lo' ? 4 : 0)} strokeWidth={held ? 1.7 : 1.3} stroke={held ? 'var(--ink)' : 'var(--ink-3)'} dash={held ? undefined : '4 4'} fillColor={held ? 'var(--paper-2)' : undefined} fillStyle="solid" />
              <text x={x} y={doorY(row) + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f.mono, fill: held ? 'var(--ink)' : 'var(--ink-3)' }}>
                {i === 0 ? ':22' : ':8000'}
              </text>
            </g>
          )
        }),
      )}

      {/* processes and the doors they hold */}
      {vps && (
        <g>
          <Rough shape={{ k: 'line', x1: d22, y1: g.procY, x2: d22, y2: g.rowPub.y + dh / 2 }} seed={9041} strokeWidth={2} />
          <Rough shape={{ k: 'line', x1: d22, y1: g.procY + g.procH, x2: d22, y2: g.rowLo.y - dh / 2 }} seed={9042} strokeWidth={2} />
          <Rough shape={{ k: 'rect', ...procBox(d22, dw + 4) }} seed={9043} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <text x={d22} y={g.procY + g.procH / 2 + 6} textAnchor="middle" className="k-svg-display" style={{ fontSize: f.name - 2 }}>
            sshd
          </text>
        </g>
      )}
      {pubBound && <Rough shape={{ k: 'line', x1: d8000, y1: g.procY, x2: d8000, y2: g.rowPub.y + dh / 2 }} seed={9044} strokeWidth={2} />}
      <Rough shape={{ k: 'line', x1: d8000, y1: g.procY + g.procH, x2: d8000, y2: g.rowLo.y - dh / 2 }} seed={9045} strokeWidth={2} />
      <Rough shape={{ k: 'rect', ...procBox(d8000, 100) }} seed={9046} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <text x={d8000} y={g.procY + g.procH / 2 + 6} textAnchor="middle" className="k-svg-display" style={{ fontSize: f.name - 1 }}>
        gunicorn
      </text>
      {clash && (
        <g>
          <Rough shape={{ k: 'line', x1: d8000, y1: g.clashY, x2: d8000, y2: g.rowLo.y + dh / 2 }} seed={9047} strokeWidth={2} stroke="var(--red)" dash="4 4" />
          <Rough shape={{ k: 'rect', ...procBox(d8000, 100), y: g.clashY }} seed={9048} strokeWidth={1.8} stroke="var(--red)" dash="5 4" fillColor="var(--paper)" fillStyle="solid" />
          <text x={d8000} y={g.clashY + g.procH / 2 + 6} textAnchor="middle" className="k-svg-display" style={{ fontSize: f.name - 1, fill: 'var(--red)' }}>
            gunicorn #2
          </text>
          <text x={g.clashLabel[0]} y={g.clashLabel[1]} textAnchor="end" className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--red)' }}>
            zauzeto!
          </text>
        </g>
      )}

      {/* who sends */}
      <Petra x={g.petraOut.x} y={g.petraOut.y} scale={g.petraOut.s} holding="phone" mood={p.sender === 'outside' && done ? (k.outcome === 'ok' ? 'grin' : 'worry') : 'smile'} />
      {g.petraOutLabel && (
        <text x={g.petraOutLabel[0]} y={g.petraOutLabel[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
          <tspan x={g.petraOutLabel[0]}>Petra</tspan>
          <tspan x={g.petraOutLabel[0]} dy={f.hand}>
            mobilni podatci
          </tspan>
        </text>
      )}
      {g.petraWifi && (
        <g>
          <Petra x={g.petraWifi.x} y={g.petraWifi.y} scale={g.petraWifi.s} holding="phone" seed={77} mood={p.sender === 'wifi' && done ? (k.outcome === 'ok' ? 'grin' : 'worry') : 'smile'} />
          <text x={g.petraWifi.label[0]} y={g.petraWifi.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
            <tspan x={g.petraWifi.label[0]}>Petra</tspan>
            <tspan x={g.petraWifi.label[0]} dy={f.hand}>
              Wi-Fi
            </tspan>
          </text>
        </g>
      )}
      <MiniLaptop x={g.lanaLaptop.x} y={g.lanaLaptop.y} w={g.lanaLaptop.w} h={g.lanaLaptop.h} seed={9050} />
      <text x={g.lanaLabel[0]} y={g.lanaLabel[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
        {g.lanaText}
      </text>

      {/* the request */}
      {!clash && <Road pts={route} seed={9060} active={!arrived} faint={arrived} />}
      {arrived && k.outcome === 'refused' && <RefusedBurst x={route[route.length - 1][0] + 8} y={route[route.length - 1][1] - 22} r={14} />}
      {arrived && k.outcome === 'timeout' && (
        <g>
          <HollowClock x={clock.at[0]} y={clock.at[1]} r={16} progress={Math.min(1, (t - travel) / WAIT)} expired={done} />
          {done && (
            <text x={clock.label[0]} y={clock.label[1]} textAnchor={clock.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: 'var(--red)' }}>
              istek vremena
            </text>
          )}
        </g>
      )}
      {tray && <TraySprite x={tray.at[0]} y={tray.at[1]} w={g.tray} tone={tray.tone} label={tray.label} size={f.hand} trayHref={ids.tray} faded={tray.faded} labelDy={-g.tray * 0.62} />}
    </svg>
  )
}

/** The firewall: a hatched strip along the outer wall with one door (gap) at the public row — bricked when it drops. */
function WallStrip({ g, open }: { g: DoorsGeo; open: boolean }) {
  const half = 20
  const { side, at, from, to, gap } = g.wall
  const r = (a: number, b: number) => (side === 'left' ? { x: at - 8, y: a, w: 16, h: b - a } : { x: a, y: at - 8, w: b - a, h: 16 })
  return (
    <g>
      <Rough shape={{ k: 'rect', ...r(from, gap - half) }} seed={9070} strokeWidth={1.5} fillColor="var(--ink-3)" hachureGap={4} />
      <Rough shape={{ k: 'rect', ...r(gap + half, to) }} seed={9071} strokeWidth={1.5} fillColor="var(--ink-3)" hachureGap={4} />
      {!open && <Rough shape={{ k: 'rect', ...r(gap - half, gap + half) }} seed={9072} strokeWidth={1.7} stroke="var(--red)" fillColor="var(--red)" fillStyle="cross-hatch" hachureGap={4} />}
    </g>
  )
}

const SENDERS: { value: Sender; label: string }[] = [
  { value: 'inside', label: 'Lana, s istog računala' },
  { value: 'outside', label: 'Petra, preko interneta' },
  { value: 'wifi', label: 'Petra, ista Wi-Fi mreža' },
]

export function DoorsLab() {
  const [p, setP] = useState<DoorsParams>({ host: 'vps', sender: 'outside', bind: '127.0.0.1', fwOpen: true })
  const [shot, setShot] = useState(1)
  const [clash, setClash] = useState(false)
  const [seen, setSeen] = useState({ outsideOk: false, insideLoopback: false, natTried: false, clash: false })
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 615 /* 760 × 17 / 21: Caveat 21 stays ≥ 17 px */
  const k = knock(p)

  const fire = (next: DoorsParams) => {
    setP(next)
    setClash(false)
    setShot((n) => n + 1)
    const r = knock(next)
    setSeen((s) => ({
      ...s,
      outsideOk: s.outsideOk || (next.sender === 'outside' && r.outcome === 'ok'),
      insideLoopback: s.insideLoopback || (next.sender === 'inside' && next.bind === '127.0.0.1'),
      natTried: s.natTried || (next.host === 'laptop' && next.sender === 'outside' && next.bind === '0.0.0.0'),
    }))
  }
  const set = (patch: Partial<DoorsParams>) => {
    const next = { ...p, ...patch }
    if (!senderValid(next.host, next.sender)) next.sender = 'outside'
    fire(next)
  }
  const startSecond = () => {
    setClash(true)
    setShot((n) => n + 1)
    setSeen((s) => ({ ...s, clash: true }))
  }

  const tone = clash ? 'bad' : k.outcome === 'ok' ? 'ok' : 'bad'
  return (
    <SimFrame
      title="tko sluša na kojim vratima"
      subtitle="Jedno računalo, dvije adrese: javna (ili kućna Wi-Fi) i 127.0.0.1. Proces drži vrata na kojima sluša."
      hint="gunicorn sluša na zadanoj adresi i Petra dobiva odbijenu vezu. Promijenite --bind, vatrozid i pošiljatelja, pa probajte isto s laptopom iza kućnog usmjerivača."
      minHeight={260}
      controls={
        <>
          <Segmented
            label="Računalo"
            size="sm"
            value={p.host}
            options={[
              { value: 'vps' as DoorHost, label: 'VPS (javna adresa)' },
              { value: 'laptop' as DoorHost, label: 'Lanin laptop (NAT)' },
            ]}
            onChange={(v) => set({ host: v })}
          />
          <Segmented
            label="gunicorn --bind"
            size="sm"
            value={p.bind}
            options={[
              { value: '127.0.0.1' as Bind, label: '127.0.0.1:8000' },
              { value: '0.0.0.0' as Bind, label: '0.0.0.0:8000' },
            ]}
            onChange={(v) => set({ bind: v })}
          />
          <Segmented label="Tko šalje" size="sm" value={p.sender} options={SENDERS.filter((s) => senderValid(p.host, s.value))} onChange={(v) => set({ sender: v })} />
          <Toggle label="Vatrozid propušta port 8000" checked={p.fwOpen} onChange={(v) => set({ fwOpen: v })} hint={p.fwOpen ? 'pravilo: allow 8000/tcp' : 'paketi na 8000 tiho nestaju (DROP)'} />
          <div className={styles.buttonRow}>
            <Button variant="primary" size="sm" icon={Play} onClick={() => fire(p)}>
              Pošalji zahtjev
            </Button>
            <Button variant="danger" size="sm" icon={Zap} onClick={startSecond}>
              Pokreni još jedan gunicorn
            </Button>
          </div>
        </>
      }
      stats={
        <Goals
          goals={[
            { text: 'Neka Petra preko interneta dobije 200 OK.', done: seen.outsideOk },
            { text: 'Pokažite da s istog računala radi i s --bind 127.0.0.1.', done: seen.insideLoopback },
            { text: 'Dokažite da laptopu iza NAT-a ni 0.0.0.0 ne pomaže Petri na mobitelu.', done: seen.natTried },
            { text: 'Pokrenite drugi gunicorn na istom portu.', done: seen.clash },
          ]}
        />
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <div className={styles.urlbar}>
          <span className={styles.urlwho}>{clash ? 'Lana pokreće' : p.sender === 'inside' ? 'Lana upisuje' : 'Petra upisuje'}</span>
          <code className={styles.url}>{clash ? `gunicorn --bind ${p.bind}:8000 klopa.wsgi` : k.url}</code>
        </div>
        <div style={narrow ? { maxWidth: 460, width: '100%', margin: '0 auto' } : undefined}>
          <DoorsStage key={shot} p={p} clash={clash} narrow={narrow} />
        </div>
        <p className={styles.doorsResult} data-tone={tone} aria-live="polite">
          {clash ? (
            <>
              <b>✗ Address already in use.</b> Drugi gunicorn ne može se pokrenuti: na {p.bind}:8000 već netko sluša. Iza jedne adrese i porta po zadanom stoji jedan proces.
            </>
          ) : (
            <>
              <b>
                {k.outcome === 'ok' ? '✓' : '✗'} {k.head}.
              </b>{' '}
              {k.text}
            </>
          )}
        </p>
      </div>
    </SimFrame>
  )
}
