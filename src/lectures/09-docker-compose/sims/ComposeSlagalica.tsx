import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { Button, ControlGroup, Diagram, DLabel, EventLog, fmt, Goals, Packet, plural, Rough, RoughBox, Segmented, Select, SimFrame, Stat, StatRow, SvgStamp, Toggle, useSimulation, useWidth } from '../../../kit'
import * as M from '../model'
import { changedLine, composeYaml } from '../yaml'
import { edgeOf, inRect, MEDIUM, MEDIUM_MIN, NARROW, WIDE, WIDE_MIN, type Pt } from '../slagalicaGeo'
import { BrowserDoodle, Door, LinkLine, SelfLoop, ServiceCard, VolumeThing } from './SlagalicaParts'
import styles from '../styles.module.css'

const MOUNT_OPTIONS: { value: M.Mount; label: string }[] = [
  { value: 'anon', label: 'bez volumena (anonimni)' },
  { value: 'named', label: 'imenovani pgdata → /var/lib/postgresql' },
  { value: 'named-old', label: 'imenovani, stara putanja …/data (ne kreće)' },
  { value: 'bind', label: 'bind mount ./pgdata' },
  { value: 'tmpfs', label: 'tmpfs (RAM)' },
]

const PRESET_OPTIONS: { value: M.PresetId; label: string }[] = [
  { value: 'ivin-readme', label: 'ivin-readme · seed 9 (incident)' },
  { value: 'dobar-compose', label: 'dobar-compose · seed 9' },
]

const PORTS = ['8080', '8000', '5432'] as const

/** marks in front of the short log under the drawing (the same as the kit's EventLog) */
const MARK: Record<string, string> = { ok: '✓', warn: '!', bad: '✗', info: '→', neutral: '·' }
/** tray speed of the „Osvježi” request (viewBox units per second; the same on every route) */
const TRAY_SPEED = 260

interface Drag {
  svc: M.SvcId
  start: Pt
  p: Pt
  moved: boolean
}

function toSvg(e: RPointerEvent<SVGGElement>): Pt | null {
  const svg = e.currentTarget.ownerSVGElement
  const m = svg?.getScreenCTM()
  if (!svg || !m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return [p.x, p.y]
}

/** Flagship: „Compose slagalica” — the whole of Klopa on one computer, described by a live compose.yaml. */
export function ComposeSlagalica() {
  const reduce = useReducedMotion()
  const sim = useSimulation<M.State>({ init: () => M.createState('ivin-readme'), step: (s, dt) => M.step(s, dt), fixedDt: M.FIXED_DT })
  const s = sim.state
  const [sel, setSel] = useState<M.SvcId>('api')
  const [port, setPort] = useState<M.BrowsePort>(8080)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [explainOpen, setExplainOpen] = useState(false)
  const [yamlPref, setYamlPref] = useState<boolean | null>(null)
  const [sent, setSent] = useState(0)
  const [ref, w] = useWidth<HTMLDivElement>()
  const yamlRef = useRef<HTMLDivElement>(null)
  const layout = w === null || w >= WIDE_MIN ? 'wide' : w >= MEDIUM_MIN ? 'medium' : 'narrow'
  const wide = layout === 'wide'
  const G = layout === 'wide' ? WIDE : layout === 'medium' ? MEDIUM : NARROW
  const off = s.host === 'off'
  // the live file is open beside the drawing on wide sheets; on tablets and phones it starts folded
  const yamlOpen = yamlPref ?? wide

  useEffect(() => {
    const box = yamlRef.current
    const el = box?.querySelector<HTMLElement>(`[data-svc="${sel}"]`)
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: reduce ? 'auto' : 'smooth' })
  }, [sel, reduce, yamlOpen])

  const act = (fn: (x: M.State) => void) => {
    sim.mutate(fn)
    if (!sim.running) sim.play()
  }
  const edit = (fn: (c: M.Config) => void, text: string) =>
    sim.mutate((x) => {
      fn(x.cfg)
      M.note(x, `compose.yaml: ${text}`)
    })
  const setNet = (svc: M.SvcId, net: M.NetId) => edit((c) => (c.net[svc] = net), net === 'bridge' ? `${svc} → network_mode: bridge` : `${svc} → mreža klopa_default`)

  // drag a service between networks (pointer); keyboard users pick the network in the panel
  const onDown = (svc: M.SvcId) => (e: RPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return
    const p = toSvg(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ svc, start: p, p, moved: false })
  }
  const onMove = (e: RPointerEvent<SVGGElement>) => {
    if (!drag) return
    const p = toSvg(e)
    if (!p) return
    setDrag({ ...drag, p, moved: drag.moved || Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > 6 })
  }
  const onUp = () => {
    if (!drag) return
    const d = drag
    setDrag(null)
    setSel(d.svc)
    if (!d.moved) return
    const target: M.NetId | null = inRect(d.p, G.regions.bridge) ? 'bridge' : inRect(d.p, G.regions.default) ? 'default' : null
    if (target && target !== s.cfg.net[d.svc]) setNet(d.svc, target)
  }
  const dropTarget: M.NetId | null = drag?.moved ? (inRect(drag.p, G.regions.bridge) ? 'bridge' : inRect(drag.p, G.regions.default) ? 'default' : null) : null

  const pos = (svc: M.SvcId): Pt => G.slot[s.cfg.net[svc]][svc]
  const size = (svc: M.SvcId) => G.card[s.cfg.net[svc]]
  const b = M.browse(s, port)
  const rows = M.dbRows(s)
  const dangling = M.danglingCount(s)
  const running = M.SERVICES.filter((v) => s.containers[v]?.state === 'running').length
  const pending = M.needsUp(s)
  const nothing = Object.keys(s.containers).length === 0
  const selC = s.containers[sel]
  const lines = composeYaml(s.cfg)

  // where the data of db lives (in-use first, then dangling)
  const vols = [...s.volumes].sort((a, c) => Number(c.inUse) - Number(a.inUse))
  const shown = vols.slice(0, G.shelf.length)
  const volAt = (id: string | null): Pt | null => {
    const i = shown.findIndex((v) => v.id === id)
    return i < 0 ? null : G.shelf[i]
  }
  const db = s.containers.db

  const doorFor = (p: string) => M.SERVICES.filter((v) => s.cfg.ports[v] !== 'none' && s.cfg.ports[v].split(':')[0] === p)
  const holderOf = (p: string) => M.SERVICES.find((v) => {
    const c = s.containers[v]
    return M.procUp(c) && c.applied.ports !== 'none' && c.applied.ports.split(':')[0] === p
  })

  const label = `Jedno računalo s Klopom: ${running} od 6 kontejnera radi${off ? ', računalo je ugašeno' : ''}. Preglednik na localhost:${port} dobiva ${b.detail}. ${rows === null ? 'Baza ne radi.' : `U bazi ${plural(rows, ['je', 'su', 'je'], false)} ${M.nar(rows)}.`}`

  // one request from the browser („Osvježi”): through the door, then web → api → db, stopping at the first hop that fails
  const edge = (a: M.SvcId, c: M.SvcId): Pt => edgeOf(pos(a), pos(c), size(a).w, size(a).h, 2)
  const browserDoor = G.doors[String(port) as '8080' | '8000']
  const browserFrom: Pt = G.vertical ? [browserDoor[0], G.browser.y + G.browser.h] : [G.browser.x + G.browser.w, G.browser.y + G.browser.h / 2]
  const trayPath: Pt[] = (() => {
    const path: Pt[] = [browserFrom, browserDoor]
    const holder = holderOf(String(port))
    if (b.code === 'refused' || !holder) return path
    const at = pos(holder)
    const sz = size(holder)
    path.push(G.vertical ? [at[0] - sz.w / 4, at[1] - sz.h / 2 - 4] : [at[0] - sz.w / 2 - 4, at[1] - sz.h / 4])
    if (b.code === 'reset' || b.code === '502') return path
    if (holder === 'web') path.push(edge('web', 'api'), edge('api', 'web'))
    if (b.code === '200') path.push(edge('api', 'db'), edge('db', 'api'))
    return path
  })()
  const trayLen = trayPath.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - trayPath[i - 1][0], p[1] - trayPath[i - 1][1]) : 0), 0)
  const apiTwoLines = !!s.containers.api && (s.containers.api.state === 'exited' || s.containers.api.state === 'backoff') && s.cfg.net.api === 'default'

  const stage = (
    <Diagram width={G.W} height={G.H} label={label} interactive>
      {/* the host: one computer with Docker Engine */}
      <rect x={G.host.x} y={G.host.y} width={G.host.w} height={G.host.h} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', ...G.host }} seed={9001} strokeWidth={2.2} roughness={1.2} stroke={off ? 'var(--red)' : 'var(--ink)'} multi />
      <DLabel x={G.host.x + 14} y={G.host.y + 24} text="kontejneri iza zida · Docker Engine" size={G.hand} anchor="start" bold />
      {!G.vertical && (
        <>
          <DLabel x={G.browser.x + 2} y={G.browser.y + G.browser.h + 22} text="preglednik" size={G.hand} anchor="start" tone="neutral" />
          <DLabel x={G.browser.x + 2} y={G.browser.y + G.browser.h + 44} text="na računalu" size={G.hand} anchor="start" tone="neutral" />
        </>
      )}

      {/* networks as regions */}
      {(['default', 'bridge'] as const).map((n) => {
        const r = G.regions[n]
        const hot = dropTarget === n
        return (
          <g key={n}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={4} style={{ fill: n === 'default' ? 'color-mix(in srgb, var(--pen) 8%, transparent)' : 'color-mix(in srgb, var(--ink-3) 9%, transparent)' }} />
            <Rough shape={{ k: 'rect', ...r }} seed={n === 'default' ? 9011 : 9012} stroke={n === 'default' ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={hot ? 2.6 : 1.5} dash={hot ? undefined : '7 6'} roughness={1.2} />
            <DLabel x={G.regionLabel[n][0]} y={G.regionLabel[n][1]} text={n === 'default' ? 'klopa_default · DNS po imenu ✓' : 'bridge (zadana) · bez DNS-a ✗'} size={G.hand} anchor="start" tone={n === 'default' ? 'blue' : 'neutral'} bold />
          </g>
        )
      })}

      {/* published ports: doors in the host wall, and a dashed tunnel to the container behind them */}
      {PORTS.map((p) => {
        const claim = doorFor(p)
        const holder = holderOf(p)
        return (
          <g key={p}>
            {claim.map((v) => {
              const at = pos(v)
              const sz = size(v)
              const door = G.doors[p]
              const end: Pt = G.vertical ? [at[0] - sz.w / 4, at[1] - sz.h / 2 - 4] : [at[0] - sz.w / 2 - 4, at[1] - sz.h / 4]
              const lost = !!holder && holder !== v
              return (
                <Rough
                  key={v}
                  shape={{ k: 'lin', pts: G.vertical ? [door, [door[0], door[1] + 14], end] : [door, [door[0] + 12, door[1]], end] }}
                  seed={9020 + Number(p) % 13 + v.length}
                  stroke={lost ? 'var(--red)' : 'var(--pen)'}
                  strokeWidth={1.5}
                  dash={holder === v ? undefined : '5 5'}
                  roughness={0.7}
                />
              )
            })}
            <Door at={G.doors[p]} port={p} vertical={G.vertical} open={claim.length > 0} size={G.small} />
          </g>
        )
      })}

      {/* the browser on the host and its route to the door */}
      {(() => {
        const door = G.doors[String(port) as '8080' | '8000']
        const from: Pt = G.vertical ? [door[0], G.browser.y + G.browser.h] : [G.browser.x + G.browser.w, G.browser.y + G.browser.h / 2]
        const hasDoor = doorFor(String(port)).length > 0
        const to: Pt = G.vertical ? [door[0], door[1] - (hasDoor ? 6 : 2)] : [door[0] - (hasDoor ? 6 : 2), door[1]]
        return (
          <g>
            <Rough shape={{ k: 'lin', pts: G.vertical ? [from, to] : [from, [from[0] + 6, from[1]], [to[0] - 6, to[1]], to] }} seed={9031} stroke={b.ok ? 'var(--green)' : 'var(--red)'} strokeWidth={1.6} dash={b.ok ? undefined : '6 5'} roughness={0.7} />
            {!hasDoor && !off && <Rough shape={{ k: 'line', x1: to[0] - 7, y1: to[1] - 7, x2: to[0] + 7, y2: to[1] + 7 }} seed={9032} stroke="var(--red)" strokeWidth={2} />}
          </g>
        )
      })()}
      <BrowserDoodle x={G.browser.x} y={G.browser.y} w={G.browser.w} h={G.browser.h} address={`localhost:${port}`} code={b.code} ok={b.ok} size={G.small} mono={G.mono} wideLayout={!G.vertical} />

      {/* who talks to whom (the drawing shows the file; blue = connected right now) */}
      {M.LINKS.map(([a, c], i) => {
        if (a === 'api' && c === 'db' && s.cfg.dbHost === 'localhost') return null
        const pa = pos(a)
        const pc = pos(c)
        const sa = size(a)
        const sc = size(c)
        const fileOk = s.cfg.net[a] === 'default' && s.cfg.net[c] === 'default'
        const tone = !fileOk ? 'bad' : M.reaches(s, a, c) ? 'ok' : 'idle'
        const from = edgeOf(pa, pc, sa.w, sa.h + (a === 'api' || a === 'web' || a === 'worker' ? 40 : 0))
        const to = edgeOf(pc, pa, sc.w, sc.h)
        const isDb = a === 'api' && c === 'db'
        // „db:5432” a quarter of the way from api, beside the line; hidden while api's card shows a reason under it (a red ✗ says the rest)
        const q: Pt = [from[0] + (to[0] - from[0]) * 0.25, from[1] + (to[1] - from[1]) * 0.25]
        const showDbLabel = isDb && tone !== 'bad' && !apiTwoLines
        return <LinkLine key={i} from={from} to={to} tone={tone} seed={9040 + i} size={G.small} crossT={isDb ? 0.35 : 0.5} label={showDbLabel ? 'db:5432' : undefined} labelAt={showDbLabel ? [q[0] + (G.vertical ? 40 : 46), q[1] + 4] : undefined} />
      })}
      {s.cfg.dbHost === 'localhost' && <SelfLoop at={pos('api')} w={size('api').w} h={size('api').h} size={G.small} vertical={G.vertical} />}

      {/* where the rows live */}
      <DLabel x={G.shelfLabel[0]} y={G.shelfLabel[1]} text={G.vertical ? 'podatci izvan kontejnera' : 'podatci izvan kontejnera (disk računala)'} size={G.hand} anchor="start" bold />
      {db &&
        [db.vol, db.extraVol].map((id, k) => {
          const at = volAt(id)
          if (!at) return null
          const from = pos('db')
          const sz = size('db')
          return <Rough key={k} shape={{ k: 'line', x1: from[0] + (k ? 18 : 0), y1: from[1] + sz.h / 2 + 2, x2: at[0], y2: at[1] - 2 }} seed={9050 + k} stroke={k ? 'var(--ink-3)' : 'var(--pen)'} strokeWidth={1.5} dash={k ? '4 5' : undefined} roughness={0.6} />
        })}
      {shown.map((v, i) => (
        <VolumeThing key={v.id} v={v} at={G.shelf[i]} w={G.cyl.w} h={G.cyl.h} size={G.small} />
      ))}
      {vols.length > shown.length && <DLabel x={G.host.x + G.host.w - 14} y={G.shelfLabel[1]} text={`+${vols.length - shown.length}`} size={G.hand} anchor="end" tone="neutral" />}
      {s.volumes.length === 0 && <DLabel x={G.shelf[0][0] - G.cyl.w / 2} y={G.shelf[0][1] + 30} text={G.vertical ? 'još ništa – tek nakon up' : 'još ništa – podatci nastaju s prvim compose up'} size={G.hand} anchor="start" tone="neutral" />}

      {/* the six services */}
      {M.SERVICES.map((v) => (
        <ServiceCard
          key={v}
          svc={v}
          at={drag?.svc === v && drag.moved ? pos(v) : pos(v)}
          w={size(v).w}
          h={size(v).h}
          c={s.containers[v]}
          changed={!s.containers[v] || M.changedKeys(s, v).length > 0}
          selected={sel === v}
          compact={s.cfg.net[v] === 'bridge'}
          mono={s.cfg.net[v] === 'bridge' ? G.small : G.mono}
          small={G.small}
          hostOff={off}
          onSelect={() => setSel(v)}
          onPointerDown={onDown(v)}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      ))}
      {drag?.moved && <ServiceCard svc={drag.svc} at={drag.p} w={size(drag.svc).w} h={size(drag.svc).h} c={s.containers[drag.svc]} changed selected={false} compact={false} mono={G.mono} small={G.small} hostOff={off} ghost />}

      {sent > 0 && !off && trayPath.length > 1 && <Packet key={sent} path={trayPath} duration={Math.max(0.6, trayLen / TRAY_SPEED)} tone={b.ok ? undefined : 'bad'} />}

      {off && (
        <g aria-hidden="true">
          <Rough shape={{ k: 'rect', x: G.host.x + 6, y: G.host.y + 6, w: G.host.w - 12, h: G.host.h - 12 }} seed={9061} stroke="transparent" fillColor="var(--ink-3)" hachureGap={16} fillWeight={0.8} />
          <SvgStamp x={G.stamp[0]} y={G.stamp[1]} text="UGAŠENO" tone="red" size={wide ? 26 : 20} />
        </g>
      )}
    </Diagram>
  )

  return (
    <SimFrame
      title="Compose slagalica"
      subtitle="Cijela Klopa na jednom računalu: šest kontejnera, mreže, vrata i volumeni – opisani jednom datotekom."
      sim={sim}
      showTime
      hint={
        <>
          Popravite Ivin <code>compose.yaml</code>: Klopa se mora otvoriti na <code>localhost:8080</code>, a narudžbe preživjeti <code>compose down</code> i <code>docker rm db</code>. Servise vucite između mreža ili ih birajte u ploči; izmjene vrijede tek nakon{' '}
          <code>compose up</code>.
        </>
      }
      controls={
        <>
          <ControlGroup title="Servis u datoteci">
            <Select label="Odabrani servis" value={sel} options={M.SERVICES.map((v) => ({ value: v, label: v }))} onChange={(v) => setSel(v)} />
            <Segmented
              label="Mreža"
              size="sm"
              value={s.cfg.net[sel]}
              options={[
                { value: 'default', label: 'klopa_default' },
                { value: 'bridge', label: 'bridge (zadana)' },
              ]}
              onChange={(n) => setNet(sel, n)}
            />
            {M.PORT_OPTIONS[sel].length > 1 && (
              <Segmented
                label="ports"
                size="sm"
                value={s.cfg.ports[sel]}
                options={M.PORT_OPTIONS[sel].map((p) => ({ value: p, label: p === 'none' ? 'bez' : p }))}
                onChange={(p) => edit((c) => (c.ports[sel] = p), p === 'none' ? `${sel}: bez ports` : `${sel}: ports "${p}"`)}
              />
            )}
            {sel === 'api' && (
              <Segmented
                label="DATABASE_HOST"
                size="sm"
                value={s.cfg.dbHost}
                options={[
                  { value: 'db', label: 'db' },
                  { value: 'localhost', label: 'localhost' },
                ]}
                onChange={(h) => edit((c) => (c.dbHost = h), `api: DATABASE_HOST=${h}`)}
              />
            )}
            {sel === 'db' && <Select label="Podatci baze" value={s.cfg.mount} options={MOUNT_OPTIONS} onChange={(m) => edit((c) => (c.mount = m), `db: ${MOUNT_OPTIONS.find((o) => o.value === m)?.label}`)} />}
          </ControlGroup>
          <ControlGroup title="Cijeli projekt">
            <Toggle
              label={
                <>
                  <code>depends_on</code>: <code>service_healthy</code>
                </>
              }
              checked={s.cfg.healthy}
              onChange={(v) => edit((c) => (c.healthy = v), v ? 'depends_on s condition: service_healthy' : 'depends_on bez uvjeta')}
              hint="api čeka da baza prođe provjeru ispravnosti"
            />
            <Toggle
              label={
                <>
                  <code>restart</code>: unless-stopped
                </>
              }
              checked={s.cfg.restart}
              onChange={(v) => edit((c) => (c.restart = v), v ? 'restart: unless-stopped' : 'bez restart pravila')}
              hint="ponovno pokreće kontejner – na ovom računalu"
            />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <div className={styles.btnGrid}>
              <Button variant="danger" onClick={() => act((x) => M.crash(x, sel))} disabled={off || !M.procUp(selC)} title={`Sruši kontejner ${sel}`}>
                Sruši kontejner
              </Button>
              {off ? (
                <Button variant="success" onClick={() => act(M.hostOn)}>
                  Upali računalo
                </Button>
              ) : (
                <Button variant="danger" onClick={() => act(M.hostOff)}>
                  Ugasi računalo
                </Button>
              )}
            </div>
            <p className={styles.selHint}>Ruši se odabrani servis: {sel}.</p>
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible>
            <Segmented
              label="gunicorn u kontejneru sluša na"
              size="sm"
              value={s.cfg.apiBind}
              options={[
                { value: '0.0.0.0', label: '0.0.0.0' },
                { value: '127.0.0.1', label: '127.0.0.1' },
              ]}
              onChange={(v) => edit((c) => (c.apiBind = v), `api: gunicorn -b ${v}:8000`)}
            />
            <div className={styles.btnGrid}>
              <Button size="sm" onClick={() => act(M.volumePrune)} disabled={off}>
                docker volume prune
              </Button>
            </div>
            <Select label="Preset" value={s.preset} options={PRESET_OPTIONS} onChange={(p) => sim.mutate((x) => M.loadPreset(x, p))} />
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label={`localhost:${port}`} value={b.code} tone={b.ok ? 'ok' : 'bad'} sub={b.ok ? 'odgovor stiže' : 'nema jelovnika'} />
            <Stat
              label="narudžbe u bazi"
              value={rows === null ? '—' : fmt.num(rows)}
              sub={s.lastCheck ? `stare nakon ${s.lastCheck.kind === 'rm' ? 'docker rm' : 'down'}: ${fmt.num(s.lastCheck.after)} od ${fmt.num(s.lastCheck.before)}` : `naručeno ukupno: ${fmt.num(s.orders)}`}
              tone={s.lastCheck && s.lastCheck.after < s.lastCheck.before ? 'bad' : rows === 0 && s.orders > 0 ? 'bad' : 'neutral'}
            />
            <Stat label="kontejneri Up" value={`${running} / 6`} tone={running === 6 ? 'ok' : running === 0 ? 'bad' : 'warn'} />
            <Stat label="viseći volumeni" value={String(dangling)} tone={dangling ? 'warn' : 'neutral'} sub={dangling ? 'stari podatci, bez kontejnera' : ' '} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Klopa se otvara u pregledniku (localhost:8080 → 200 OK).', done: s.seen.browser },
                { text: 'API pronalazi bazu po imenu (DATABASE_HOST: db).', done: s.seen.byName },
                {
                  text: `Narudžbe preživljavaju compose down i docker rm baze (down ${s.seen.survivedDown ? '✓' : '·'} · rm ${s.seen.survivedRm ? '✓' : '·'}).`,
                  done: s.seen.survivedDown && s.seen.survivedRm,
                },
                { text: 'Pokušajte preživjeti pad računala (Ugasi računalo, pa pročitajte objašnjenje).', done: s.seen.hostDown && s.seen.explained },
              ]}
            />
            <EventLog events={s.events} max={8} />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <div className={styles.browserRow}>
          <Segmented
            label="Preglednik na računalu otvara"
            size="sm"
            value={port}
            options={[
              { value: 8080, label: 'localhost:8080' },
              { value: 8000, label: 'localhost:8000' },
            ]}
            onChange={setPort}
          />
          <Button size="sm" onClick={() => setSent((n) => n + 1)} disabled={off} title="Pošalji jedan zahtjev iz preglednika">
            Osvježi
          </Button>
        </div>
        <div className={wide ? undefined : layout === 'medium' ? styles.mediumStage : styles.narrowStage}>{stage}</div>

        {/* the commands right under the drawing, so the student sees what they do */}
        <div className={styles.cmdRow} role="group" aria-label="Naredbe">
          <Button variant="primary" onClick={() => act(M.composeUp)} disabled={off}>
            compose up
          </Button>
          <Button onClick={() => act((x) => M.composeDown(x, false))} disabled={off || nothing}>
            compose down
          </Button>
          <Button onClick={() => act((x) => M.composeDown(x, true))} disabled={off || nothing}>
            compose down -v
          </Button>
          <Button onClick={() => act(M.removeDb)} disabled={off || !db}>
            docker rm -f klopa-db-1
          </Button>
        </div>
        <div className={styles.statusSlot}>
          <p className={styles.statusLine} aria-live="polite">
            <span className={b.ok ? styles.statusOk : styles.statusBad}>{b.ok ? '✓' : '✗'}</span>
            <span>
              <code>localhost:{port}</code> → {b.detail}
            </span>
          </p>
          <p className={styles.fileNote}>
            {off ? (
              <>Računalo je ugašeno – ne radi ništa, ni Docker.</>
            ) : nothing ? (
              <>Ništa još ne radi: pritisnite „compose up”.</>
            ) : pending ? (
              <>
                <span className={styles.bang} aria-hidden="true">
                  !
                </span>{' '}
                Datoteka se razlikuje od onoga što radi (crtkano) – vrijedi tek nakon „compose up”.
              </>
            ) : (
              <>Ono što radi odgovara datoteci.</>
            )}
          </p>
        </div>
        {s.events.length > 0 && (
          <ul className={styles.miniLog} aria-hidden="true">
            {s.events
              .slice(-2)
              .reverse()
              .map((e) => (
                <li key={e.id} className={e.tone === 'bad' ? styles.statusBad : e.tone === 'ok' ? styles.miniOk : undefined}>
                  <span className={styles.miniMark}>{MARK[e.tone ?? 'neutral']}</span>
                  {e.text}
                </li>
              ))}
          </ul>
        )}
        {s.seen.hostDown && (
          <RoughBox className={styles.explain} stroke="var(--red)" dash="7 5" seed={9071}>
            <Button
              size="sm"
              onClick={() => {
                setExplainOpen((o) => !o)
                if (!s.seen.explained) sim.mutate((x) => (x.seen.explained = true))
              }}
            >
              {explainOpen ? 'Sakrij objašnjenje' : 'Otvori objašnjenje: može li compose.yaml preživjeti pad računala?'}
            </Button>
            {explainOpen && (
              <>
                <p>
                  Ne može. <code>restart: unless-stopped</code> vraća kontejnere tek kad se <em>isto</em> računalo ponovno upali, a Docker ih tada pokreće sve odjednom, bez redoslijeda iz <code>depends_on</code>. Compose ne zna ni za jedno drugo računalo, pa nema kamo
                  premjestiti ni jedan kontejner.
                </p>
                <p>Za to trebaju barem dva računala i netko tko neprestano pazi što radi, a što ne – i sam premješta kontejnere. To je tema sljedećeg predavanja.</p>
              </>
            )}
          </RoughBox>
        )}
        <div className={styles.yamlHead}>
          <span className={styles.yamlTag}>compose.yaml</span>
          <small>uživo · kliknite ime servisa</small>
          <Button size="sm" variant="ghost" active={yamlOpen} onClick={() => setYamlPref(!yamlOpen)}>
            {yamlOpen ? 'Sakrij datoteku' : 'Prikaži datoteku'}
          </Button>
        </div>
        {yamlOpen && (
          <RoughBox className={styles.yamlBox} stroke="var(--ink-2)" seed={9081} pad={2}>
            <div className={styles.yaml} ref={yamlRef} role="region" aria-label="compose.yaml, uživo" tabIndex={0}>
              {lines.map((l, i) => {
                const cls = [styles.yamlLine, l.svc === sel ? styles.yamlSel : '', changedLine(s, l) ? styles.yamlChanged : '', l.comment ? styles.yamlComment : ''].filter(Boolean).join(' ')
                return (
                  <div key={i} className={cls} data-svc={l.head ? l.svc : undefined}>
                    <span className={styles.yamlNo} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className={styles.yamlText}>
                      {l.head && l.svc ? (
                        <>
                          {'  '}
                          <button type="button" className={styles.yamlSvc} onClick={() => setSel(l.svc!)} aria-pressed={sel === l.svc}>
                            {l.svc}
                          </button>
                          :
                        </>
                      ) : (
                        l.text
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </RoughBox>
        )}
        <p className={styles.timeNote}>
          Vrijeme je sažeto: Postgres je ovdje spreman za 5&nbsp;s (sim), a stanke prije ponovnog pokretanja su 1, 2, 4 i 8&nbsp;s (sim) – Docker stvarno kreće od 100&nbsp;ms i udvostručuje. Narudžbe stižu ubrzano.
        </p>
      </div>
    </SimFrame>
  )
}
