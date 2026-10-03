import { AnimatePresence } from 'motion/react'
import { Check, CommitString, Cross, Cylinder, DGroup, DLabel, Diagram, Edge, LoopArrows, MenzaGate, PodShape, QueueSlots, ServiceTag, StudentQueue, fmt, useWidth } from '../../../kit'
import * as G from '../../../engines/gitops'
import * as K from '../../../engines/cluster'
import * as Q from '../../../engines/queue'
import { API, WORKER, apiPods, apiRed, workerRed, type IncidentState } from '../incident/model'

type Pt = [number, number]
type Anchor = 'start' | 'middle' | 'end'

interface Layout {
  w: number
  h: number
  hand: number
  mono: number
  git: { x: number; y: number; w: number; title: Pt; head: Pt }
  loop: { cx: number; cy: number; r: number; name: Pt; nameAnchor: Anchor; status: Pt; statusAnchor: Anchor }
  students: { x: number; y: number; label: Pt }
  gate: { x: number; y: number; w: number; h: number }
  route: { at: Pt; anchor: Anchor; mark: Pt }
  tag: { x: number; y: number; w: number; h: number }
  endpoints: Pt
  pods: { x: number; y: number; w: number; h: number; cols: number; dx: number; dy: number; size: number }
  db: { x: number; y: number; label: Pt; down: Pt | null }
  queue: { x: number; y: number; w: number; h: number }
  workers: { x: number; y: number; dx: number; label: Pt }
  edges: { gitArgo: [Pt, Pt]; argoPods: [Pt, Pt]; studentsGate: [Pt, Pt]; gateTag: [Pt, Pt]; tagPods: [Pt, Pt]; podsDb: [Pt, Pt]; podsQueue: [Pt, Pt]; queueWorkers: [Pt, Pt] }
}

/** ≥ 520 px of stage (desktop with the controls beside it, tablets). Lettering ≥ 12 px down to 520 px. */
const MEDIUM: Layout = {
  w: 640,
  h: 462,
  hand: 15,
  mono: 15,
  git: { x: 22, y: 56, w: 170, title: [107, 32], head: [107, 88] },
  loop: { cx: 470, cy: 58, r: 24, name: [502, 64], nameAnchor: 'start', status: [470, 108], statusAnchor: 'middle' },
  students: { x: 98, y: 252, label: [62, 152] },
  gate: { x: 128, y: 150, w: 78, h: 96 },
  route: { at: [180, 284], anchor: 'middle', mark: [262, 279] },
  tag: { x: 250, y: 178, w: 178, h: 46 },
  endpoints: [306, 254],
  pods: { x: 20, y: 300, w: 408, h: 128, cols: 5, dx: 74, dy: 56, size: 34 },
  db: { x: 540, y: 134, label: [569, 216], down: [569, 238] },
  queue: { x: 456, y: 330, w: 112, h: 32 },
  workers: { x: 560, y: 406, dx: 48, label: [584, 448] },
  edges: {
    gitArgo: [[198, 56], [442, 58]],
    argoPods: [[470, 84], [430, 300]],
    studentsGate: [[104, 206], [128, 202]],
    gateTag: [[206, 201], [250, 201]],
    tagPods: [[400, 224], [400, 300]],
    podsDb: [[428, 320], [538, 198]],
    podsQueue: [[428, 346], [456, 346]],
    queueWorkers: [[568, 352], [574, 384]],
  },
}

/** Phones (< 520 px of stage, at most 460 px wide). Lettering ≥ 12 px down to 320 px. */
const NARROW: Layout = {
  w: 380,
  h: 616,
  hand: 15,
  mono: 15,
  git: { x: 16, y: 54, w: 130, title: [86, 30], head: [81, 86] },
  loop: { cx: 300, cy: 56, r: 22, name: [300, 22], nameAnchor: 'middle', status: [376, 104], statusAnchor: 'end' },
  students: { x: 92, y: 238, label: [62, 146] },
  gate: { x: 118, y: 140, w: 72, h: 92 },
  route: { at: [16, 268], anchor: 'start', mark: [172, 263] },
  tag: { x: 96, y: 290, w: 178, h: 44 },
  endpoints: [150, 358],
  pods: { x: 16, y: 376, w: 348, h: 128, cols: 5, dx: 64, dy: 56, size: 32 },
  db: { x: 262, y: 128, label: [291, 210], down: null },
  queue: { x: 16, y: 552, w: 112, h: 30 },
  workers: { x: 210, y: 566, dx: 48, label: [258, 608] },
  edges: {
    gitArgo: [[150, 54], [276, 56]],
    argoPods: [[370, 112], [364, 376]],
    studentsGate: [[98, 192], [118, 188]],
    gateTag: [[190, 228], [232, 290]],
    tagPods: [[250, 334], [250, 376]],
    podsDb: [[320, 376], [300, 220]],
    podsQueue: [[72, 504], [72, 522]],
    queueWorkers: [[128, 567], [190, 566]],
  },
}

function argoTone(sync: string, health: string): 'ok' | 'warn' | 'bad' | 'blue' {
  if (health === 'Degraded' || health === 'Missing') return 'bad'
  if (sync === 'OutOfSync') return 'warn'
  if (health === 'Progressing') return 'blue'
  return 'ok'
}

function podTone(image: string): 'green' | 'blue' | 'rose' {
  const tag = image.split(':').pop()
  return tag === '2.0.2' ? 'green' : tag === '2.0.1' ? 'blue' : 'rose'
}

/** The whole Klopa during lunch, drawn from the three engines: Git + Argo CD, Gateway, Service, Pods, Postgres, queue, worker. */
export function IncidentStage({ s, onPod }: { s: IncidentState; onPod: (name: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = (width ?? 640) >= 520 ? MEDIUM : NARROW
  const red = apiRed(s, 5)
  const wr = workerRed(s)
  const app = G.appView(s.git)
  const tone = argoTone(app.sync, app.health)
  const head = G.commitGraph(s.git, 1)[0]?.short ?? ''
  const pods = apiPods(s)
  const shown = pods.slice(0, 10)
  const ready = K.getEndpointSlice(s.k8s, API).filter((e) => e.ready).length
  const wpods = Q.podViews(s.q, { namePrefix: WORKER }).filter((p) => p.status !== 'Terminating').slice(0, 3)
  const routeOk = s.applied.apiRoute
  const dbUp = s.k8s.db.up
  const studentCount = Math.max(2, Math.min(4, Math.round(red.rps / 11)))
  const flowing = routeOk && ready > 0 && red.errPct < 0.5
  const filled = Math.min(6, Math.ceil(wr.backlog / 8))
  const P = L.pods
  const E = L.edges
  const podWord = pods.length === 1 ? 'Pod' : pods.length > 1 && pods.length < 5 ? 'Poda' : 'Podova'
  return (
    <div ref={ref} style={{ width: '100%', maxWidth: L === NARROW ? 460 : undefined, margin: '0 auto' }}>
      <Diagram
        width={L.w}
        height={L.h}
        maxHeight={L.h * 1.3}
        interactive
        label={`Klopa za vrijeme ručka: Argo CD ${app.sync}, ${app.health}; ${ready} spremnih endpointa, ${pods.length} Podova klopa-api; u redu ${Math.round(wr.backlog)} narudžbi; baza ${dbUp ? 'radi' : 'ne odgovara'}.`}
      >
        <DLabel x={L.git.title[0]} y={L.git.title[1]} text="config repozitorij (Git)" size={L.hand} />
        <CommitString x={L.git.x} y={L.git.y} w={L.git.w} n={3} />
        <DLabel x={L.git.head[0]} y={L.git.head[1]} text={`HEAD ${head}`} mono size={L.mono} />
        <Edge from={E.gitArgo[0]} to={E.gitArgo[1]} dashed tone="blue" />
        <LoopArrows cx={L.loop.cx} cy={L.loop.cy} r={L.loop.r} check={tone === 'ok'} />
        <DLabel x={L.loop.name[0]} y={L.loop.name[1]} text="Argo CD" anchor={L.loop.nameAnchor} size={L.hand} />
        <DLabel x={L.loop.status[0]} y={L.loop.status[1]} text={`${app.sync} · ${app.health}`} anchor={L.loop.statusAnchor} mono size={L.mono} tone={tone} bold />
        <Edge from={E.argoPods[0]} to={E.argoPods[1]} dashed tone="blue" />

        <DLabel x={L.students.label[0]} y={L.students.label[1]} text={`${fmt.num(red.rps)} zahtjeva/s`} mono size={L.mono} />
        <StudentQueue x={L.students.x} y={L.students.y} count={studentCount} tap={red.errPct > 0.2} />
        <Edge from={E.studentsGate[0]} to={E.studentsGate[1]} tone={flowing ? 'orange' : 'neutral'} flow={flowing} />
        <MenzaGate x={L.gate.x} y={L.gate.y} w={L.gate.w} h={L.gate.h} label="GATEWAY" labelSize={15} />
        <DLabel x={L.route.at[0]} y={L.route.at[1]} text="/api → klopa-api" anchor={L.route.anchor} mono size={L.mono} tone={routeOk ? 'neutral' : 'bad'} />
        <g transform={`translate(${L.route.mark[0]} ${L.route.mark[1]})`}>{routeOk ? <Check x={0} y={0} size={8} /> : <Cross x={0} y={0} size={8} />}</g>

        <Edge key={`gate-${routeOk}`} from={E.gateTag[0]} to={E.gateTag[1]} tone={routeOk ? 'neutral' : 'bad'} dashed={!routeOk} />
        <ServiceTag x={L.tag.x} y={L.tag.y} w={L.tag.w} h={L.tag.h}>
          <DLabel x={L.tag.x + L.tag.w / 2 + 12} y={L.tag.y + L.tag.h / 2 + 5} text="Service klopa-api" mono size={L.mono} />
        </ServiceTag>
        <DLabel x={L.endpoints[0]} y={L.endpoints[1]} text={`endpointi: ${ready}`} mono size={L.mono} tone={ready === 0 ? 'bad' : 'neutral'} bold={ready === 0} />
        <Edge key={`tag-${ready > 0}`} from={E.tagPods[0]} to={E.tagPods[1]} tone={ready > 0 ? 'green' : 'bad'} dashed={ready === 0} />

        <DGroup x={P.x} y={P.y} w={P.w} h={P.h} />
        <DLabel x={P.x + 10} y={P.y + 20} anchor="start" size={L.hand} text={`klopa-api · ${pods.length} ${podWord}`} />
        <AnimatePresence>
          {shown.map((p, i) => {
            const v = K.podShapeView(p)
            return (
              <PodShape
                key={p.id}
                x={P.x + 34 + (i % P.cols) * P.dx}
                y={P.y + 54 + Math.floor(i / P.cols) * P.dy}
                size={P.size}
                status={v.status}
                tone={podTone(p.spec.image)}
                restarts={p.container.restartCount}
                onClick={() => onPod(p.name)}
                ariaLabel={`Pod ${p.name}: ${v.label}. Otvori kubectl describe.`}
              />
            )
          })}
        </AnimatePresence>
        {pods.length > shown.length && <DLabel x={P.x + P.w - 8} y={P.y + 20} text={`+${pods.length - shown.length}`} mono anchor="end" size={L.mono} />}

        <Edge key={`db-${dbUp}`} from={E.podsDb[0]} to={E.podsDb[1]} tone={dbUp ? 'neutral' : 'bad'} dashed={!dbUp} />
        <Cylinder x={L.db.x} y={L.db.y} w={58} h={62} />
        <DLabel x={L.db.label[0]} y={L.db.label[1]} text="Postgres" mono size={L.mono} tone={dbUp ? 'neutral' : 'bad'} />
        {!dbUp && (
          <g transform={`translate(${L.db.x + 70} ${L.db.y + 24})`}>
            <Cross x={0} y={0} size={10} />
          </g>
        )}
        {!dbUp && L.db.down && <DLabel x={L.db.down[0]} y={L.db.down[1]} text="ne odgovara" size={L.hand} tone="bad" />}

        <Edge from={E.podsQueue[0]} to={E.podsQueue[1]} tone="neutral" />
        <DLabel x={L.queue.x + L.queue.w / 2} y={L.queue.y - 12} text="red narudžbi" size={L.hand} />
        <QueueSlots x={L.queue.x} y={L.queue.y} w={L.queue.w} h={L.queue.h} slots={6} filled={filled} />
        <DLabel x={L.queue.x + L.queue.w / 2} y={L.queue.y + L.queue.h + 22} text={`u redu: ${Math.round(wr.backlog)}${wr.dlq ? ` · DLQ ${wr.dlq}` : ''}`} mono size={L.mono} tone={wr.backlog > 25 ? 'bad' : 'neutral'} />
        <Edge from={E.queueWorkers[0]} to={E.queueWorkers[1]} tone="neutral" />
        <AnimatePresence>
          {wpods.map((p, i) => (
            <PodShape
              key={p.name}
              x={L.workers.x + i * L.workers.dx}
              y={L.workers.y}
              size={30}
              status={p.shape}
              tone="teal"
              restarts={p.restarts}
              onClick={() => onPod(p.name)}
              ariaLabel={`Pod ${p.name}: ${p.status}. Otvori kubectl describe.`}
            />
          ))}
        </AnimatePresence>
        <DLabel x={L.workers.label[0]} y={L.workers.label[1]} text="klopa-worker" mono size={L.mono} />
      </Diagram>
    </div>
  )
}
