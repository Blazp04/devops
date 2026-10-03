import { useState } from 'react'
import { Arrow, DNode, Diagram, Edge, Globe, MenzaGate, Redar, Rough, Segmented, ServiceTag, Signpost, Slider, fmt, plural, useWidth } from '../../../kit'
import { LB_PRICE } from './gateway-model'
import { Padlock } from './parts'
import css from '../styles.module.css'

type Way = 'lb' | 'gw'

const APPS = ['web', 'api', 'admin', 'izvjestaji', 'kuhinja', 'status']

/** The sprawl: N apps exposed with N LoadBalancer Services, or one Gateway in front of all of them. */
function Sprawl({ way, n, narrow }: { way: Way; n: number; narrow: boolean }) {
  const W = narrow ? 360 : 680
  const row = narrow ? 60 : 70
  const top = 40
  const H = top + n * row + (way === 'lb' && !narrow ? 40 : narrow && way === 'gw' && n < 3 ? 44 : 24)
  const midY = top + ((n - 1) * row) / 2
  const tagX = narrow ? 206 : 470
  const tagW = narrow ? 148 : 190
  const m = 14
  const ys = Array.from({ length: n }, (_, i) => top + i * row)
  const globe: [number, number] = [narrow ? 34 : 60, midY]
  const lbX = narrow ? 128 : 290
  const gateX = narrow ? 104 : 250
  const apps = `${n} ${plural(n, ['aplikacija', 'aplikacije', 'aplikacija'])}`
  const label =
    way === 'lb'
      ? `${apps} izvana preko ${n} ${plural(n, ['LoadBalancer Servicea', 'LoadBalancer Servicea', 'LoadBalancer Servicea'])}: ${n} ${plural(n, ['javna adresa', 'javne adrese', 'javnih adresa'])}, ${n} ${plural(n, ['load balancer', 'load balancera', 'load balancera'])} u oblaku po ${LB_PRICE} € (pretpostavka) i ${n} ${plural(n, ['mjesto', 'mjesta', 'mjesta'])} za certifikat.`
      : `${apps} iza jednog Gatewaya: jedna javna adresa, jedan load balancer i jedno mjesto za certifikat.`
  return (
    <Diagram width={W} height={H} label={label}>
      <Globe cx={globe[0]} cy={globe[1]} r={narrow ? 24 : 32} />
      <text x={globe[0]} y={globe[1] + (narrow ? 44 : 54)} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45 }}>
        internet
      </text>
      {way === 'lb' ? (
        ys.map((y, i) => (
          <g key={i}>
            <Edge from={[globe[0] + 30, globe[1]]} to={[lbX - 24, y]} width={1.3} />
            <g aria-hidden="true">
              <Redar x={lbX} y={y + 6} scale={narrow ? 0.32 : 0.42} angle={0} arm={false} />
            </g>
            <text x={lbX + (narrow ? 18 : 26)} y={y - 4} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--red)' }}>
              LB {LB_PRICE} €
            </text>
            {!narrow && (
              <text x={lbX + 26} y={y + 14} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
                IP {i + 1}
              </text>
            )}
            <Padlock x={tagX - 20} y={y - 2} state="off" seed={1600 + i} />
            <Edge from={[lbX + (narrow ? 62 : 90), y + 4]} to={[tagX - 26, y + 4]} width={1.3} arrow={false} />
          </g>
        ))
      ) : (
        <g>
          <Edge from={[globe[0] + 30, globe[1]]} to={[gateX - (narrow ? 54 : 78), midY]} width={1.3} />
          <g aria-hidden="true">
            <Redar x={gateX - (narrow ? 38 : 56)} y={midY + 6} scale={narrow ? 0.32 : 0.42} angle={0} arm={false} />
          </g>
          <text x={gateX - (narrow ? 38 : 56)} y={midY + (narrow ? 66 : 52)} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m, fill: 'var(--red)' }}>
            LB {LB_PRICE} €
          </text>
          <MenzaGate x={gateX - 4} y={midY - 46} w={narrow ? 62 : 84} h={84} label="GW" labelSize={14} />
          <Padlock x={gateX + (narrow ? 27 : 38)} y={midY + 56} state="ok" />
          <Signpost x={gateX + (narrow ? 64 : 92)} y={midY - 30} w={30} h={40} />
          {ys.map((y, i) => (
            <Edge key={i} from={[gateX + (narrow ? 96 : 128), midY]} to={[tagX - 4, y + 4]} width={1.3} />
          ))}
        </g>
      )}
      {ys.map((y, i) => (
        <ServiceTag key={i} x={tagX} y={y - 15} w={tagW} h={34} seed={4600 + i}>
          <text x={tagX + 22} y={y + 7} className="k-svg-mono" style={{ fontSize: m, fontWeight: 600 }}>
            {narrow ? APPS[i] : `klopa-${APPS[i]}`}
          </text>
        </ServiceTag>
      ))}
      {way === 'lb' && !narrow && (
        <text x={W - 4} y={H - 8} textAnchor="end" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: 'var(--red)' }}>
          certifikat na svakom mjestu posebno
        </text>
      )}
    </Diagram>
  )
}

/** The path of one request through the layers; in Gateway mode the ClusterIP hop is drawn as bypassed. */
function PathLayers({ way, narrow }: { way: Way; narrow: boolean }) {
  const lbSteps = [
    { t: 'internet', s: 'student', icon: 'globe' as const },
    { t: 'LB u oblaku', s: 'L4: IP i port', icon: 'lb' as const },
    { t: 'čvor', s: 'NodePort', icon: 'server' as const },
    { t: 'kube-proxy', s: 'nasumično po vezi', icon: 'network' as const },
    { t: 'Pod', s: 'klopa-web', icon: 'pod' as const },
  ]
  const gwSteps = [
    { t: 'internet', s: 'student', icon: 'globe' as const },
    { t: 'LB u oblaku', s: 'L4: jedna IP', icon: 'lb' as const },
    { t: 'Gateway', s: 'L7 proxy Podovi', icon: undefined },
    { t: 'ClusterIP', s: 'preskočeno', icon: 'network' as const },
    { t: 'Pod IP', s: 'iz EndpointSlicea', icon: 'pod' as const },
  ]
  const steps = way === 'lb' ? lbSteps : gwSteps
  const W = narrow ? 340 : 680
  const H = narrow ? 5 * 66 + 10 : 160
  const pos = (i: number): [number, number] => (narrow ? [170, 36 + i * 66] : [70 + i * 135, 76])
  const nodeW = narrow ? 210 : 124
  const label =
    way === 'lb'
      ? 'Put zahtjeva s LoadBalancer Serviceom: internet, load balancer u oblaku (L4), čvor, kube-proxy koji Pod bira nasumično po vezi, Pod.'
      : 'Put zahtjeva kroz Gateway: internet, load balancer u oblaku (L4) do Podova proxyja Gatewaya (iza njihova LoadBalancer Servicea), Gateway (L7: domena, putanja, TLS), pa izravno na IP adresu Poda aplikacije iz EndpointSlicea; ClusterIP i kube-proxy aplikacijskog Servicea su preskočeni.'
  return (
    <Diagram width={W} height={H} label={label}>
      {steps.slice(0, -1).map((_, i) => {
        const a = pos(i)
        const b = pos(i + 1)
        const bypassed = way === 'gw' && (i === 2 || i === 3)
        const from: [number, number] = narrow ? [a[0], a[1] + 22] : [a[0] + nodeW / 2, a[1]]
        const to: [number, number] = narrow ? [b[0], b[1] - 22] : [b[0] - nodeW / 2, b[1]]
        return bypassed ? null : <Edge key={i} from={from} to={to} width={1.6} />
      })}
      {way === 'gw' &&
        (narrow ? (
          <Arrow pts={[[pos(2)[0] + nodeW / 2 - 4, pos(2)[1] + 6], [pos(2)[0] + nodeW / 2 + 22, pos(3)[1]], [pos(4)[0] + nodeW / 2 - 4, pos(4)[1] - 6]]} stroke="var(--pen)" strokeWidth={2} seed={1612} />
        ) : (
          <Arrow pts={[[pos(2)[0] + 14, pos(2)[1] - 24], [pos(3)[0], pos(3)[1] - 60], [pos(4)[0] - 14, pos(4)[1] - 24]]} stroke="var(--pen)" strokeWidth={2} seed={1612} />
        ))}
      {steps.map((st, i) => {
        const p = pos(i)
        const skipped = way === 'gw' && i === 3
        return (
          <g key={`${way}-${i}`}>
            <DNode x={p[0]} y={p[1]} w={nodeW} h={46} title={st.t} subtitle={narrow ? st.s : undefined} icon={st.icon} status={skipped ? 'dim' : i === 2 && way === 'gw' ? 'active' : 'normal'} dashed={skipped} animate={false} />
            {!narrow && (
              <text x={p[0]} y={p[1] + 44} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: skipped ? 'var(--ink-3)' : 'var(--ink-2)' }}>
                {st.s}
              </text>
            )}
          </g>
        )
      })}
      {way === 'gw' && (
        <g aria-hidden="true">
          <MenzaGate x={narrow ? 22 : pos(2)[0] - 44} y={narrow ? pos(2)[1] - 18 : 14} w={34} h={34} />
        </g>
      )}
      {way === 'gw' && (
        <g>
          <Rough
            shape={narrow ? { k: 'line', x1: pos(3)[0] - 60, y1: pos(3)[1] - 14, x2: pos(3)[0] + 60, y2: pos(3)[1] + 14 } : { k: 'line', x1: pos(3)[0] - 54, y1: pos(3)[1] - 16, x2: pos(3)[0] + 54, y2: pos(3)[1] + 16 }}
            seed={1611}
            stroke="var(--red)"
            strokeWidth={1.8}
          />
          {!narrow && (
            <text x={pos(3)[0]} y={pos(3)[1] + 72} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 14 * 1.45, fill: 'var(--pen)' }}>
              ravno na Pod, po zahtjevu
            </text>
          )}
        </g>
      )}
    </Diagram>
  )
}

export function LbSprawl() {
  const [way, setWay] = useState<Way>('lb')
  const [n, setN] = useState(3)
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 640
  const ips = way === 'lb' ? n : 1
  const eur = ips * LB_PRICE
  return (
    <div ref={ref} className={css.panel}>
      <div className={css.controlsRow}>
        <Segmented
          label="Kako pustiti promet izvana"
          value={way}
          onChange={setWay}
          options={[
            { value: 'lb', label: 'LoadBalancer za svaki Service' },
            { value: 'gw', label: 'Jedan Gateway' },
          ]}
        />
        <div style={{ minWidth: 220, flex: '1 1 220px' }}>
          <Slider label="Broj aplikacija izvana" value={n} min={1} max={6} onChange={setN} format={(v) => plural(v, ['aplikacija', 'aplikacije', 'aplikacija'])} />
        </div>
      </div>
      <div className={css.readout} aria-live="polite">
        <div>
          <div className={css.bigLabel}>javne adrese</div>
          <div className={`${css.big} ${ips > 1 ? css.bad : css.good}`}>{fmt.num(ips)}</div>
        </div>
        <div>
          <div className={css.bigLabel}>load balanceri u oblaku</div>
          <div className={`${css.big} ${ips > 1 ? css.bad : ''}`}>{fmt.num(eur)} €/mj.</div>
          <div className={css.bigLabel}>pretpostavka: {LB_PRICE} € po LB-u</div>
        </div>
        <div>
          <div className={css.bigLabel}>mjesta za certifikat</div>
          <div className={`${css.big} ${ips > 1 ? css.bad : css.good}`}>{fmt.num(ips)}</div>
        </div>
        <div>
          <div className={css.bigLabel}>/api na drugi Service?</div>
          <div className={`${css.big} ${way === 'lb' ? css.bad : css.good}`}>{way === 'lb' ? '✗ ne' : '✓ da'}</div>
        </div>
      </div>
      <div className={narrow ? css.narrowCap : undefined}>
        <Sprawl way={way} n={n} narrow={narrow} />
      </div>
      <div className={css.bigLabel}>Put jednog zahtjeva</div>
      <div className={narrow ? css.narrowCap : undefined}>
        <PathLayers way={way} narrow={narrow} />
      </div>
    </div>
  )
}
