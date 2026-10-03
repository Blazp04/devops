/**
 * Drawings of lecture 06, composed from the kit's pen and doodles (no new metaphors):
 *   message = a kitchen ticket (paper slip on the rail) · HTTP request = the orange tray · consumer = a server card with a
 *   face („kuhar”) · kitchen = teta Mira's pass · SMS gateway = the phone doodle · DLQ = a red-pencil bin.
 */
import type { ReactNode } from 'react'
import { Check, Cross, Mira, MiniFace, Phone, Rough } from '../../../kit'
import type { ServerMood } from '../../../kit'
import type { Box } from '../geometry'
import type { BoardLine, CardView, TicketTone } from '../stageView'

/** Symbols for one drawing: `#<id>-ticket`, `-ticket-warn` (returned / redelivered), `-ticket-bad`, `-ticket-ok`. 32 × 36 units. */
export function TicketDefs({ id }: { id: string }) {
  const slip = (stroke: string, seed: number, hatch?: string) => (
    <>
      <Rough shape={{ k: 'poly', pts: [[-15, -16], [15, -16], [15, 13], [9, 16], [3, 13], [-3, 16], [-9, 13], [-15, 16]] }} seed={seed} stroke={stroke} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" roughness={0.8} />
      {hatch && <Rough shape={{ k: 'rect', x: -13, y: -14, w: 26, h: 9 }} seed={seed + 1} stroke="none" fillColor={hatch} hachureGap={2.6} fillWeight={0.9} roughness={0.6} />}
      <circle cx={0} cy={-11} r={1.7} style={{ fill: 'var(--ink-3)' }} />
    </>
  )
  return (
    <defs>
      <symbol id={`${id}-ticket`} viewBox="-16 -18 32 36" overflow="visible">
        {slip('var(--ink)', 9101)}
      </symbol>
      <symbol id={`${id}-ticket-warn`} viewBox="-16 -18 32 36" overflow="visible">
        {slip('var(--pen)', 9111, 'var(--hl-blue-ink)')}
      </symbol>
      <symbol id={`${id}-ticket-bad`} viewBox="-16 -18 32 36" overflow="visible">
        {slip('var(--red)', 9121, 'var(--red)')}
      </symbol>
      <symbol id={`${id}-ticket-ok`} viewBox="-16 -18 32 36" overflow="visible">
        {slip('var(--green)', 9131, 'var(--hl-green-ink)')}
      </symbol>
    </defs>
  )
}

const TICKET_HREF: Record<TicketTone, string> = { info: 'ticket', warn: 'ticket-warn', bad: 'ticket-bad', ok: 'ticket-ok' }

/** One ticket centred on (x, y); `scale` 1 = 32 × 36 units. Optional order number printed on it (mono 13). */
export function Ticket({ id, x, y, tone = 'info', label, scale = 1, mark }: { id: string; x: number; y: number; tone?: TicketTone; label?: string; scale?: number; mark?: string }) {
  const w = 32 * scale
  const h = 36 * scale
  return (
    <g>
      <use href={`#${id}-${TICKET_HREF[tone]}`} x={x - w / 2} y={y - h / 2} width={w} height={h} />
      {label && (
        <text x={x} y={y + 6 * scale} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: tone === 'bad' ? 'var(--red)' : 'var(--ink)' }}>
          {label}
        </text>
      )}
      {mark && (
        <text x={x + 13 * scale} y={y - 13 * scale} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: tone === 'bad' ? 'var(--red)' : 'var(--pen)' }}>
          {mark}
        </text>
      )}
    </g>
  )
}

/** A dashed pencil lane with a handwritten label (retry lane, „nevidljivo”). */
export function Lane({ box, label, seed, tone = 'ink', hand = 19, children }: { box: Box; label: string; seed: number; tone?: 'ink' | 'red' | 'pen'; hand?: number; children?: ReactNode }) {
  const stroke = tone === 'red' ? 'var(--red)' : tone === 'pen' ? 'var(--pen)' : 'var(--ink-3)'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={seed} stroke={stroke} strokeWidth={1.3} dash="5 5" roughness={0.9} />
      <text x={box.x + 8} y={box.y + 19} className="k-svg-hand" style={{ fontSize: hand, fill: tone === 'red' ? 'var(--red)' : tone === 'pen' ? 'var(--pen)' : 'var(--ink-2)' }}>
        {label}
      </text>
      {children}
    </g>
  )
}

const STATUS_FILL = { ink: 'var(--ink)', red: 'var(--red)', pen: 'var(--pen)', green: 'var(--green)', muted: 'var(--ink-3)' }

/** A consumer (or, in direct mode, an API worker): a server card with a face, its job, progress and ack deadline. */
export function CookCard({ box, info, seed }: { box: Box; info: CardView; seed: number }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough
        shape={{ k: 'rect', x, y, w, h }}
        seed={seed}
        stroke={info.down ? 'var(--red)' : 'var(--ink)'}
        strokeWidth={info.down ? 1.9 : 1.6}
        fillColor={info.down ? 'var(--red)' : 'var(--paper)'}
        fillStyle={info.down ? 'hachure' : 'solid'}
        hachureGap={7}
        fillWeight={0.5}
        dash={info.dashed ? '4 4' : undefined}
      />
      <text x={x + 9} y={y + 18} className="k-svg-display" style={{ fontSize: 13.5 }}>
        {info.title}
      </text>
      <MiniFace cx={x + w - 16} cy={y + 16} r={11} mood={info.mood} seed={seed + 5} />
      {info.armed && <Rough shape={{ k: 'lin', pts: [[x + w - 38, y + 6], [x + w - 44, y + 15], [x + w - 37, y + 15], [x + w - 43, y + 25]] }} seed={seed + 9} stroke="var(--red)" strokeWidth={2} roughness={0.4} />}
      {info.progress !== null && (
        <g>
          <rect x={x + 9} y={y + 25} width={w - 40} height={7} rx={1.5} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1 }} />
          <rect x={x + 9} y={y + 25} width={(w - 40) * Math.min(1, Math.max(0, info.progress))} height={7} rx={1.5} style={{ fill: info.slow ? 'var(--hl-pink-ink)' : 'var(--hl-orange-ink)', opacity: 0.85 }} />
        </g>
      )}
      <text x={x + 9} y={y + h - 6} className="k-svg-mono" style={{ fontSize: 13, fill: STATUS_FILL[info.statusTone] }}>
        {info.status}
      </text>
      {info.deadline !== null && <line x1={x + 3} x2={x + 3 + (w - 6) * Math.max(0, Math.min(1, info.deadline))} y1={y + h + 3} y2={y + h + 3} style={{ stroke: info.deadline < 0.25 ? 'var(--red)' : 'var(--pen)', strokeWidth: 2.4, strokeLinecap: 'round' }} />}
    </g>
  )
}

/** An empty consumer slot (the slider can add one here): faint dashed outline, decoration only. */
export function FreeCard({ box, seed }: { box: Box; seed: number }) {
  return <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={seed} stroke="var(--ink-4)" strokeWidth={1} dash="3 6" roughness={0.6} />
}

/** Teta Mira's pass: the last cooked orders, each with its stamp (✓ skuhano · ✗ DVAPUT! · „već skuhano”). */
export function KitchenBoard({ box, lines, cooked, duplicates, worried, seed, showMira = true }: { box: Box; lines: BoardLine[]; cooked: number; duplicates: number; worried: boolean; seed: number; showMira?: boolean }) {
  const { x, y, w, h } = box
  const mira = showMira && w >= 250
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.6} fillColor="var(--paper-2)" fillStyle="solid" />
      <text x={x + 10} y={y + 21} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        skuhano {cooked}
        {duplicates > 0 && <tspan style={{ fill: 'var(--red)' }}> · ✗ dvaput {duplicates}</tspan>}
      </text>
      {lines.slice(0, 3).map((l, i) => {
        const ly = y + 44 + i * 20
        const word = l.kind === 'cooked' ? 'skuhano' : l.kind === 'duplicate' ? 'DVAPUT!' : 'već skuhano'
        const fill = l.kind === 'cooked' ? 'var(--ink)' : l.kind === 'duplicate' ? 'var(--red)' : 'var(--pen)'
        return (
          <g key={l.key}>
            {l.kind === 'cooked' ? <Check x={x + 18} y={ly - 4} size={6} seed={seed + 10 + (l.key % 7)} /> : l.kind === 'duplicate' ? <Cross x={x + 18} y={ly - 4} size={6} seed={seed + 20 + (l.key % 7)} /> : <circle cx={x + 18} cy={ly - 4} r={5.5} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 1.6 }} />}
            <text x={x + 32} y={ly} className="k-svg-mono" style={{ fontSize: 13, fill, fontWeight: l.kind === 'duplicate' ? 700 : 500 }}>
              #{l.orderId} {word}
            </text>
          </g>
        )
      })}
      {lines.length === 0 && (
        <text x={x + 12} y={y + 50} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
          još ništa
        </text>
      )}
      {mira && (
        <g transform={`translate(${x + w - 52} ${y + h - 70}) scale(0.5)`}>
          <Mira mood={worried ? 'worry' : 'smile'} holding="ladle" />
        </g>
      )}
    </g>
  )
}

/** The external SMS gateway: the phone doodle, its state and the last SMS. */
export function SmsBox({ box, down, slow, last, duplicates, pending, seed }: { box: Box; down: boolean; slow: boolean; last: string | null; duplicates: number; pending: number; seed: number }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.4} stroke={down ? 'var(--red)' : 'var(--ink-2)'} dash="6 4" roughness={0.9} />
      <text x={x + 8} y={y + 20} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        SMS-gateway
      </text>
      <Phone x={x + 8} y={y + 30} w={46} h={56} seed={seed + 3} text={down ? '✗' : 'SMS'} textSize={13} />
      {down && <Cross x={x + 22} y={y + 66} size={9} seed={seed + 7} />}
      <text x={x + 60} y={y + 46} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: down ? 'var(--red)' : slow ? 'var(--orange)' : 'var(--green)' }}>
        {down ? '✗ ne radi' : slow ? '! sporo' : '✓ radi'}
      </text>
      {pending > 0 ? (
        <text x={x + 60} y={y + 66} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--pen)' }}>
          čeka {pending}
        </text>
      ) : (
        last && (
          <text x={x + 60} y={y + 66} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
            {last}
          </text>
        )
      )}
      {duplicates > 0 && (
        <text x={x + 60} y={y + 86} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
          ✗ 2× {duplicates}
        </text>
      )}
    </g>
  )
}

/** The dead-letter queue: a red-pencil bin with its count and the last order numbers. */
export function DlqBin({ box, id, count, last, seed }: { box: Box; id: string; count: number; last: number[]; seed: number }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${x} ${y + 8} L${x + 8} ${y + h} L${x + w - 8} ${y + h} L${x + w} ${y + 8}` }} seed={seed} stroke="var(--red)" strokeWidth={1.8} />
      <Rough shape={{ k: 'line', x1: x - 4, y1: y + 8, x2: x + w + 4, y2: y + 8 }} seed={seed + 1} stroke="var(--red)" strokeWidth={2.2} />
      <text x={x + 10} y={y + 32} className="k-svg-display" style={{ fontSize: 16, fill: 'var(--red)' }}>
        DLQ
      </text>
      <text x={x + 52} y={y + 32} className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700, fill: count > 0 ? 'var(--red)' : 'var(--ink-3)' }}>
        {count}
      </text>
      {last.slice(0, Math.max(1, Math.floor((w - 20) / 36))).map((o, i) => (
        <Ticket key={`${o}-${i}`} id={id} x={x + 26 + i * 36} y={y + 66} tone="bad" label={String(o)} scale={1} />
      ))}
      {count === 0 && (
        <text x={x + 12} y={y + 70} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-3)' }}>
          prazno
        </text>
      )}
    </g>
  )
}

/** The API card (klopa-api): name, small face and what it answers. */
export function ApiCard({ box, status, statusTone, mood, seed }: { box: Box; status: string; statusTone: 'ink' | 'red' | 'green' | 'pen'; mood: ServerMood; seed: number }) {
  const { x, y, w, h } = box
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + 9} y={y + 21} className="k-svg-display" style={{ fontSize: 14.5 }}>
        klopa-api
      </text>
      <MiniFace cx={x + w - 16} cy={y + 18} r={11} mood={mood} seed={seed + 3} />
      <text x={x + 9} y={y + h - 11} className="k-svg-mono" style={{ fontSize: 13, fill: STATUS_FILL[statusTone] }}>
        {status}
      </text>
    </g>
  )
}
