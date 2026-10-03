import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Boil, Rough } from '../sketch/Sketch'
import { hashSeed, type Pt } from '../sketch/roughGen'
import { useWidth } from '../sketch/useSize'
import { Crowd, Redar } from '../doodles/Characters'
import { Cylinder, Envelope, Helm, Laptop, ServiceTag, SvgStamp } from '../doodles/Things'
import { Doodle } from '../doodles/Doodle'
import { Brace, Clipboard, CommitString, Elastic, FolderTab, Fridge, FoodBox, LoopArrows, LoopMagnifier, MenzaGate, MiniFace, MiniServer, Phone, QueueSlots, RecipeCard, Shelf, TrayStack, Vault } from '../doodles/diagram-doodles'
import { DBar, DiagramScale, Edge } from '../diagram/Diagram'
import { NodeFrame, PodShape } from '../diagram/K8s'
import { borderPoint, clusterTag, DNS_ANSWER, LAYOUT_WIDTH, mapFont, STAMP_ROTATE, storyStage, type Box, type Layout, type MapFont, type StageItem, type StageLink } from './story-map'

interface StoryMapProps {
  /** Lecture id ("01"…"24"): shows the architecture as it is at the END of that lecture. */
  at: string
  /** Optional caption override (may contain inline `<code>`; the drawing's accessible name then uses the default caption) */
  caption?: ReactNode
  /** Highlight what this lecture added (default true) */
  highlightNew?: boolean
  /** Tag every thing with the number of the lecture that introduced it (blue-pen stamps; the course trailer / rewind) */
  tags?: boolean
}

/** The narrow (phone) drawing is never shown wider than this (bible: narrow layouts max ~460 px). */
const NARROW_MAX = 460

/** DNS = a phone book page: red margin line, coloured index tabs, „DNS” on top and the entry klopa → address. */
function PhoneBook({ box, f, seed }: { box: Box; f: MapFont; seed: number }) {
  const [x, y, w, h] = box
  const row = (k: number) => y + 6 + f.name * 0.95 + k * ((h - 12 - f.name * 0.95) / 2)
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'rect', x: x + w - 2, y: y + 10 + i * 15, w: 7, h: 10 }} seed={seed + 2 + i} strokeWidth={1} fillColor={['var(--hl-yellow-ink)', 'var(--hl-pink-ink)', 'var(--hl-green-ink)'][i]} fillStyle="solid" />
      ))}
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 11, y1: y + 2, x2: x + 11, y2: y + h - 2 }} seed={seed + 1} strokeWidth={1.2} stroke="var(--red)" />
      <text x={x + 18} y={row(0)} className="k-map__name" style={{ fontSize: f.name }}>
        DNS
      </text>
      <text x={x + 18} y={row(1)} className="k-map__hand" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
        klopa
      </text>
      <text x={x + 18} y={row(2)} className="k-map__mono" style={{ fontSize: f.mono }}>
        {DNS_ANSWER}
      </text>
    </g>
  )
}

/** The thing itself, drawn into its box. */
function Thing({ si, L, f }: { si: StageItem; L: Layout; f: MapFont }) {
  const [x, y, w, h] = si.box
  const seed = 12000 + (hashSeed(si.item.id) % 4000)
  const cx = x + w / 2
  const cy = y + h / 2
  switch (si.item.kind) {
    case 'crowd':
      return (
        <Boil slow>
          <Crowd x={x} y={y} scale={Math.min(w / 190, h / 210)} />
        </Boil>
      )
    case 'dns':
      return <PhoneBook box={si.box} f={f} seed={seed} />
    case 'hc':
      return <Doodle kind="hc" x={x} y={y} scale={Math.min(w / 64, h / 48)} />
    case 'ci':
      return <Doodle kind="pipeline" x={x} y={y} scale={Math.min(w / 64, h / 48)} />
    case 'obs':
      return <Doodle kind="eye" x={x} y={y} scale={Math.min(w / 64, h / 48)} />
    case 'laptop':
      return <Laptop x={x} y={y} w={w} seed={seed} sticker={L === 'wide' ? 'Klopa' : ''} />
    case 'lb': {
      const k = h / 172
      return (
        <Boil slow>
          <Redar x={cx - 6 * k} y={y + 94 * k} scale={k} angle={0} />
        </Boil>
      )
    }
    case 'server': {
      const r = Math.min(h * 0.22, 19)
      const parts = (si.sub ?? '').split(' · ')
      const narrow = L === 'narrow'
      return (
        <g>
          <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
          <MiniFace cx={x + 10 + r} cy={y + 12 + r} r={r} seed={seed + 1} />
          <text x={x + 2 * r + 18} y={y + 18 + r * 0.9} className="k-map__name" style={{ fontSize: f.name }}>
            {si.label}
          </text>
          {narrow ? (
            parts.map((p, i) => (
              <text key={i} x={x + 10} y={y + h - 30 + i * 18} className="k-map__mono" style={{ fontSize: f.mono }}>
                {p}
              </text>
            ))
          ) : (
            <text x={x + 12} y={y + h - 13} className="k-map__mono" style={{ fontSize: f.mono }}>
              {si.sub}
            </text>
          )}
        </g>
      )
    }
    case 'worker':
      return <MiniServer x={x} y={y} w={w} h={h} seed={seed} />
    case 'brace':
      return w > h ? (
        <g transform={`translate(${x + w} ${y}) rotate(90)`}>
          <Brace x={0} y={0} h={w} depth={h} seed={seed} />
        </g>
      ) : (
        <Brace x={x} y={y} h={h} depth={w} seed={seed} />
      )
    case 'db':
      return (
        <g>
          <Cylinder x={x} y={y} w={w} h={h} seed={seed} />
          <text x={cx} y={y + h * 0.62} textAnchor="middle" className="k-map__mono k-dhalo" style={{ fontSize: f.mono, fontWeight: 600 }}>
            {si.label}
          </text>
        </g>
      )
    case 'queue':
      return <QueueSlots x={x} y={y} w={w} h={h} slots={4} filled={2} seed={seed} />
    case 'sms':
      return <Phone x={x} y={y} w={w} h={h} seed={seed} textSize={f.mono} />
    case 'host':
      return (
        <g>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={4} className="k-map__wash" />
          <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} roughness={1.4} />
          <text x={x + 12} y={y + 8 + f.hand} className="k-map__hand" style={{ fontSize: f.hand + 1, fontWeight: 700 }}>
            {si.label}
          </text>
          <MiniFace cx={x + w - 22} cy={y + 20} r={12} seed={seed + 1} />
        </g>
      )
    case 'container':
      return <FoodBox x={x} y={y} w={w} h={h} seed={seed} label={si.label} labelSize={f.mono} tint="var(--hl-pink-ink)" />
    case 'dockerfile':
    case 'compose':
      return (
        <g>
          <RecipeCard x={x} y={y} w={w} h={h} seed={seed} lines={3} title={si.label} titleSize={f.small} />
          {si.sub && (
            <text x={cx} y={y + h + f.hand + 2} textAnchor="middle" className="k-map__hand" style={{ fontSize: f.hand }}>
              {si.sub}
            </text>
          )}
        </g>
      )
    case 'image':
      return <TrayStack x={x} y={y} w={w} h={h} seed={seed} labels={['FROM', 'RUN', 'COPY']} labelSize={f.mono} />
    case 'cluster':
      return (
        <g>
          <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke="var(--pen)" strokeWidth={2} multi roughness={1.2} />
        </g>
      )
    case 'loop':
      return <LoopArrows cx={cx} cy={cy} r={Math.min(w, h) * 0.42} seed={seed} check />
    case 'desired':
    case 'deploy':
      return <Clipboard x={x} y={y} w={w} h={h} seed={seed} text={si.lines} textSize={f.mono} />
    case 'cp': {
      const narrow = L === 'narrow'
      const py = y + 48
      const a = narrow ? [x + 6, 96] : [x + 14, 104]
      const s = narrow ? [x + 108, 88] : [x + 128, 96]
      const e = narrow ? x + 202 : x + 236
      return (
        <g>
          <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke="var(--pen)" strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" multi />
          <Helm x={x + 22} y={y + 24} r={11} seed={seed + 1} />
          <text x={x + 42} y={y + 30} className="k-map__name" style={{ fontSize: f.name, fill: 'var(--pen)' }}>
            {si.label}
          </text>
          {[
            [a, 'API server'],
            [s, 'scheduler'],
          ].map(([[px, pw], t], i) => (
            <g key={String(t)}>
              <Rough shape={{ k: 'rect', x: px as number, y: py, w: pw as number, h: 28 }} seed={seed + 3 + i} strokeWidth={1.3} />
              <text x={(px as number) + (pw as number) / 2} y={py + 19} textAnchor="middle" className="k-map__mono" style={{ fontSize: f.mono }}>
                {t as string}
              </text>
            </g>
          ))}
          <Cylinder x={e} y={py - 3} w={narrow ? 24 : 26} h={34} seed={seed + 6} />
          <text x={e + (narrow ? 27 : 30)} y={py + 19} className="k-map__mono" style={{ fontSize: f.mono }}>
            etcd
          </text>
        </g>
      )
    }
    case 'node':
      return <NodeFrame x={x} y={y} w={w} h={h} name={si.label} spec={si.sub ?? '4 vCPU · 8 GB'} />
    case 'pod':
      return <PodShape x={cx} y={cy + 2} size={Math.round(w / 1.35)} status="running" tone={si.tone ?? 'blue'} label={si.tape} />
    case 'bars': {
      const half = w / 2
      const v = (k: number) => 0.42 + ((hashSeed(`${si.item.id}${k}`) % 40) / 100)
      return (
        <g>
          {['CPU', 'RAM'].map((t, i) => (
            <g key={t}>
              <text x={x + i * half} y={y + h - 2} className="k-map__hand" style={{ fontSize: f.small, fontWeight: 700 }}>
                {t}
              </text>
              <DBar x={x + i * half + f.small * 1.9} y={y} w={half - 12 - f.small * 1.9} h={h} value={v(i)} tone="warn" />
            </g>
          ))}
        </g>
      )
    }
    case 'svc':
      return (
        <ServiceTag x={x} y={y} w={w} h={h} seed={seed}>
          <text x={x + 30} y={y + h * 0.44} className="k-map__name" style={{ fontSize: f.name }}>
            {si.label}
          </text>
          <text x={x + 30} y={y + h * 0.8} className="k-map__mono" style={{ fontSize: f.mono }}>
            {si.sub}
          </text>
        </ServiceTag>
      )
    case 'gateway':
      return <MenzaGate x={x} y={y} w={w} h={h} seed={seed} labelSize={f.stamp} />
    case 'hpa':
      return <Elastic x={x} y={y} w={w} h={h} seed={seed} />
    case 'ca': {
      const narrow = L === 'narrow'
      return (
        <g>
          <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.5} stroke="var(--ink-3)" dash="6 5" roughness={1.4} />
          {narrow ? (
            <text x={cx} y={cy + f.hand * 0.32} textAnchor="middle" className="k-map__hand" style={{ fontSize: f.small }}>
              <tspan className="k-map__name" style={{ fontSize: f.name }}>
                {si.label}
              </tspan>{' '}
              ({si.sub})
            </text>
          ) : (
            <g>
              <text x={cx} y={y + 34} textAnchor="middle" className="k-map__name" style={{ fontSize: f.name + 2 }}>
                {si.label}
              </text>
              {(si.sub ?? '').split(' ').map((p, i) => (
                <text key={i} x={cx} y={y + 38 + f.small * (1 + i * 1.05)} textAnchor="middle" className="k-map__hand" style={{ fontSize: f.small }}>
                  {p}
                </text>
              ))}
            </g>
          )}
        </g>
      )
    }
    case 'keda':
      return (
        <g transform={`rotate(-4 ${cx} ${cy})`}>
          <rect x={x} y={y} width={w} height={h} className="k-map__sticker" />
          <text x={cx} y={cy + 5} textAnchor="middle" className="k-map__sticker-text" style={{ fontSize: f.mono }}>
            {si.label}
          </text>
        </g>
      )
    case 'cm':
      return <RecipeCard x={x} y={y} w={w} h={h} seed={seed} lines={3} />
    case 'secret':
      return <Envelope x={x} y={y} w={w} h={h} seed={seed} />
    case 'eso':
      return (
        <g>
          <LoopArrows cx={cx} cy={cy} r={Math.min(w, h) * 0.46} seed={seed} />
          <Envelope x={cx - w * 0.26} y={cy - h * 0.16} w={w * 0.52} h={h * 0.34} seed={seed + 9} />
        </g>
      )
    case 'argo':
      return <LoopMagnifier cx={cx} cy={cy} r={Math.min(w, h) * 0.42} seed={seed} />
    case 'pvc':
      return <Fridge x={x} y={y} w={w} h={h} seed={seed} label={si.label} labelSize={f.mono} />
    case 'ns':
      return <FolderTab x={x} y={y} w={w} h={h} seed={seed} label={si.label} labelSize={f.mono} />
    case 'note':
      return (
        <g transform={`rotate(-1.5 ${cx} ${cy})`}>
          <rect x={x} y={y} width={w} height={h} className="k-map__note" />
          <rect x={cx - 22} y={y - 7} width={44} height={13} className="k-map__note-tape" />
          {(si.lines ?? []).map((l, i) => (
            <text key={i} x={x + 9} y={y + f.small + 2 + i * f.small * 1.06} className="k-map__note-text" style={{ fontSize: f.small }}>
              {l}
            </text>
          ))}
        </g>
      )
    case 'git':
      return <CommitString x={x} y={cy} w={w} n={si.item.id === 'git' ? 4 : 3} branch={si.item.id === 'git'} r={6} seed={seed} />
    case 'registry':
      return <Shelf x={x} y={y} w={w} h={h} seed={seed} />
    case 'vault':
      return <Vault x={x} y={y} w={w} h={h} seed={seed} />
  }
}

/** The handwritten name next to a thing (where `labelAt` says), and the cluster's name on its frame. */
function ThingLabel({ si, L, f, mark }: { si: StageItem; L: Layout; f: MapFont; mark?: boolean }) {
  const [x, y, w, h] = si.box
  if (!si.label) return null
  const hand = { fontSize: f.hand }
  switch (si.labelAt) {
    case 'below':
      return (
        <text x={x + w / 2} y={y + h + f.hand + 2} textAnchor="middle" className="k-map__hand k-dhalo" style={hand}>
          {si.label}
        </text>
      )
    case 'above':
      return (
        <text x={x + w / 2} y={y - 6} textAnchor="middle" className={si.item.kind === 'pod' ? 'k-map__mono k-dhalo' : 'k-map__hand k-dhalo'} style={si.item.kind === 'pod' ? { fontSize: f.mono, fontWeight: 600 } : hand}>
          {si.label}
        </text>
      )
    case 'right':
      return (
        <text x={x + w + 6} y={y + h / 2 + f.hand * 0.33} className="k-map__hand k-dhalo" style={hand}>
          {si.label}
        </text>
      )
    case 'left':
      return (
        <text x={x - 4} y={y + h / 2 + f.hand * 0.33} textAnchor="end" className="k-map__hand k-dhalo" style={hand}>
          {si.label}
        </text>
      )
    case 'top':
    case 'bottom-right': {
      const { x: lx, y: ly, w: tw } = clusterTag(si, L, f)
      return (
        <g>
          <rect x={lx - 6} y={ly - 13} width={tw + 12} height={26} className="k-paper-fill" />
          {mark && <MarkerFill box={[lx - 4, ly - 13, tw + 8, 26]} seed={4405} />}
          <Helm x={lx + 10} y={ly} r={9} seed={4404} />
          <text x={lx + 26} y={ly + (f.hand + 4) * 0.33} className="k-map__hand" style={{ fontSize: f.hand + 4, fontWeight: 700, fill: 'var(--pen)' }}>
            {si.label}
          </text>
        </g>
      )
    }
    default:
      return null
  }
}

/** Marker swipe behind what this lecture added (dragged left → right) and its NOVO stamp. */
function NewMark({ si, f, reduce }: { si: StageItem; f: MapFont; reduce: boolean }) {
  const [x, y, w, h] = si.box
  const k = si.item.kind
  const frame = k === 'node' || k === 'host'
  const below = si.labelAt === 'below' ? f.hand + 8 : 0
  const above = si.labelAt === 'above' ? f.hand + 2 : 0
  const hb: Box = frame ? [x - 8, y - 8, w + 16, h + 16] : [x - 7, y - 6 - above, w + 14, h + 12 + above + below]
  return (
    <motion.g className="k-map__new" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.55, delay: 0.25, ease: [0.5, 0, 0.3, 1] }} style={{ transformBox: 'fill-box', transformOrigin: '0% 50%' }}>
      <MarkerFill box={hb} seed={hashSeed(`mark${si.item.id}`)} />
    </motion.g>
  )
}

/**
 * A highlighter swipe over an area: on paper a translucent marker, on the chalkboard coloured chalk laid on its side
 * (hatching at −41°), so the drawing under it stays readable. Both are drawn; diagram.css shows the one for the theme.
 */
function MarkerFill({ box, seed }: { box: Box; seed: number }) {
  const [x, y, w, h] = box
  return (
    <g>
      <g className="k-map__marker k-map__marker--paper">
        <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke="none" strokeWidth={0} fillColor="var(--hl-yellow)" fillStyle="solid" roughness={2.2} />
      </g>
      <g className="k-map__marker k-map__marker--chalk">
        <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke="none" strokeWidth={0} fillColor="var(--hl-yellow-ink)" hachureGap={5} fillWeight={2.2} roughness={1.6} />
      </g>
    </g>
  )
}

function Link({ sl, boxes, L, highlight }: { sl: StageLink; boxes: Map<string, Box>; L: Layout; highlight: boolean }) {
  const a = boxes.get(sl.link.from)
  const b = boxes.get(sl.link.to)
  if (!a || !b) return null
  const tone = highlight && sl.isNew ? 'blue' : 'neutral'
  const pts = sl.link.pts?.[L]
  if (pts && pts.length >= 2) {
    const seed = hashSeed(sl.key + L)
    const color = tone === 'blue' ? 'var(--pen)' : 'var(--ink-3)'
    return (
      <g>
        <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={color} strokeWidth={1.6} roughness={0.8} dash={sl.link.dashed ? '5 6' : undefined} />
        <Edge from={pts[pts.length - 2]} to={pts[pts.length - 1]} tone={tone} arrow />
      </g>
    )
  }
  const ca: Pt = [b[0] + b[2] / 2, b[1] + b[3] / 2]
  const cb: Pt = [a[0] + a[2] / 2, a[1] + a[3] / 2]
  return <Edge from={borderPoint(a, ca)} to={borderPoint(b, cb)} tone={tone} dashed={sl.link.dashed} label={sl.link.label} />
}

/**
 * Klopa karta: the running example's architecture at the end of a lecture, drawn as a page of the notebook.
 * Everything is a doodle from the grammar (students, the redar, server cards, lunchboxes, the luggage tag…); what
 * this lecture added is swiped with a highlighter and stamped NOVO. Two layouts chosen by the container's width:
 * wide (≥ 860 px) and narrow (phones, ≤ 460 px). The lettering grows when the drawing is shown smaller than its
 * viewBox (`mapFont`), so handwriting stays ≥ 17 px and print ≥ 12 px on screen. Data: ./story-map.ts.
 */
export function StoryMap({ at, caption, highlightNew = true, tags = false }: StoryMapProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const reduce = useReducedMotion() ?? false
  const L: Layout = width === null || width >= 860 ? 'wide' : 'narrow'
  // px per viewBox unit: the lettering grows when the drawing is shown smaller than 1:1 (≥ 17 px / 12 px on screen)
  const scale = width === null ? null : (L === 'narrow' ? Math.min(width, NARROW_MAX) : width) / LAYOUT_WIDTH[L]
  const f = mapFont(L, scale)
  const stage = storyStage(at, L, f, { novo: highlightNew, tags })
  const boxes = new Map(stage.items.map((i) => [i.item.id, i.box] as const))
  const [vw, vh] = stage.size
  const fresh = highlightNew ? stage.items.filter((i) => i.isNew) : []
  const fade = reduce ? { initial: false as const } : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.35 } }
  const order = (i: StageItem) => (i.item.kind === 'cluster' || i.item.kind === 'host' ? 0 : i.item.kind === 'node' || i.item.kind === 'cp' ? 1 : 2)
  const drawn = [...stage.items].sort((p, q) => order(p) - order(q))
  const what = stage.lecture ? `${stage.lecture.title}` : ''
  const shownCaption = caption ?? stage.lecture?.caption
  const spoken = typeof caption === 'string' ? caption : (stage.lecture?.caption ?? '')
  return (
    <figure className="k-storymap k-wide">
      <div className="k-storymap__head">
        <span className="k-storymap__kicker">Klopa karta</span>
        <span className="k-storymap__title">
          nakon predavanja <b>{at}</b>
          {what && ` · ${what}`}
        </span>
      </div>
      <div ref={ref} className="k-storymap__stage" data-layout={L}>
        <svg
          className="k-storymap__svg"
          viewBox={`0 0 ${vw} ${vh}`}
          role="img"
          aria-label={`Arhitektura aplikacije Klopa nakon predavanja ${at}. ${spoken}`}
          style={{ ['--map-edge' as string]: `${f.edge}px`, maxWidth: L === 'narrow' ? NARROW_MAX : undefined } as CSSProperties}
        >
          <DiagramScale value={scale}>
          {[0, 1].map((layer) => (
            <AnimatePresence key={layer}>
              {drawn
                .filter((i) => order(i) === layer)
                .map((si) => (
                  <motion.g key={si.item.id} {...fade}>
                    {highlightNew && si.isNew && si.item.kind !== 'cluster' && <NewMark si={si} f={f} reduce={reduce} />}
                    <Thing si={si} L={L} f={f} />
                  </motion.g>
                ))}
            </AnimatePresence>
          ))}
          <g className="k-storymap__links">
            {stage.links.map((sl) => (
              <Link key={`${sl.key}-${L}`} sl={sl} boxes={boxes} L={L} highlight={highlightNew} />
            ))}
          </g>
          <AnimatePresence>
            {drawn
              .filter((i) => order(i) === 2)
              .map((si) => (
                <motion.g key={si.item.id} {...fade}>
                  {highlightNew && si.isNew && <NewMark si={si} f={f} reduce={reduce} />}
                  <Thing si={si} L={L} f={f} />
                  <ThingLabel si={si} L={L} f={f} />
                </motion.g>
              ))}
          </AnimatePresence>
          {drawn
            .filter((i) => order(i) < 2)
            .map((si) => (
              <ThingLabel key={`l-${si.item.id}`} si={si} L={L} f={f} mark={highlightNew && si.isNew} />
            ))}
          <g className="k-storymap__stamps">
            {(tags ? stage.items : fresh)
              .filter((si) => si.stamp)
              .map((si) => (
                <StampOnly key={`s-${si.item.id}-${at}`} si={si} size={si.tag ? f.mono : f.stamp} />
              ))}
          </g>
          </DiagramScale>
        </svg>
      </div>
      <figcaption className="k-storymap__caption">{shownCaption}</figcaption>
      {highlightNew && fresh.length > 0 && (
        <p className="k-storymap__legend">
          <span className="k-storymap__swatch" aria-hidden="true" />
          <span>
            markerom i pečatom <b>NOVO</b>: što je dodalo ovo predavanje
          </span>
        </p>
      )}
      {tags && (
        <p className="k-storymap__legend">
          <span className="k-storymap__tagkey" aria-hidden="true">
            07
          </span>
          <span>broj uz crtež: predavanje u kojem je to ušlo u Klopu</span>
        </p>
      )}
    </figure>
  )
}

/** The NOVO stamp, on top of everything (so neighbouring drawings never cover it), where story-map placed it. */
function StampOnly({ si, size }: { si: StageItem; size: number }) {
  if (!si.stamp || !si.stampAt) return null
  return <SvgStamp x={si.stampAt[0]} y={si.stampAt[1]} text={si.stamp} tone={si.tag ? 'pen' : 'red'} size={size} rotate={si.tag ? -4 : STAMP_ROTATE} />
}
