import { Check, Cross, Diagram, K8sIcon, LoopArrows, MenzaGate, Packet, PodShape, Rough, Stepper, Term, stepColor, useWidth } from '../../../kit'

const CMD = ['kubectl apply -f gateway.yaml', 'kubectl apply … standard-install.yaml', 'kubectl apply … install.yaml', 'kubectl get gateway -n klopa']
const BUILTIN = ['Pod', 'Deployment', 'Service', 'ConfigMap', '…']
const ADDED = ['GatewayClass', 'Gateway', 'HTTPRoute']

/** A gate that is only wished for: dashed pencil posts and arch (desired state). Box x, y, w, h. */
function DashedGate({ x, y, w, h, stroke = 'var(--ink-3)' }: { x: number; y: number; w: number; h: number; stroke?: string }) {
  const pt = y + h * 0.3
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: pt, w: w * 0.13, h: h * 0.7 }} seed={1701} dash="5 4" stroke={stroke} />
      <Rough shape={{ k: 'rect', x: x + w * 0.87, y: pt, w: w * 0.13, h: h * 0.7 }} seed={1702} dash="5 4" stroke={stroke} />
      <Rough shape={{ k: 'curve', pts: [[x, pt], [x + w * 0.2, y + h * 0.06], [x + w / 2, y], [x + w * 0.8, y + h * 0.06], [x + w, pt]] }} seed={1703} dash="5 4" stroke={stroke} />
    </g>
  )
}

function CrdStage({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 600
  const W = narrow ? 360 : 680
  const H = narrow ? 470 : 304
  const m = 14
  // anchors
  const api: [number, number] = narrow ? [52, 112] : [72, 150]
  const board = narrow ? { x: 104, y: 52, w: 240, h: 196 } : { x: 140, y: 52, w: 200, h: 220 }
  const gate = narrow ? { x: 24, y: 300, w: 110, h: 110 } : { x: 384, y: 92, w: 120, h: 130 }
  const ring: [number, number] = narrow ? [262, 318] : [602, 104]
  const pods: [number, number][] = narrow
    ? [
        [222, 418],
        [298, 418],
      ]
    : [
        [570, 228],
        [636, 228],
      ]
  const c = stepColor(step)
  const known = step >= 1
  const label = [
    'API server ne poznaje vrstu Gateway i odbija objekt.',
    'CRD-ovi su dodali vrste GatewayClass, Gateway i HTTPRoute; Gateway je spremljen, ali ga nitko ne ostvaruje (iscrtkan).',
    'Kontroler (petlja) gleda API i za Gateway pokreće Podove s proxyjem.',
    'Gateway je programiran, ima adresu i propušta zahtjeve.',
  ][step]
  return (
    <div ref={ref}>
      <Diagram width={W} height={H} label={label}>
        <text x={W / 2} y={24} textAnchor="middle" className="k-svg-mono" style={{ fontSize: narrow ? 13.5 : m, fill: 'var(--ink)' }}>
          $ {CMD[step]}
        </text>
        <K8sIcon kind="api" x={api[0]} y={api[1]} size={narrow ? 54 : 64} />
        <text x={api[0]} y={api[1] + (narrow ? 56 : 64)} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
          API server
        </text>
        {/* the list of kinds the API knows */}
        <Rough shape={{ k: 'rect', x: board.x, y: board.y, w: board.w, h: board.h }} seed={1711} fillColor="var(--paper)" fillStyle="solid" strokeWidth={1.5} />
        <text x={board.x + 12} y={board.y + 24} className="k-svg-hand" style={{ fontSize: m * 1.45, fill: 'var(--ink-2)' }}>
          vrste koje API zna
        </text>
        {BUILTIN.map((k, i) => (
          <text key={k} x={board.x + 14} y={board.y + 50 + i * 20} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
            {k}
          </text>
        ))}
        {known &&
          ADDED.map((k, i) => {
            const x = narrow ? board.x + 128 : board.x + 14
            const y = narrow ? board.y + 50 + i * 20 : board.y + 154 + i * 20
            return (
              <g key={k}>
                <Rough shape={{ k: 'line', x1: x - 4, y1: y - 4.5, x2: x + k.length * m * 0.6 + 4, y2: y - 5.5 }} seed={1720 + i} stroke="var(--hl-green-ink)" strokeWidth={18} roughness={0.6} />
                <text x={x} y={y} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--note-ink)', fontWeight: 600 }}>
                  {k}
                </text>
              </g>
            )
          })}
        {known && (
          <text x={narrow ? board.x + 128 : board.x + 10} y={narrow ? board.y + 132 : board.y + board.h + 24} textAnchor="start" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: c }}>
            {narrow ? '① + CRD-ovi' : '① novo: CRD-ovi'}
          </text>
        )}

        {/* the Gateway object */}
        {step === 0 && (
          <g>
            <DashedGate {...gate} stroke="var(--red)" />
            <Cross x={gate.x + gate.w / 2} y={gate.y + gate.h * 0.6} size={22} />
            <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 26} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m, fill: 'var(--red)' }}>
              no matches for kind
            </text>
            <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 44} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m, fill: 'var(--red)' }}>
              "Gateway"
            </text>
          </g>
        )}
        {(step === 1 || step === 2) && <DashedGate {...gate} stroke={step === 1 ? 'var(--ink-3)' : 'var(--pen)'} />}
        {step === 3 && <MenzaGate x={gate.x} y={gate.y} w={gate.w} h={gate.h} label="klopa-gw" labelSize={14} />}
        {step >= 1 && (
          <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 26} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m, fill: step === 3 ? 'var(--green)' : 'var(--ink-2)' }}>
            {step === 3 ? 'Programmed: True' : 'Programmed: –'}
          </text>
        )}
        {step === 1 && (
          <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 48} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: 'var(--ink-2)' }}>
            spremljen, ali mrtav
          </text>
        )}
        {step === 3 && (
          <g>
            <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
              203.0.113.25
            </text>
            <Check x={gate.x + gate.w + 10} y={gate.y + gate.h * 0.4} size={10} />
            <Packet path={narrow ? [[gate.x - 20, gate.y + gate.h * 0.8], [gate.x + gate.w + 30, gate.y + gate.h * 0.8]] : [[gate.x - 30, gate.y + gate.h * 0.8], [gate.x + gate.w + 40, gate.y + gate.h * 0.8]]} duration={1.6} tone="neutral" r={5} />
          </g>
        )}

        {/* the controller */}
        {step >= 2 && (
          <g>
            <LoopArrows cx={ring[0]} cy={ring[1]} r={narrow ? 34 : 38} />
            <text x={ring[0]} y={ring[1] + 5} textAnchor="middle" className="k-svg-display" style={{ fontSize: m }}>
              kontroler
            </text>
            <text x={ring[0]} y={ring[1] - (narrow ? 44 : 48)} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
              Envoy Gateway
            </text>
            {pods.map((p, i) => (
              <PodShape key={i} x={p[0]} y={p[1]} size={30} tone="teal" status={step === 2 ? 'creating' : 'running'} />
            ))}
            <text x={(pods[0][0] + pods[1][0]) / 2} y={pods[0][1] + (narrow ? 36 : 38)} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: stepColor(2) }}>
              ② proxy Podovi
            </text>
            <Rough
              shape={{ k: 'line', x1: ring[0] - (narrow ? 40 : 44), y1: ring[1] + (narrow ? 4 : 10), x2: narrow ? gate.x + gate.w + 8 : gate.x + gate.w + 14, y2: narrow ? gate.y + 30 : gate.y + 40 }}
              seed={1741}
              stroke="var(--pen)"
              strokeWidth={1.5}
              dash="5 5"
            />
          </g>
        )}
        {step >= 2 && !narrow && (
          <Rough shape={{ k: 'line', x1: api[0] + 34, y1: api[1] - 40, x2: ring[0] - 44, y2: ring[1] - 20 }} seed={1742} stroke="var(--pen)" strokeWidth={1.2} dash="3 5" />
        )}
      </Diagram>
    </div>
  )
}

export function CrdStepper() {
  return (
    <Stepper
      title="Kako Gateway API dolazi u klaster"
      steps={[
        {
          title: 'Kubernetes ne zna što je Gateway',
          body: (
            <>
              Davor pošalje <code>gateway.yaml</code>, a API server ga odbije: u njegovu popisu vrsta nema Gatewaya. Gateway API nije ugrađen u Kubernetes.
            </>
          ),
        },
        {
          title: 'CRD-ovi: nove vrste u API-ju',
          body: (
            <>
              Instaliramo <strong>CRD-ove</strong> (engl. <em>Custom Resource Definition</em>) Gateway API-ja (neki kontroleri, među njima i Envoy Gateway, donose ih sami). API server sada prihvaća GatewayClass, Gateway i HTTPRoute i
              sprema ih u <code>etcd</code> – ali nitko ništa ne radi s njima. Gateway je zasad samo želja, nacrtana iscrtkano.
            </>
          ),
        },
        {
          title: 'Kontroler: petlja koja oživi vrata',
          body: (
            <>
              Kontroler (ovdje Envoy Gateway) kroz API server gleda objekte Gateway API-ja – ista <Term id="reconciliation-loop">petlja usklađivanja</Term> kao kod Deploymenta. Za naš Gateway pokreće Podove s proxyjem i od oblaka
              traži jedan load balancer.
            </>
          ),
        },
        {
          title: 'Vrata rade',
          body: <>Gateway dobiva adresu i stanje Programmed=True (kontroler je proxy stvarno konfigurirao). Promet izvana sada ulazi kroz ta vrata, a kamo dalje, odlučuju pravila u HTTPRouteu.</>,
        },
      ]}
    >
      {(step) => <CrdStage step={step} />}
    </Stepper>
  )
}
