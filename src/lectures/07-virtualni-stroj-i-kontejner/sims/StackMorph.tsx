/**
 * „Slojevi: VM ili kontejner” — the same two apps (klopa-api, klopa-worker) on the same hardware, as a stack that
 * morphs between the two answers. VM: hardware → hypervisor → (per VM) guest kernel → libraries → app.
 * Container: hardware → the host kernel → (per container) libraries → app; the runtime stands beside the containers
 * (it starts and watches them; the app's system calls go straight to the host kernel, not through it).
 */
import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Figure, Rough, Segmented, useWidth } from '../../../kit'
import { Band, ContainerBox, ProgramCard, VmFrame } from './parts'
import styles from '../styles.module.css'

type View = 'vm' | 'ct'
type Box = { x: number; y: number; w: number; h: number }

interface Geo {
  W: number
  H: number
  hw: Box
  base: Box
  vm: [Box, Box]
  guest: [Box, Box]
  libs: { vm: [Box, Box]; ct: [Box, Box] }
  app: { vm: [Box, Box]; ct: [Box, Box] }
  box: [Box, Box]
  runtime: Box
  arrows: [number, number][][]
  ctLabel: [number, number][]
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 640,
  H: 382,
  hw: { x: 16, y: 330, w: 608, h: 42 },
  base: { x: 16, y: 280, w: 608, h: 42 },
  vm: [
    { x: 24, y: 24, w: 276, h: 248 },
    { x: 316, y: 24, w: 276, h: 248 },
  ],
  guest: [
    { x: 40, y: 222, w: 244, h: 40 },
    { x: 332, y: 222, w: 244, h: 40 },
  ],
  libs: {
    vm: [
      { x: 52, y: 162, w: 220, h: 50 },
      { x: 344, y: 162, w: 220, h: 50 },
    ],
    ct: [
      { x: 36, y: 214, w: 220, h: 50 },
      { x: 290, y: 214, w: 220, h: 50 },
    ],
  },
  app: {
    vm: [
      { x: 52, y: 102, w: 220, h: 50 },
      { x: 344, y: 102, w: 220, h: 50 },
    ],
    ct: [
      { x: 36, y: 154, w: 220, h: 50 },
      { x: 290, y: 154, w: 220, h: 50 },
    ],
  },
  box: [
    { x: 26, y: 138, w: 240, h: 134 },
    { x: 280, y: 138, w: 240, h: 134 },
  ],
  runtime: { x: 530, y: 120, w: 96, h: 112 },
  arrows: [
    [
      [532, 150],
      [516, 160],
    ],
  ],
  ctLabel: [
    [30, 128],
    [284, 128],
  ],
  mono: 14,
  hand: 20,
}

const NARROW: Geo = {
  W: 360,
  H: 432,
  hw: { x: 8, y: 380, w: 344, h: 42 },
  base: { x: 8, y: 330, w: 344, h: 42 },
  vm: [
    { x: 10, y: 120, w: 164, h: 202 },
    { x: 186, y: 120, w: 164, h: 202 },
  ],
  guest: [
    { x: 18, y: 270, w: 148, h: 42 },
    { x: 194, y: 270, w: 148, h: 42 },
  ],
  libs: {
    vm: [
      { x: 18, y: 210, w: 148, h: 52 },
      { x: 194, y: 210, w: 148, h: 52 },
    ],
    ct: [
      { x: 18, y: 262, w: 148, h: 56 },
      { x: 194, y: 262, w: 148, h: 56 },
    ],
  },
  app: {
    vm: [
      { x: 18, y: 152, w: 148, h: 50 },
      { x: 194, y: 152, w: 148, h: 50 },
    ],
    ct: [
      { x: 18, y: 204, w: 148, h: 50 },
      { x: 194, y: 204, w: 148, h: 50 },
    ],
  },
  box: [
    { x: 10, y: 192, w: 164, h: 132 },
    { x: 186, y: 192, w: 164, h: 132 },
  ],
  runtime: { x: 70, y: 18, w: 220, h: 88 },
  arrows: [
    [
      [112, 110],
      [94, 162],
    ],
    [
      [248, 110],
      [266, 162],
    ],
  ],
  ctLabel: [
    [14, 184],
    [190, 184],
  ],
  mono: 15,
  hand: 20.5,
}

const APPS = [
  { name: 'klopa-api', lib: 'libvips 8.15' },
  { name: 'klopa-worker', lib: 'libvips 8.12' },
]

/** an element that slides (spring) and fades between the two views; drawn at (0, 0) */
function Move({ to, show = true, children }: { to: { x: number; y: number }; show?: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.g initial={false} animate={{ x: to.x, y: to.y, opacity: show ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20, opacity: { duration: 0.35 } }}>
      {children}
    </motion.g>
  )
}

function Fade({ show, children }: { show: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.g initial={false} animate={{ opacity: show ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.35, delay: show && !reduce ? 0.2 : 0 }} style={{ pointerEvents: 'none' }} aria-hidden={!show}>
      {children}
    </motion.g>
  )
}

export function StackMorph() {
  const [view, setView] = useState<View>('vm')
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = width !== null && width < 640 ? NARROW : WIDE
  const narrow = g === NARROW
  const vm = view === 'vm'
  const label = vm
    ? 'Virtualni strojevi: hardver, iznad njega hipervizor, a u svakom VM-u vlastita jezgra gosta, biblioteke i aplikacija.'
    : 'Kontejneri: hardver, jedna jezgra domaćina, a na njoj dva kontejnera – svaki sa svojim bibliotekama i aplikacijom. Izvršno okruženje stoji sa strane i pokreće ih.'
  return (
    <div ref={ref}>
      <Figure caption="Ista dva programa na istom hardveru. Prebacite pogled i pratite što nestaje: jezgra gosta.">
        <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
          <Band {...g.hw} label="hardver" sub={narrow ? undefined : 'procesor · RAM · disk · mreža'} size={16} subSize={g.mono - 1} seed={7601} align="start" />
          {/* the layer above the hardware: hypervisor ↔ the host kernel (same place, different job) */}
          <Fade show={vm}>
            <Band {...g.base} label="hipervizor" size={16} hatch="var(--ink-3)" seed={7602} align="start" />
          </Fade>
          <Fade show={!vm}>
            <Band {...g.base} label="jezgra domaćina (Linux)" size={16} hatch="var(--hl-blue-ink)" seed={7603} align="start" />
          </Fade>
          {[0, 1].map((i) => (
            <g key={i}>
              <Fade show={vm}>
                <VmFrame {...g.vm[i]} label={`VM ${i + 1}`} size={g.mono} seed={7610 + i * 5} />
              </Fade>
              {/* the guest kernel sinks into the host and disappears in the container view */}
              <Move to={vm ? g.guest[i] : { x: g.guest[i].x, y: g.base.y }} show={vm}>
                <Band x={0} y={0} w={g.guest[i].w} h={g.guest[i].h} label="jezgra gosta" size={15} hatch="var(--hl-blue-ink)" seed={7620 + i} />
              </Move>
              <Fade show={!vm}>
                <Rough shape={{ k: 'rect', ...g.box[i] }} seed={7630 + i} stroke="var(--ink-2)" strokeWidth={1.6} dash="6 5" />
                <text x={g.ctLabel[i][0]} y={g.ctLabel[i][1]} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
                  kontejner {i + 1}
                </text>
              </Fade>
              <Move to={vm ? g.libs.vm[i] : g.libs.ct[i]}>
                <Band x={0} y={0} w={g.libs.vm[i].w} h={g.libs.vm[i].h} label="biblioteke" sub={APPS[i].lib} size={15} subSize={g.mono - 0.5} hatch="var(--hl-green-ink)" seed={7640 + i} />
              </Move>
              <Move to={vm ? g.app.vm[i] : g.app.ct[i]}>
                {vm ? (
                  <ProgramCard x={0} y={0} w={g.app.vm[i].w} h={g.app.vm[i].h} name={APPS[i].name} size={g.mono} seed={7650 + i} />
                ) : (
                  <ContainerBox x={0} y={0} w={g.app.vm[i].w} h={g.app.vm[i].h} name={APPS[i].name} size={g.mono} seed={7660 + i} tint={i === 0 ? 'var(--hl-blue-ink)' : 'var(--hl-green-ink)'} />
                )}
              </Move>
            </g>
          ))}
          {narrow && (
            <Fade show={vm}>
              <text x={g.W / 2} y={72} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
                svaki VM – kao cijelo računalo
              </text>
            </Fade>
          )}
          {/* the runtime: beside the containers, not under them */}
          <Fade show={!vm}>
            <Rough shape={{ k: 'rect', ...g.runtime }} seed={7670} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
            {narrow ? (
              <>
                <text x={g.runtime.x + g.runtime.w / 2} y={g.runtime.y + 30} textAnchor="middle" className="k-svg-display" style={{ fontSize: 15, fontWeight: 700 }}>
                  izvršno okruženje
                </text>
                <text x={g.runtime.x + g.runtime.w / 2} y={g.runtime.y + 54} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 0.5, fill: 'var(--ink-2)' }}>
                  containerd · runc
                </text>
                <text x={g.runtime.x + g.runtime.w / 2} y={g.runtime.y + 76} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--pen)' }}>
                  pokreće i nadzire
                </text>
              </>
            ) : (
              <>
                <text x={g.runtime.x + 10} y={g.runtime.y + 26} className="k-svg-display" style={{ fontSize: 15, fontWeight: 700 }}>
                  <tspan x={g.runtime.x + 10}>izvršno</tspan>
                  <tspan x={g.runtime.x + 10} dy={18}>
                    okruženje
                  </tspan>
                </text>
                <text x={g.runtime.x + 10} y={g.runtime.y + 72} className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
                  <tspan x={g.runtime.x + 10}>containerd</tspan>
                  <tspan x={g.runtime.x + 10} dy={17}>
                    runc
                  </tspan>
                </text>
                <text x={g.runtime.x + g.runtime.w / 2} y={g.runtime.y + g.runtime.h + 24} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--pen)' }}>
                  pokreće
                </text>
              </>
            )}
            {g.arrows.map((pts, i) => (
              <Arrow key={i} pts={pts} stroke="var(--pen)" seed={7680 + i * 3} dash="4 4" />
            ))}
          </Fade>
        </svg>
      </Figure>
      <div className={styles.controls}>
        <Segmented<View>
          label="Pogled"
          value={view}
          onChange={setView}
          options={[
            { value: 'vm', label: 'Virtualni stroj' },
            { value: 'ct', label: 'Kontejner' },
          ]}
        />
      </div>
      <p className={styles.readout} aria-live="polite">
        {vm ? (
          <>
            Svaki VM ima <strong>vlastitu jezgru</strong>: aplikacija razgovara s jezgrom gosta, a ona radi na hardveru koji joj dijeli i nadzire hipervizor.
          </>
        ) : (
          <>
            Nema jezgre gosta: oba kontejnera <strong>dijele jezgru domaćina</strong> i razgovaraju s njom izravno. Svoje su ostale samo datoteke – biblioteke i aplikacija.
          </>
        )}
      </p>
    </div>
  )
}
