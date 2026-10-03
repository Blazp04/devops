import { Cross, Diagram, K8sGlyph, MiniLaptop, Rough, Stepper, stepColor, useWidth } from '../../../kit'
import { Card, Hand, Magnets, Mono, Wire } from './Parts'
import { FS, type Box, type Pt } from './stage'

const STEPS = [
  {
    title: 'Ploča',
    body: 'Sve što klaster zna – koji objekti postoje, kakvi trebaju biti i kakvi su zapravo – zapisano je u bazi etcd. Ispred nje stoji API poslužitelj: jedini koji smije čitati i pisati po njoj.',
  },
  {
    title: 'Lana piše',
    body: 'Naredba kubectl apply šalje manifest API poslužitelju. On provjeri tko piše i smije li, zapis spremi u etcd i odgovori. Ništa se drugo u tom trenutku ne pokreće.',
  },
  {
    title: 'Svi gledaju ploču',
    body: 'controller-manager, raspoređivač i kubelet na svakom čvoru stalno promatraju (engl. watch) API poslužitelj i traže samo svoje: nedostaje li Podova, ima li Poda bez čvora, ima li Poda za njegov čvor.',
  },
  {
    title: 'Nitko nikoga ne zove',
    body: 'Raspoređivač nikad ne javlja kubeletu „pokreni ovo”. Upiše odluku na ploču, a kubelet je sam pročita. Komponenta zato smije kasniti ili se ponovno pokrenuti, a ostale to ne ruši. (Iznimka: za kubectl logs i exec API poslužitelj sam otvori vezu prema kubeletu.)',
  },
]

interface Geo {
  W: number
  H: number
  cp: Box
  board: Box
  etcd: Box
  api: Box
  cm: Box
  sched: Box
  lana: Box
  kubelets: Box[]
  wires: { lana: Pt[]; cm: Pt[]; sched: Pt[]; kube: Pt[][]; etcd: [Pt, Pt] }
  notes: { etcd: Pt; api: Pt; lana: Pt; kube: Pt; cp: Pt; never: Pt | null; neverLine: Pt[] | null }
  narrow: boolean
}

function geo(narrow: boolean): Geo {
  if (!narrow) {
    const board = { x: 250, y: 22, w: 220, h: 214 }
    const etcd = { x: 270, y: 40, w: 180, h: 70 }
    const api = { x: 270, y: 130, w: 180, h: 86 }
    const cm = { x: 22, y: 44, w: 214, h: 76 }
    const sched = { x: 494, y: 44, w: 196, h: 76 }
    const kubelets = [0, 1, 2].map((i) => ({ x: 206 + i * 140, y: 300, w: 126, h: 34 }))
    return {
      W: 720,
      H: 384,
      narrow,
      cp: { x: 16, y: 10, w: 688, h: 262 },
      board,
      etcd,
      api,
      cm,
      sched,
      lana: { x: 14, y: 292, w: 180, h: 60 },
      kubelets,
      wires: {
        lana: [
          [194, 302],
          [270, 206],
        ],
        cm: [
          [236, 86],
          [270, 156],
        ],
        sched: [
          [494, 86],
          [450, 156],
        ],
        kube: kubelets.map((k) => [
          [360, 216],
          [k.x + k.w / 2, k.y],
        ]),
        etcd: [
          [360, 110],
          [360, 130],
        ],
      },
      notes: { etcd: [36, 160], api: [36, 218], lana: [36, 196], kube: [626, 312], cp: [30, 260], never: [560, 226], neverLine: [[640, 120], [556, 300]] },
    }
  }
  const board = { x: 92, y: 132, w: 216, h: 200 }
  const etcd = { x: 104, y: 148, w: 192, h: 68 }
  const api = { x: 104, y: 232, w: 192, h: 86 }
  const cm = { x: 10, y: 22, w: 184, h: 92 }
  const sched = { x: 206, y: 22, w: 184, h: 92 }
  const kubelets = [0, 1, 2].map((i) => ({ x: 8 + i * 132, y: 486, w: 120, h: 34 }))
  return {
    W: 400,
    H: 572,
    narrow,
    cp: { x: 4, y: 8, w: 392, h: 342 },
    board,
    etcd,
    api,
    cm,
    sched,
    lana: { x: 8, y: 372, w: 170, h: 58 },
    kubelets,
    wires: {
      lana: [
        [150, 372],
        [170, 318],
      ],
      cm: [
        [50, 114],
        [50, 276],
        [104, 276],
      ],
      sched: [
        [350, 114],
        [350, 276],
        [296, 276],
      ],
      kube: kubelets.map((k) => [
        [200, 318],
        [k.x + k.w / 2, k.y],
      ]),
      etcd: [
        [200, 216],
        [200, 232],
      ],
    },
    notes: { etcd: [200, 452], api: [16, 330], lana: [190, 394], kube: [200, 562], cp: [16, 344], never: null, neverLine: null },
  }
}

function Drawing({ step }: { step: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = (width ?? 720) < 560
  const g = geo(narrow)
  const watchers = step >= 2
  const c1 = stepColor(0)
  const c2 = stepColor(1)
  const c3 = stepColor(2)
  const c4 = stepColor(3)
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Diagram width={g.W} height={g.H} label="Ploča na zidu: API poslužitelj i etcd u sredini; Lana piše preko kubectl, a controller-manager, raspoređivač i kubeleti na čvorovima gledaju ploču.">
          {step >= 3 && (
            <g>
              <Rough shape={{ k: 'rect', ...g.cp }} seed={2001} stroke="var(--pen)" strokeWidth={1.5} draw="mount" />
              <Rough shape={{ k: 'rect', x: g.cp.x + 4, y: g.cp.y + 4, w: g.cp.w - 8, h: g.cp.h - 8 }} seed={2002} stroke="var(--pen)" strokeWidth={1.1} draw="mount" />
              <Hand x={g.notes.cp[0]} y={g.notes.cp[1]} lines={['upravljačka ravnina']} color="var(--pen)" />
            </g>
          )}
          {/* the board itself: API + etcd, with magnets */}
          <Rough shape={{ k: 'rect', ...g.board }} seed={2011} stroke="var(--ink)" strokeWidth={2.2} multi fillColor="var(--paper-2)" fillStyle="solid" />
          <Magnets box={g.board} />
          <Wire pts={g.wires.etcd} seed={2021} color="var(--ink)" width={2.2} />
          <Card box={g.etcd} title={['etcd']} role="izvor istine" glyph="etcd" seed={2031} accent={step === 0 ? c1 : undefined} />
          <Card box={g.api} title={['API poslužitelj']} role="jedini piše u etcd" glyph="api" seed={2041} accent={step === 1 ? c2 : undefined} />

          {/* Lana writes */}
          <g>
            <g opacity={step >= 1 ? 1 : 0.28}>
              <Wire pts={g.wires.lana} seed={2051} color={step === 1 ? c2 : 'var(--ink-2)'} width={step === 1 ? 2.2 : 1.5} />
              <Rough shape={{ k: 'rect', ...g.lana }} seed={2052} stroke="var(--ink-2)" strokeWidth={1.4} />
              <MiniLaptop x={g.lana.x + 8} y={g.lana.y + 8} w={52} h={40} />
            </g>
            <Mono x={g.lana.x + 68} y={g.lana.y + 26} color={step >= 1 ? 'var(--ink)' : 'var(--ink-3)'}>
              kubectl
            </Mono>
            <Hand x={g.lana.x + 68} y={g.lana.y + 50} lines={['Lana']} color={step >= 1 ? 'var(--ink-2)' : 'var(--ink-3)'} />
          </g>

          {/* the watchers */}
          <Wire pts={g.wires.cm} dashed seed={2061} dim={!watchers} color={step === 2 ? c3 : 'var(--pen)'} />
          <Wire pts={g.wires.sched} dashed seed={2062} dim={!watchers} color={step === 2 ? c3 : 'var(--pen)'} />
          {g.wires.kube.map((w, i) => (
            <Wire key={i} pts={w} dashed seed={2063 + i} dim={!watchers} color={step === 2 ? c3 : 'var(--pen)'} />
          ))}
          <Card box={g.cm} title={g.narrow ? ['controller-', 'manager'] : ['controller-manager']} role={watchers ? 'nedostaje li Podova?' : undefined} glyph="cm-ctrl" seed={2071} dim={!watchers} titleSize={g.narrow ? 15 : FS.title} />
          <Card box={g.sched} title={['raspoređivač']} role={watchers ? 'Pod bez čvora?' : undefined} glyph="sched" seed={2072} dim={!watchers} />
          {g.kubelets.map((k, i) => (
            <g key={i}>
              <g opacity={watchers ? 1 : 0.28}>
                <Rough shape={{ k: 'rect', ...k }} seed={2081 + i} stroke="var(--ink)" strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
                <K8sGlyph kind="kubelet" x={k.x + 6} y={k.y + 5} w={28} h={24} />
              </g>
              <Mono x={k.x + 40} y={k.y + 23} color={watchers ? 'var(--ink)' : 'var(--ink-3)'}>
                kubelet
              </Mono>
              <Mono x={k.x + k.w / 2} y={k.y + k.h + 22} anchor="middle" color={watchers ? 'var(--ink-2)' : 'var(--ink-3)'}>
                {`node-${i + 1}`}
              </Mono>
            </g>
          ))}

          {/* step notes, in the step's colour */}
          {step === 0 && !g.narrow && (
            <>
              <Hand x={g.notes.etcd[0]} y={g.notes.etcd[1]} lines={['etcd pamti sve', 'što klaster zna →']} color={c1} />
              <Hand x={g.notes.api[0]} y={g.notes.api[1]} lines={['API poslužitelj:', 'jedini vratar →']} color={c1} />
            </>
          )}
          {step === 0 && g.narrow && <Hand x={g.notes.etcd[0]} y={g.notes.etcd[1]} anchor="middle" lines={['etcd pamti sve što klaster zna,', 'a API poslužitelj je jedini vratar']} color={c1} />}
          {step === 1 && <Hand x={g.notes.lana[0]} y={g.notes.lana[1]} lines={['kubectl apply =', 'upis na ploču']} color={c2} />}
          {step === 2 && !g.narrow && <Hand x={g.notes.kube[0]} y={g.notes.kube[1]} lines={['Pod za', 'moj čvor?']} color={c3} />}
          {step === 2 && g.narrow && <Hand x={g.notes.kube[0]} y={g.notes.kube[1]} anchor="middle" lines={['kubelet: „Pod za moj čvor?”']} color={c3} />}
          {step >= 3 && g.notes.neverLine && g.notes.never && (
            <g>
              <Wire pts={g.notes.neverLine} dashed seed={2091} color="var(--red)" width={2} />
              <Cross x={(g.notes.neverLine[0][0] + g.notes.neverLine[1][0]) / 2} y={(g.notes.neverLine[0][1] + g.notes.neverLine[1][1]) / 2} size={13} />
              <Hand x={g.notes.never[0] + 50} y={g.notes.never[1]} lines={['nikad', 'izravno']} color={c4} />
            </g>
          )}
          {step >= 3 && g.narrow && <Hand x={200} y={460} anchor="middle" lines={['nitko nikoga ne zove izravno']} color={c4} />}
        </Diagram>
      </div>
    </div>
  )
}

export function PlocaStepper() {
  return (
    <Stepper title="Ploča na zidu" steps={STEPS} autoPlay={0} caption="Komponente ne razgovaraju međusobno: sve ide preko API poslužitelja, a samo on razgovara s bazom etcd.">
      {(step) => <Drawing step={step} />}
    </Stepper>
  )
}
