import { useState } from 'react'
import { Diagram, Edge, MenzaGate, PodShape, Rough, RoughBox, Segmented, ServiceTag, Signpost, useWidth } from '../../../kit'
import { OWNS, ROLE_LABEL, SNIPPET, type Role } from './roles-data'
import { ClassCard, OwnerTag } from './parts'
import css from '../styles.module.css'

const KINDS = ['GatewayClass', 'Gateway', 'HTTPRoute', 'Service', 'Podovi']
const NAMES = ['eg', 'klopa-gw', 'klopa', 'klopa-api', 'app=klopa-api']
const REFS = ['gatewayClassName', 'parentRefs', 'backendRefs', 'selector']
const OWNER_OF: Role[] = ['class', 'gw', 'route', 'route', 'route']
const OWNER_WORD: Record<Role, string> = { class: 'pružatelj', gw: 'Davor', route: 'Lana' }
const HALO: Record<Role, string> = { class: 'var(--hl-yellow-ink)', gw: 'var(--hl-blue-ink)', route: 'var(--hl-green-ink)' }

function Thing({ i, x, y, s }: { i: number; x: number; y: number; s: number }) {
  switch (i) {
    case 0:
      return <ClassCard x={x - 26 * s} y={y - 24 * s} w={52 * s} h={48 * s} />
    case 1:
      return <MenzaGate x={x - 36 * s} y={y - 34 * s} w={72 * s} h={68 * s} label="GW" labelSize={14} />
    case 2:
      return <Signpost x={x - 22 * s} y={y - 30 * s} w={44 * s} h={60 * s} />
    case 3:
      return <ServiceTag x={x - 40 * s} y={y - 16 * s} w={80 * s} h={32 * s} />
    default:
      return (
        <g>
          <PodShape x={x - 22 * s} y={y} size={26 * s} tone="violet" />
          <PodShape x={x + 10 * s} y={y - 14 * s} size={26 * s} tone="violet" />
          <PodShape x={x + 14 * s} y={y + 16 * s} size={26 * s} tone="violet" />
        </g>
      )
  }
}

function Chain({ role, narrow }: { role: Role; narrow: boolean }) {
  const W = narrow ? 360 : 680
  const H = narrow ? 560 : 300
  const m = 14
  const pos = (i: number): [number, number] => (narrow ? [96, 70 + i * 104] : [68 + i * 136, 140])
  const owned = OWNS[role]
  return (
    <Diagram width={W} height={H} label={`Lanac GatewayClass → Gateway → HTTPRoute → Service → Podovi. Označeno je ono što piše uloga: ${ROLE_LABEL[role]}.`}>
      {/* references: from the object that names to the object it names */}
      {REFS.map((ref, i) => {
        const a = pos(i)
        const b = pos(i + 1)
        const from: [number, number] = narrow ? [b[0], b[1] - 40] : [b[0] - 46, b[1]]
        const to: [number, number] = narrow ? [a[0], a[1] + 40] : [a[0] + 46, a[1]]
        // backendRefs and selector point forward; gatewayClassName and parentRefs point back to what they name
        const fwd = i >= 2
        const lx = narrow ? 170 : (a[0] + b[0]) / 2
        const ly = narrow ? (a[1] + b[1]) / 2 + 5 : 238
        return (
          <g key={ref}>
            <Edge from={fwd ? to : from} to={fwd ? from : to} tone="blue" width={1.6} />
            <text x={lx} y={ly} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--pen)' }}>
              {ref}
            </text>
            {!narrow && <line x1={lx} y1={ly - 16} x2={lx} y2={b[1] + 6} style={{ stroke: 'var(--pen)', strokeWidth: 1, strokeDasharray: '2 4' }} />}
          </g>
        )
      })}
      {KINDS.map((k, i) => {
        const [x, y] = pos(i)
        const mine = owned.includes(i)
        const o = OWNER_OF[i]
        return (
          <g key={k}>
            {mine && <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: narrow ? 108 : 112, h: 92 }} seed={1801 + i} stroke={HALO[role]} fillColor={HALO[role]} hachureGap={7} fillWeight={0.9} strokeWidth={2} />}
            <Thing i={i} x={x} y={y} s={1} />
            <text x={narrow ? x + 64 : x} y={narrow ? y - 10 : y - 58} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-display" style={{ fontSize: 15, fill: 'var(--ink)' }}>
              {k}
            </text>
            <text x={narrow ? x + 64 : x} y={narrow ? y + 10 : y + 64} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
              {NAMES[i]}
            </text>
            {!narrow && <OwnerTag x={x} y={34} text={OWNER_WORD[o]} tone={o} />}
            {narrow && <OwnerTag x={narrow ? x + 64 : x} y={y + 32} text={OWNER_WORD[o]} tone={o} anchor="start" />}
          </g>
        )
      })}
    </Diagram>
  )
}

const ROLE_TEXT: Record<Role, { writes: string; not: string }> = {
  class: {
    writes: 'Instalira kontroler (ovdje Envoy Gateway) i objavljuje GatewayClass: „ova vrsta vrata postoji i gradi ih ovaj kontroler”. To može biti tim platforme ili pružatelj oblaka.',
    not: 'Ne zna ništa o Klopi, njezinim domenama ni putanjama.',
  },
  gw: {
    writes: 'Piše Gateway: slušatelje (engl. listeners – port i protokol na kojima vrata primaju promet, ovdje :80 i :443), certifikat iz Secreta i iz kojeg se Namespacea rute smiju vezati na vrata (allowedRoutes). Jedna adresa, jedan račun.',
    not: 'Ne piše pravila aplikacija – ne mora znati da /api postoji.',
  },
  route: {
    writes: 'Piše HTTPRoute za svoju aplikaciju: domene, putanje, zaglavlja i težine – uz svoj Service i Deployment. Novu putanju dodaje bez čekanja na Davora.',
    not: 'Ne može promijeniti vrata, slušatelje ni certifikat; ruta vrijedi samo ako je Gateway pusti.',
  },
}

export function RolesChain() {
  const [role, setRole] = useState<Role>('gw')
  const [ref, w] = useWidth<HTMLDivElement>()
  // wide lettering is 14 units in a 680 viewBox: ≥ 12 px from 583 px up
  const narrow = w !== null && w < 584
  const t = ROLE_TEXT[role]
  return (
    <div ref={ref} className={css.panel}>
      <Segmented label="Uloga" value={role} onChange={setRole} options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <div className={narrow ? css.narrowCap : undefined}>
        <Chain role={role} narrow={narrow} />
      </div>
      <div className={css.twoCol}>
        <div className={css.roleText} aria-live="polite">
          <strong>{ROLE_LABEL[role]}</strong>
          <ul>
            <li>{t.writes}</li>
            <li>{t.not}</li>
          </ul>
        </div>
        <RoughBox className={css.snippetBox} stroke="var(--ink-3)" strokeWidth={1.4} pad={2} seed={1971}>
          <pre className={css.snippet} tabIndex={0} aria-label={`YAML koji piše uloga: ${ROLE_LABEL[role]}`}>
            {SNIPPET[role].map((l, i) => (l.startsWith('!') ? <mark key={i}>{l.slice(1) + '\n'}</mark> : <span key={i}>{l + '\n'}</span>))}
          </pre>
        </RoughBox>
      </div>
    </div>
  )
}
