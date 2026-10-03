/**
 * "Abeceda luke": the illustration grammar as one engineering drawing sheet. Rows are the four families
 * (A traffic, B servers, C Kubernetes, D delivery), columns 1–5; every cell is drawn with the same isometric
 * primitives AND at the same scale (fixed viewBox size, only centred on its drawing), so sizes compare honestly.
 * The last cell is the sheet's title block.
 */
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { iso, pts, segs, type Dir, type V3 } from './iso-math'
import {
  Archive,
  Box,
  Container,
  FaceText,
  HazardBand,
  LampDot,
  Lockbox,
  Person,
  PodBox,
  Quad,
  Rails,
  Road,
  RotBeacon,
  Silo,
  Tower,
  Truck,
  Wagon,
} from './iso'
import { useLoopTime, usePrefersReducedMotion } from './useLoop'
import g from './grammar.module.css'

/** every cell shows the same slice of the world: CELL_W × CELL_H SVG units (1 world unit = 20) */
const CELL_W = 176
const CELL_H = 108

function Cell({
  code,
  title,
  note,
  children,
  svgRef,
}: {
  code: string
  title: string
  note: string
  children: ReactNode
  svgRef?: RefObject<SVGSVGElement | null>
}) {
  const own = useRef<SVGSVGElement>(null)
  const ref = svgRef ?? own
  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    // centre the fixed window on the drawing (the size never changes, so the scale is shared by every cell)
    const b = svg.getBBox()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    svg.setAttribute('viewBox', `${(cx - CELL_W / 2).toFixed(1)} ${(cy - CELL_H / 2).toFixed(1)} ${CELL_W} ${CELL_H}`)
  }, [ref])
  return (
    <figure className={g.cell}>
      <div className={g.art}>
        <svg ref={ref} viewBox={`0 0 ${CELL_W} ${CELL_H}`} role="img" aria-label={`${title}: ${note}`}>
          {children}
        </svg>
      </div>
      <figcaption className={g.cap}>
        <span className={g.code}>{code}</span>
        <b>{title}</b>
        <span className={g.note}>{note}</span>
      </figcaption>
    </figure>
  )
}

function Portal({ x, y0, y1, lamp }: { x: number; y0: number; y1: number; lamp: 'ok' | 'warn' | 'err' }) {
  return (
    <g>
      <Box x={x} y={y0} w={0.1} d={0.1} h={1.1} c="var(--yellow)" />
      <Box x={x} y={y1 - 0.1} w={0.1} d={0.1} h={1.1} c="var(--yellow)" />
      <Box x={x} y={y0} z={1.1} w={0.1} d={y1 - y0} h={0.12} c="var(--yellow)" />
      <LampDot x={x + 0.05} y={(y0 + y1) / 2} z={1.32} state={lamp} r={0.12} blink={lamp === 'err'} />
    </g>
  )
}

function Clock({ at }: { at: V3 }) {
  const [x, y] = iso(...at)
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.6} />
      <path d={`M${x} ${y}V${y - 5.5}M${x} ${y}h4`} stroke="var(--ink)" strokeWidth={1.6} />
    </g>
  )
}

function Rings({ at, tone }: { at: V3; tone: 'ok' | 'err' }) {
  const [x, y] = iso(...at)
  const c = tone === 'ok' ? 'var(--sig-green)' : 'var(--sig-red)'
  return (
    <g fill="none" stroke={c} strokeWidth={1.6}>
      <circle cx={x} cy={y} r={9} opacity={0.8} />
      <circle cx={x} cy={y} r={15} opacity={0.4} />
    </g>
  )
}

function slot(x: number, y: number, z: number, taken: boolean) {
  return (
    <polygon
      key={`${x},${y}`}
      className={taken ? g.slotTaken : g.slot}
      points={pts([
        [x, y, z],
        [x + 0.8, y, z],
        [x + 0.8, y + 0.8, z],
        [x, y + 0.8, z],
      ])}
    />
  )
}

/* ----------------------------------------------------------- Argo CD loop */

const RING_R = 2.3
function ArgoCell() {
  const ref = useRef<SVGSVGElement>(null)
  const reduce = usePrefersReducedMotion()
  const t = useLoopTime(ref, !reduce, 2.2)
  const period = 9
  const a = ((t % period) / period) * Math.PI * 2
  const px = Math.cos(a) * RING_R
  const py = Math.sin(a) * RING_R
  const tx = -Math.sin(a)
  const ty = Math.cos(a)
  const dir: Dir = Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'x+' : 'x-') : ty > 0 ? 'y+' : 'y-'
  // the pilot passes the cluster side (around a = 0) and puts the drifted container back
  const phase = (t % period) / period
  const synced = phase > 0.02 && phase < 0.62
  const ring: V3[] = []
  for (let i = 0; i < 48; i++) {
    const k = (i / 48) * Math.PI * 2
    ring.push([Math.cos(k) * RING_R, Math.sin(k) * RING_R, 0])
  }
  const back = py < 0
  const pilot = <Truck x={px} y={py} dir={dir} cargo="var(--orange)" cab="var(--yellow)" scale={0.6} />
  return (
    <Cell
      code="D4"
      title="Argo CD · GitOps petlja"
      note="Pilot stalno kruži: uspoređuje teretni list u Gitu s lukom i vraća sve što odstupa."
      svgRef={ref}
    >
      <polygon points={pts(ring)} className={g.ringRoad} />
      <polygon points={pts(ring)} className={g.ringKerb} />
      <polygon points={pts(ring)} className={g.ringLine} />
      {back && pilot}
      {/* Git manifest (left) and the cluster (right) */}
      <Box x={-1.5} y={-0.2} w={1.1} d={0.8} h={0.06} c="var(--paper)" />
      <path
        d={segs([
          [
            [-1.38, 0.0, 0.07],
            [-0.55, 0.0, 0.07],
          ],
          [
            [-1.38, 0.2, 0.07],
            [-0.7, 0.2, 0.07],
          ],
          [
            [-1.38, 0.4, 0.07],
            [-0.6, 0.4, 0.07],
          ],
        ])}
        stroke="var(--ink-3)"
        strokeWidth={1.2}
      />
      <Box x={0.2} y={-0.6} w={1.4} d={1.4} h={0.14} c="var(--dock)" />
      <Container x={0.35} y={-0.45} z={0.14} len={0.55} wid={0.45} hei={0.45} c="var(--teal)" />
      <Container
        x={0.95}
        y={0.15}
        z={0.14}
        len={0.55}
        wid={0.45}
        hei={0.45}
        c="var(--teal)"
        ghost={!synced}
        lamp={synced ? 'ok' : 'warn'}
        lampBlink={!synced}
      />
      {!back && pilot}
    </Cell>
  )
}

/* ------------------------------------------------------------- the sheet */

const ROWS = [
  { k: 'A', name: 'Promet' },
  { k: 'B', name: 'Poslužitelji' },
  { k: 'C', name: 'Kubernetes' },
  { k: 'D', name: 'Isporuka' },
]

/** row label on the sheet's left margin: zone letter + family name */
function Zone({ k }: { k: number }) {
  return (
    <span className={g.zoneLeft}>
      <b>{ROWS[k].k}</b>
      <small>{ROWS[k].name}</small>
    </span>
  )
}

export function Grammar() {
  return (
    <div className={g.sheet}>
      <div className={g.grid}>
        <span className={g.corner} aria-hidden="true" />
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={g.zoneTop} aria-hidden="true">
            {n}
          </span>
        ))}
        <Zone k={0} />
        {/* A — traffic */}
        <Cell code="A1" title="Student" note="Izvor zahtjeva. Mobitel svijetli; boja jakne ne znači ništa.">
          <Box x={-0.5} y={-0.6} w={2.2} d={1.9} h={0.05} c="var(--concrete)" />
          <Person x={0.9} y={-0.35} c="var(--teal)" />
          <Person x={0.2} y={-0.15} c="var(--mustard)" />
          <Person x={1.3} y={0.25} c="var(--rust)" />
          <Person x={0} y={0.45} c="var(--orange)" />
          <Person x={0.75} y={0.75} c="var(--blue)" />
        </Cell>
        <Cell
          code="A2"
          title="Zahtjev · odgovor · greška"
          note="Kamion stalnom brzinom: žuti teret tamo, zeleni natrag (200), crveni s rotirkom i 503 na krovu."
        >
          <Road x0={-0.2} y0={0} x1={4.4} y1={0} w={1.1} />
          <Truck x={0.8} y={0.25} dir="x+" cargo="var(--yellow)" scale={0.85} />
          <Truck x={2.2} y={-0.25} dir="x-" cargo="var(--sig-green)" scale={0.85} />
          <Truck x={3.6} y={-0.25} dir="x-" cargo="var(--sig-red)" scale={0.85} beacon placard="503" />
        </Cell>
        <Cell code="A3" title="Timeout" note="Odgovor ne stiže: kamion stoji pred rampom, teret je siv i blijedi.">
          <Road x0={0} y0={0} x1={3.4} y1={0} w={1.1} />
          <Box x={2.55} y={-0.75} w={0.12} d={0.12} h={0.6} c="var(--steel)" />
          <line {...lineXY([2.6, -0.65, 0.5], [2.6, 0.6, 0.5])} stroke="var(--sig-red)" strokeWidth={3} strokeDasharray="5 4" />
          <g opacity={0.6}>
            <Truck x={1.6} y={0.25} dir="x+" cargo="var(--steel-2)" scale={0.75} />
          </g>
          <Clock at={[1.6, 0.25, 1.3]} />
        </Cell>
        <Cell
          code="A4"
          title="Load balancer"
          note="Rampa preko ceste s pločom: algoritam i aktivne veze; na svakom izlazu signal s rampom."
        >
          <Road x0={-1.2} y0={0} x1={0} y1={0} w={1} />
          <polygon
            points={pts([
              [0, -1.5, 0],
              [1.6, -1.5, 0],
              [1.6, 1.5, 0],
              [0, 1.5, 0],
            ])}
            fill="var(--asphalt)"
          />
          <Box x={0.1} y={-1.6} w={0.16} d={0.16} h={1.7} c="var(--yellow)" />
          <Box x={0.1} y={1.44} w={0.16} d={0.16} h={1.7} c="var(--yellow)" />
          <Box x={0.1} y={-1.6} z={1.7} w={0.16} d={3.2} h={0.3} c="var(--yellow)" />
          <Box x={0.12} y={-0.9} z={2.0} w={0.06} d={1.8} h={0.75} c="var(--board-face)" />
          {[0, 1, 2].map((k) => (
            <Quad
              key={k}
              plane="x"
              at={0.181}
              a0={-0.75 + 0.05}
              a1={0.75}
              b0={2.12 + k * 0.2}
              b1={2.22 + k * 0.2}
              c={k === 2 ? 'var(--sig-green)' : 'var(--amber)'}
            />
          ))}
          <LampDot x={1.2} y={-1.0} z={0.05} state="ok" r={0.14} />
          <LampDot x={1.2} y={0} z={0.05} state="ok" r={0.14} />
          <LampDot x={1.2} y={1.0} z={0.05} state="err" r={0.14} />
        </Cell>
        <Cell
          code="A5"
          title="Provjera zdravlja"
          note="Prsten oko svjetla svakih 0,5 s: zeleni prošao, crveni pao. Izbacivanje tek nakon više padova."
        >
          <Box x={0} y={0} w={2.6} d={1.4} h={0.18} c="var(--dock)" />
          <Box x={0.5} y={0.5} z={0.18} w={0.1} d={0.1} h={1.1} c="var(--steel)" />
          <Box x={1.9} y={0.5} z={0.18} w={0.1} d={0.1} h={1.1} c="var(--steel)" />
          <LampDot x={0.55} y={0.55} z={1.36} state="ok" r={0.13} />
          <Rings at={[0.55, 0.55, 1.36]} tone="ok" />
          <LampDot x={1.95} y={0.55} z={1.36} state="err" r={0.13} blink />
          <Rings at={[1.95, 0.55, 1.36]} tone="err" />
        </Cell>

        <Zone k={1} />
        {/* B — servers */}
        <Cell code="B1" title="Poslužitelj" note="Dok. Žuta dizalica = jedna jezgra (CPU). Iscrtano mjesto u dvorištu = dio RAM‑a.">
          <Box x={0} y={0} w={3} d={2.4} h={0.2} c="var(--dock)" />
          <Container x={0.65} y={0.45} z={0.2} len={0.6} wid={0.42} hei={0.36} c="var(--yellow)" />
          {[0.5, 1.55].map((bx) => (
            <g key={bx}>
              <Box x={bx} y={0.6} z={0.2} w={0.08} d={0.08} h={0.95} c="var(--yellow)" />
              <Box x={bx + 0.82} y={0.6} z={0.2} w={0.08} d={0.08} h={0.95} c="var(--yellow)" />
              <Box x={bx} y={0.59} z={1.15} w={0.9} d={0.1} h={0.1} c="var(--yellow)" />
            </g>
          ))}
          <LampDot x={0.95} y={0.64} z={1.32} state="warn" r={0.09} />
          {[0.3, 1.2, 2.1].map((xx) => slot(xx, 1.4, 0.201, false))}
        </Cell>
        <Cell
          code="B2"
          title="Red čekanja"
          note="Puno dvorište svijetli žuto, kamioni čekaju pred vratima sa žmigavcima, na doku se vrti žuta rotirka."
        >
          <Road x0={-1.6} y0={0.9} x1={0.4} y1={0.9} w={1.0} />
          <Truck x={-0.75} y={1.15} dir="x+" cargo="var(--yellow)" scale={0.8} hazard />
          <Truck x={0.2} y={1.15} dir="x+" cargo="var(--yellow)" scale={0.8} hazard />
          <Box x={0.6} y={-0.4} w={2.4} d={2.4} h={0.2} c="var(--dock)" />
          {[0.8, 1.9].map((xx) => [-0.2, 0.9].map((yy) => slot(xx, yy, 0.201, true)))}
          {[0.8, 1.9].map((xx) =>
            [-0.2, 0.9].map((yy) => (
              <Container key={`${xx}${yy}`} x={xx + 0.1} y={yy + 0.17} z={0.2} len={0.6} wid={0.46} hei={0.36} c="var(--yellow)" />
            )),
          )}
          <Box x={2.75} y={-0.25} z={0.2} w={0.08} d={0.08} h={1.2} c="var(--steel)" />
          <RotBeacon x={2.79} y={-0.21} z={1.42} angle={0.9} r={0.13} />
        </Cell>
        <Cell code="B3" title="Baza podataka" note="Silos. Mjerač sprijeda pokazuje koliko je pun.">
          <Box x={-1.0} y={-1.0} w={2} d={2} h={0.1} c="var(--concrete-dark)" />
          <Silo x={0} y={0} r={0.75} h={2} level={0.62} />
        </Cell>
        <Cell code="B4" title="Kontejner" note="Slika koja radi. Boja = aplikacija ili verzija, natpis = ime, lampa = stanje.">
          <Container x={0} y={0} len={2.2} wid={0.9} hei={0.95} c="var(--teal)" label="klopa-api" labelSize={0.3} lamp="ok" />
        </Cell>
        <Cell code="B5" title="Slojevi slike" note="Ploče jedna na drugoj. Isti sloj dijeli više slika.">
          {[
            { z: 0, c: 'var(--steel)', t: 'OS' },
            { z: 0.55, c: 'var(--blue)', t: 'runtime' },
            { z: 1.1, c: 'var(--orange)', t: 'app' },
          ].map((l) => (
            <g key={l.t}>
              <Box x={0} y={0} z={l.z} w={2.2} d={1} h={0.16} c={l.c} />
              <FaceText face="left" x={0.1} y={1} z={l.z + 0.03} size={0.14}>
                {l.t}
              </FaceText>
            </g>
          ))}
          <path
            d={segs([
              [
                [2.2, 1, 0.16],
                [2.2, 1, 0.55],
              ],
              [
                [2.2, 1, 0.71],
                [2.2, 1, 1.1],
              ],
              [
                [0, 1, 0.16],
                [0, 1, 0.55],
              ],
              [
                [0, 1, 0.71],
                [0, 1, 1.1],
              ],
            ])}
            stroke="var(--ink-3)"
            strokeDasharray="2 3"
          />
        </Cell>

        <Zone k={2} />
        {/* C — Kubernetes */}
        <Cell code="C1" title="Čvor" note="Platforma s oslikanim mjestima; ćelije na rubu = zauzeti CPU.">
          <Box x={0} y={0} w={3.2} d={2.2} h={0.22} c="var(--dock)" />
          {[0, 1, 2, 3].map((k) => (
            <Quad
              key={k}
              plane="z"
              at={0.221}
              a0={0.3 + k * 0.45}
              a1={0.65 + k * 0.45}
              b0={1.75}
              b1={1.95}
              c={k < 3 ? 'var(--orange)' : 'var(--steel-2)'}
            />
          ))}
          <PodBox x={0.3} y={0.3} z={0.22} len={1.1} wid={0.55} hei={0.55} c="var(--teal)" lamp="ok" />
          <PodBox x={1.7} y={0.3} z={0.22} len={1.1} wid={0.55} hei={0.55} c="var(--orange)" lamp="ok" />
        </Cell>
        <Cell
          code="C2"
          title="Pod i stanja"
          note="Kontejner na paleti, duljina = zatraženi CPU. Running zeleno · CrashLoopBackOff traka i rotirka · Pending iscrtkano."
        >
          <Box x={-0.4} y={-0.4} w={4.2} d={3.0} h={0.12} c="var(--dock)" />
          <PodBox x={0.1} y={0} z={0.12} len={1.2} wid={0.6} hei={0.6} c="var(--teal)" lamp="ok" />
          <PodBox x={2.1} y={0.3} z={0.12} len={1.2} wid={0.6} hei={0.6} c="var(--teal)" lamp="err" blink />
          <HazardBand x={2.1} y={0.3} w={1.2} d={0.6} z={0.52} h={0.12} />
          <RotBeacon x={2.55} y={0.6} z={0.74} angle={0.6} r={0.1} tone="red" />
          <PodBox x={0.6} y={1.5} z={0.12} len={2.4} wid={0.6} hei={0.6} c="var(--orange)" lamp="warn" blink ghost />
        </Cell>
        <Cell
          code="C3"
          title="Control plane · etcd"
          note="Toranj odlučuje (API server, scheduler); arhiva etcd pamti stanje; ploča: željeno i stvarno."
        >
          <Tower x={-1.5} y={-1.1} h={2.4} beacon={false} />
          <Archive x={0.3} y={-0.2} w={1.1} d={0.8} h={0.85} />
        </Cell>
        <Cell code="C4" title="Service" note="Kiosk šalje promet samo Podovima s oznakom koji su spremni.">
          <Box x={-0.5} y={1.3} w={1.0} d={0.9} h={0.8} c="var(--cab)" />
          <Box x={-0.55} y={1.25} z={0.8} w={1.1} d={1.0} h={0.08} c="var(--yellow)" />
          <PodBox x={1.0} y={-1.2} len={1.0} wid={0.5} hei={0.55} c="var(--teal)" lamp="ok" />
          <PodBox x={2.4} y={-1.2} len={1.0} wid={0.5} hei={0.55} c="var(--teal)" lamp="err" />
          <path
            d={arcD([0, 1.75, 1.0], [1.5, -0.95, 0.7])}
            fill="none"
            stroke="var(--sig-green)"
            strokeWidth={2.4}
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
        </Cell>
        <Cell code="C5" title="Secret" note="Zapečaćena kasica s lokotom; vrijednost se nikad ne ispisuje.">
          <Lockbox x={0} y={0} />
          <path
            d={segs([
              [
                [1.0, 0.35, 0.3],
                [2.2, -0.75, 0.3],
              ],
            ])}
            stroke="var(--ink-3)"
            strokeDasharray="3 3"
            strokeWidth={1.2}
          />
          <PodBox x={2.2} y={-1.4} len={1.1} wid={0.55} hei={0.55} c="var(--teal)" lamp="ok" />
        </Cell>

        <Zone k={3} />
        {/* D — delivery */}
        <Cell code="D1" title="Git commit" note="Kolosijek = grana, plombirani vagon = commit, skretnica = grananje.">
          <Rails x0={0} x1={5} y={0} branchAt={1.4} />
          <Wagon x={0.1} y={0} hash="a3f9c1" />
          <Wagon x={2.3} y={0} hash="7be20d" />
          <Wagon x={3.7} y={0} hash="c41e88" head />
          <Wagon x={3.6} y={1.38} hash="e19a42" c="var(--mustard)" />
        </Cell>
        <Cell code="D2" title="Faza pipelinea" note="Traka kroz inspekcijske portale: build → test → sken. Crvena lampa zaustavlja traku.">
          <Box x={0} y={0} w={6} d={0.6} h={0.28} c="var(--chassis)" />
          <path
            d={segs(
              Array.from({ length: 15 }, (_, k): [V3, V3] => [
                [0.3 + k * 0.4, 0.02, 0.28],
                [0.3 + k * 0.4, 0.58, 0.28],
              ]),
            )}
            stroke="var(--steel)"
            strokeWidth={1}
          />
          <Portal x={0.9} y0={-0.2} y1={0.8} lamp="ok" />
          <Container x={1.6} y={0.1} z={0.28} len={0.6} wid={0.4} hei={0.36} c="var(--yellow)" />
          <Portal x={2.8} y0={-0.2} y1={0.8} lamp="ok" />
          <Portal x={4.6} y0={-0.2} y1={0.8} lamp="err" />
          <Container x={5.0} y={0.1} z={0.28} len={0.6} wid={0.4} hei={0.36} c="var(--sig-red)" />
        </Cell>
        <Cell code="D3" title="Registar" note="Brod pun gotovih slika. Povlačenje slike = dizalica skida kontejner.">
          <Box x={0} y={0} z={-0.3} w={3.6} d={1.5} h={0.32} c="var(--rust)" />
          <Box x={0} y={0} z={0.02} w={3.6} d={1.5} h={0.3} c="var(--navy-2)" />
          {[0, 1, 2].map((k) => (
            <Container
              key={k}
              x={0.15 + k * 0.85}
              y={0.15}
              z={0.32}
              axis="y"
              len={1.2}
              wid={0.7}
              hei={0.5}
              c={['var(--teal)', 'var(--orange)', 'var(--blue)'][k]}
            />
          ))}
          <Container x={0.15} y={0.15} z={0.82} axis="y" len={1.2} wid={0.7} hei={0.5} c="var(--mustard)" />
          <Box x={2.75} y={0.25} z={0.32} w={0.7} d={1.0} h={0.9} c="var(--cab)" />
        </Cell>
        <ArgoCell />

        <div className={g.titleBlock}>
          <div className={g.tbMain}>
            <small>Luka Klopa</small>
            <b>Abeceda luke</b>
            <span>ilustracijska gramatika tečaja</span>
          </div>
          <dl className={g.tbRows}>
            <div>
              <dt>List</dt>
              <dd>1 / 1</dd>
            </div>
            <div>
              <dt>Mjerilo</dt>
              <dd>1 m = 20</dd>
            </div>
            <div>
              <dt>Projekcija</dt>
              <dd>dimetrija 2:1</dd>
            </div>
            <div>
              <dt>Izvor</dt>
              <dd>iso.tsx</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function lineXY(a: V3, b: V3) {
  const [x1, y1] = iso(...a)
  const [x2, y2] = iso(...b)
  return { x1, y1, x2, y2 }
}

function arcD(a: V3, b: V3) {
  const [x1, y1] = iso(...a)
  const [x2, y2] = iso(...b)
  return `M${x1} ${y1}Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 30} ${x2} ${y2}`
}
