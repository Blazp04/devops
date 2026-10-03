import { Badge, DBar, Diagram, EventLog, Goals, PodShape, Redar, Rough, Segmented, ServerCard, ServiceTag, SimFrame, Slider, Stat, StatRow, StudentQueue, Toggle, fmt, hashSeed, pointAt, useDiagramIds, useSimulation, useWidth } from '../../../kit'
import { metrics, serversView, visibleFlights, type ServerView } from '../../../engines/traffic'
import { MACHINES, createRackSim, machineOf, machineShares, rackEvents, setParams, setRack, stepRackSim, type Machine, type RackKind, type RackSim } from '../rack'
import css from '../styles.module.css'

type Pt = [number, number]

interface Geo {
  W: number
  H: number
  narrow: boolean
  queue: Pt
  qCount: number
  front: Pt
  frontIn: Pt
  frames: { x: number; y: number; w: number; h: number }[]
  backendX0: number
  backendGap: number
  barX: number
  barW: number
  tagW: number
  /** narrow: the vertical lane (between the machine names and the bars) the trays take down to their machine */
  laneX: number | null
}

function geometry(narrow: boolean, lambda: number): Geo {
  const qCount = Math.max(2, Math.min(5, Math.round(lambda / 4)))
  if (!narrow)
    return {
      W: 760,
      H: 380,
      narrow,
      queue: [132, 330],
      qCount,
      front: [218, 200],
      frontIn: [160, 200],
      frames: [0, 1, 2].map((i) => ({ x: 290, y: 10 + i * 122, w: 462, h: 112 })),
      backendX0: 340,
      backendGap: 62,
      barX: 600,
      barW: 100,
      tagW: 112,
      laneX: null,
    }
  return {
    W: 400,
    H: 600,
    narrow,
    queue: [168, 204],
    qCount,
    front: [280, 128],
    frontIn: [218, 128],
    frames: [0, 1, 2].map((i) => ({ x: 6, y: 228 + i * 124, w: 388, h: 114 })),
    backendX0: 44,
    backendGap: 54,
    barX: 262,
    barW: 86,
    tagW: 120,
    laneX: 243,
  }
}

function mood(v: ServerView): 'calm' | 'busy' | 'panic' | 'dead' {
  if (v.proc !== 'up') return 'dead'
  if (v.cpuSmooth >= 0.95 || v.queue >= v.queueMax * 0.6) return 'panic'
  if (v.cpuSmooth >= 0.75) return 'busy'
  return 'calm'
}

function Flights({ st, g, pos }: { st: RackSim; g: Geo; pos: Map<string, Pt> }) {
  const ids = useDiagramIds()
  if (!ids) return null
  const lb = st.p.front === 'lb'
  const head: Pt = [g.queue[0] + 8, g.queue[1] - 56]
  return (
    <g aria-hidden="true">
      {visibleFlights(st.t).map(({ flight: f, progress }) => {
        if (f.dir !== 'in') return null
        const end = pos.get(f.to)
        // Service: along the tag's lower edge, so the trays never cover the word „Service”; narrow: down the free lane
        const fy = lb ? g.front[1] : g.front[1] + 22
        const out: Pt = lb ? g.front : [g.laneX ?? g.frontIn[0] + g.tagW, fy]
        const via: Pt[] = g.laneX !== null && end ? [[g.laneX, end[1] - 30]] : []
        const path: Pt[] = end ? [head, [g.frontIn[0], fy], out, ...via, end] : [head, [g.frontIn[0], fy], out]
        const [x, y] = pointAt(path, Math.min(1, Math.max(0, progress)))
        const bad = f.outcome !== 'ok' && f.outcome !== 'waiting'
        return <use key={f.id} href={ids.tray} x={x - 15} y={y - 10} width={30} height={20} style={{ fill: bad ? 'color-mix(in srgb, var(--red) 70%, var(--paper))' : 'var(--tray)' }} />
      })}
    </g>
  )
}

function Stage({ st, narrow }: { st: RackSim; narrow: boolean }) {
  const g = geometry(narrow, st.p.lambda)
  const views = serversView(st.t)
  const shares = machineShares(st)
  const pos = new Map<string, Pt>()
  const byMachine = new Map<Machine['key'], ServerView[]>()
  for (const v of views) {
    const k = machineOf(v.id, st.p.rack, v.meta)
    byMachine.set(k, [...(byMachine.get(k) ?? []), v])
  }
  const lb = st.p.front === 'lb'
  const hand = narrow ? 21.5 : 18
  const mono = narrow ? 15 : 13
  return (
    <Diagram
      width={g.W}
      height={g.H}
      label={`${st.p.lambda} zahtjeva u sekundi ide kroz ${lb ? 'klasični load balancer (najmanje veza)' : 'Kubernetes Service (nasumično po vezi)'} na ${st.p.rack === 'l04' ? 'tri poslužitelja različite veličine' : 'sedam jednakih Podova na tri stroja'}.`}
    >
      <text x={narrow ? 16 : 14} y={narrow ? 34 : 150} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--tray-ink)' }}>
        {st.p.lambda} zahtjeva/s{st.p.nat ? ' · jedan NAT' : ''}
      </text>
      <StudentQueue x={g.queue[0]} y={g.queue[1]} count={g.qCount} scale={0.55} tap={st.p.lambda >= 20} />
      {lb ? (
        <g>
          <Redar x={g.front[0]} y={g.front[1] + 22} scale={0.6} sweat={Math.min(3, Math.round(Math.max(...views.map((v) => v.queue / Math.max(1, v.queueMax))) * 3))} />
          <text x={g.front[0]} y={g.front[1] + 82} textAnchor="middle" className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            najmanje veza
          </text>
        </g>
      ) : (
        <g>
          <ServiceTag x={g.frontIn[0]} y={g.front[1] - 26} w={g.tagW} h={52} seed={4531}>
            <text x={g.frontIn[0] + 22} y={g.front[1] + 5} className="k-svg-display" style={{ fontSize: mono + 2 }}>
              Service
            </text>
          </ServiceTag>
          <text x={narrow ? 396 : g.frontIn[0] + 56} y={g.front[1] + 50} textAnchor={narrow ? 'end' : 'middle'} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            {st.p.nat ? 'ClientIP: isti Pod' : 'nasumično po vezi'}
          </text>
        </g>
      )}
      {MACHINES.map((m, i) => {
        const f = g.frames[i]
        const list = byMachine.get(m.key) ?? []
        const cpu = list.length ? list.reduce((a, v) => a + v.cpuSmooth, 0) / list.length : 0
        return (
          <g key={m.key}>
            <Rough shape={{ k: 'rect', x: f.x, y: f.y, w: f.w, h: f.h }} seed={hashSeed(`rack-frame|${m.key}|${narrow}`)} stroke="var(--ink-2)" strokeWidth={1.6} />
            <text x={f.x + 12} y={f.y + 24} className="k-svg-display" style={{ fontSize: mono + 2 }}>
              {m.name}
              <tspan className="k-svg-mono" style={{ fontSize: mono, fontWeight: 400, fill: 'var(--ink-2)' }}>
                {'  '}
                {m.spec}
              </tspan>
            </text>
            {st.p.rack === 'l04'
              ? list.map((v) => {
                  const c: Pt = [g.backendX0 + (narrow ? 30 : 20), f.y + 70]
                  // narrow: trays come from the lane on the right, so they land on the card's right edge
                  pos.set(v.id, [narrow ? c[0] + 46 : c[0] - 46, c[1]])
                  return <ServerCard key={v.id} x={c[0] - 46} y={f.y + 38} w={92} h={64} mood={mood(v)} down={v.proc !== 'up'} seed={hashSeed(`card|${v.id}`)} />
                })
              : list.map((v, j) => {
                  const c: Pt = [g.backendX0 + j * g.backendGap, f.y + 74]
                  pos.set(v.id, [narrow ? c[0] + 18 : c[0] - 22, c[1]])
                  return <PodShape key={v.id} x={c[0]} y={c[1]} size={30} status={v.proc === 'up' ? 'running' : 'crash'} tone="blue" ariaLabel={`Pod ${v.name} na stroju ${m.name}`} />
                })}
            <text x={g.barX} y={f.y + 48} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--tray-ink)' }}>
              promet {fmt.pct(shares[m.key], 0)}
            </text>
            <DBar x={g.barX} y={f.y + 54} w={g.barW} h={10} value={shares[m.key]} tone="orange" />
            <text x={g.barX} y={f.y + 86} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
              CPU {fmt.pct(cpu, 0)}
            </text>
            <DBar x={g.barX} y={f.y + 92} w={g.barW} h={10} value={cpu} />
          </g>
        )
      })}
      <Flights st={st} g={g} pos={pos} />
    </Diagram>
  )
}

/** Scene 5: the L04 rack behind a classic LB or behind a Service (E1 engine, Service mode). */
export function RackService() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const sim = useSimulation<RackSim>({
    init: () => createRackSim({ rack: 'l04', front: 'service', lambda: 15, nat: false }),
    step: (st, dt) => stepRackSim(st, dt),
  })
  const st = sim.state
  const m = metrics(st.t)
  const narrow = w === null || w < 640
  const p = st.p
  const goals = [
    { text: 'Usporedite greške pri 15 zahtjeva/s: klasični LB i Service pred poslužiteljima iz 4. predavanja (po 20 s)', done: st.errLb !== null && st.errSvc !== null },
    { text: 'Pokažite kako veći stroj ipak dobije više prometa (7 jednakih Podova, Service)', done: st.bigShare !== null && st.bigShare >= 0.45 },
    { text: 'Uključite NAT kampusa (sessionAffinity: ClientIP) i pogledajte kamo ide sav promet', done: st.natDone },
  ]
  return (
    <SimFrame
      title="Service nije klasični load balancer"
      sim={sim}
      showTime
      hint="Usporedite Service i redara (klasični LB iz 4. predavanja) po 20 s pri 15 zahtjeva/s, zatim stavite 7 jednakih Podova na iste strojeve."
      toolbar={<Badge tone="neutral">seed 42</Badge>}
      controls={
        <>
          <Segmented
            label="Ispred poslužitelja"
            value={p.front}
            options={[
              { value: 'lb', label: 'Klasični LB (4. pred.)' },
              { value: 'service', label: 'Kubernetes Service' },
            ]}
            onChange={(v) => sim.mutate((x) => setParams(x, { front: v }))}
            size="sm"
          />
          <Segmented<RackKind>
            label="Iza njega"
            value={p.rack}
            options={[
              { value: 'l04', label: 'Mali, Srednji, Veliki' },
              { value: 'pods', label: '7 jednakih Podova' },
            ]}
            onChange={(v) => sim.mutate((x) => setRack(x, v))}
            size="sm"
          />
          <Slider label="Promet" value={p.lambda} min={5} max={30} onChange={(v) => sim.mutate((x) => setParams(x, { lambda: v }))} format={(v) => `${v} zahtjeva/s`} />
          <Toggle
            label="Kampus iza jednog NAT-a + sessionAffinity: ClientIP"
            checked={p.nat}
            onChange={(on) => sim.mutate((x) => setParams(x, { nat: on }))}
            disabled={p.front === 'lb'}
          />
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Greške (10 s)" value={fmt.pct(m.errorRate, 1)} tone={m.errorRate > 0.01 ? 'bad' : 'ok'} sub={`odbijene veze, puni redovi, isteklo vrijeme: ${m.errors.total}`} />
            <Stat label="p95" value={m.p95 === null ? '–' : fmt.ms(m.p95)} sub="uspješni zahtjevi" />
            <Stat label="Uspješno" value={fmt.num(m.goodput, 1)} unit="/s" />
            <Stat
              label="Usporedba pri 15/s"
              value={`${st.errLb === null ? '–' : fmt.pct(st.errLb, 1)} / ${st.errSvc === null ? '–' : fmt.pct(st.errSvc, 1)}`}
              sub="greške: klasični LB / Service"
            />
          </StatRow>
          <div className={css.statsGrid}>
            <Goals goals={goals} />
            <EventLog events={rackEvents(st)} max={5} />
          </div>
        </>
      }
    >
      <div ref={ref}>
        <div className={narrow ? css.stageNarrow : css.stageWide}>
          <Stage st={st} narrow={narrow} />
        </div>
      </div>
    </SimFrame>
  )
}
