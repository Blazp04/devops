import { motion, useReducedMotion } from 'motion/react'
import { Check, Cross, Diagram, DLabel, Iva, Laptop, SpeechBubble, StepBadge, Stepper, useWidth } from '../../../kit'
import { Fade, Sheet, type SheetLine } from './Drawn'

const README: string[] = [
  '# pokrenite ih ovim redom!',
  'docker network create klopa',
  'docker run --name db … postgres:18',
  'docker run --name redis … redis:8',
  'docker run --name rabbitmq … rabbitmq:4.3',
  'docker run --name api … klopa-api',
  '  -e DATABASE_HOST=localhost',
  'docker run --name worker … klopa-worker',
  'docker run --name web -p 8080:8080 …',
]

const YAML: string[] = [
  'services:',
  '  db:',
  '    image: postgres:18',
  '    volumes:',
  '      - pgdata:/var/lib/postgresql',
  '  redis:    { image: redis:8 }',
  '  rabbitmq: { image: rabbitmq:4.3 }',
  '  api:',
  '    environment: { DATABASE_HOST: db }',
  '    depends_on: [db, redis, rabbitmq]',
  '  worker:   { … }',
  '  web:',
  '    ports: ["8080:8080"]',
  'volumes: { pgdata: {} }',
]

/** README line ↔ compose.yaml line, numbered and in the same marker colour */
const PAIRS: { r: number; y: number; mark: NonNullable<SheetLine['mark']>; color: string }[] = [
  { r: 2, y: 4, mark: 'green', color: 'var(--green)' },
  { r: 6, y: 8, mark: 'pink', color: 'var(--red)' },
  { r: 5, y: 9, mark: 'yellow', color: 'var(--ink)' },
  { r: 8, y: 12, mark: 'blue', color: 'var(--pen)' },
]

/** which README line (docker run …) becomes which service line in compose.yaml */
const FOLD: [number, number, string][] = [
  [2, 1, 'db'],
  [3, 5, 'redis'],
  [4, 6, 'rabbitmq'],
  [5, 7, 'api'],
  [7, 10, 'worker'],
  [8, 11, 'web'],
]

const TERM = ['$ docker compose up -d', '✔ Network klopa_default   Created', '✔ Volume klopa_pgdata     Created', '✔ Container klopa-db-1    Started', '✔ Container klopa-api-1   Started', '✔ Container klopa-web-1   Started']

const STEPS = [
  {
    title: 'Šest naredbi u README-u',
    body: (
      <>
        Svaki dio Klope pokreće se svojom naredbom <code>docker run</code>, s po nekoliko zastavica. Prije njih treba stvoriti mrežu. Redoslijed je važan, a čuva ga samo jedan komentar koji je lako preskočiti.
      </>
    ),
  },
  {
    title: 'Ivino jutro',
    body: (
      <>
        Iva naredbe pokrene napamet, pa <code>api</code> krene prije baze. API odmah traži bazu na <code>localhost:5432</code>, dobije <code>Connection refused</code> i ugasi se – a ni pravim redom ne bi bilo bolje. Baza uz to nema <code>-v</code>, pa nakon{' '}
        <code>docker rm</code> nova baza kreće prazna. README ništa od toga ne provjerava.
      </>
    ),
  },
  {
    title: 'Zastavice postaju ključevi',
    body: (
      <>
        Iste upute, zapisane kao <strong>opis</strong> – i usput ispravljene: svaka naredba postaje servis, <code>-e</code> postaje <code>environment</code> (sada <code>DATABASE_HOST: db</code>), baza dobiva imenovani volumen (<code>volumes</code>),{' '}
        <code>-p</code> postaje <code>ports</code>, a redoslijed postaje <code>depends_on</code>. Mrežu Compose stvara sam.
      </>
    ),
  },
  {
    title: 'Jedna naredba',
    body: (
      <>
        <code>docker compose up -d</code> pročita datoteku, stvori mrežu i volumene i pokrene kontejnere pravim redom. Opisali smo <em>što</em> želimo, a ne korake.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  readme: { x: number; y: number; w: number }
  yaml: { x: number; y: number; w: number }
  size: number
  lineH: number
  iva: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number }
  note: [number, number]
  laptop: { x: number; y: number; w: number }
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 384,
  readme: { x: 8, y: 30, w: 344 },
  yaml: { x: 372, y: 30, w: 340 },
  size: 12.5,
  lineH: 22,
  iva: { x: 440, y: 150, s: 1 },
  bubble: { x: 530, y: 74, w: 160, h: 64 },
  note: [16, 300],
  laptop: { x: 24, y: 44, w: 316 },
  hand: 14,
}

const NARROW: Geo = {
  W: 340,
  H: 660,
  readme: { x: 6, y: 30, w: 328 },
  yaml: { x: 6, y: 316, w: 328 },
  size: 12,
  lineH: 21,
  iva: { x: 20, y: 400, s: 1.05 },
  bubble: { x: 140, y: 380, w: 170, h: 70 },
  note: [14, 290],
  laptop: { x: 14, y: 40, w: 312 },
  hand: 13,
}

function Lecture1Drawing({ step, G }: { step: number; G: Geo }) {
  const reduce = useReducedMotion()
  const ly = (sheetY: number, i: number) => sheetY + 36 + i * G.lineH
  const readmeLines: SheetLine[] = README.map((t, i) => ({
    text: t,
    dim: i === 0 || step >= 3,
    mark: step === 1 && (i === 5 || i === 6) ? 'pink' : step === 1 && i === 2 ? 'yellow' : step === 2 ? PAIRS.find((p) => p.r === i)?.mark : undefined,
  }))
  const yamlLines: SheetLine[] = YAML.map((t, i) => ({ text: t, mark: step >= 2 ? PAIRS.find((p) => p.y === i)?.mark : undefined, dim: false }))
  const ivaHead: [number, number] = [G.iva.x + 40 * G.iva.s, G.iva.y + 28 * G.iva.s]
  return (
    <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
      <Fade show={step < 3}>
        <Sheet x={G.readme.x} y={G.readme.y} w={G.readme.w} title="README.md" lines={readmeLines} size={G.size} lineH={G.lineH} seed={3101} />
        {step === 1 && (
          <>
            <StepBadge n={1} x={G.readme.x + G.readme.w - 16} y={ly(G.readme.y, 6) - 4} r={12} color="var(--red)" />
            <StepBadge n={2} x={G.readme.x + G.readme.w - 16} y={ly(G.readme.y, 2) - 4} r={12} color="var(--ink-2)" />
            <Cross x={G.readme.x + G.readme.w - 42} y={ly(G.readme.y, 6) - 5} size={12} />
          </>
        )}
      </Fade>
      <Fade show={step === 1}>
        <DLabel x={G.note[0]} y={G.note[1]} text="① api pita localhost:5432" size={G.hand} anchor="start" tone="bad" bold />
        <DLabel x={G.note[0]} y={G.note[1] + 26} text="→ Connection refused, api se gasi" size={G.hand} anchor="start" tone="bad" />
        <DLabel x={G.note[0]} y={G.note[1] + 52} text="② db bez -v: nakon docker rm je prazna" size={G.hand} anchor="start" tone="neutral" bold />
      </Fade>

      {/* Iva, only while the README is the plan */}
      <Fade show={step < 2}>
        <g transform={`translate(${G.iva.x} ${G.iva.y}) scale(${G.iva.s})`}>
          <Iva x={0} y={0} mood={step === 1 ? 'worry' : 'flat'} holding="laptop" />
        </g>
        <SpeechBubble x={G.bubble.x} y={G.bubble.y} w={G.bubble.w} h={G.bubble.h} tx={ivaHead[0] + 18} ty={ivaHead[1] - 4} lines={step === 1 ? ['Baze nema?!'] : ['Kojim redom', 'ovo ide?']} size={18} seed={3121} />
      </Fade>

      {/* compose.yaml */}
      <Fade show={step >= 2}>
        <Sheet x={G.yaml.x} y={G.yaml.y} w={G.yaml.w} title="compose.yaml" lines={yamlLines} size={G.size} lineH={G.lineH} seed={3131} />
        {PAIRS.map((p, i) => (
          <g key={i}>
            {step === 2 && <StepBadge n={i + 1} x={G.readme.x + G.readme.w - 16} y={ly(G.readme.y, p.r) - 4} r={12} color={p.color} />}
            <StepBadge n={i + 1} x={G.yaml.x + G.yaml.w - 16} y={ly(G.yaml.y, p.y) - 4} r={12} color={p.color} />
          </g>
        ))}
      </Fade>
      {step === 2 && !reduce &&
        FOLD.map(([r, y, name], i) => {
          const from: [number, number] = [G.readme.x + 160, ly(G.readme.y, r)]
          const to: [number, number] = [G.yaml.x + 24, ly(G.yaml.y, y)]
          return (
            <motion.g key={name} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: to[0] - from[0], y: to[1] - from[1], opacity: 0 }} transition={{ duration: 0.9, delay: 0.25 + i * 0.15, ease: 'easeInOut' }} aria-hidden="true">
              <rect x={from[0] - 4} y={from[1] - G.size} width={name.length * G.size * 0.62 + 8} height={G.size + 6} rx={3} style={{ fill: 'var(--hl-yellow)' }} />
              <text x={from[0]} y={from[1]} className="k-svg-mono" style={{ fontSize: G.size, fontWeight: 700 }}>
                {name}
              </text>
            </motion.g>
          )
        })}
      <Fade show={step === 2}>
        <DLabel x={G.note[0]} y={G.note[1]} text={G.W > 400 ? 'mrežu klopa_default Compose stvara sam' : 'mrežu Compose stvara sam'} size={G.hand} anchor="start" tone="blue" bold />
      </Fade>

      {/* step 4: one command on Lana's laptop */}
      <Fade show={step === 3}>
        <Laptop
          x={G.laptop.x}
          y={G.laptop.y}
          w={G.laptop.w}
          sticker=""
          screen={
            <g>
              {TERM.map((t, i) => (
                <text key={i} x={10} y={22 + i * 22} className="k-svg-mono" style={{ whiteSpace: 'pre', fontSize: G.size, fill: i === 0 ? 'var(--term-prompt)' : 'var(--term-ok)' }}>
                  {t}
                </text>
              ))}
            </g>
          }
        />
        <Check x={G.laptop.x + G.laptop.w - 10} y={G.laptop.y + G.laptop.w * 0.62 + 30} size={18} />
        <DLabel x={G.laptop.x + G.laptop.w - 30} y={G.laptop.y + G.laptop.w * 0.62 + 36} text="pravim redom, svaki put" size={G.hand} anchor="end" tone="ok" bold />
      </Fade>
    </Diagram>
  )
}

/** Scene 1: six `docker run` lines fold into one compose.yaml. */
export function SixCommandsStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 620
  const G = wide ? WIDE : NARROW
  return (
    <div ref={ref}>
      <Stepper title="Šest naredbi ili jedna datoteka" steps={STEPS} autoPlay={0}>
        {(step) => (
          <div style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
            <Lecture1Drawing step={step} G={G} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
