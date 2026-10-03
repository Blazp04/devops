import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Arrow, Brain, Cross, Diagram, NodeFrame, PodShape, Rough, Stepper, stepColor, useDiagramIds, useWidth } from '../../../kit'
import { gkeAllocatable } from '../lib/model'
import styles from '../styles.module.css'

const CAP = { cpuM: 2000, memMi: 4096 }
const ALLOC = gkeAllocatable(CAP.cpuM, CAP.memMi)
/** an example node (not one of the incident's three): a DaemonSet Pod + three Pods; usage is what they really eat */
const PODS = [
  { key: 'ds', name: 'DaemonSet', cpu: 100, mem: 200, useCpu: 100, useMem: 200, system: true },
  { key: 'web', name: 'web', cpu: 250, mem: 256, useCpu: 150, useMem: 200 },
  { key: 'api', name: 'api', cpu: 500, mem: 512, useCpu: 400, useMem: 400 },
  { key: 'test', name: 'testni', cpu: 1000, mem: 256, useCpu: 20, useMem: 120 },
]
const NEW_POD = { cpu: 1500, mem: 512 }
const sum = (f: (p: (typeof PODS)[number]) => number) => PODS.reduce((a, p) => a + f(p), 0)
const REQ_CPU = sum((p) => p.cpu)
const USE_CPU = sum((p) => p.useCpu)
const REQ_MEM = sum((p) => p.mem)

const STEPS = [
  { title: 'Čvor ima kapacitet', body: 'Uzmimo za primjer čvor s 2 vCPU i 4 GiB RAM-a. To je njegov kapacitet (engl. capacity): dvije procesorske jezgre su 2000m (milijezgri), memorija 4096Mi.' },
  {
    title: 'Dio stroja uzima sustav',
    body: `Kubelet, container runtime i operacijski sustav trebaju svoj dio, a kubelet čuva i 100Mi pričuve za izbacivanje. Ostatak je allocatable: ${ALLOC.cpuM}m i ${ALLOC.memMi}Mi. To je sve što raspoređivač smije podijeliti.`,
  },
  {
    title: 'Rezervacije, ne apetit',
    body: `Svaki Pod u rezervaciji drži svoje requests – i sivi DaemonSet (agent za logove: običan Pod koji radi na svakom čvoru). Zajedno ${REQ_CPU}m CPU-a, a stvarno troše tek ${USE_CPU}m – narančasta traka. Rezervacija ostaje cijela i kad Pod ne jede.`,
  },
  {
    title: 'Novi gost: 1500m',
    body: `Novi Pod traži ${NEW_POD.cpu}m. Nerezervirano je samo ${ALLOC.cpuM - REQ_CPU}m, pa raspoređivač kaže „Insufficient cpu” – iako procesor radi na ${Math.round((USE_CPU / ALLOC.cpuM) * 100)} %. Memorije bi bilo dovoljno.`,
  },
]

interface Geo {
  W: number
  H: number
  narrow: boolean
  stripX: number
  stripW: number
  cpuY: number
  memY: number
  barH: number
  podY: number
  font: { mono: number; hand: number; name: number }
}

function geoFor(width: number | null): Geo {
  if (width !== null && width < 640) return { W: 400, H: 430, narrow: true, stripX: 20, stripW: 360, cpuY: 150, memY: 300, barH: 26, podY: 112, font: { mono: 14.5, hand: 21, name: 15 } }
  return { W: 760, H: 330, narrow: false, stripX: 150, stripW: 580, cpuY: 108, memY: 232, barH: 26, podY: 70, font: { mono: 14.5, hand: 21, name: 15 } }
}

function Strip({ g, y, total, alloc, step, kind }: { g: Geo; y: number; total: number; alloc: number; step: number; kind: 'cpu' | 'mem' }) {
  const ids = useDiagramIds()
  const reduce = useReducedMotion()
  const sc = g.stripW / total
  const sysW = (total - alloc) * sc
  const unit = kind === 'cpu' ? 'm' : 'Mi'
  const fill = (n: number) => n * sc
  const blocks: { key: string; x: number; w: number; system?: boolean; name: string }[] = []
  let acc = g.stripX
  for (const p of PODS) {
    const w = fill(kind === 'cpu' ? p.cpu : p.mem)
    blocks.push({ key: p.key, x: acc, w, system: p.system, name: p.name })
    acc += w
  }
  const used = kind === 'cpu' ? USE_CPU : sum((p) => p.useMem)
  const req = kind === 'cpu' ? REQ_CPU : REQ_MEM
  const t = reduce ? { duration: 0 } : { duration: 0.45 }
  return (
    <g>
      <text x={g.narrow ? g.stripX : g.stripX - 14} y={g.narrow ? y - 10 : y + g.barH - 7} textAnchor={g.narrow ? 'start' : 'end'} className={styles.svgLabel} style={{ fontSize: g.font.name + 1 }}>
        {kind === 'cpu' ? 'CPU' : 'RAM'}
      </text>
      {/* reserved for the system + eviction threshold (step ≥ 1) */}
      {step >= 1 && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t}>
          <rect x={g.stripX + g.stripW - sysW} y={y} width={sysW} height={g.barH} style={{ fill: ids ? `url(${ids.hatchRed})` : 'none' }} />
          <text x={g.stripX + g.stripW} y={g.narrow ? y - 10 : y + g.barH + 20} textAnchor="end" className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--red)' }}>
            sustav −{total - alloc}
            {unit}
          </text>
        </motion.g>
      )}
      {/* Pods' requests (step ≥ 2) */}
      {step >= 2 &&
        blocks.map((b, i) => (
          <motion.g key={b.key} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.35, delay: 0.12 * i }}>
            <rect x={b.x} y={y} width={b.w} height={g.barH} style={{ fill: ids ? `url(${b.system ? ids.hatch : ids.hatchV1})` : 'none' }} />
            <line x1={b.x + b.w} y1={y} x2={b.x + b.w} y2={y + g.barH} style={{ stroke: 'var(--ink-2)', strokeWidth: 1.2 }} />
            {kind === 'cpu' && b.w >= 52 && !b.system && (
              <text x={b.x + b.w / 2} y={y + g.barH / 2 + 5} textAnchor="middle" className={styles.svgName} style={{ fontSize: g.font.name - 1, paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 4 }}>
                {b.name}
              </text>
            )}
          </motion.g>
        ))}
      {/* usage: food strip */}
      {step >= 2 && (
        <motion.rect x={g.stripX} y={y + g.barH + 4} height={7} rx={2} initial={{ width: 0 }} animate={{ width: fill(used) }} transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.5 }} style={{ fill: 'var(--food)' }} />
      )}
      <Rough shape={{ k: 'rect', x: g.stripX, y, w: g.stripW, h: g.barH }} seed={kind === 'cpu' ? 1711 : 1712} stroke="var(--ink)" strokeWidth={1.6} roughness={0.8} />
      {step >= 1 && <line x1={g.stripX + g.stripW - sysW} y1={y - 6} x2={g.stripX + g.stripW - sysW} y2={y + g.barH + 6} style={{ stroke: 'var(--red)', strokeWidth: 2 }} />}
      <text x={g.stripX} y={y + g.barH + (step >= 2 ? 30 : 20)} className={styles.svgMono} style={{ fontSize: g.font.mono }}>
        {step === 0 && `kapacitet ${total}${unit}`}
        {step === 1 && `allocatable ${alloc}${unit}`}
        {step >= 2 && (
          <>
            <tspan style={{ fill: 'var(--pen)' }}>rez. {req}
              {unit}
            </tspan>
            <tspan style={{ fill: 'var(--ink-3)' }}> · </tspan>
            <tspan>troši {used}
              {unit} ({Math.round((used / alloc) * 100)} %)</tspan>
          </>
        )}
      </text>
    </g>
  )
}

function Scene({ step, g }: { step: number; g: Geo }) {
  const free = ALLOC.cpuM - REQ_CPU
  const sc = g.stripW / CAP.cpuM
  const freeX = g.stripX + REQ_CPU * sc
  const newW = NEW_POD.cpu * sc
  const busy = Math.min(1, step >= 2 ? USE_CPU / ALLOC.cpuM : 0)
  return (
    <g>
      <NodeFrame x={4} y={6} w={g.W - 8} h={g.H - 12} name="čvor" />
      <text x={g.narrow ? 64 : 66} y={28} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--ink-2)' }}>
        2 vCPU · 4 GiB (primjer)
      </text>
      {/* two brains = two cores (CPU) */}
      <g aria-hidden="true">
        <Brain x={g.narrow ? 270 : 26} y={g.narrow ? 14 : 52} w={34} h={28} busy={busy} seed={3011} />
        <Brain x={g.narrow ? 312 : 70} y={g.narrow ? 14 : 52} w={34} h={28} busy={busy} seed={3012} />
      </g>
      <Strip g={g} y={g.cpuY} total={CAP.cpuM} alloc={ALLOC.cpuM} step={step} kind="cpu" />
      <Strip g={g} y={g.memY} total={CAP.memMi} alloc={ALLOC.memMi} step={step} kind="mem" />
      {step === 1 && (
        <text x={g.stripX} y={g.narrow ? g.cpuY - 38 : g.cpuY - 14} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: stepColor(1) }}>
          ② allocatable = kapacitet − sustav − pričuva
        </text>
      )}
      {step === 2 && (
        <text x={g.stripX} y={g.narrow ? g.cpuY - 38 : g.cpuY - 14} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: stepColor(2) }}>
          ③ šrafirano = rezervirano · narančasto = jede
        </text>
      )}
      {/* the grey block is a DaemonSet Pod (log agent), not the system reserve */}
      {step >= 2 && (
        <g aria-hidden="true">
          <text
            x={g.narrow ? g.stripX + 50 : g.stripX - 14}
            y={g.narrow ? g.cpuY - 4 : g.cpuY + g.barH + 28}
            textAnchor={g.narrow ? 'start' : 'end'}
            className={styles.svgHand}
            style={{ fontSize: g.font.hand, fill: 'var(--ink-2)' }}
          >
            DaemonSet
          </text>
          <Arrow
            pts={
              g.narrow
                ? [
                    [g.stripX + 46, g.cpuY - 9],
                    [g.stripX + 10, g.cpuY + 3],
                  ]
                : [
                    [g.stripX - 10, g.cpuY + g.barH + 16],
                    [g.stripX + 9, g.cpuY + g.barH - 3],
                  ]
            }
            stroke="var(--ink-2)"
            seed={1725}
          />
        </g>
      )}
      <AnimatePresence>
        {step >= 3 && (
          <motion.g key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PodShape x={g.narrow ? 60 : freeX - newW / 2 + 40} y={g.narrow ? 70 : 42} size={30} status="pending" tone="blue" />
            <text x={g.narrow ? 86 : freeX - newW / 2 + 64} y={g.narrow ? 76 : 48} className={styles.svgMono} style={{ fontSize: g.font.mono }}>
              novi Pod: {NEW_POD.cpu}m
            </text>
            <Rough shape={{ k: 'rect', x: freeX, y: g.cpuY - 4, w: Math.min(newW, g.stripX + g.stripW + 18 - freeX), h: g.barH + 8 }} seed={1720} stroke="var(--red)" strokeWidth={1.8} dash="6 4" />
            <Arrow pts={g.narrow ? [[60, 92], [freeX + 6, g.cpuY - 8]] : [[freeX - newW / 2 + 40, 60], [freeX + 8, g.cpuY - 8]]} stroke="var(--pen)" />
            <Cross x={freeX + 14} y={g.cpuY + g.barH / 2} size={16} />
            <text x={g.narrow ? g.stripX : freeX - 6} y={g.narrow ? g.memY - 60 : g.cpuY + g.barH + 56} textAnchor={g.narrow ? 'start' : 'end'} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--red)' }}>
              ④ slobodno samo {free}m → Insufficient cpu
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  )
}

/** Scene 1 „Rezervacija, ne apetit”: capacity → allocatable → requests vs usage → a Pod that does not fit. */
export function ReservationStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = geoFor(width)
  return (
    <div ref={ref}>
      <Stepper
        wide
        title="Što raspoređivač vidi na čvoru"
        steps={STEPS}
        caption={`Brojke allocatable računate formulom GKE-a (6 % prve procesorske jezgre i 1 % druge, 25 % prvih 4 GiB memorije, plus 100Mi pričuve); drugi oblaci rezerviraju malo drukčije.`}
      >
        {(step) => (
          <div className={g.narrow ? styles.stageNarrow : undefined}>
            <Diagram width={g.W} height={g.H} label={`Primjer čvora: kapacitet 2000m i 4096Mi, allocatable ${ALLOC.cpuM}m i ${ALLOC.memMi}Mi, rezervirano ${REQ_CPU}m, a troši se ${USE_CPU}m. Korak ${step + 1}: ${STEPS[step].title}.`}>
              <Scene step={step} g={g} />
            </Diagram>
          </div>
        )}
      </Stepper>
    </div>
  )
}
