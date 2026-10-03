/**
 * Lecture 01 drawing parts, composed from the kit's pen (Rough, Check, Cross, Burst, ServerFace…):
 * the DNS phone book, the server's firewall wall with doors, the proxy and app boxes, the home router,
 * the hollow clock (timeout), the request tray with its handwritten label, a pencil road.
 */
import { Burst, Check, Cross, Rough, ServerFace, type Pt } from '../../../kit'
import type { Box } from '../geometry'

export type TrayTone = 'req' | 'ok' | 'bad'

const TRAY_FILL: Record<TrayTone, string> = {
  req: 'var(--tray)',
  ok: 'color-mix(in srgb, var(--hl-green-ink) 78%, var(--paper))',
  bad: 'color-mix(in srgb, var(--red) 70%, var(--paper))',
}

const TONE_INK: Record<TrayTone, string> = { req: 'var(--tray-ink)', ok: 'var(--green)', bad: 'var(--red)' }

/** One request = the orange tray (green with ✓ = an answer, red with ✗ = a failure) with a handwritten note above it. */
export function TraySprite({ x, y, w, tone, label, size, trayHref, labelDy = -22, faded }: { x: number; y: number; w: number; tone: TrayTone; label?: string; size: number; trayHref: string; labelDy?: number; faded?: boolean }) {
  const h = w * 0.7
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* a waiting tray fades; its lettering never does */}
      <g opacity={faded ? 0.45 : 1}>
        <use href={trayHref} x={-w / 2} y={-h / 2} width={w} height={h} fill={TRAY_FILL[tone]} />
        {tone === 'ok' && <Check x={w * 0.42} y={-h * 0.5} size={w * 0.17} strokeWidth={2.2} seed={9101} />}
        {tone === 'bad' && <Cross x={w * 0.42} y={-h * 0.55} size={w * 0.17} strokeWidth={2.2} seed={9102} />}
      </g>
      {label && (
        <text y={labelDy} textAnchor="middle" className="k-svg-hand k-dhalo" style={{ fontSize: size, fill: TONE_INK[tone] }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** A pencil road (where requests may travel). `active` = the route of the step being played, in blue pen. */
export function Road({ pts, seed, active, faint, color }: { pts: Pt[]; seed: number; active?: boolean; faint?: boolean; color?: string }) {
  return (
    <Rough
      shape={{ k: 'lin', pts }}
      seed={seed}
      stroke={color ?? (active ? 'var(--pen)' : 'var(--ink-3)')}
      strokeWidth={active ? 2.1 : 1.3}
      dash={active ? '7 6' : faint ? '2 7' : '3 6'}
      roughness={0.7}
    />
  )
}

/** The DNS resolver as a phone book (name → number): page, red margin, coloured index tabs, entries in mono. */
export function PhoneBook({ box, lines, mono, struck, warn }: { box: Box; lines: [string, string]; mono: number; struck?: boolean; warn?: string }) {
  const { x, y, w, h } = box
  const tx = x + 18
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={9201} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 10, y1: y + 2, x2: x + 10, y2: y + h - 2 }} seed={9202} strokeWidth={1.2} stroke="var(--red)" />
      {[0, 1, 2].map((i) => (
        <Rough
          key={i}
          shape={{ k: 'rect', x: x + w, y: y + 10 + i * 22, w: 8, h: 14 }}
          seed={9203 + i}
          strokeWidth={1}
          fillColor={['var(--hl-yellow-ink)', 'var(--hl-pink-ink)', 'var(--hl-green-ink)'][i]}
          fillStyle="solid"
        />
      ))}
      <text x={tx} y={y + h * 0.4} className="k-svg-mono" style={{ fontSize: mono }}>
        {lines[0]}
      </text>
      <text x={tx} y={y + h * 0.4 + mono * 1.65} className="k-svg-mono" style={{ fontSize: mono, fill: warn ? 'var(--orange)' : 'var(--ink-2)' }}>
        {lines[1]}
      </text>
      {struck && (
        <Rough
          shape={{ k: 'lin', pts: [[tx - 4, y + h * 0.4 - mono * 0.3], [tx + lines[0].length * mono * 0.6 + 4, y + h * 0.4 - mono * 0.36]] }}
          seed={9207}
          strokeWidth={2.2}
          stroke="var(--red)"
          roughness={1.4}
        />
      )}
    </g>
  )
}

/** A machine or a flat: one big pencil frame (solid = a hard boundary). */
export function HostFrame({ box, seed, dim }: { box: Box; seed: number; dim?: boolean }) {
  return <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={seed} strokeWidth={1.9} roughness={1.3} stroke={dim ? 'var(--ink-3)' : 'var(--ink)'} />
}

/**
 * The firewall along the server's outer wall: a hatched strip with a door (gap) per open port.
 * A port that is not allowed is bricked up; a port that drops the current packet gets a red ✗.
 */
export function FirewallWall({
  wall,
  at,
  from,
  to,
  doors,
  seed = 9301,
}: {
  wall: 'left' | 'top'
  at: number
  from: number
  to: number
  /** door centre along the wall, open or bricked, and whether it just dropped a packet */
  doors: { pos: number; open: boolean; dropped?: boolean }[]
  seed?: number
}) {
  const half = 18
  const open = doors.filter((d) => d.open).sort((a, b) => a.pos - b.pos)
  const pieces: [number, number][] = []
  let start = from
  for (const d of open) {
    pieces.push([start, d.pos - half])
    start = d.pos + half
  }
  pieces.push([start, to])
  const rect = (a: number, b: number): Box => (wall === 'left' ? { x: at - 8, y: a, w: 16, h: b - a } : { x: a, y: at - 8, w: b - a, h: 16 })
  return (
    <g>
      {pieces.map(([a, b], i) =>
        b - a > 2 ? (
          <Rough key={i} shape={{ k: 'rect', ...rect(a, b) }} seed={seed + i} strokeWidth={1.5} fillColor="var(--ink-3)" hachureGap={4} fillWeight={1} />
        ) : null,
      )}
      {doors
        .filter((d) => !d.open)
        .map((d, i) => (
          <Rough key={`b${i}`} shape={{ k: 'rect', ...rect(d.pos - half, d.pos + half) }} seed={seed + 20 + i} strokeWidth={1.7} stroke={d.dropped ? 'var(--red)' : 'var(--ink-2)'} fillColor={d.dropped ? 'var(--red)' : 'var(--ink-2)'} fillStyle="cross-hatch" hachureGap={4} />
        ))}
      {doors
        .filter((d) => d.dropped)
        .map((d, i) => {
          const [cx, cy] = wall === 'left' ? [at - 24, d.pos] : [d.pos, at - 22]
          return <Cross key={`x${i}`} x={cx} y={cy} size={9} strokeWidth={2.6} seed={seed + 40 + i} />
        })}
    </g>
  )
}

/** The reverse proxy (Caddy) on :443 — terminates TLS and forwards to the app. */
export function ProxyBox({ box, name, mono, title }: { box: Box; name: number; mono: number; title?: string }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={9401} strokeWidth={1.8} fillColor="var(--paper-2)" fillStyle="solid" />
      <text x={x + 12} y={y + 26} className="k-svg-display" style={{ fontSize: name }}>
        {title ?? 'Caddy'}
      </text>
      <text x={x + 12} y={y + 50} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
        :443 · TLS
      </text>
    </g>
  )
}

/** The app process (gunicorn): printed name, the address it listens on, a face in a porthole (dead when it is down). */
export function AppBox({ box, face, name, mono, hand, bind, down, note }: { box: Box; face: Pt; name: number; mono: number; hand: number; bind: string; down?: boolean; note?: string }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={9501} strokeWidth={1.8} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + 12} y={y + 28} className="k-svg-display" style={{ fontSize: name }}>
        gunicorn
      </text>
      <text x={x + 12} y={y + 54} className="k-svg-mono" style={{ fontSize: mono, fill: down ? 'var(--red)' : 'var(--ink-2)' }}>
        {bind}
      </text>
      {(down || note) && (
        <text x={x + 12} y={y + h - 9} className="k-svg-hand" style={{ fontSize: hand, fill: down ? 'var(--red)' : 'var(--pen)' }}>
          {down ? 'ne radi' : note}
        </text>
      )}
      <g transform={`translate(${face[0]} ${face[1]})`}>
        <ServerFace mood={down ? 'dead' : 'calm'} r={16} />
      </g>
    </g>
  )
}

/** A home router (the flat's NAT): a box with two antennas and status lights. */
export function RouterDoodle({ box }: { box: Box }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x + w * 0.22, y1: y, x2: x + w * 0.14, y2: y - 18 }} seed={9601} strokeWidth={1.8} />
      <Rough shape={{ k: 'line', x1: x + w * 0.78, y1: y, x2: x + w * 0.86, y2: y - 18 }} seed={9602} strokeWidth={1.8} />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={9603} strokeWidth={1.8} fillColor="var(--paper-2)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + w * (0.3 + i * 0.2)} cy={y + h * 0.55} r={2.4} style={{ fill: i === 2 ? 'var(--hl-orange-ink)' : 'var(--green)' }} />
      ))}
    </g>
  )
}

/** Timeout: a hollow clock in red pencil that fills while the client waits; ✗ when the client gives up. */
export function HollowClock({ x, y, r, progress, expired }: { x: number; y: number; r: number; progress: number; expired?: boolean }) {
  const a = -Math.PI / 2 + Math.PI * 2 * Math.min(0.999, Math.max(0, progress))
  const large = progress > 0.5 ? 1 : 0
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={9701} strokeWidth={2} stroke="var(--red)" fillColor="var(--paper)" fillStyle="solid" />
      {progress > 0.01 && (
        <path
          d={`M${x} ${y} L${x} ${y - r * 0.82} A${r * 0.82} ${r * 0.82} 0 ${large} 1 ${x + Math.cos(a) * r * 0.82} ${y + Math.sin(a) * r * 0.82} Z`}
          style={{ fill: 'var(--red)', opacity: 0.18 }}
        />
      )}
      <Rough shape={{ k: 'lin', pts: [[x, y - r * 0.6], [x, y], [x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62]] }} seed={9702} strokeWidth={1.8} stroke="var(--red)" roughness={0.5} />
      {expired && <Cross x={x + r * 1.05} y={y - r * 0.95} size={r * 0.42} strokeWidth={2.6} seed={9703} />}
    </g>
  )
}

/** Connection refused: a red spiky burst — the answer came back at once, and it was "no". */
export function RefusedBurst({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <Burst cx={x} cy={y} r={r} seed={9801} points={10} />
      <Cross x={x} y={y} size={r * 0.36} strokeWidth={2.4} seed={9802} />
    </g>
  )
}
