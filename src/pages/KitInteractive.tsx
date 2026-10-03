/**
 * /kit · the interactive area's live examples (sections "kod", the stepper in "dijagrami", and "simulacija").
 * Owned by the interactive area; mounted from KitPage.tsx.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Plus, Power, RotateCcw, Snowflake, Zap } from 'lucide-react'
import {
  Button,
  Check,
  CodeBlock,
  ControlGroup,
  EventLog,
  Goals,
  LineChart,
  Meter,
  Person,
  Redar,
  Rough,
  Segmented,
  Select,
  Series,
  ServerFace,
  SimFrame,
  Slider,
  Sparkline,
  Stat,
  StatRow,
  StepBadge,
  Stepper,
  Student,
  Tabs,
  Terminal,
  Toggle,
  TrayDefs,
  createRng,
  fmt,
  stepColor,
  useSimulation,
  useWidth,
  type Pt,
  type SimEvent,
} from '../kit'

/* =====================================================================
   Kod: a code sheet with margin notes, a closed sheet, Lana's laptop
   ===================================================================== */

const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: klopa-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: klopa-api
  template:
    metadata:
      labels:
        app: klopa-api
    spec:
      containers:
        - name: klopa-api
          image: registry.klopa.example/klopa-api:1.4.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "1"
              memory: 2Gi`

const NGINX = `upstream klopa_api {
    least_conn;                      # novi zahtjev: onome s najmanje veza
    server 10.0.0.11:8080 weight=1;  # Mali
    server 10.0.0.12:8080 weight=2;  # Srednji
    server 10.0.0.13:8080 weight=4;  # Veliki
}

server {
    listen 80;
    location / {
        proxy_pass http://klopa_api;
    }
}`

export function KitCodeDemo() {
  return (
    <>
      <p>
        Kod je list milimetarskog papira zalijepljen u bilježnicu. Bilješke uz retke pišu se plavom kemijskom na margini, a njihovi retci dobiju isti marker kao tekst. Prijeđite mišem preko bilješke (ili retka).
      </p>
      <CodeBlock
        title="deployment.yaml"
        lang="yaml"
        caption="Deployment koji traži tri jednaka Poda."
        highlight="6"
        code={DEPLOYMENT}
        notes={[
          { lines: '6', text: 'Tri kopije: jedna smije pasti.' },
          { lines: '7-9', text: 'oznaka po kojoj ih Service nađe' },
          { lines: '17', text: 'točna verzija, nikad :latest' },
          { lines: '21-23', text: 'rezervira 1 vCPU i 2 GB po Podu' },
        ]}
      />
      <CodeBlock
        wide
        title="klopa.conf"
        lang="nginx"
        mode="open"
        caption="Široki list (wide): ima mjesta, pa bilješke stoje na margini uz svoje retke."
        code={NGINX}
        notes={[
          { lines: '1-6', text: 'upstream: popis poslužitelja iza load balancera.' },
          { lines: '2', text: 'least_conn: jedan redak mijenja algoritam.' },
          { lines: '3-5', text: 'težine 1 : 2 : 4, razmjerno jezgrama.' },
          { lines: '11', text: 'svaki zahtjev ide na popis klopa_api; NGINX bira poslužitelj.' },
        ]}
      />
      <CodeBlock title="Dockerfile" lang="dockerfile" mode="closed" code={`FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nCMD ["node", "server.js"]`} />
      <Terminal
        caption="Na mobitelu se tablica preslaže po retcima, pa se CrashLoopBackOff uvijek vidi. Uz važan redak može se zalijepiti papirić s komentarom lika (note i who)."
        lines={[
          { comment: 'Primijeni manifest na klaster' },
          { cmd: 'kubectl apply -f deployment.yaml' },
          { out: 'deployment.apps/klopa-api configured', tone: 'ok' },
          { cmd: 'kubectl get pods -l app=klopa-api' },
          {
            out: 'NAME                         READY   STATUS             RESTARTS      AGE\nklopa-api-7d9f8c6b5-4xkqp    1/1     Running            0             3m12s\nklopa-api-7d9f8c6b5-9mzrt    1/1     Running            0             3m12s\nklopa-api-7d9f8c6b5-hb2ln    0/1     CrashLoopBackOff   4 (38s ago)   3m12s',
            note: 'Treći se ruši pa diže – već četvrti put.',
            who: 'davor',
          },
        ]}
      />
      <Tabs
        tabs={[
          { label: 'Service', content: <CodeBlock title="service.yaml" code={`apiVersion: v1\nkind: Service\nmetadata:\n  name: klopa-api\nspec:\n  selector:\n    app: klopa-api\n  ports:\n    - port: 80\n      targetPort: 8080`} /> },
          { label: 'Terminal', content: <CodeBlock lang="bash" code={`kubectl get svc klopa-api\nkubectl describe svc klopa-api\necho "gotovo"`} /> },
        ]}
      />
    </>
  )
}

/* =====================================================================
   Stepper: the journey of one request, as a flip-book
   ===================================================================== */

interface StepGeo {
  vb: [number, number]
  student: { x: number; y: number; s: number; label: Pt }
  phone: Pt
  lb: { x: number; y: number; s: number; label: Pt }
  lbIn: Pt
  lbOut: Pt
  cards: Pt[]
  card: { w: number; h: number }
  door: (i: number) => Pt
  ok: Pt
  badge: [Pt, Pt, Pt]
}

const WIDE: StepGeo = {
  vb: [760, 330],
  student: { x: 10, y: 90, s: 1.1, label: [54, 262] },
  phone: [80, 180],
  lb: { x: 330, y: 214, s: 1.02, label: [330, 316] },
  lbIn: [300, 220],
  lbOut: [374, 202],
  cards: [
    [560, 22],
    [560, 128],
    [560, 234],
  ],
  card: { w: 180, h: 74 },
  door: (i) => [552, [59, 165, 271][i]],
  ok: [128, 70],
  badge: [
    [196, 168],
    [470, 120],
    [236, 66],
  ],
}

const TALL: StepGeo = {
  vb: [360, 560],
  student: { x: 16, y: 18, s: 0.95, label: [56, 170] },
  phone: [76, 98],
  lb: { x: 196, y: 278, s: 0.95, label: [196, 378] },
  lbIn: [184, 254],
  lbOut: [206, 316],
  cards: [
    [4, 436],
    [124, 436],
    [244, 436],
  ],
  card: { w: 112, h: 74 },
  door: (i) => [[60, 180, 300][i], 426],
  ok: [134, 50],
  badge: [
    [150, 160],
    [232, 380],
    [300, 56],
  ],
}

const STEP_SERVERS = [
  { name: 'Mali', cpu: '1 vCPU', ram: '2 GB' },
  { name: 'Srednji', cpu: '2 vCPU', ram: '4 GB' },
  { name: 'Veliki', cpu: '4 vCPU', ram: '8 GB' },
]

/** A server card as in the notebook: printed name and spec, the face in a round window top right. */
function StepServer({ x, y, w, h, name, cpu, ram, mood, seed, compact }: { x: number; y: number; w: number; h: number; name: string; cpu: string; ram: string; mood: 'calm' | 'busy'; seed: number; compact: boolean }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.8} stroke="var(--ink)" fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + (compact ? 9 : 14)} y={y + (compact ? 25 : 30)} className="k-svg-display" style={{ fontSize: compact ? 16 : 19 }}>
        {name}
      </text>
      {compact ? (
        <text x={x + 9} y={y + 46} className="k-svg-mono" style={{ fontSize: 13.5, fill: 'var(--ink-2)' }}>
          <tspan x={x + 9}>{cpu}</tspan>
          <tspan x={x + 9} dy={16}>
            {ram}
          </tspan>
        </text>
      ) : (
        <text x={x + 14} y={y + 52} className="k-svg-mono" style={{ fontSize: 13.5, fill: 'var(--ink-2)' }}>
          {cpu} · {ram}
        </text>
      )}
      <g transform={`translate(${x + w - (compact ? 21 : 30)} ${y + (compact ? 22 : h / 2)})`}>
        <ServerFace mood={mood} r={compact ? 13 : 19} />
      </g>
    </g>
  )
}

const STEPS = [
  { title: 'Zahtjev stiže na load balancer', body: 'Studentica otvori Klopu i pošalje narudžbu. Ona ne zna koliko poslužitelja postoji: vidi samo jednu adresu, a iza nje stoji redar.' },
  { title: 'Load balancer bira poslužitelj', body: 'Redar gleda koliko svaki poslužitelj ima otvorenih veza. Po pravilu „najmanje aktivnih veza” bira Srednji.' },
  { title: 'Odgovor se vraća', body: 'Srednji obradi narudžbu i odgovor putuje natrag preko redara do studentice. Za nju je to bio jedan zahtjev na jednu adresu.' },
]

function RequestFrame({ step, g }: { step: number; g: StepGeo }) {
  const reduce = !!useReducedMotion()
  const target = g.door(1)
  const shoulder: Pt = [g.lb.x + 13 * g.lb.s, g.lb.y - 28 * g.lb.s]
  const angles = [-1.25, Math.atan2(target[1] - shoulder[1], target[0] - shoulder[0]), Math.atan2(g.phone[1] - shoulder[1], g.phone[0] - shoulder[0])]
  const routes: Pt[][] = [[g.phone, g.lbIn], [g.lbOut, target], [target, g.lbOut, g.lbIn, g.phone]]
  const travel = routes[step]
  const color = stepColor(step)
  const delay = reduce ? 0 : 0.5
  return (
    <svg viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <TrayDefs id="kitstep" />
      {/* earlier legs stay as faint pencil */}
      {routes.slice(0, Math.min(step, 2)).map((r, i) => (
        <Rough key={i} shape={{ k: 'lin', pts: r }} seed={760 + i} stroke="var(--ink-3)" strokeWidth={1.3} dash="2 7" roughness={0.6} />
      ))}
      <Rough key={`r${step}`} shape={{ k: 'lin', pts: travel }} seed={770 + step} stroke={color} strokeWidth={2.2} dash="3 7" roughness={0.7} />
      <Person x={g.student.x} y={g.student.y} scale={g.student.s} hair="pony" holding="phone" shirt="var(--hl-pink-ink)" mood={step === 2 ? 'grin' : 'smile'} seed={701} />
      <text x={g.student.label[0]} y={g.student.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
        studentica
      </text>
      <Redar x={g.lb.x} y={g.lb.y} scale={g.lb.s} angle={angles[step]} slowArm />
      <text x={g.lb.label[0]} y={g.lb.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
        redar = load balancer
      </text>
      {STEP_SERVERS.map((s, i) => (
        <StepServer
          key={s.name}
          x={g.cards[i][0]}
          y={g.cards[i][1]}
          w={g.card.w}
          h={g.card.h}
          name={s.name}
          cpu={s.cpu}
          ram={s.ram}
          mood={i === 0 ? 'busy' : step === 2 && i === 1 ? 'busy' : 'calm'}
          seed={720 + i * 5}
          compact={g.card.w < 150}
        />
      ))}
      {step >= 1 && (
        <Rough
          shape={{ k: 'ellipse', cx: g.cards[1][0] + g.card.w / 2, cy: g.cards[1][1] + g.card.h / 2, w: g.card.w + 34, h: g.card.h + 30 }}
          seed={730}
          stroke="var(--red)"
          strokeWidth={2.4}
          multi
          draw="mount"
          duration={0.6}
          delay={reduce ? 0 : 0.9}
        />
      )}
      {step === 2 && (
        <motion.g initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.9 }}>
          <Check x={g.ok[0]} y={g.ok[1]} size={13} seed={740} />
          <text x={g.ok[0] + 18} y={g.ok[1] - 4} className="k-svg-hand" style={{ fontSize: 23, fill: 'var(--green)' }}>
            200 OK
          </text>
        </motion.g>
      )}
      {/* ① ② ③: the numbered note sits next to what changes in this step */}
      <StepBadge n={step + 1} x={g.badge[step][0]} y={g.badge[step][1]} color={color} />
      {/* the tray travels the drawn route at constant speed */}
      <motion.g
        key={`t${step}`}
        initial={{ x: travel[0][0], y: travel[0][1], opacity: reduce ? 1 : 0 }}
        animate={reduce ? { x: travel[travel.length - 1][0], y: travel[travel.length - 1][1], opacity: 1 } : { x: travel.map((q) => q[0]), y: travel.map((q) => q[1]), opacity: 1 }}
        transition={{ duration: reduce ? 0 : travel.length > 2 ? 1.5 : 0.9, ease: 'linear', delay, opacity: { duration: 0.1, delay } }}
      >
        <use href="#kitstep-tray" x={-19} y={-13} width={38} height={26} />
      </motion.g>
    </svg>
  )
}

export function KitStepperDemo() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 640 ? TALL : WIDE
  return (
    <div className="k-wide" ref={ref}>
      <Stepper title="Put jednog zahtjeva" steps={STEPS} caption="Stepper: crtež na stranici, kartica s pričom uz njega (ili ispod, kad nema mjesta). Strelice ← → na tipkovnici mijenjaju korak.">
        {(step) => (
          <div style={g === TALL ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <RequestFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}

/* =====================================================================
   Simulacija: one queue, N workers (cooks behind the counter)
   ===================================================================== */

interface Job {
  id: number
  progress: number
}

interface QueueSimState {
  queue: Job[]
  workers: (Job | null)[]
  nextId: number
  untilNext: number
  done: number
  depth: Series
  rng: ReturnType<typeof createRng>
  sampleAcc: number
  time: number
  /** what just happened (newest last, the last 20 kept) — fed to <EventLog> */
  events: SimEvent[]
  eventId: number
  full: boolean
  /** a burst was sent and the queue has not been empty since */
  burstPending: boolean
  /** the queue emptied after a burst at least once (a goal) */
  burstCleared: boolean
}

function createQueueSim(workers: number): QueueSimState {
  return {
    queue: [],
    workers: Array(workers).fill(null),
    nextId: 1,
    untilNext: 0,
    done: 0,
    depth: new Series(90),
    rng: createRng(7),
    sampleAcc: 0,
    time: 0,
    events: [],
    eventId: 1,
    full: false,
    burstPending: false,
    burstCleared: false,
  }
}

function logEvent(s: QueueSimState, text: string, tone: SimEvent['tone']) {
  s.events.push({ id: s.eventId++, t: s.time, text, tone })
  if (s.events.length > 20) s.events.shift()
}

/** Grow / shrink the worker pool (a job taken from a removed worker goes back to the head of the queue). */
function resizeWorkers(s: QueueSimState, n: number) {
  while (s.workers.length < n) s.workers.push(null)
  while (s.workers.length > n) {
    const job = s.workers.pop()
    if (job) s.queue.unshift(job)
  }
}

const SLOTS = 10
const SLOT: CSSProperties = { fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '2.5 2.5' }
const BAR: CSSProperties = { fill: 'none', stroke: 'var(--ink-2)', strokeWidth: 1.2 }
const FILL: CSSProperties = { fill: 'var(--hl-orange-ink)', opacity: 0.7 }

/** The stage drawn with the notebook's doodles: students arrive, trays wait in the rack, workers cook. */
function QueueStage({ s, narrow }: { s: QueueSimState; narrow: boolean }) {
  const n = s.workers.length
  const W = narrow ? 360 : 680
  const rowH = 58
  const rack = narrow ? { x: 20, y: 176, gap: 32 } : { x: 150, y: 120, gap: 28 }
  const head: Pt = [rack.x + SLOTS * rack.gap + 4, rack.y + 13]
  const workersTop = narrow ? 252 : Math.max(16, head[1] - (n * rowH) / 2 + 6)
  const H = narrow ? workersTop + n * rowH + 6 : Math.max(250, workersTop + n * rowH + 6)
  const wx = narrow ? 110 : 486
  const ww = narrow ? 236 : 186
  const sc = narrow ? 0.62 : 0.8
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Red čekanja: ${s.queue.length} poslova čeka, ${s.workers.filter(Boolean).length} od ${n} radnika radi.`} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
      <TrayDefs id="kitsim" />
      {/* students who send jobs (tapping a foot when the line is long) */}
      <g>
        {[0, 1].map((i) => (
          <Student key={i} variant={i + 2} x={(narrow ? 14 : 4) + i * (narrow ? 46 : 56)} y={narrow ? 0 : 52} scale={sc} tap={s.queue.length > 8 && i === 1} />
        ))}
        <text x={narrow ? 64 : 70} y={narrow ? 114 : 194} textAnchor="middle" className="k-svg-hand" style={{ fontSize: narrow ? 21 : 19, fill: 'var(--ink-2)' }}>
          narudžbe
        </text>
      </g>
      {/* the rack: dashed slots, trays waiting (the head of the line is on the right) */}
      <text x={rack.x} y={rack.y - 12} className="k-svg-hand" style={{ fontSize: 20, fill: s.queue.length > SLOTS ? 'var(--red)' : 'var(--ink-2)' }}>
        red: {s.queue.length}
        {s.queue.length > SLOTS ? `  (+${s.queue.length - SLOTS} ne stane)` : ''}
      </text>
      {Array.from({ length: SLOTS }, (_, q) => (
        <rect key={q} x={rack.x + q * rack.gap} y={rack.y} width={rack.gap - 4} height={26} rx={2} style={SLOT} />
      ))}
      {s.queue.slice(0, SLOTS).map((j, q) => (
        <use key={j.id} href="#kitsim-tray" x={rack.x + (SLOTS - 1 - q) * rack.gap + 1} y={rack.y + 5} width={rack.gap - 6} height={17} />
      ))}
      {/* pencil roads from the head of the queue to every worker */}
      {s.workers.map((_, i) => (
        <Rough key={`r${i}-${n}`} shape={{ k: 'line', x1: head[0], y1: head[1], x2: wx - 34, y2: workersTop + i * rowH + 23 }} seed={3110 + i} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.8} />
      ))}
      {s.workers.map((job, i) => {
        const y = workersTop + i * rowH
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: wx, y, w: ww, h: 46 }} seed={3000 + i * 20} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
            <text x={wx + 12} y={y + 29} className="k-svg-display" style={{ fontSize: 17 }}>
              radnik {i + 1}
            </text>
            <g transform={`translate(${wx + ww - 24} ${y + 23})`}>
              <ServerFace mood={job ? 'busy' : 'calm'} r={14} />
            </g>
            {/* the job being cooked, and how far along it is (a marker swipe) */}
            <rect x={wx + 98} y={y + 18} width={50} height={11} rx={1.5} style={BAR} />
            {job && <rect x={wx + 98} y={y + 18} width={50 * Math.min(1, job.progress)} height={11} rx={1.5} style={FILL} />}
            {job && <use href="#kitsim-tray" x={wx - 32} y={y + 13} width={28} height={20} />}
          </g>
        )
      })}
    </svg>
  )
}

function ExampleSim() {
  const [rate, setRate] = useState(4)
  const [workers, setWorkers] = useState(2)
  const [ref, w] = useWidth<HTMLDivElement>()
  const serviceTime = 0.6 // seconds per job

  const sim = useSimulation<QueueSimState>({
    init: () => createQueueSim(workers),
    step: (s, dt) => {
      s.time += dt
      // arrivals (Poisson process)
      s.untilNext -= dt
      while (s.untilNext <= 0) {
        s.queue.push({ id: s.nextId++, progress: 0 })
        s.untilNext += s.rng.exp(rate)
      }
      // the slider already resized the pool (onChange → mutate); keep it in step after a reset too
      resizeWorkers(s, workers)
      // service
      s.workers = s.workers.map((job) => {
        const j = job ?? s.queue.shift() ?? null
        if (!j) return null
        j.progress += dt / serviceTime
        if (j.progress >= 1) {
          s.done++
          return null
        }
        return j
      })
      s.sampleAcc += dt
      if (s.sampleAcc >= 0.25) {
        s.sampleAcc = 0
        s.depth.push(s.queue.length)
      }
      // events: the queue fills up / empties again
      if (!s.full && s.queue.length > 20) {
        s.full = true
        logEvent(s, 'Red je pun: više od 20 poslova čeka', 'bad')
      } else if (s.full && s.queue.length <= 10) {
        s.full = false
        logEvent(s, 'Red se smanjuje', 'ok')
      }
      if (s.burstPending && s.queue.length === 0) {
        s.burstPending = false
        s.burstCleared = true
        logEvent(s, 'Red je prazan – nalet je obrađen', 'ok')
      }
    },
  })
  const burst = () =>
    sim.mutate((st) => {
      st.queue.push(...Array.from({ length: 8 }, () => ({ id: st.nextId++, progress: 0 })))
      st.burstPending = true
      logEvent(st, 'Nalet: +8 poslova odjednom', 'warn')
    })
  // a control changes the model right away (also while paused), and leaves a note in the log
  const changeWorkers = (n: number) => {
    setWorkers(n)
    sim.mutate((st) => {
      resizeWorkers(st, n)
      logEvent(st, `Broj radnika: ${n}`, 'info')
    })
  }
  const changeRate = (r: number) => {
    setRate(r)
    sim.mutate((st) => {
      // dragging the slider rewrites one note instead of adding twenty
      const last = st.events[st.events.length - 1]
      const text = `Promet: ${fmt.num(r, 1)} poslova/s`
      if (last && typeof last.text === 'string' && last.text.startsWith('Promet:')) {
        last.text = text
        last.t = st.time
      } else logEvent(st, text, 'neutral')
    })
  }

  const s = sim.state
  const capacity = workers / serviceTime
  const util = Math.min(1, rate / capacity)

  return (
    <SimFrame
      title="red čekanja i radnici"
      subtitle="Poslovi stižu nasumično, prosječno onoliko u sekundi koliko kaže klizač; svaki radnik obrađuje jedan posao 0,6 s."
      sim={sim}
      showTime
      hint="pojačajte promet iznad kapaciteta i gledajte kako red raste. Zatim dodajte radnika."
      controls={
        <>
          <ControlGroup title="Promet">
            <Slider label="Dolazni poslovi" value={rate} min={1} max={12} step={0.5} onChange={changeRate} format={(v) => `${fmt.num(v, 1)}/s`} />
          </ControlGroup>
          <ControlGroup title="Kapacitet">
            <Slider label="Broj radnika" value={workers} min={1} max={6} onChange={changeWorkers} format={(v) => `${v}`} hint={`kapacitet: ${fmt.num(capacity, 1)} poslova/s`} />
          </ControlGroup>
          <Button variant="danger" icon={Zap} onClick={burst}>
            Nalet: +8 poslova
          </Button>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="U redu" value={s.queue.length} tone={s.queue.length > 20 ? 'bad' : s.queue.length > 5 ? 'warn' : 'ok'} spark={s.depth.values.slice(-30)} />
            <Stat label="Obrađeno" value={s.done} />
            <Stat label="Opterećenje" value={fmt.pct(util)} tone={util > 0.9 ? 'bad' : util > 0.7 ? 'warn' : 'ok'} sub={`${fmt.num(rate, 1)} od ${fmt.num(capacity, 1)} poslova/s`} />
          </StatRow>
          <LineChart
            series={[{ label: 'duljina reda', values: s.depth.values, color: 'var(--request)', area: true }]}
            threshold={{ value: 20, label: 'red je pun' }}
            window={90}
            height={120}
            yLabel="poslova u redu"
            xLabel="zadnjih 22 s"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 28, alignItems: 'start', marginTop: 24 }}>
            <Goals
              goals={[
                { text: 'Obradite 40 poslova.', done: s.done >= 40 },
                { text: 'Pošaljite nalet pa vratite red na nulu.', done: s.burstCleared },
              ]}
            />
            <EventLog events={s.events} />
          </div>
        </>
      }
    >
      <div ref={ref}>
        <QueueStage s={s} narrow={w !== null && w < 680} />
      </div>
    </SimFrame>
  )
}

/* =====================================================================
   Controls and metrics, one of each
   ===================================================================== */

const LABEL: CSSProperties = { fontFamily: 'var(--f-hand)', fontSize: 22, fontWeight: 700, color: 'var(--red)', margin: '0 0 10px', lineHeight: 1 }
const CELL: CSSProperties = { display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }

function Cell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={CELL}>
      <p style={LABEL}>{title}</p>
      {children}
    </div>
  )
}

// a p95 series with a gap ("n/a" while there are too few samples): the chart breaks the line instead of drawing 0
const P95: number[] = Array.from({ length: 60 }, (_, i) => (i > 22 && i < 30 ? NaN : 0.35 + 0.25 * Math.sin(i / 6) + (i > 38 ? (i - 38) * 0.06 : 0)))

function ControlsGallery() {
  const [seg, setSeg] = useState<'rr' | 'wrr' | 'lc'>('rr')
  const [on, setOn] = useState(true)
  const [retry, setRetry] = useState(false)
  const [algo, setAlgo] = useState<'rr' | 'lc' | 'p2c'>('lc')
  const [traffic, setTraffic] = useState(12)
  const [down, setDown] = useState(false)
  return (
    <div className="k-wide" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '40px 48px', margin: '2.4em 0' }}>
      <Cell title="gumbi (Button)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Button variant="primary" icon={Zap}>
            Nalet prometa
          </Button>
          <Button icon={Plus}>Dodaj poslužitelj</Button>
          <Button variant="ghost" icon={RotateCcw}>
            Vrati zadano
          </Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {down ? (
            <Button variant="success" icon={RotateCcw} onClick={() => setDown(false)}>
              Popravi
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setDown(true)}>
              Sruši poslužitelj
            </Button>
          )}
          <Button variant="danger" size="sm" icon={Snowflake}>
            Zamrzni
          </Button>
          <Button size="sm" active icon={Power}>
            Uključeno
          </Button>
          <Button size="sm" disabled>
            Nedostupno
          </Button>
        </div>
      </Cell>
      <Cell title="izbor (Segmented, Toggle, Select)">
        <Segmented
          label="Algoritam"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'rr', label: 'Kružno' },
            { value: 'wrr', label: 'Težinsko' },
            { value: 'lc', label: 'Najmanje veza' },
          ]}
        />
        <Toggle label="Aktivne provjere" checked={on} onChange={setOn} hint="svake 2 s (sim) · stvarno npr. 30 s" />
        <Select
          label="Ostali algoritmi"
          value={algo}
          onChange={setAlgo}
          options={[
            { value: 'lc', label: 'Najmanje aktivnih veza' },
            { value: 'rr', label: 'Kružno' },
            { value: 'p2c', label: 'Dva nasumična' },
          ]}
        />
        <ControlGroup title="Napredno" collapsible>
          <Toggle label="Ponovi odbijeni zahtjev" checked={retry} onChange={setRetry} hint="jednom, na drugom poslužitelju" />
        </ControlGroup>
      </Cell>
      <Cell title="klizač i mjerači (Slider, Meter)">
        <Slider label="Promet" value={traffic} min={2} max={40} onChange={setTraffic} format={(v) => `${v} zahtjeva/s`} />
        <Meter label="CPU" value={traffic / 40} valueLabel={`${Math.round((traffic / 40) * 100)} %`} />
        <Meter label="RAM" value={0.45} valueLabel="1,8 / 4 GB" />
        <Meter label="red" value={0.96} valueLabel="23 / 24" tone="bad" />
      </Cell>
      <Cell title="metrike (Stat, Sparkline, LineChart)">
        <StatRow>
          <Stat label="p95 latencija" value="0,78" unit="s" tone="warn" sub="95 % je brže" />
          <Stat label="greške/s" value="2,4" tone="bad" sub="502: 9 · 503: 3" />
        </StatRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--f-hand)', fontSize: 19, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>uspješno/s</span>
          <Sparkline values={[3, 4, 4, 6, 5, 7, 8, 8, 6, 9, 11, 10]} color="var(--ok)" />
        </div>
        <LineChart
          series={[{ label: 'p95 (s)', values: P95, color: 'var(--pen)' }]}
          yMax={2}
          threshold={{ value: 1.5, label: 'cilj 1,5 s' }}
          formatY={(v) => fmt.num(v, 1)}
          height={110}
          xLabel="rupa = n/a"
        />
      </Cell>
    </div>
  )
}

export function KitSimDemo() {
  return (
    <>
      <p>Primjer obrasca za simulacije: stanje u <code>useSimulation</code>, kontrole sa strane, metrike ispod crte. Simulacija je umetak milimetarskog papira; na ploči je nacrtana kredom.</p>
      <ExampleSim />
      <ControlsGallery />
    </>
  )
}
