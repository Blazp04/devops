/**
 * Small drawings composed from the kit's pen for this lecture: a key (credential), a padlock (protected repo),
 * a brick firewall, the notebook page (config repo = Git), the cluster's double blue line, the poll ring and the
 * two Argo CD status tags (sync + health, each with a mark so they never rely on colour).
 */
import type { ReactNode } from 'react'
import { Helm, Rough } from '../../../kit'
import type { HealthCode, SyncCode } from '../../../engines/gitops'
import { HEALTH_MARK, SYNC_MARK, healthInk, syncInk } from '../lib/labels'

type Font = 'mono' | 'hand' | 'ui' | 'display' | 'print'
const FONT_CLASS: Record<Font, string> = { mono: 'k-svg-mono', hand: 'k-svg-hand', ui: 'k-svg-display', display: 'k-svg-display', print: 'k-svg-print' }

/** A line of text in a drawing. `ui` = printed names (Bricolage 600), `hand` = Caveat notes, `mono` = values. */
export function T({
  x,
  y,
  size = 14,
  font = 'mono',
  fill,
  anchor = 'start',
  weight,
  children,
  strike,
}: {
  x: number
  y: number
  size?: number
  font?: Font
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  children: ReactNode
  strike?: boolean
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={FONT_CLASS[font]}
      style={{ fontSize: size, fill: fill ?? 'var(--ink)', fontWeight: weight ?? (font === 'ui' ? 650 : font === 'hand' ? 600 : undefined), textDecoration: strike ? 'line-through' : undefined }}
    >
      {children}
    </text>
  )
}

/** A key = a credential that can change production. */
export function KeyGlyph({ x, y, s = 1, stroke = 'var(--ink)', seed = 2201, crossed }: { x: number; y: number; s?: number; stroke?: string; seed?: number; crossed?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Rough shape={{ k: 'ellipse', cx: -9, cy: 0, w: 13, h: 13 }} seed={seed} stroke={stroke} strokeWidth={1.8} fillColor="var(--hl-yellow-ink)" fillStyle="hachure" hachureGap={2.6} />
      <Rough shape={{ k: 'line', x1: -2.5, y1: 0, x2: 13, y2: 0 }} seed={seed + 1} stroke={stroke} strokeWidth={2} />
      <Rough shape={{ k: 'lin', pts: [[8, 0], [8, 5]] }} seed={seed + 2} stroke={stroke} strokeWidth={1.8} />
      <Rough shape={{ k: 'lin', pts: [[12, 0], [12, 4]] }} seed={seed + 3} stroke={stroke} strokeWidth={1.8} />
      {crossed && <Rough shape={{ k: 'line', x1: -16, y1: 8, x2: 15, y2: -8 }} seed={seed + 4} stroke="var(--red)" strokeWidth={2.2} />}
    </g>
  )
}

/** A padlock = the config repo is protected (reviews, signed commits). */
export function Padlock({ x, y, s = 1, stroke = 'var(--pen)', seed = 2211, open }: { x: number; y: number; s?: number; stroke?: string; seed?: number; open?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Rough shape={{ k: 'arc', cx: open ? -4 : 0, cy: -6, w: 14, h: 16, start: Math.PI, stop: Math.PI * 2 }} seed={seed} stroke={stroke} strokeWidth={2} />
      <Rough shape={{ k: 'rect', x: -10, y: -6, w: 20, h: 15 }} seed={seed + 1} stroke={stroke} strokeWidth={1.8} fillColor="var(--hl-blue-ink)" fillStyle="hachure" hachureGap={3} />
      <circle cx={0} cy={1} r={1.8} style={{ fill: stroke }} />
    </g>
  )
}

/** A brick firewall standing vertically between „outside” and the cluster. */
export function Firewall({ x, y1, y2, seed = 2221 }: { x: number; y1: number; y2: number; seed?: number }) {
  const rows = Math.max(2, Math.floor((y2 - y1) / 12))
  const h = (y2 - y1) / rows
  return (
    <g aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => {
        const off = i % 2 === 0 ? 0 : 5
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: x - 10 + off, y: y1 + i * h, w: 10, h }} seed={seed + i * 2} stroke="var(--red)" strokeWidth={1.1} roughness={0.8} fillColor={i % 2 ? 'var(--hl-orange-ink)' : undefined} fillStyle="hachure" hachureGap={3.4} fillWeight={0.7} />
            <Rough shape={{ k: 'rect', x: x + off, y: y1 + i * h, w: 10, h }} seed={seed + i * 2 + 1} stroke="var(--red)" strokeWidth={1.1} roughness={0.8} fillColor={i % 2 ? undefined : 'var(--hl-orange-ink)'} fillStyle="hachure" hachureGap={3.4} fillWeight={0.7} />
          </g>
        )
      })}
    </g>
  )
}

/** The same firewall lying down (narrow layouts: outside above, cluster below). */
export function FirewallH({ y, x1, x2, seed = 2261 }: { y: number; x1: number; x2: number; seed?: number }) {
  const cols = Math.max(2, Math.floor((x2 - x1) / 22))
  const w = (x2 - x1) / cols
  return (
    <g aria-hidden="true">
      {Array.from({ length: cols }, (_, i) => (
        <g key={i}>
          <Rough shape={{ k: 'rect', x: x1 + i * w, y: y - 9, w, h: 9 }} seed={seed + i * 2} stroke="var(--red)" strokeWidth={1.1} roughness={0.8} fillColor={i % 2 ? 'var(--hl-orange-ink)' : undefined} fillStyle="hachure" hachureGap={3.4} fillWeight={0.7} />
          <Rough shape={{ k: 'rect', x: x1 + i * w + w / 2, y, w: Math.min(w, x2 - (x1 + i * w + w / 2)), h: 9 }} seed={seed + i * 2 + 1} stroke="var(--red)" strokeWidth={1.1} roughness={0.8} fillColor={i % 2 ? undefined : 'var(--hl-orange-ink)'} fillStyle="hachure" hachureGap={3.4} fillWeight={0.7} />
        </g>
      ))}
    </g>
  )
}

/** The config repo = a notebook page: paper, red margin, spiral holes along the top. */
export function NotebookPage({ x, y, w, h, seed = 2231 }: { x: number; y: number; w: number; h: number; seed?: number }) {
  const holes = Math.max(3, Math.floor(w / 34))
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 22, y1: y + 4, x2: x + 22, y2: y + h - 4 }} seed={seed + 1} stroke="var(--red)" strokeWidth={1} roughness={0.6} />
      {Array.from({ length: holes }, (_, i) => (
        <Rough key={i} shape={{ k: 'ellipse', cx: x + 20 + (i * (w - 40)) / Math.max(1, holes - 1), cy: y + 8, w: 7, h: 7 }} seed={seed + 3 + i} strokeWidth={1.1} stroke="var(--ink-3)" />
      ))}
    </g>
  )
}

/** The cluster = a double blue pen line with the helm in the corner. */
export function ClusterFrame({ x, y, w, h, seed = 2241, helm = true }: { x: number; y: number; w: number; h: number; seed?: number; helm?: boolean }) {
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke="var(--pen)" strokeWidth={1.7} />
      <Rough shape={{ k: 'rect', x: x + 4, y: y + 4, w: w - 8, h: h - 8 }} seed={seed + 1} stroke="var(--pen)" strokeWidth={1.1} roughness={0.9} />
      {helm && <Helm x={x + w - 16} y={y + 16} r={10} seed={seed + 2} />}
    </g>
  )
}

/**
 * Poll countdown: a faint pencil circle and the elapsed part of the interval in blue pen.
 * With a webhook the ring is dashed (polling still runs as a fallback).
 */
export function PollRing({ cx, cy, r, progress, webhook, seed = 2251 }: { cx: number; cy: number; r: number; progress: number; webhook: boolean; seed?: number }) {
  const p = Math.max(0.001, Math.min(0.999, progress))
  const a = -Math.PI / 2 + p * Math.PI * 2
  const large = p > 0.5 ? 1 : 0
  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 2, h: r * 2 }} seed={seed} stroke="var(--ink-4)" strokeWidth={1.2} dash={webhook ? '4 4' : undefined} />
      <path d={d} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.85 }} />
      <circle cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={3.4} style={{ fill: 'var(--pen)' }} />
    </g>
  )
}

/** „✓ Synced” — the sync tag. */
export function SyncTag({ x, y, sync, size = 14, anchor = 'start' }: { x: number; y: number; sync: SyncCode | null; size?: number; anchor?: 'start' | 'middle' | 'end' }) {
  if (!sync) return null
  return (
    <T x={x} y={y} size={size} fill={syncInk(sync)} anchor={anchor} weight={600}>
      {SYNC_MARK[sync]} {sync}
    </T>
  )
}

/** „♥ Healthy” — the health tag. */
export function HealthTag({ x, y, health, size = 14, anchor = 'start' }: { x: number; y: number; health: HealthCode | null; size?: number; anchor?: 'start' | 'middle' | 'end' }) {
  if (!health) return null
  return (
    <T x={x} y={y} size={size} fill={healthInk(health)} anchor={anchor} weight={600}>
      {HEALTH_MARK[health]} {health}
    </T>
  )
}
