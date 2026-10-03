import { memo } from 'react'
import { Rough } from '../sketch/Sketch'
import { hashSeed, type Pt } from '../sketch/roughGen'
import { Cylinder, Envelope } from '../doodles/Things'
import {
  Building,
  Clipboard,
  CounterWindow,
  Drawer,
  Elastic,
  FolderTab,
  Fridge,
  KitchenTimer,
  LoopArrows,
  LoopMagnifier,
  Magnifier,
  MenzaGate,
  MiniLunchbox,
  MiniPerson,
  RecipeCard,
  Signpost,
} from '../doodles/diagram-doodles'
import type { K8sKind } from './k8s-helpers'

interface K8sGlyphProps {
  kind: K8sKind
  /** box the doodle is drawn into (top-left + size) */
  x: number
  y: number
  w: number
  h: number
  /** accent marker of the drawing (hatching); defaults per kind */
  color?: string
}

/** Luggage tag (Service) with its hole and a bit of string. Box x, y, w, h; the point is on the left. */
function Tag({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  const nose = Math.min(w * 0.26, h * 0.5)
  return (
    <g>
      <Rough shape={{ k: 'curve', pts: [[x + nose * 0.5, y + h / 2], [x - w * 0.04, y + h * 0.9], [x + w * 0.06, y + h + 2]] }} seed={seed + 2} strokeWidth={1.1} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'path', d: `M${x + nose} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x + nose} ${y + h} L${x} ${y + h / 2} Z` }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + nose * 0.62, cy: y + h / 2, w: Math.max(4, h * 0.2), h: Math.max(4, h * 0.2) }} seed={seed + 1} strokeWidth={1.2} />
      <Rough shape={{ k: 'line', x1: x + nose + w * 0.1, y1: y + h * 0.38, x2: x + w * 0.86, y2: y + h * 0.38 }} seed={seed + 3} strokeWidth={1.1} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'line', x1: x + nose + w * 0.1, y1: y + h * 0.64, x2: x + w * 0.7, y2: y + h * 0.64 }} seed={seed + 4} strokeWidth={1.1} stroke="var(--ink-3)" />
    </g>
  )
}

/**
 * Hand-drawn Kubernetes kinds (drawn into the box x, y, w, h): pod = lunchbox · deploy = stack of lunchboxes with a
 * clipboard · rs = the stack · svc = luggage tag · secret = envelope · cm = recipe card · node = building ·
 * ns = folder · gw = menza gate · route = signpost · hpa = elastic · job / cronjob = kitchen timer ·
 * sts = numbered lunchboxes · ds = one lunchbox per building · pv = fridge · pvc = drawer · sc = fridge sizes ·
 * argo = loop with a magnifier · api = counter window · etcd = cylinder · sched = magnifier over a free slot ·
 * cm-ctrl = reconciliation loop · kubelet = the cook of a node · proxy = a switch · user = a student.
 */
export const K8sGlyph = memo(function K8sGlyph({ kind, x, y, w, h, color }: K8sGlyphProps) {
  const seed = 9900 + (hashSeed(kind) % 700)
  const cx = x + w / 2
  const cy = y + h / 2
  const s = Math.min(w, h)
  const blue = color ?? 'var(--hl-blue-ink)'
  switch (kind) {
    case 'pod':
      return <MiniLunchbox x={x + w * 0.14} y={y + h * 0.04} w={w * 0.72} h={h * 0.9} tint={blue} tape="var(--tape-v1)" seed={seed} />
    case 'rs':
    case 'deploy': {
      const dep = kind === 'deploy'
      const bx = dep ? x + w * 0.3 : x + w * 0.06
      const bw = dep ? w * 0.58 : w * 0.7
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <MiniLunchbox key={i} x={bx + i * w * 0.07} y={y + i * h * 0.17} w={bw * 0.86} h={h * 0.56} tint={blue} seed={seed + i * 3} bg sw={1.3} />
          ))}
          {dep && <Clipboard x={x + w * 0.02} y={y + h * 0.28} w={w * 0.38} h={h * 0.7} seed={seed + 20} checks={2} />}
        </g>
      )
    }
    case 'sts':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <MiniLunchbox x={x + i * w * 0.34} y={y + h * 0.08} w={w * 0.3} h={h * 0.54} tint={blue} seed={seed + i * 3} sw={1.3} />
              <text x={x + i * w * 0.34 + w * 0.15} y={y + h * 0.96} textAnchor="middle" className="k-svg-mono" style={{ fontSize: Math.max(10, s * 0.32), fontWeight: 700 }}>
                {i}
              </text>
            </g>
          ))}
        </g>
      )
    case 'ds':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Rough shape={{ k: 'rect', x: x + i * w * 0.34, y: y + h * 0.18, w: w * 0.3, h: h * 0.78 }} seed={seed + i} strokeWidth={1.4} roughness={1.3} />
              <MiniLunchbox x={x + i * w * 0.34 + w * 0.05} y={y + h * 0.42} w={w * 0.2} h={h * 0.42} tint={blue} seed={seed + 5 + i} sw={1.1} />
            </g>
          ))}
        </g>
      )
    case 'svc':
      return <Tag x={x + w * 0.06} y={y + h * 0.18} w={w * 0.88} h={h * 0.56} seed={seed} />
    case 'node':
      return <Building x={x + w * 0.06} y={y} w={w * 0.88} h={h} seed={seed} />
    case 'ns':
      return <FolderTab x={x + w * 0.06} y={y + h * 0.08} w={w * 0.88} h={h * 0.86} seed={seed} />
    case 'secret':
      return <Envelope x={x + w * 0.06} y={y + h * 0.2} w={w * 0.88} h={h * 0.64} seed={seed} />
    case 'cm':
      return <RecipeCard x={x + w * 0.12} y={y + h * 0.04} w={w * 0.76} h={h * 0.92} seed={seed} lines={3} />
    case 'pv':
      return <Fridge x={cx - s * 0.34} y={y} w={s * 0.68} h={h} seed={seed} />
    case 'pvc':
      return <Drawer x={x + w * 0.1} y={y + h * 0.1} w={w * 0.8} h={h * 0.84} seed={seed} />
    case 'sc':
      return (
        <g>
          {[0.5, 0.72, 0.96].map((k, i) => (
            <Fridge key={i} x={x + i * w * 0.34} y={y + h * (1 - k)} w={w * 0.28} h={h * k} seed={seed + i * 10} />
          ))}
        </g>
      )
    case 'ing': {
      const dx = x + w * 0.46
      return (
        <g>
          <Rough shape={{ k: 'rect', x: dx, y: y + h * 0.04, w: w * 0.44, h: h * 0.92 }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: dx + w * 0.34, cy: y + h * 0.54, w: 3.5, h: 3.5 }} seed={seed + 1} strokeWidth={1.4} />
          <Rough shape={{ k: 'line', x1: x, y1: cy, x2: dx + w * 0.18, y2: cy }} seed={seed + 2} strokeWidth={1.7} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[dx + w * 0.08, cy - 5], [dx + w * 0.18, cy], [dx + w * 0.08, cy + 5]] }} seed={seed + 3} strokeWidth={1.6} stroke="var(--pen)" roughness={0.5} />
        </g>
      )
    }
    case 'gw':
      return <MenzaGate x={x + w * 0.04} y={y} w={w * 0.92} h={h} seed={seed} />
    case 'route':
      return <Signpost x={x + w * 0.08} y={y} w={w * 0.84} h={h} seed={seed} />
    case 'hpa':
      return <Elastic x={x} y={y + h * 0.06} w={w} h={h * 0.88} seed={seed} />
    case 'job':
    case 'cronjob':
      return <KitchenTimer cx={cx} cy={cy + h * 0.08} r={s * 0.36} seed={seed} cron={kind === 'cronjob'} />
    case 'api':
      return <CounterWindow x={x + w * 0.1} y={y + h * 0.06} w={w * 0.8} h={h * 0.88} seed={seed} />
    case 'etcd':
      return <Cylinder x={cx - s * 0.4} y={y + h * 0.02} w={s * 0.8} h={h * 0.92} seed={seed} />
    case 'sched':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: x + w * 0.4, y: y + h * 0.36, w: w * 0.52, h: h * 0.56 }} seed={seed} strokeWidth={1.1} stroke="var(--ink-3)" dash="3 4" />
          <Magnifier cx={x + w * 0.34} cy={y + h * 0.36} r={s * 0.26} seed={seed + 1} />
        </g>
      )
    case 'cm-ctrl':
      return <LoopArrows cx={cx} cy={cy} r={s * 0.42} seed={seed} check />
    case 'kubelet':
      return (
        <g>
          <MiniPerson cx={x + w * 0.3} cy={y + h * 0.2} s={h * 0.76} shirt="var(--hl-green-ink)" hair="bun" seed={seed} />
          <MiniLunchbox x={x + w * 0.54} y={y + h * 0.42} w={w * 0.42} h={h * 0.52} tint={blue} seed={seed + 10} sw={1.3} />
        </g>
      )
    case 'proxy': {
      const o: Pt = [x + w * 0.38, cy]
      const ends: Pt[] = [
        [x + w * 0.94, y + h * 0.12],
        [x + w * 0.94, cy],
        [x + w * 0.94, y + h * 0.88],
      ]
      return (
        <g>
          <Rough shape={{ k: 'line', x1: x + w * 0.02, y1: cy, x2: o[0], y2: o[1] }} seed={seed} strokeWidth={1.8} />
          {ends.map((e, i) => (
            <g key={i}>
              <Rough shape={{ k: 'curve', pts: [o, [o[0] + w * 0.2, (o[1] + e[1]) / 2 + (i - 1) * 2], e] }} seed={seed + 1 + i} strokeWidth={1.5} stroke="var(--pen)" />
              <Rough shape={{ k: 'ellipse', cx: e[0], cy: e[1], w: 5, h: 5 }} seed={seed + 5 + i} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--pen)" fillStyle="solid" />
            </g>
          ))}
          <Rough shape={{ k: 'rect', x: o[0] - 7, y: o[1] - 7, w: 14, h: 14 }} seed={seed + 9} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
        </g>
      )
    }
    case 'user':
      return <MiniPerson cx={cx} cy={y + h * 0.21} s={h * 0.8} shirt={blue} seed={seed} />
    case 'argo':
      return <LoopMagnifier cx={cx} cy={cy} r={s * 0.42} seed={seed} />
  }
})
