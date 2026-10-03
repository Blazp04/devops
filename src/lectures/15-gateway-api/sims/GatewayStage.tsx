import {
  Check,
  Cross,
  Davor,
  Diagram,
  Envelope,
  MenzaGate,
  PodShape,
  Redar,
  Rough,
  ServiceTag,
  Signpost,
  SpeechBubble,
  StudentQueue,
  pointAt,
  useDiagramIds,
} from '../../../kit'
import { GW_IP, LB_PRICE, LB_TARGETS, SERVICES, T_FAIL, T_IN, T_OUT, T_SERVE, secretValid, type GwState } from './gateway-model'
import { LB_ROW, failPt, inPath, outPath, roads, type Geo, type Pt } from './gateway-geo'
import { ClassCard, OwnerTag, Padlock } from './parts'

interface StageProps {
  s: GwState
  g: Geo
  showPath: boolean
  roles: boolean
  bubble: string[] | null
  davorBuzz: boolean
}

const PODS_PER_ROW = SERVICES.map((v) => v.pods.length)

function poly(pts: Pt[]) {
  return pts.map((p) => p.join(',')).join(' ')
}

function Trays({ s, g }: { s: GwState; g: Geo }) {
  const ids = useDiagramIds()
  if (!ids) return null
  const mode = s.cfg.mode
  const items = s.reqs.map((q) => {
    let p: Pt
    let fall = 0
    if (q.phase === 'in') p = pointAt(inPath(g, mode, q.lb), Math.min(1, q.pt / T_IN))
    else if (q.phase === 'fail') {
      p = failPt(g, q.failAt ?? 'exit', q.id)
      fall = Math.min(1, q.pt / (T_FAIL * 0.5))
    } else {
      const row = SERVICES.findIndex((v) => v.name === q.svc)
      const path = outPath(g, mode, Math.max(0, row), q.pod, q.lb)
      p = q.phase === 'out' ? pointAt(path, Math.min(1, q.pt / T_OUT)) : path[path.length - 1]
    }
    return { q, p, fall }
  })
  const tw = g.kind === 'wide' ? 26 : 24
  // only the newest failed tray at each fall point carries its code (TLS / 500 / 404), so the labels never pile up
  const newest: Record<string, number> = {}
  for (const { q } of items) if (q.phase === 'fail') newest[q.failAt ?? 'exit'] = Math.max(newest[q.failAt ?? 'exit'] ?? 0, q.id)
  return (
    <g aria-hidden="true">
      {items.map(({ q, p, fall }) => {
        const failed = q.phase === 'fail'
        const served = q.phase === 'serve'
        const bad = failed || (served && (q.outcome === 'app404' || q.outcome === 'leak'))
        const x = p[0] + (failed ? fall * 6 : 0)
        const y = p[1] + (failed ? fall * 26 : 0)
        const fill = bad ? 'color-mix(in srgb, var(--red) 70%, var(--paper))' : 'var(--tray)'
        return (
          <g key={q.id} transform={failed ? `rotate(${fall * 32} ${x} ${y})` : undefined}>
            <use href={ids.tray} x={x - tw / 2} y={y - tw * 0.35} width={tw} height={tw * 0.7} fill={fill} />
            {q.tls && !failed && (
              <g>
                <path d={`M${x - 2.7} ${y - tw * 0.52} v-2.4 a2.7 2.7 0 0 1 5.4 0 v2.4`} fill="none" style={{ stroke: 'var(--green)', strokeWidth: 1.6 }} />
                <rect x={x - 4.2} y={y - tw * 0.52} width={8.4} height={6.6} rx={1.2} style={{ fill: 'var(--green)' }} />
              </g>
            )}
            {q.beta && <circle cx={x + tw * 0.5} cy={y - tw * 0.3} r={4.6} style={{ fill: 'var(--pen)', stroke: 'var(--paper)', strokeWidth: 1.4 }} />}
          </g>
        )
      })}
      {items
        .filter(({ q }) => q.phase === 'fail' || (q.phase === 'serve' && q.pt < T_SERVE))
        .map(({ q, p }) => {
          const bad = q.phase === 'fail' || q.outcome === 'app404' || q.outcome === 'leak'
          const code = q.outcome === 'tls' ? 'TLS' : q.outcome === 'gw500' ? '500' : q.outcome === 'leak' ? '200 !' : bad ? '404' : ''
          const mx = q.phase === 'fail' ? p[0] + 16 : p[0] + g.podSize * 0.62
          const my = q.phase === 'fail' ? p[1] + 30 : p[1] + 2
          return (
            <g key={`m${q.id}`}>
              {bad ? <Cross x={mx} y={my} size={7} /> : <Check x={mx} y={my} size={6} />}
              {bad && q.phase === 'fail' && newest[q.failAt ?? 'exit'] === q.id && (
                <text x={mx + 10} y={my + 5} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
                  {code}
                </text>
              )}
            </g>
          )
        })}
    </g>
  )
}

export function GatewayStage({ s, g, showPath, roles, bubble, davorBuzz }: StageProps) {
  const mode = s.cfg.mode
  const gw = mode === 'gw'
  const https = s.cfg.https
  const certOk = secretValid(s.cfg.secret)
  /** wide and medium share the side-by-side arrangement; medium is just tighter */
  const wide = g.kind !== 'narrow'
  const med = g.kind === 'medium'
  const m = g.mono
  const label = gw
    ? `Gateway klopa-gw: studenti šalju zahtjeve preko jednog load balancera u oblaku do Gatewaya, a on ih prema pravilima šalje izravno na Podove četiriju objekata Service. HTTPS ${https ? (certOk ? 'radi' : 'ne radi – krivi Secret') : 'nije uključen'}.`
    : 'Tri LoadBalancer Servicea: svaka domena ima svoj load balancer i svoju javnu adresu; load balancer ne vidi putanju, pa /api završava na klopa-web.'
  return (
    <div style={{ maxWidth: wide ? undefined : 460, margin: '0 auto', width: '100%' }}>
      <Diagram width={g.W} height={g.H} label={label}>
        {/* roads */}
        <g aria-hidden="true">
          {roads(g, mode, PODS_PER_ROW).map((r, i) => (
            <polyline key={`${mode}-${i}`} points={poly(r)} fill="none" style={{ stroke: 'var(--ink-4)', strokeWidth: 1.5, strokeLinejoin: 'round' }} />
          ))}
        </g>

        {/* the students */}
        <StudentQueue x={g.source.x} y={g.source.y} count={g.source.count} scale={g.source.scale} direction={g.source.direction} />
        <text x={g.source.label[0]} y={g.source.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand * 1.45 }}>
          studenti
        </text>

        {gw ? (
          <g>
            <g aria-hidden="true">
              <Redar x={g.redar.x} y={g.redar.y} scale={g.redar.scale} angle={0} />
            </g>
            <text x={wide ? g.redar.x - (med ? 16 : 6) : g.redar.x} y={wide ? g.redar.y - 52 : g.redar.y + 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
              {wide ? `LB · ${LB_PRICE} €/mj.` : `LB ${LB_PRICE} €`}
            </text>
            <MenzaGate x={g.gate.x} y={g.gate.y} w={g.gate.w} h={g.gate.h} label="Gateway" labelSize={wide ? 15 : 14} />
            <Signpost x={g.sign.x} y={g.sign.y} w={g.sign.w} h={g.sign.h} />
            {/* listeners */}
            <g>
              <text x={g.listeners[0] - (wide ? 4 : 2)} y={g.listeners[1]} textAnchor="end" className="k-svg-mono" style={{ fontSize: m }}>
                :80
              </text>
              <text x={g.listeners[0] + (wide ? 4 : 2)} y={g.listeners[1]} textAnchor="start" className="k-svg-mono" style={{ fontSize: m, fill: https ? (certOk ? 'var(--green)' : 'var(--red)') : 'var(--ink-3)' }}>
                :443
              </text>
              <Padlock x={g.listeners[0] + (wide ? 56 : 52)} y={g.listeners[1] - 5} state={https ? (certOk ? 'ok' : 'bad') : 'off'} />
            </g>
            {/* the certificate Secret */}
            {https && (
              <g>
                <Rough
                  shape={{ k: 'line', x1: g.envelope.x + 28, y1: g.envelope.y, x2: g.listeners[0] + 30, y2: g.listeners[1] + 6 }}
                  seed={1571}
                  stroke={certOk ? 'var(--pen)' : 'var(--red)'}
                  strokeWidth={1.4}
                  dash="4 4"
                />
                <Envelope x={g.envelope.x} y={g.envelope.y} w={56} h={36} />
                {!certOk && <Cross x={g.envelope.x + 62} y={g.envelope.y + 6} size={8} />}
                <text
                  x={wide ? g.envelope.x + 28 : g.envelope.x - 8}
                  y={wide ? g.envelope.y + 56 : g.envelope.y + 24}
                  textAnchor={wide ? 'middle' : 'end'}
                  className="k-svg-mono"
                  style={{ fontSize: m, fill: certOk ? 'var(--ink)' : 'var(--red)' }}
                >
                  {s.cfg.secret.replace('klopa-staging/', 'staging/')}
                </text>
              </g>
            )}
          </g>
        ) : (
          <g>
            {g.lbRedars.map((r, i) => (
              <g key={i}>
                <g aria-hidden="true">
                  <Redar x={r.x} y={r.y} scale={r.scale} angle={0} sweat={i === 0 ? 2 : 0} />
                </g>
                <text x={r.label[0]} y={r.label[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
                  {wide ? `LB ${LB_TARGETS[i].ip.replace('203.0.113', '…')} · ${LB_PRICE} €` : `LB ${LB_PRICE} €`}
                </text>
                {wide && (
                  <text x={r.label[0]} y={r.label[1] + 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand * 1.45, fill: LB_TARGETS[i].host ? 'var(--ink-2)' : 'var(--red)' }}>
                    {LB_TARGETS[i].host ?? 'nijedna domena'}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}

        {/* Services (tags) and their Pods */}
        {SERVICES.map((v, row) => {
          const y = g.rowY[row]
          const lbRow = !gw && !LB_ROW.includes(row)
          return (
            <g key={v.name}>
              <ServiceTag x={g.tag.x} y={y - g.tag.h / 2} w={g.tag.w} h={g.tag.h} seed={4510 + row}>
                <text x={g.tag.x + 22} y={y + m * 0.36} className="k-svg-mono" style={{ fontSize: m, fill: lbRow ? 'var(--ink-3)' : 'var(--ink)', fontWeight: 600 }}>
                  {v.name}
                </text>
              </ServiceTag>
              {v.app === 'api' && (
                <text x={g.tag.x + 22} y={y + g.tag.h / 2 + m + 4} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
                  verzija {v.label}
                </text>
              )}
              {showPath && gw && (
                <g>
                  <text x={g.tag.x + 22} y={y + g.tag.h / 2 + 2 * m + 8} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-3)' }}>
                    ClusterIP {v.clusterIP}
                  </text>
                  <Rough shape={{ k: 'line', x1: g.tag.x + 18, y1: y + g.tag.h / 2 + 2 * m + 4, x2: g.tag.x + 22 + (10 + v.clusterIP.length) * m * 0.6, y2: y + g.tag.h / 2 + 2 * m + 2 }} seed={1560 + row} stroke="var(--red)" strokeWidth={1.6} />
                </g>
              )}
              {v.pods.map((ip, i) => (
                <g key={ip}>
                  <PodShape x={g.podX[i]} y={y} size={g.podSize} tone={v.tone} status="running" />
                  {showPath && (
                    <text x={g.podX[i]} y={y + g.podSize / 2 + m + 6} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m, fill: 'var(--pen)' }}>
                      {ip.replace('10.244', '')}
                    </text>
                  )}
                </g>
              ))}
            </g>
          )
        })}
        {showPath && (
          <g>
            <text x={g.W - 6} y={g.kind === 'wide' ? 18 : g.H - 8} textAnchor="end" className="k-svg-mono" style={{ fontSize: m, fill: 'var(--pen)' }}>
              Pod IP: 10.244.…
            </text>
            {gw && (
              <text x={wide ? g.tag.x + (med ? 66 : 70) : 8} y={wide ? 20 : g.H - 8} textAnchor={wide ? 'middle' : 'start'} className="k-svg-hand" style={{ fontSize: g.hand * 1.45, fill: 'var(--red)' }}>
                {wide ? 'Gateway preskače ClusterIP' : 'ClusterIP se preskače'}
              </text>
            )}
          </g>
        )}

        {/* roles view: who owns which part */}
        {roles && gw && (
          <g>
            {wide ? (
              <g>
                <text x={g.gate.x} y={94} className="k-svg-mono" style={{ fontSize: m }}>
                  GatewayClass
                </text>
                <ClassCard x={g.gate.x} y={100} w={46} h={44} />
                <OwnerTag x={g.gate.x + (med ? 50 : 54)} y={128} text="pružatelj" tone="class" anchor="start" />
              </g>
            ) : (
              <g>
                <ClassCard x={290} y={4} w={44} h={42} />
                <OwnerTag x={354} y={64} text="pružatelj" tone="class" anchor="end" />
                <OwnerTag x={104} y={20} text="Davor" tone="gw" />
                <OwnerTag x={20} y={214} text="Lana · HTTPRoute" tone="route" anchor="start" />
              </g>
            )}
          </g>
        )}
        {wide && gw && (
          roles ? (
            <OwnerTag x={g.gate.x + g.gate.w / 2 + 6} y={g.gate.y - 10} text="Davor · Gateway" tone="gw" />
          ) : med ? (
            <g>
              <text x={g.gate.x + g.gate.w / 2} y={g.gate.y - 28} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
                klopa-gw
              </text>
              <text x={g.gate.x + g.gate.w / 2} y={g.gate.y - 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
                {GW_IP}
              </text>
            </g>
          ) : (
            <text x={g.gate.x + g.gate.w / 2} y={g.gate.y - 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
              klopa-gw · {GW_IP}
            </text>
          )
        )}
        {wide && roles && gw && <OwnerTag x={g.sign.x + g.sign.w / 2} y={g.sign.y - 10} text="Lana" tone="route" />}

        <Trays s={s} g={g} />

        {wide && bubble && (
          <g>
            <Davor x={6} y={26} scale={0.5} buzz={davorBuzz} mood={davorBuzz ? 'worry' : 'smile'} />
            <SpeechBubble x={54} y={6} w={134} h={54} tx={42} ty={46} lines={bubble} size={21} />
          </g>
        )}
      </Diagram>
    </div>
  )
}
