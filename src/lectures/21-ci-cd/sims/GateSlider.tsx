import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Diagram, DLabel, Rough, Drawer, Helm, Petra, SpeechBubble, Slider, Button, Figure, Term, useWidth } from '../../../kit'
import type { GateMode } from '../../../engines/build/index.ts'
import { Barrier, CommitDot } from './Draw'
import { GATE_ORDER, GATE_LABEL } from '../factory'
import css from '../styles.module.css'

/** Scene 4 „Isporuka ili postavljanje?”: one slider moves the human gate along a small pipeline. */

type L = {
  W: number
  H: number
  /** commit path: start and the stop point per gate position */
  from: [number, number]
  stop: Record<GateMode, [number, number]>
  line: [number, number, number, number]
  ci: { x: number; y: number; w: number; h: number }
  drawers: [number, number][]
  staging: { x: number; y: number; w: number; h: number }
  prod: { x: number; y: number; w: number; h: number }
  bar: Record<'ci' | 'delivery', { px: number; py: number; closed: number; open: number }>
  len: number
  petra: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number }
  head: [number, number]
  notes: Record<GateMode, { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }>
  txt: number
}

const WIDE: L = {
  W: 900,
  H: 250,
  from: [40, 150],
  stop: { ci: [368, 150], delivery: [618, 150], deployment: [790, 150] },
  line: [30, 150, 860, 150],
  ci: { x: 20, y: 76, w: 340, h: 130 },
  drawers: [0, 1, 2, 3, 4].map((i) => [40 + i * 64, 130] as [number, number]),
  staging: { x: 420, y: 116, w: 150, h: 68 },
  prod: { x: 700, y: 100, w: 180, h: 100 },
  bar: { ci: { px: 390, py: 104, closed: Math.PI / 2, open: -1.2 }, delivery: { px: 645, py: 104, closed: Math.PI / 2, open: -1.2 } },
  len: 90,
  petra: { x: 560, y: 8, s: 0.72 },
  bubble: { x: 430, y: 12, w: 124, h: 56 },
  head: [589, 30],
  notes: {
    ci: { x: 635, y: 236, text: 'postavljanje: ručno, netko drugi', anchor: 'middle' },
    delivery: { x: 790, y: 236, text: 'spremno u svakom trenutku', anchor: 'middle' },
    deployment: { x: 790, y: 236, text: 'svaki zeleni commit, bez klika', anchor: 'middle' },
  },
  txt: 14.5,
}

const NARROW: L = {
  W: 360,
  H: 470,
  from: [180, 124],
  stop: { ci: [180, 142], delivery: [180, 306], deployment: [180, 378] },
  line: [180, 118, 180, 420],
  ci: { x: 16, y: 12, w: 328, h: 106 },
  drawers: [0, 1, 2, 3, 4].map((i) => [34 + i * 62, 52] as [number, number]),
  staging: { x: 120, y: 186, w: 120, h: 60 },
  prod: { x: 95, y: 360, w: 170, h: 80 },
  bar: { ci: { px: 128, py: 158, closed: 0, open: -1.25 }, delivery: { px: 128, py: 322, closed: 0, open: -1.25 } },
  len: 104,
  petra: { x: 272, y: 264, s: 0.64 },
  bubble: { x: 250, y: 184, w: 100, h: 56 },
  head: [296, 282],
  notes: {
    ci: { x: 180, y: 462, text: 'postavljanje: ručno, netko drugi', anchor: 'middle' },
    delivery: { x: 180, y: 462, text: 'spremno u svakom trenutku', anchor: 'middle' },
    deployment: { x: 180, y: 462, text: 'svaki zeleni commit, bez klika', anchor: 'middle' },
  },
  txt: 14,
}

function Scene({ gate, run, l }: { gate: GateMode; run: number; l: L }) {
  const reduce = useReducedMotion()
  const stop = l.stop[gate]
  const dist = Math.hypot(stop[0] - l.from[0], stop[1] - l.from[1])
  const deployOn = gate !== 'ci'
  const note = l.notes[gate]
  const box = (b: { x: number; y: number; w: number; h: number }, on: boolean, seed: number) => (
    <Rough shape={{ k: 'rect', ...b }} seed={seed} strokeWidth={on ? 1.8 : 1.2} stroke={on ? 'var(--ink)' : 'var(--ink-3)'} dash={on ? undefined : '5 5'} fillColor="var(--paper)" fillStyle="solid" />
  )
  return (
    <Diagram width={l.W} height={l.H} label={`Pipeline s ljudskim vratima u položaju „${GATE_LABEL[gate]}”: ${note.text}.`}>
      <Rough shape={{ k: 'line', x1: l.line[0], y1: l.line[1], x2: l.line[2], y2: l.line[3] }} seed={8401} strokeWidth={2} stroke="var(--ink-2)" />
      {/* CI part: always automatic */}
      <Rough shape={{ k: 'rect', ...l.ci }} seed={8402} strokeWidth={1.6} stroke="var(--pen)" fillColor="var(--paper)" fillStyle="solid" />
      {l.drawers.map(([x, y], i) => (
        <Drawer key={i} x={x} y={y} w={44} h={38} seed={8410 + i} />
      ))}
      <DLabel x={l.ci.x + 12} y={l.ci.y + 26} text="CI: svaki commit, automatski" anchor="start" size={l.txt} tone="blue" bold />
      <DLabel x={l.ci.x + l.ci.w / 2} y={l.ci.y + l.ci.h - 12} text={l.W > 500 ? 'lint · testovi · slika · skeniranje · registar' : 'lint → … → registar'} anchor="middle" size={l.txt} tone="neutral" />
      {/* staging and production */}
      {box(l.staging, deployOn, 8420)}
      <DLabel x={l.staging.x + l.staging.w / 2} y={l.staging.y + l.staging.h / 2 + 7} text="staging + e2e" anchor="middle" size={l.txt} bold tone="neutral" />
      {box(l.prod, deployOn, 8421)}
      <Helm x={l.prod.x + 24} y={l.prod.y + 24} r={12} stroke={deployOn ? 'var(--pen)' : 'var(--ink-3)'} />
      <DLabel x={l.prod.x + l.prod.w / 2 + 14} y={l.prod.y + l.prod.h - 14} text="produkcija" anchor="middle" size={l.txt} bold tone="neutral" />
      {/* the gate */}
      {gate === 'ci' && <Barrier px={l.bar.ci.px} py={l.bar.ci.py} len={l.len} closedAngle={l.bar.ci.closed} openAngle={l.bar.ci.open} seed={8430} />}
      {gate !== 'ci' && <Barrier px={l.bar.delivery.px} py={l.bar.delivery.py} len={l.len} closedAngle={l.bar.delivery.closed} openAngle={l.bar.delivery.open} open={gate === 'deployment'} seed={8440} />}
      {gate === 'delivery' && (
        <>
          <Petra x={l.petra.x} y={l.petra.y} scale={l.petra.s} mood="smile" />
          <SpeechBubble x={l.bubble.x} y={l.bubble.y} w={l.bubble.w} h={l.bubble.h} tx={l.head[0]} ty={l.head[1]} lines={['Izdajemo', 'u 14 h.']} size={21} seed={8450} />
        </>
      )}
      <DLabel x={note.x} y={note.y} text={note.text} anchor={note.anchor} size={l.txt} tone={gate === 'deployment' ? 'ok' : gate === 'ci' ? 'neutral' : 'blue'} />
      {/* the commit travelling at constant speed until the gate stops it */}
      <motion.g
        key={`${gate}-${run}`}
        initial={reduce ? false : { x: l.from[0] - stop[0], y: l.from[1] - stop[1] }}
        animate={{ x: 0, y: 0 }}
        transition={{ duration: reduce ? 0 : dist / 260, ease: 'linear' }}
      >
        <CommitDot x={stop[0]} y={stop[1]} r={10} stroke="var(--green)" seed={8460} />
      </motion.g>
    </Diagram>
  )
}

const TEXT: Record<GateMode, ReactNode> = {
  ci: (
    <>
      <strong>Samo CI.</strong> Svaki commit se izgradi, testira i spremi u registar. Što će se i kada postaviti, odlučuje netko ručno – traka staje kod registra.
    </>
  ),
  delivery: (
    <>
      <strong>
        <Term id="continuous-delivery">Kontinuirana isporuka</Term>
      </strong>{' '}
      (engl. <em>continuous delivery</em>): svaka promjena automatski stiže do stanja „spremno za produkciju”, a izdanje je poslovna odluka – jedan klik. Klopa bi mogla izdati bilo kad; Petra bira kada.
    </>
  ),
  deployment: (
    <>
      <strong>
        <Term id="continuous-deployment">Kontinuirano postavljanje</Term>
      </strong>{' '}
      (engl. <em>continuous deployment</em>): vrata su otvorena i svaki commit koji prođe sve provjere sam ode u produkciju. Bez kontinuirane isporuke to ne ide – postavljanje je isporuka bez klika.
    </>
  ),
}

export function GateSlider() {
  const [i, setI] = useState(1)
  const [run, setRun] = useState(0)
  const [ref, w] = useWidth<HTMLDivElement>()
  const gate = GATE_ORDER[i] ?? 'delivery'
  const l = w !== null && w >= 830 ? WIDE : NARROW
  return (
    <Figure wide caption="Ista traka, tri položaja ljudskih vrata. Mijenja se tko odlučuje o zadnjem koraku. Provjere do registra su iste; „samo CI” ne pokreće ni staging ni e2e.">
      <div className={css.gateBox} ref={ref}>
        <div style={l === NARROW ? { maxWidth: 460, margin: '0 auto', width: '100%' } : undefined}>
          <Scene gate={gate} run={run} l={l} />
        </div>
        <div className={css.gateRow}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Slider label="Vrata" value={i} min={0} max={2} step={1} format={(v) => GATE_LABEL[GATE_ORDER[v] ?? 'delivery']} onChange={(v) => setI(v)} />
          </div>
          <Button size="sm" onClick={() => setRun((r) => r + 1)}>
            Pošalji commit
          </Button>
        </div>
        <div className={css.gateExplain}>
          {GATE_ORDER.map((g) => (
            <p key={g} aria-hidden={g === gate ? undefined : true}>
              {TEXT[g]}
            </p>
          ))}
        </div>
      </div>
    </Figure>
  )
}
