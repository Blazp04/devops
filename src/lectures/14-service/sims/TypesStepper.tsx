import { Arrow, Cloud, Cross, Diagram, MiniPerson, PodShape, Rough, ServiceTag, Stepper, stepColor, useWidth } from '../../../kit'

type Pt = [number, number]

const STEPS = [
  {
    title: 'ClusterIP (zadano)',
    body: (
      <>
        Virtualna adresa koju poznaju samo pravila unutar klastera. klopa-web do API-ja dolazi bez problema, a student s mobitelom ne može ni pokušati: <code>10.96.12.7</code> izvan klastera ne znači ništa.
      </>
    ),
  },
  {
    title: 'NodePort',
    body: (
      <>
        Svaki čvor otvara isti port iz raspona 30000–32767 (ovdje <code>31080</code>) i prosljeđuje ga Serviceu. Izvana se može ući, ali student mora znati IP adresu nekog čvora – a čvorovi dolaze i odlaze.
      </>
    ),
  },
  {
    title: 'LoadBalancer',
    body: (
      <>
        Kontroler oblaka napravi vanjski load balancer s javnom adresom i usmjeri ga na NodePortove. Bez oblaka (npr. lokalni kind) adresa ostaje <code>&lt;pending&gt;</code> – dok netko ne pokrene dodatak koji je dodjeljuje.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  student: Pt
  lb: { x: number; y: number; w: number; h: number }
  cluster: { x: number; y: number; w: number; h: number }
  nodes: { x: number; y: number; w: number; h: number }[]
  web: Pt
  tag: { x: number; y: number; w: number; h: number }
}

const WIDE: Geo = {
  W: 660,
  H: 300,
  mono: 13,
  hand: 18,
  student: [40, 150],
  lb: { x: 88, y: 112, w: 116, h: 72 },
  cluster: { x: 232, y: 14, w: 424, h: 276 },
  nodes: [0, 1, 2].map((i) => ({ x: 246 + i * 136, y: 120, w: 124, h: 156 })),
  web: [282, 214],
  tag: { x: 368, y: 50, w: 168, h: 50 },
}

const NARROW: Geo = {
  W: 400,
  H: 470,
  mono: 14.5,
  hand: 20,
  student: [60, 70],
  lb: { x: 200, y: 26, w: 140, h: 86 },
  cluster: { x: 6, y: 150, w: 388, h: 314 },
  nodes: [0, 1, 2].map((i) => ({ x: 18 + i * 125, y: 266, w: 114, h: 186 })),
  web: [62, 330],
  tag: { x: 110, y: 186, w: 180, h: 52 },
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  const c = g.cluster
  const nodeIn = (i: number): Pt => [g.nodes[i].x + g.nodes[i].w / 2, g.nodes[i].y]
  const studentOut: Pt = narrow ? [g.student[0] + 26, g.student[1] + 22] : [g.student[0] + 24, g.student[1]]
  return (
    <Diagram width={g.W} height={g.H} label={`Korak ${step + 1}: ${STEPS[step].title}. Tko može doći do Servicea klopa-api.`}>
      {/* the cluster: double blue pen line */}
      <Rough shape={{ k: 'rect', x: c.x, y: c.y, w: c.w, h: c.h }} seed={1461} stroke="var(--pen)" strokeWidth={1.6} />
      <Rough shape={{ k: 'rect', x: c.x + 5, y: c.y + 5, w: c.w - 10, h: c.h - 10 }} seed={1462} stroke="var(--pen)" strokeWidth={1.1} />
      <text x={c.x + 16} y={c.y + 30} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
        klaster
      </text>
      {g.nodes.map((n, i) => (
        <g key={i}>
          <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={1470 + i} stroke="var(--ink-2)" strokeWidth={1.3} dash="6 5" />
          <text x={n.x + n.w - 8} y={n.y + n.h - 10} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
            node-{i + 1}
          </text>
          {i > 0 && <PodShape x={n.x + n.w / 2} y={n.y + n.h * 0.62} size={34} tone="violet" ariaLabel={`Pod klopa-api na čvoru node-${i + 1}`} />}
          {step >= 1 && (
            <g>
              <rect x={n.x + n.w / 2 - 30} y={n.y - 11} width={60} height={22} style={{ fill: 'var(--note-orange)' }} />
              <Rough shape={{ k: 'rect', x: n.x + n.w / 2 - 30, y: n.y - 11, w: 60, h: 22 }} seed={1480 + i} stroke="var(--ink-2)" strokeWidth={1.3} />
              <text x={n.x + n.w / 2} y={n.y + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--note-ink)', fontWeight: 600 }}>
                :31080
              </text>
            </g>
          )}
        </g>
      ))}
      <PodShape x={g.web[0]} y={g.web[1]} size={34} tone="teal" ariaLabel="Pod klopa-web" />
      <text x={g.web[0]} y={g.web[1] + 36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        klopa-web
      </text>
      <ServiceTag x={g.tag.x} y={g.tag.y} w={g.tag.w} h={g.tag.h} seed={1463}>
        <text x={g.tag.x + 24} y={g.tag.y + 21} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
          klopa-api
        </text>
        <text x={g.tag.x + 24} y={g.tag.y + 21 + g.mono + 4} className="k-svg-mono" style={{ fontSize: g.mono }}>
          10.96.12.7:80
        </text>
      </ServiceTag>
      {/* inside: klopa-web always reaches the Service */}
      <Arrow pts={[[g.web[0] + 6, g.web[1] - 26], [g.tag.x + 10, g.tag.y + g.tag.h]]} stroke="var(--green)" strokeWidth={1.7} seed={1464} head={8} />
      {/* the student outside */}
      <MiniPerson cx={g.student[0]} cy={g.student[1] - 30} s={narrow ? 56 : 52} shirt="var(--hl-pink-ink)" hair="bun" />
      <text x={g.student[0]} y={g.student[1] + 44} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        student
      </text>
      {step === 0 && (
        <g>
          <Rough shape={{ k: 'rect', x: c.x + 14, y: c.y + 42, w: c.w - 28, h: c.h - 52 }} seed={1465} stroke={stepColor(0)} strokeWidth={1.4} dash="3 5" />
          <Arrow pts={[studentOut, narrow ? [g.student[0] + 30, c.y - 8] : [c.x - 10, g.student[1]]]} stroke="var(--red)" strokeWidth={1.6} seed={1466} dash="6 5" head={7} />
          <Cross x={narrow ? g.student[0] + 30 : c.x - 6} y={narrow ? c.y - 14 : g.student[1] - 14} size={8} seed={1467} />
          <text x={narrow ? g.student[0] + 48 : c.x - 14} y={narrow ? c.y - 18 : g.student[1] + 30} textAnchor={narrow ? 'start' : 'end'} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
            10.96.12.7? ne vidi
          </text>
        </g>
      )}
      {step === 1 && (
        <g>
          <Arrow pts={narrow ? [studentOut, [g.student[0] + 30, 210], [nodeIn(1)[0] - 20, nodeIn(1)[1] - 14]] : [studentOut, [c.x - 20, 104], [nodeIn(1)[0] - 10, 104], [nodeIn(1)[0], nodeIn(1)[1] - 12]]} stroke="var(--green)" strokeWidth={1.7} seed={1468} head={8} />
          <text x={narrow ? 110 : 120} y={narrow ? 100 : 86} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink)' }}>
            {narrow ? 'IP čvora:31080' : 'IP čvora:31080'}
          </text>
        </g>
      )}
      {step === 2 && (
        <g>
          <Cloud x={g.lb.x} y={g.lb.y} w={g.lb.w} h={g.lb.h} seed={1469} />
          <text x={g.lb.x + g.lb.w / 2} y={g.lb.y + g.lb.h * 0.62} textAnchor="middle" className="k-svg-display" style={{ fontSize: g.mono + 1 }}>
            LB oblaka
          </text>
          <text x={g.lb.x + g.lb.w / 2} y={g.lb.y + g.lb.h + g.mono + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink)' }}>
            203.0.113.10
          </text>
          <text x={g.lb.x + g.lb.w / 2} y={g.lb.y + g.lb.h + 2 * g.mono + 9} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--orange)' }}>
            kind: &lt;pending&gt;
          </text>
          <Arrow pts={[studentOut, [g.lb.x + 8, g.lb.y + g.lb.h * 0.55]]} stroke="var(--green)" strokeWidth={1.7} seed={1475} head={8} />
          {[0, 1, 2].map((i) => (
            <Arrow key={i} pts={[[g.lb.x + g.lb.w * (narrow ? 0.3 + i * 0.2 : 0.9), g.lb.y + g.lb.h * (narrow ? 0.9 : 0.5 + i * 0.12)], [nodeIn(i)[0], nodeIn(i)[1] - 13]]} stroke="var(--pen)" strokeWidth={1.3} seed={1480 + i} head={6} dash="5 4" />
          ))}
        </g>
      )}
    </Diagram>
  )
}

/** Scene 6: who can reach the Service – reachability grows from ClusterIP to NodePort to LoadBalancer. */
export function TypesStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 620 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Tko može doći do Servicea?" steps={STEPS}>
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
