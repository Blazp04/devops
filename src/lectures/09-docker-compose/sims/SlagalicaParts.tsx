import { useState, type PointerEvent as RPointerEvent } from 'react'
import { Check, Cross, Cylinder, FoodBox, FolderTab, plural, Rough } from '../../../kit'
import type { Container, SvcId, Volume } from '../model'
import type { Pt } from '../slagalicaGeo'

/* Drawing pieces of „Compose slagalica”, all in the kit's pen (roughjs, fixed seeds). */

const OWN: SvcId[] = ['web', 'api', 'worker']

/** Short docker-ps-like status under a service card: [status, reason]. */
function statusLines(svc: SvcId, c: Container | undefined, compact: boolean): [string, string] {
  if (!c) return [compact ? '—' : 'nije pokrenut', '']
  switch (c.state) {
    case 'created':
      return [compact ? 'Created' : 'Created', c.reason.startsWith('čeka') ? c.reason : '']
    case 'starting':
      return [compact ? 'starting' : svc === 'db' || svc === 'redis' || svc === 'rabbitmq' ? 'health: starting' : 'pokreće se', '']
    case 'running':
      return [compact ? 'Up ✓' : svc === 'db' || svc === 'redis' || svc === 'rabbitmq' ? 'Up (healthy)' : 'Up', '']
    case 'backoff':
      return [compact ? `↻ ${c.restarts + 1}` : `Restarting ↻${c.restarts + 1}`, compact ? '' : c.reason]
    case 'off':
      return [compact ? 'stao' : 'stao (računalo)', '']
    default:
      // a port conflict means the container was never started (docker ps: Created)
      if (c.reason === 'port zauzet') return ['Created', compact ? '' : 'port zauzet']
      if (c.reason.startsWith('Exited')) return [compact ? 'Exited' : c.reason, '']
      return [compact ? 'Exited' : 'Exited (1)', compact ? '' : c.reason]
  }
}

export function ServiceCard({
  svc,
  at,
  w,
  h,
  c,
  changed,
  selected,
  compact,
  mono,
  small,
  hostOff,
  ghost,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  svc: SvcId
  at: Pt
  w: number
  h: number
  c: Container | undefined
  /** the file says something else than the running container (or nothing runs yet) */
  changed: boolean
  selected: boolean
  compact: boolean
  mono: number
  small: number
  hostOff: boolean
  /** drawn under the pointer while dragging */
  ghost?: boolean
  onSelect?: () => void
  onPointerDown?: (e: RPointerEvent<SVGGElement>) => void
  onPointerMove?: (e: RPointerEvent<SVGGElement>) => void
  onPointerUp?: (e: RPointerEvent<SVGGElement>) => void
}) {
  const x = at[0] - w / 2
  const y = at[1] - h / 2
  const seed = 9100 + svc.length * 31 + (compact ? 7 : 0) + svc.charCodeAt(0)
  const failed = c && (c.state === 'exited' || c.state === 'backoff')
  const up = c?.state === 'running'
  const [line1, line2] = statusLines(svc, c, compact)
  const [focused, setFocused] = useState(false)
  const statusTone = up ? 'var(--green)' : failed ? 'var(--red)' : c?.state === 'off' ? 'var(--ink-2)' : 'var(--ink-2)'
  const dash = !c || changed ? '6 5' : undefined
  const label = `${svc}: ${line1}${line2 ? `, ${line2}` : ''}${changed ? ', izmjena čeka compose up' : ''}`
  return (
    <g
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `Servis ${label}. Odaberite ga.` : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // keyboard focus gets the same pen ring as the selection (drawn below), not the browser's box
      onFocus={onSelect ? (e) => setFocused(e.currentTarget.matches(':focus-visible')) : undefined}
      onBlur={onSelect ? () => setFocused(false) : undefined}
      style={{ cursor: onSelect ? 'grab' : undefined, touchAction: onSelect ? 'none' : undefined, outline: 'none' }}
      className="slag-card"
      opacity={ghost ? 0.85 : 1}
    >
      <rect x={x} y={y} width={w} height={h} className="k-paper-fill" />
      {selected && <Rough shape={{ k: 'rect', x: x - 7, y: y - 7, w: w + 14, h: h + 14 }} seed={seed + 5} stroke="var(--pen)" strokeWidth={1.8} dash="5 4" roughness={0.9} />}
      {focused && <Rough shape={{ k: 'rect', x: x - 11, y: y - 11, w: w + 22, h: h + 22 }} seed={seed + 6} stroke="var(--pen)" strokeWidth={2.4} roughness={0.8} />}
      <g opacity={hostOff ? 0.45 : 1}>
        <FoodBox
          x={x}
          y={y}
          w={w}
          h={h}
          seed={seed}
          tint={OWN.includes(svc) ? 'var(--hl-blue-ink)' : 'var(--ink-4)'}
          stroke={failed ? 'var(--red)' : 'var(--ink)'}
          dash={dash}
        />
      </g>
      <text x={at[0]} y={y + h * 0.62 + mono * 0.36} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: mono, fontWeight: 700 }}>
        {svc}
      </text>
      {/* the state mark in the top-right corner */}
      {up && <Check x={x + w - 4} y={y + 2} size={compact ? 12 : 15} />}
      {failed && <Cross x={x + w - 4} y={y + 2} size={compact ? 11 : 14} />}
      {changed && c && (
        <text x={x - 2} y={y + 4} textAnchor="middle" className="k-svg-hand" style={{ fontSize: small * 1.5, fill: 'var(--orange)', fontWeight: 700 }}>
          !
        </text>
      )}
      {!ghost && (
        <>
          <text x={at[0]} y={y + h + small + 3} textAnchor="middle" className="k-svg-mono" style={{ fontSize: small, fill: statusTone, fontWeight: 600 }}>
            {line1}
          </text>
          {line2 && (
            <text x={at[0]} y={y + h + small * 2 + 6} textAnchor="middle" className="k-svg-mono" style={{ fontSize: small, fill: 'var(--red)' }}>
              {line2}
            </text>
          )}
        </>
      )}
    </g>
  )
}

/** A pencil line between two services: ok = blue pen, bad = red dashed with ✗, idle = faint dashed. */
export function LinkLine({ from, to, tone, label, labelAt, size, seed, crossT = 0.5 }: { from: Pt; to: Pt; tone: 'ok' | 'bad' | 'idle'; label?: string; labelAt?: Pt; size: number; seed: number; crossT?: number }) {
  const stroke = tone === 'ok' ? 'var(--pen)' : tone === 'bad' ? 'var(--red)' : 'var(--ink-3)'
  const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  const cross: Pt = [from[0] + (to[0] - from[0]) * crossT, from[1] + (to[1] - from[1]) * crossT]
  const lp = labelAt ?? mid
  return (
    <g>
      <Rough shape={{ k: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1] }} seed={seed} stroke={stroke} strokeWidth={tone === 'idle' ? 1.2 : 1.7} dash={tone === 'ok' ? undefined : '6 5'} roughness={0.8} />
      {tone === 'bad' && <Cross x={cross[0]} y={cross[1]} size={11} />}
      {label && (
        <text x={lp[0]} y={lp[1]} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: size, fill: stroke, fontWeight: 600 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** localhost inside the api container: the call loops back into api itself (an arc over the card's top corner). */
export function SelfLoop({ at, w, h, size, vertical }: { at: Pt; w: number; h: number; size: number; vertical: boolean }) {
  const top = at[1] - h / 2
  const x0 = vertical ? at[0] - w / 2 + 14 : at[0] + w / 2 - 34
  const x1 = x0 + 22
  const d = `M ${x0} ${top + 2} C ${x0 - 4} ${top - 22}, ${x1 + 4} ${top - 22}, ${x1} ${top + 1}`
  return (
    <g>
      <Rough shape={{ k: 'path', d }} seed={9301} stroke="var(--red)" strokeWidth={1.8} roughness={0.7} />
      <Rough shape={{ k: 'lin', pts: [[x1 - 6, top - 6], [x1, top + 1], [x1 + 5, top - 6]] }} seed={9302} stroke="var(--red)" strokeWidth={1.7} roughness={0.5} />
      {!vertical && (
        <text x={x0 - 8} y={top - 6} textAnchor="end" className="k-svg-mono k-dhalo" style={{ fontSize: size, fill: 'var(--red)', fontWeight: 600 }}>
          localhost = api
        </text>
      )}
    </g>
  )
}

/** A door in the host wall (a published port): left wall (wide) or top wall (narrow). */
export function Door({ at, port, vertical, open, size }: { at: Pt; port: string; vertical: boolean; open: boolean; size: number }) {
  const [x, y] = at
  const dw = vertical ? 30 : 10
  const dh = vertical ? 10 : 30
  return (
    <g>
      <rect x={x - dw / 2} y={y - dh / 2} width={dw} height={dh} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', x: x - dw / 2, y: y - dh / 2, w: dw, h: dh }} seed={9400 + Number(port) % 97} stroke={open ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={1.6} fillColor={open ? undefined : 'var(--ink-4)'} hachureGap={3} />
      {open && <Rough shape={vertical ? { k: 'line', x1: x - dw / 2, y1: y + dh / 2, x2: x - dw / 2 - 12, y2: y + dh / 2 + 8 } : { k: 'line', x1: x - dw / 2, y1: y - dh / 2, x2: x - dw / 2 - 9, y2: y - dh / 2 - 10 }} seed={9410 + Number(port) % 89} stroke="var(--pen)" strokeWidth={1.6} roughness={0.6} />}
      <text x={vertical ? x + dw / 2 + 4 : x - 8} y={vertical ? y - 9 : y + dh / 2 + size + 2} textAnchor={vertical ? 'start' : 'end'} className="k-svg-mono k-dhalo" style={{ fontSize: size, fontWeight: 700, fill: open ? 'var(--pen)' : 'var(--ink-3)' }}>
        {port}
      </text>
    </g>
  )
}

/** The test browser on the host: address + what came back. */
export function BrowserDoodle({ x, y, w, h, address, code, ok, size, mono, wideLayout }: { x: number; y: number; w: number; h: number; address: string; code: string; ok: boolean; size: number; mono: number; wideLayout: boolean }) {
  const tone = ok ? 'var(--green)' : code === '—' ? 'var(--ink-3)' : 'var(--red)'
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={9501} strokeWidth={1.8} />
      <Rough shape={{ k: 'line', x1: x, y1: y + 20, x2: x + w, y2: y + 20 }} seed={9502} strokeWidth={1.3} roughness={0.6} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + 10 + i * 9} cy={y + 10} r={2.6} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1.2 }} />
      ))}
      <text x={x + (wideLayout ? 8 : 44)} y={wideLayout ? y + 40 : y + 14} className="k-svg-mono" style={{ fontSize: size, fill: 'var(--ink-2)' }}>
        {address}
      </text>
      <text x={wideLayout ? x + 10 : x + w - 40} y={wideLayout ? y + h - 22 : y + h - 16} textAnchor={wideLayout ? 'start' : 'end'} className="k-svg-mono" style={{ fontSize: mono * 1.4, fontWeight: 700, fill: tone }}>
        {code}
      </text>
      {ok ? <Check x={x + w - 20} y={y + h - 30} size={16} /> : code !== '—' && <Cross x={x + w - 20} y={y + h - 30} size={14} />}
      {!wideLayout && (
        <text x={x + 10} y={y + h - 16} className="k-svg-hand" style={{ fontSize: size * 1.4, fill: 'var(--ink-2)' }}>
          preglednik na računalu
        </text>
      )}
    </g>
  )
}

/** One place where data lives outside the container: volume (cylinder), bind mount (folder) or tmpfs (RAM chip). */
export function VolumeThing({ v, at, w, h, size }: { v: Volume; at: Pt; w: number; h: number; size: number }) {
  const dangling = v.kind === 'anon' && !v.inUse
  const x = at[0] - w / 2
  const y = at[1]
  return (
    <g>
      <g opacity={dangling ? 0.5 : 1}>
        {v.kind === 'bind' ? (
          <FolderTab x={x} y={y + 6} w={w} h={h - 6} seed={9601} tint="var(--note-yellow)" />
        ) : v.kind === 'tmpfs' ? (
          <g>
            <Rough shape={{ k: 'rect', x: x + 2, y: y + 10, w: w - 4, h: h - 18 }} seed={9611} strokeWidth={1.6} fillColor="var(--hl-green-ink)" hachureGap={4} />
            {[0, 1, 2, 3].map((i) => (
              <Rough key={i} shape={{ k: 'line', x1: x + 8 + i * ((w - 16) / 3), y1: y + h - 8, x2: x + 8 + i * ((w - 16) / 3), y2: y + h - 1 }} seed={9612 + i} strokeWidth={1.3} roughness={0.4} />
            ))}
          </g>
        ) : (
          <Cylinder x={x} y={y} w={w} h={h} seed={v.kind === 'named' ? 9621 : 9631 + v.label.charCodeAt(0)} fillColor={v.rows > 0 ? (v.kind === 'named' ? 'var(--hl-blue-ink)' : 'var(--ink-4)') : undefined} />
        )}
      </g>
      <text x={at[0]} y={y + h + size + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fontWeight: 600, fill: dangling ? 'var(--ink-2)' : 'var(--ink)' }}>
        {v.label}
      </text>
      <text x={at[0]} y={y + h + size * 2 + 7} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fill: 'var(--ink-2)' }}>
        {plural(v.rows, ['narudžba', 'narudžbe', 'narudžbi'])}
      </text>
      {/* „viseći” sits on the cylinder itself (above it would collide with the shelf label) */}
      {dangling && (
        <text x={at[0]} y={y + h * 0.66} textAnchor="middle" className="k-svg-hand k-dhalo" style={{ fontSize: size * 1.45, fill: 'var(--red)', fontWeight: 700 }}>
          viseći
        </text>
      )}
    </g>
  )
}
