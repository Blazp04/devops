import { Arrow, Check, Cross, DGroup, Diagram, PodShape, Rough, ServiceTag, fmt, hashSeed, pointAt, useDiagramIds } from '../../../kit'
import { inFlightAt, type ClusterState } from '../../../engines/cluster'
import { labelMatches, selectorText, type StagePod, type StageView } from '../lab'
import { portOf, routeDirect, routeRefused, routeTo, rowY, stageGeometry, type Pt, type StageGeo, type StageKind } from '../stage'

interface Props {
  s: ClusterState
  view: StageView
  kind: StageKind
  label: string
  /** the Pod picked in the controls (blue dashed ring) */
  selected?: string | null
  onSelect?: (podName: string) => void
  /** id of the request sent with „Pošalji zahtjev” (drawn with a pen ring) */
  traced?: string | null
}

const LINE_STROKE: Record<StagePod['line'], string> = {
  traffic: 'var(--green)',
  notReady: 'var(--ink-3)',
  terminating: 'var(--orange)',
  propagating: 'var(--pen)',
  stale: 'var(--orange)',
  none: 'none',
}

/** The Service line to one Pod: solid = in kube-proxy's rules, dashed = in the slice but no traffic, none = not selected. */
function ServiceLine({ g, from, i, p }: { g: StageGeo; from: Pt; i: number; p: StagePod }) {
  if (p.line === 'none') return null
  const port = portOf(g, i)
  const pts: Pt[] = g.trunkX === null ? [from, port] : [[g.trunkX, port[1]], port]
  const solid = p.line === 'traffic' || p.line === 'stale'
  const seed = hashSeed(`svc-line|${p.id}|${g.kind}`)
  const mid: Pt = [pts[0][0] + (port[0] - pts[0][0]) * 0.62, pts[0][1] + (port[1] - pts[0][1]) * 0.62]
  return (
    <g>
      {solid ? (
        <Arrow pts={pts} stroke={LINE_STROKE[p.line]} strokeWidth={p.line === 'traffic' ? 1.9 : 1.7} seed={seed} head={7} />
      ) : (
        <Rough shape={{ k: 'line', x1: pts[0][0], y1: pts[0][1], x2: port[0], y2: port[1] }} seed={seed} stroke={LINE_STROKE[p.line]} strokeWidth={1.5} dash={p.line === 'propagating' ? '2 4' : '6 5'} />
      )}
      {p.line === 'notReady' && <Cross x={mid[0]} y={mid[1]} size={6} seed={seed + 3} />}
      {p.line === 'stale' && (
        <text x={mid[0]} y={mid[1] - 6} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--orange)' }}>
          !
        </text>
      )}
    </g>
  )
}

/** A label sticker on a Pod: green ✓ outline when the selector asks for it and it matches, red when it does not. */
function Sticker({ g, x, y, k, v, sel }: { g: StageGeo; x: number; y: number; k: string; v: string | null; sel: Record<string, string> }) {
  const m = labelMatches(sel, k, v)
  const h = g.mono + 7
  const stroke = m === null ? 'var(--ink-3)' : m ? 'var(--green)' : 'var(--red)'
  return (
    <g>
      {v === null ? (
        <Rough shape={{ k: 'rect', x, y, w: g.stickerW, h }} seed={hashSeed(`st|${k}|${x}|${y}`)} stroke={stroke} strokeWidth={1.2} dash="3 4" />
      ) : (
        <>
          <rect x={x} y={y} width={g.stickerW} height={h} rx={3} style={{ fill: k === 'app' ? 'var(--note-yellow)' : 'var(--note-blue)' }} />
          <Rough shape={{ k: 'rect', x, y, w: g.stickerW, h }} seed={hashSeed(`st|${k}|${v}|${x}`)} stroke={stroke} strokeWidth={m ? 1.6 : 1.1} />
        </>
      )}
      <text x={x + 5} y={y + h - 5.5} className="k-svg-mono" style={{ fontSize: g.mono, fill: v === null ? 'var(--ink-3)' : 'var(--note-ink)' }}>
        {v === null ? `${k}: –` : `${k}=${v}`}
      </text>
    </g>
  )
}

function PodRow({ g, i, p, view, selected, onSelect }: { g: StageGeo; i: number; p: StagePod; view: StageView; selected: boolean; onSelect?: (n: string) => void }) {
  const y = rowY(g, i)
  const sel = view.svc.selector
  const sh = g.mono + 7
  const barLen = g.barW - (g.kind === 'wide' ? 40 : 30)
  const statusNote = p.terminating ? 'Terminating' : p.inSlice && !p.ready ? 'READY 0/1' : null
  return (
    <g>
      <PodShape
        x={g.podX}
        y={y}
        size={g.podSize}
        status={p.shape}
        tone={p.tone}
        selected={selected}
        onClick={onSelect ? () => onSelect(p.name) : undefined}
        ariaLabel={`Pod ${p.name}, ${p.status}${p.inSlice ? (p.ready ? ', spreman' : ', nije spreman') : ', izvan Servicea'}`}
      />
      <Sticker g={g} x={g.stickerX} y={y - sh - 1} k="app" v={p.app} sel={sel} />
      <Sticker g={g} x={g.stickerX} y={y + 2} k="version" v={p.version} sel={sel} />
      <text x={g.captionX} y={y - 4} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        …{p.short}
        {g.kind === 'wide' && p.node ? <tspan style={{ fontWeight: 400, fill: 'var(--ink-2)' }}> · {p.node}</tspan> : null}
      </text>
      <text x={g.captionX} y={y + 13} className="k-svg-mono" style={{ fontSize: g.mono, fill: statusNote ? (p.terminating ? 'var(--orange)' : 'var(--red)') : 'var(--ink-2)' }}>
        {statusNote ?? p.ip ?? '—'}
      </text>
      {/* hit histogram: share of the client's requests in the last 10 s */}
      <Rough shape={{ k: 'rect', x: g.barX, y: y - 7, w: barLen, h: 14 }} seed={hashSeed(`bar|${i}|${g.kind}`)} stroke="var(--ink-3)" strokeWidth={1} />
      {p.share > 0 && <rect x={g.barX + 1.5} y={y - 5.5} width={Math.max(2, (barLen - 3) * p.share)} height={11} rx={1.5} style={{ fill: 'var(--hl-orange-ink)', opacity: 0.85 }} />}
      <text x={g.barX + barLen + 4} y={y + 5} className="k-svg-mono" style={{ fontSize: g.mono, fill: p.share > 0 ? 'var(--tray-ink)' : 'var(--ink-3)' }}>
        {fmt.pct(p.share, 0).replace(/\s/g, ' ')}
      </text>
    </g>
  )
}

function GhostRow({ g, i, ip }: { g: StageGeo; i: number; ip: string }) {
  const y = rowY(g, i)
  const w = g.podSize * 1.3
  const h = g.podSize * 0.92
  return (
    <g>
      <Rough shape={{ k: 'rect', x: g.podX - w / 2, y: y - h / 2 + 4, w, h }} seed={hashSeed(`ghost|${g.kind}`)} stroke="var(--red)" strokeWidth={1.4} dash="4 5" />
      <text x={g.podX} y={y + 9} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
        ?
      </text>
      <text x={g.stickerX} y={y - 4} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 600 }}>
        {ip}:8000
      </text>
      <text x={g.stickerX} y={y + 16} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
        ovog Poda više nema
      </text>
    </g>
  )
}

/** Trays in flight (E3 inFlightAt), one pooled layer of <use>. */
function Trays({ s, g, view, rows, ghostRow, traced }: { s: ClusterState; g: StageGeo; view: StageView; rows: Map<string, number>; ghostRow: number | null; traced?: string | null }) {
  const ids = useDiagramIds()
  if (!ids) return null
  // the tray is the biggest moving thing on the drawing (bible): ≈ 34 × 22 wide, 30 × 20 narrow
  const tw = g.kind === 'wide' ? 34 : 30
  const th = g.kind === 'wide' ? 22 : 20
  return (
    <g aria-hidden="true">
      {inFlightAt(s).map(({ r, progress }) => {
        const row = r.podId ? rows.get(r.podId) : undefined
        let path: Pt[]
        if (view.targetIp) {
          const target = row ?? ghostRow
          if (target === null || target === undefined) return null
          path = routeDirect(g, target)
        } else if (row !== undefined) path = routeTo(g, row)
        else path = routeRefused(g)
        const t = Math.min(1, Math.max(0, progress))
        const [x, y] = pointAt(path, t)
        const failed = r.outcome !== 'ok'
        return (
          <g key={r.id}>
            {traced === r.id && <circle cx={x} cy={y} r={tw / 2 + 4} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 1.6, strokeDasharray: '3 3' }} />}
            <use href={ids.tray} x={x - tw / 2} y={y - th / 2} width={tw} height={th} style={{ fill: failed ? 'color-mix(in srgb, var(--red) 70%, var(--paper))' : 'var(--tray)' }} />
            {failed && t > 0.85 && <Cross x={x + tw / 2 - 2} y={y - th / 2 - 2} size={6} seed={7} />}
          </g>
        )
      })}
    </g>
  )
}

/** The Service stage: client klopa-web and the Service's rules on node-1, the Pods as rows with labels, lines and hits. */
export function ServiceStage({ s, view, kind, label, selected, onSelect, traced }: Props) {
  const ghost = view.targetIp && !view.targetAlive ? view.targetIp : null
  const nRows = view.pods.length + (ghost ? 1 : 0)
  const g = stageGeometry(kind, nRows, view.staging.length > 0)
  const shown = view.pods.slice(0, g.rows - (ghost ? 1 : 0))
  const hidden = view.pods.length - shown.length
  const rows = new Map(shown.map((p, i) => [p.id, i] as const))
  const ghostRow = ghost ? shown.length : null
  const sel = view.svc.selector
  const empty = view.sliceCount === 0
  const typeLine = view.svc.type === 'ClusterIP' ? 'ClusterIP' : view.svc.type === 'NodePort' ? `NodePort :${view.svc.nodePort}` : `LoadBalancer ${view.svc.lbIP ?? '<pending>'}`
  const rulesIps = view.proxyIps.slice(0, g.rules.cols * 2)
  const t = g.tag
  return (
    <Diagram width={g.W} height={g.H} label={label}>
      {/* node-1: the client and the rules kube-proxy wrote for the Service */}
      <DGroup x={g.node1.x} y={g.node1.y} w={g.node1.w} h={g.node1.h} />
      <text x={g.node1.x + 12} y={g.node1.y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        čvor node-1
      </text>
      <PodShape x={g.client[0]} y={g.client[1]} size={38} status="running" tone="teal" ariaLabel="Pod klopa-web, klijent" />
      <text x={g.client[0]} y={g.client[1] + 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        klopa-web
      </text>
      <text x={g.client[0]} y={g.client[1] + 40 + g.mono + 3} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
        {view.client?.ip ?? ''}
      </text>
      <Rough shape={{ k: 'line', x1: g.clientOut[0], y1: g.clientOut[1], x2: g.tagIn[0], y2: g.tagIn[1] }} seed={41} stroke="var(--ink-3)" strokeWidth={1.3} />
      {/* the selector, written under the tag */}
      <text x={g.selector[0]} y={g.selector[1]} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
        selector:
      </text>
      {g.kind === 'wide' ? (
        Object.entries(sel).map(([k, v], j) => (
          <text key={k} x={g.selector[0]} y={g.selector[1] + 18 + j * (g.mono + 4)} className="k-svg-mono" style={{ fontSize: g.mono, fill: empty ? 'var(--red)' : 'var(--ink)' }}>
            {k}={v}
          </text>
        ))
      ) : (
        <text x={g.selector[0] + 80} y={g.selector[1]} className="k-svg-mono" style={{ fontSize: g.mono, fill: empty ? 'var(--red)' : 'var(--ink)' }}>
          {selectorText(sel)}
        </text>
      )}
      {empty && (
        <text
          x={g.kind === 'wide' ? g.selector[0] + 70 : g.selector[0] + 80}
          y={g.kind === 'wide' ? g.selector[1] : g.selector[1] + 30}
          className="k-svg-hand"
          style={{ fontSize: g.hand, fill: 'var(--red)' }}
        >
          0 endpointa!
        </text>
      )}
      {/* kube-proxy's rules on node-1 (lag the EndpointSlice by 1 s) */}
      <Rough shape={{ k: 'rect', x: g.rules.x, y: g.rules.y, w: g.rules.w, h: g.rules.h }} seed={hashSeed(`rules|${g.kind}`)} stroke="var(--ink-3)" strokeWidth={1.1} dash="5 4" />
      <text x={g.rules.x + 8} y={g.rules.y + 21} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        {g.kind === 'wide' ? 'kube-proxy' : 'kube-proxy na node-1'}: {view.svc.clusterIP} →
      </text>
      {rulesIps.length === 0 ? (
        <text x={g.rules.x + 8} y={g.rules.y + 44} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)' }}>
          nema Podova → odbij vezu
        </text>
      ) : (
        rulesIps.map((ip, j) => (
          <text
            key={ip}
            x={g.rules.x + 8 + (j % g.rules.cols) * ((g.rules.w - 8) / g.rules.cols)}
            y={g.rules.y + 42 + Math.floor(j / g.rules.cols) * (g.mono + 5)}
            className="k-svg-mono"
            style={{ fontSize: g.mono, fill: view.fallback ? 'var(--orange)' : 'var(--ink)' }}
          >
            {ip}
          </text>
        ))
      )}
      <text x={g.rulesNote[0]} y={g.rulesNote[1]} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        ista pravila i na node-2 i node-3
      </text>
      {view.proxyIps.length > rulesIps.length && (
        <text x={g.rules.x + g.rules.w - 8} y={g.rules.y + 21} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
          +{view.proxyIps.length - rulesIps.length}
        </text>
      )}
      {/* narrow: the bus from the tag down to the rows */}
      {g.trunkX !== null && shown.length > 0 && (
        <Rough
          shape={{ k: 'lin', pts: [g.tagOut, [g.trunkX, g.tagOut[1] + 48], [g.trunkX, rowY(g, Math.max(0, shown.length - 1)) + 3]] }}
          seed={hashSeed(`trunk|${shown.length}`)}
          stroke="var(--ink-3)"
          strokeWidth={1.3}
        />
      )}
      {shown.map((p, i) => (
        <ServiceLine key={`l-${p.id}`} g={g} from={g.tagOut} i={i} p={p} />
      ))}
      <Trays s={s} g={g} view={view} rows={rows} ghostRow={ghostRow} traced={traced} />
      <text x={t.x + t.w / 2 + 6} y={t.y - 6} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
        etiketa = Service
      </text>
      <ServiceTag x={t.x} y={t.y} w={t.w} h={t.h} seed={4521}>
        <text x={t.x + 26} y={t.y + 24} className="k-svg-display" style={{ fontSize: g.mono + 3 }}>
          {view.svc.name}
        </text>
        <text x={t.x + 26} y={t.y + 24 + g.mono + 8} className="k-svg-mono" style={{ fontSize: g.mono }}>
          {view.svc.clusterIP}:{view.svc.port}
        </text>
        <text x={t.x + 26} y={t.y + 24 + 2 * (g.mono + 8)} className="k-svg-mono" style={{ fontSize: g.mono, fill: view.svc.type === 'LoadBalancer' && !view.svc.lbIP ? 'var(--orange)' : 'var(--ink-2)' }}>
          {typeLine}
        </text>
      </ServiceTag>
      {shown.map((p, i) => (
        <PodRow key={p.id} g={g} i={i} p={p} view={view} selected={selected === p.name} onSelect={onSelect} />
      ))}
      {ghost && ghostRow !== null && <GhostRow g={g} i={ghostRow} ip={ghost} />}
      {view.targetIp && (
        <Rough shape={{ k: 'lin', pts: routeDirect(g, ghostRow ?? rows.get(view.pods.find((p) => p.ip === view.targetIp)?.id ?? '') ?? 0) }} seed={77} stroke="var(--red)" strokeWidth={1.4} dash="7 5" />
      )}
      {hidden > 0 && (
        <text x={g.captionX} y={rowY(g, g.rows - 1) + g.rowH * 0.6} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
          + još {hidden}
        </text>
      )}
      {view.staging.length > 0 && (
        <g>
          <DGroup x={g.extra.x} y={g.extra.y} w={g.extra.w} h={g.extra.h} tone="violet" />
          <text x={g.extra.x + 12} y={g.extra.y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
            Namespace klopa-staging
          </text>
          {view.staging.slice(0, 1).map((p) => (
            <g key={p.id}>
              <PodShape x={g.extra.x + 36} y={g.extra.y + (g.kind === 'wide' ? 50 : 58)} size={30} status={p.shape} tone={p.tone} ariaLabel={`Pod ${p.name} u Namespaceu klopa-staging`} />
              <text x={g.extra.x + 66} y={g.extra.y + (g.kind === 'wide' ? 46 : 52)} className="k-svg-mono" style={{ fontSize: g.mono }}>
                app={p.app}
              </text>
              <text x={g.extra.x + 66} y={g.extra.y + (g.kind === 'wide' ? 67 : 79)} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                drugi Namespace → ne bira
              </text>
            </g>
          ))}
        </g>
      )}
      {view.readyCount > 0 && !empty && <Check x={t.x + t.w - 14} y={t.y + 14} size={6} seed={9} />}
    </Diagram>
  )
}
