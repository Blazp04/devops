/**
 * Drawing pieces of this lecture, composed from the kit's pen and doodles (Bilježnica grammar):
 * server card with a face (CPU = brains, radnici = plates, red = dashed slots), the redar's clipboard (what the load
 * balancer believes), timeout clocks, a failed tray on the floor. All SVG, local coordinates (place them with
 * <g transform>), so the rough paths stay cached while the numbers change.
 */
import { Brain, Check, Cross, Plate, Rough, ServerFace, SvgStamp } from '../../../kit'
import type { ServerState, ServerView } from '../../../engines/traffic'
import { brainFill, clipboardHeight, moodOf, piePath, stampOf, type LbMark } from '../lib/rack'

/** A small red timeout clock: the pie fills as the wait approaches the limit. Centre (x, y). */
export function TimeoutClock({ x, y, f, r = 6.5 }: { x: number; y: number; f: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r={r} style={{ fill: 'var(--paper)', stroke: 'var(--red)', strokeWidth: 1.3 }} />
      <path d={piePath(f, r - 1.6)} style={{ fill: 'var(--red)', opacity: 0.55 }} />
    </g>
  )
}

/**
 * A failed request: the tray tips over and falls, a red ✗ and the code stay ~0,9 s. Local (0, 0) = where it failed.
 * `above` puts the code above the tray instead of to its left (narrow layouts, where the door is at the left edge).
 */
export function DroppedTray({ x, y, k, code, trayHref, size = 30, label = true, above = false, fontSize = 14 }: { x: number; y: number; k: number; code: string; trayHref: string; size?: number; label?: boolean; above?: boolean; fontSize?: number }) {
  const fall = Math.min(1, k * 1.8)
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true" style={{ opacity: k > 0.8 ? (1 - k) / 0.2 : 1 }}>
      <g transform={`translate(0 ${fall * 26}) rotate(${fall * 60})`}>
        <use href={trayHref} x={-size / 2} y={-size * 0.35} width={size} height={size * 0.7} />
      </g>
      <Cross x={0} y={-14} size={8} seed={77} strokeWidth={2.4} />
      {label && (
        <text x={above ? 0 : -12} y={above ? -26 : -10} textAnchor={above ? 'middle' : 'end'} className="k-svg-mono" style={{ fontSize, fontWeight: 700, fill: 'var(--red)' }}>
          {code}
        </text>
      )}
    </g>
  )
}

const QUEUE_SLOTS = 10

/**
 * The server card of the flagship: name and size, the face (the truth about the process), one brain per core hatched
 * by CPU use, one plate per radnik (food = a request in progress), the dashed queue slots with waiting trays (a red
 * clock on trays that wait for a frozen server), a stamp when the process is not simply running, and how many users'
 * carts live in its memory. Local box (0, 0, w, h); w ≥ 330. `narrow` = the phone layout: the card is ~290 px on
 * screen, so the numbers are one size up and the brains and plates sit a little closer.
 */
export function ServerSheet({ v, sv, w, h, seed, now, trayHref, timeoutMs, carts, narrow = false }: { v: ServerState; sv: ServerView; w: number; h: number; seed: number; now: number; trayHref: string; timeoutMs: number; carts: number | null; narrow?: boolean }) {
  const mono = narrow ? 15 : 14
  const brainDx = narrow ? 28 : 30
  const plateDx = narrow ? 12 : 12.6
  const down = v.proc === 'crashed' || v.proc === 'off' || v.proc === 'hung'
  const faded = down || v.proc === 'starting' || v.proc === 'booting'
  const stamp = stampOf(v)
  const cpu = v.proc === 'up' || v.proc === 'hung' ? sv.cpuSmooth : 0
  const slots = Math.max(1, Math.min(30, sv.slots))
  const waiting = [...v.queue, ...v.parked].sort((a, b) => a.t0 - b.t0)
  const shown = waiting.slice(0, QUEUE_SLOTS)
  const more = waiting.length - shown.length
  const perRow = 15
  return (
    <g>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w, h }} seed={seed} strokeWidth={1.9} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      {down && <Rough shape={{ k: 'rect', x: 3, y: 3, w: w - 6, h: h - 6 }} seed={seed + 1} strokeWidth={0} stroke="none" fillColor="var(--red)" hachureGap={15} fillWeight={0.9} />}
      <text x={14} y={26} className="k-svg-display" style={{ fontSize: 19 }}>
        {v.name} · {v.label}
      </text>
      <text x={14} y={46} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
        {v.vcpu} vCPU · {v.ramGB} GB
      </text>
      <g transform={`translate(${w - 32} 32)`}>
        <ServerFace mood={moodOf(v.proc, cpu)} r={20} />
      </g>
      {/* the meters are "erased" while the process is down – the drawings fade, the lettering stays legible */}
      <g style={{ opacity: faded ? 0.28 : 1 }}>
        {Array.from({ length: v.vcpu }, (_, i) => (
          <Brain key={i} x={14 + i * brainDx} y={56} w={brainDx - 4} h={22} busy={brainFill(i, v.vcpu, cpu)} seed={seed + 10 + i} />
        ))}
        {Array.from({ length: slots }, (_, i) => (
          <Plate key={i} cx={19 + (i % perRow) * plateDx} cy={92 + Math.floor(i / perRow) * 13} r={5.2} full={i < sv.busy} />
        ))}
      </g>
      <text x={14 + v.vcpu * brainDx + 4} y={73} className="k-svg-mono" style={{ fontSize: mono, fill: faded ? 'var(--ink-3)' : 'var(--ink)' }}>
        CPU {Math.round(cpu * 100)} %
      </text>
      <text x={w - 12} y={100} textAnchor="end" className="k-svg-mono" style={{ fontSize: mono, fill: faded ? 'var(--ink-3)' : 'var(--ink)' }}>
        radnici {sv.busy}/{sv.workersLabel}
      </text>
      {/* the queue: dashed slots; a frozen server's trays wait with a filling red clock */}
      {Array.from({ length: QUEUE_SLOTS }, (_, q) => (
        <rect key={q} x={14 + q * 20} y={h - 26} width={17} height={14} rx={2} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '2.5 2.5' }} />
      ))}
      {shown.map((r, q) => (
        <g key={r.id}>
          <use href={trayHref} x={14 + q * 20 - 0.5} y={h - 25} width={18} height={12.6} />
          {v.proc === 'hung' && <TimeoutClock x={14 + q * 20 + 13} y={h - 27} f={(now - r.t0) / timeoutMs} r={5.5} />}
        </g>
      ))}
      <text x={w - 12} y={h - 14} textAnchor="end" className="k-svg-mono" style={{ fontSize: mono, fill: more > 0 ? 'var(--red)' : 'var(--ink)' }}>
        {more > 0 ? `red +${more}` : `red ${v.queue.length}/${sv.queueMax}`}
      </text>
      {carts !== null && (
        <text x={w - 12} y={73} textAnchor="end" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--pen)' }}>
          košarice: {carts}
        </text>
      )}
      {stamp && <SvgStamp x={w * 0.5} y={h * 0.52} text={stamp.text} tone={stamp.tone} size={19} rotate={-6} />}
    </g>
  )
}

const MARK_COLOR: Record<LbMark, string> = { ok: 'var(--green)', warn: 'var(--orange)', bad: 'var(--red)', drain: 'var(--pen)' }

/**
 * The redar's clipboard = what the load balancer believes, one line per server (✓ u prometu · ! 1/2 neusp. · ✗ izbačen).
 * It can disagree with the server cards (the truth): that gap is the detection window. Local box (0, 0, w, h).
 */
export function LbClipboard({ w, lines, seed = 5230, title = 'redar zna:', mono = 14, hand = 20 }: { w: number; lines: { name: string; mark: LbMark; text: string }[]; seed?: number; title?: string; mono?: number; hand?: number }) {
  const h = clipboardHeight(lines.length)
  return (
    <g>
      <Rough shape={{ k: 'rect', x: 0, y: 5, w, h: h - 5 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: w / 2 - 22, y: 0, w: 44, h: 10 }} seed={seed + 1} strokeWidth={1.2} fillColor="var(--ink-3)" fillStyle="solid" />
      <text x={10} y={31} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--pen)' }}>
        {title}
      </text>
      {lines.map((l, i) => {
        const y = 54 + i * 23
        return (
          <g key={l.name}>
            {l.mark === 'ok' && <Check x={18} y={y - 5} size={6} seed={seed + 10 + i} strokeWidth={2} />}
            {l.mark === 'bad' && <Cross x={18} y={y - 5} size={6} seed={seed + 20 + i} strokeWidth={2} />}
            {(l.mark === 'warn' || l.mark === 'drain') && (
              <text x={18} y={y} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700, fill: MARK_COLOR[l.mark] }}>
                {l.mark === 'warn' ? '!' : '↘'}
              </text>
            )}
            <text x={32} y={y} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink)' }}>
              <tspan style={{ fontWeight: 700 }}>{l.name}</tspan>
              <tspan dx={mono > 14 ? 5 : 7} style={{ fill: l.mark === 'ok' ? 'var(--ink-2)' : MARK_COLOR[l.mark] }}>
                {l.text}
              </tspan>
            </text>
          </g>
        )
      })}
    </g>
  )
}
