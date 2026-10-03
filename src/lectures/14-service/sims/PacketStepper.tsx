import { DGroup, Diagram, Packet, PodShape, Rough, Stepper, Term, useWidth } from '../../../kit'

type Pt = [number, number]

const STEPS = [
  {
    title: 'Ime u adresu',
    body: (
      <>
        klopa-web pita DNS za <code>klopa-api</code> (razrješivač imena dopuni ga u <code>klopa-api.klopa.svc.cluster.local</code>). CoreDNS odgovara adresom Servicea: <code>10.96.12.7</code>. Tu je adresu Kubernetes dodijelio Serviceu kad je nastao i ona se ne mijenja.
      </>
    ),
  },
  {
    title: 'Paket za adresu koju nitko nema',
    body: (
      <>
        klopa-web šalje paket na <code>10.96.12.7:80</code>. Nijedno računalo u klasteru nema tu adresu na mrežnoj kartici – ClusterIP je virtualan. Paket ipak ne odlazi u prazno…
      </>
    ),
  },
  {
    title: 'DNAT na klijentovu čvoru',
    body: (
      <>
        …jer ga presretnu pravila koja je kube-proxy upisao u jezgru operacijskog sustava na <strong>node-1</strong>, klijentovu vlastitom čvoru. Pravilo nasumično odabere jedan spreman Pod i zamijeni odredište: to je{' '}
        <Term id="dnat">DNAT</Term>. <Term id="conntrack">conntrack</Term> zapamti zamjenu.
      </>
    ),
  },
  {
    title: 'Do Poda na drugom čvoru',
    body: (
      <>
        Paket sada ima pravu adresu Poda, <code>10.244.2.15:8000</code>, i mrežom Podova putuje na node-2. Pod vidi da je paket stigao od <code>10.244.1.7</code>.
      </>
    ),
  },
  {
    title: 'Odgovor i conntrack',
    body: (
      <>
        Odgovor dolazi od <code>10.244.2.15</code>. Na node-1 conntrack prepozna vezu i vrati izvornu adresu <code>10.96.12.7:80</code>. klopa-web misli da mu je odgovorio Service – a Service nije nijedan proces.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  card: { x: number; y: number; w: number }
  nodes: { x: number; y: number; w: number; h: number; label: string }[]
  client: Pt
  pod2: Pt
  pod3: Pt
  dns: Pt
  rules: { x: number; y: number; w: number; h: number }
  vip: Pt
  /** the tray's route in each step */
  paths: Pt[][]
}

const WIDE: Geo = {
  W: 680,
  H: 352,
  mono: 13,
  hand: 18,
  card: { x: 150, y: 6, w: 380 },
  nodes: [
    { x: 6, y: 100, w: 216, h: 246, label: 'node-1' },
    { x: 232, y: 100, w: 216, h: 246, label: 'node-2' },
    { x: 458, y: 100, w: 216, h: 246, label: 'node-3' },
  ],
  client: [64, 178],
  pod2: [340, 178],
  pod3: [532, 178],
  dns: [624, 178],
  rules: { x: 16, y: 252, w: 196, h: 82 },
  vip: [227, 160],
  paths: [
    [[92, 178], [104, 142], [612, 142], [624, 156]],
    [[92, 178], [210, 163]],
    [[92, 178], [114, 250]],
    [[212, 282], [270, 282], [300, 200], [312, 181]],
    [[312, 181], [270, 286], [212, 286], [106, 206]],
  ],
}

const NARROW: Geo = {
  W: 400,
  H: 690,
  mono: 15,
  hand: 21.5,
  card: { x: 6, y: 6, w: 388 },
  nodes: [
    { x: 6, y: 130, w: 286, h: 250, label: 'node-1' },
    { x: 6, y: 392, w: 388, h: 122, label: 'node-2' },
    { x: 6, y: 528, w: 388, h: 156, label: 'node-3' },
  ],
  client: [70, 210],
  pod2: [96, 466],
  pod3: [96, 606],
  dns: [272, 606],
  rules: { x: 18, y: 284, w: 262, h: 84 },
  vip: [346, 210],
  paths: [
    [[98, 210], [316, 210], [316, 572], [272, 572], [272, 586]],
    [[98, 210], [298, 210]],
    [[98, 210], [149, 282]],
    [[149, 370], [149, 430], [96, 430], [96, 446]],
    [[96, 446], [96, 430], [149, 430], [149, 370], [112, 236]],
  ],
}

/** One header field: the old value struck through in red pencil and the new one written next to it. */
function Field({ g, x, y, label, value, was }: { g: Geo; x: number; y: number; label: string; value: string; was?: string }) {
  const cw = g.mono * 0.6
  const lx = x + 92
  return (
    <g>
      <text x={x} y={y} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        {label}
      </text>
      {was ? (
        <g>
          <text x={lx} y={y} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-3)' }}>
            {was}
          </text>
          <Rough shape={{ k: 'line', x1: lx - 2, y1: y - g.mono * 0.35, x2: lx + was.length * cw + 2, y2: y - g.mono * 0.3 }} seed={was.length * 7} stroke="var(--red)" strokeWidth={1.6} />
          <text x={lx + was.length * cw + 10} y={y} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 600 }}>
            {value}
          </text>
        </g>
      ) : (
        <text x={lx} y={y} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink)' }}>
          {value}
        </text>
      )}
    </g>
  )
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  const c = g.card
  const fy = c.y + (narrow ? 48 : 40)
  const lh = g.mono + (narrow ? 12 : 9)
  // header card per step
  const header =
    step === 0 ? (
      <>
        <Field g={g} x={c.x + 12} y={fy} label="pitanje:" value={narrow ? 'klopa-api.klopa.svc… ?' : 'klopa-api.klopa.svc.cluster.local ?'} />
        <Field g={g} x={c.x + 12} y={fy + lh} label="odgovor:" value="10.96.12.7" />
      </>
    ) : step < 4 ? (
      <>
        <Field g={g} x={c.x + 12} y={fy} label="izvor:" value="10.244.1.7:51234" />
        <Field g={g} x={c.x + 12} y={fy + lh} label="odredište:" value={step === 1 ? '10.96.12.7:80' : '10.244.2.15:8000'} was={step === 2 ? '10.96.12.7:80' : undefined} />
      </>
    ) : (
      <>
        <Field g={g} x={c.x + 12} y={fy} label="izvor:" value="10.96.12.7:80" was="10.244.2.15:8000" />
        <Field g={g} x={c.x + 12} y={fy + lh} label="odredište:" value="10.244.1.7:51234" />
      </>
    )
  const path = g.paths[step]
  return (
    <Diagram width={g.W} height={g.H} label={`Korak ${step + 1}: ${STEPS[step].title}`}>
      {/* header of the packet, rewritten in place */}
      {/* a sticky note: .k-note re-pens --ink / --red / --pen to dark paper pens in both themes */}
      <g className="k-note">
        <rect x={c.x} y={c.y} width={c.w} height={narrow ? 92 : 76} rx={4} className="k-pinned" style={{ fill: 'var(--note-blue)' }} />
        <text x={c.x + 12} y={c.y + 20} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--note-ink)' }}>
          {step === 0 ? 'DNS upit (UDP 53)' : step === 4 ? 'zaglavlje odgovora' : 'zaglavlje paketa'}
        </text>
        {header}
      </g>
      {g.nodes.map((n) => (
        <g key={n.label}>
          <DGroup x={n.x} y={n.y} w={n.w} h={n.h} />
          <text x={n.x + 12} y={n.y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
            čvor {n.label}
          </text>
        </g>
      ))}
      {/* Pods */}
      <PodShape x={g.client[0]} y={g.client[1]} size={38} tone="teal" ariaLabel="Pod klopa-web" />
      <text x={g.client[0]} y={g.client[1] + 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        klopa-web
      </text>
      <text x={g.client[0]} y={g.client[1] + 40 + g.mono + 3} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
        10.244.1.7
      </text>
      {[
        { p: g.pod2, ip: '10.244.2.15', hit: step >= 3 },
        { p: g.pod3, ip: '10.244.3.8', hit: false },
      ].map(({ p, ip, hit }) => (
        <g key={ip}>
          <PodShape x={p[0]} y={p[1]} size={38} tone="violet" selected={hit} ariaLabel={`Pod klopa-api ${ip}`} />
          <text x={p[0]} y={p[1] + 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
            klopa-api
          </text>
          <text x={p[0]} y={p[1] + 40 + g.mono + 3} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: hit ? 'var(--red)' : 'var(--ink-2)' }}>
            {ip}
          </text>
        </g>
      ))}
      <PodShape x={g.dns[0]} y={g.dns[1]} size={34} tone="amber" ariaLabel="Pod CoreDNS" />
      <text x={g.dns[0]} y={g.dns[1] + 38} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        CoreDNS
      </text>
      {/* the rules on node-1 (the same rules are on every node) */}
      <Rough shape={{ k: 'rect', x: g.rules.x, y: g.rules.y, w: g.rules.w, h: g.rules.h }} seed={1441} stroke={step === 2 ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={step === 2 ? 1.8 : 1.2} dash={step === 2 ? undefined : '5 4'} />
      <text x={g.rules.x + 8} y={g.rules.y + 22} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        pravila (kube-proxy)
      </text>
      <text x={g.rules.x + 8} y={g.rules.y + 22 + lh} className="k-svg-mono" style={{ fontSize: g.mono }}>
        10.96.12.7:80 →
      </text>
      <text x={g.rules.x + 8} y={g.rules.y + 22 + 2 * lh} className="k-svg-mono" style={{ fontSize: g.mono, fill: step >= 2 ? 'var(--red)' : 'var(--ink-2)' }}>
        {narrow ? '.2.15 ili .3.8 (nasumično)' : '.2.15 | .3.8 nasumično'}
      </text>
      {!narrow &&
        g.nodes.slice(1).map((n) => (
          <text key={`r-${n.label}`} x={n.x + 14} y={n.y + n.h - 14} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
            ista pravila i ovdje
          </text>
        ))}
      {/* the ClusterIP: an address no machine has */}
      {(step === 1 || step === 2) && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: g.vip[0], cy: g.vip[1], w: narrow ? 92 : 30, h: narrow ? 60 : 30 }} seed={1442} stroke="var(--pen)" strokeWidth={1.4} dash="4 4" />
          <text x={g.vip[0]} y={g.vip[1] + 7} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand + 2, fill: 'var(--pen)' }}>
            ?
          </text>
          <text
            x={g.vip[0]}
            y={narrow ? g.vip[1] + 52 : g.vip[1] + 36}
            textAnchor="middle"
            className="k-svg-mono"
            style={{ fontSize: g.mono, fill: 'var(--pen)', stroke: 'var(--paper)', strokeWidth: 5, paintOrder: 'stroke', strokeLinejoin: 'round' }}
          >
            10.96.12.7
          </text>
        </g>
      )}
      {path.length > 1 && <Packet key={`p-${step}`} path={path} duration={1.4} delay={0.35} tone={step === 4 ? 'ok' : undefined} />}
    </Diagram>
  )
}

/** Scene 4: one packet from klopa-web to a Pod behind the Service – header labels rewritten in place. */
export function PacketStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 640 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Put paketa kroz Service" steps={STEPS}>
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
