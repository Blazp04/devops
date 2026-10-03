import { Arrow, CommitString, Diagram, Envelope, K8sGlyph, LoopArrows, MiniLaptop, PodShape, Rough, Stepper, stepColor } from '../../../kit'
import { sealedScene, shortKey } from '../lib/scenes'
import { Fit, KeyGlyph, Lines, LockedBox, Txt } from './Draw'

interface Geo {
  w: number
  h: number
  mono: number
  hand: number
  wide: boolean
  laptop: [number, number]
  secret: [number, number]
  box: [number, number]
  git: [number, number]
  argo: [number, number]
  cluster: { x: number; y: number; w: number; h: number }
  ctrl: [number, number]
  keys: [number, number]
  sealedObj: [number, number]
  plain: [number, number]
  pod: [number, number]
  note: [number, number]
}

const GW: Geo = {
  w: 760,
  h: 400,
  mono: 15,
  hand: 21,
  wide: true,
  laptop: [76, 96],
  secret: [44, 214],
  box: [150, 214],
  git: [300, 214],
  argo: [300, 96],
  cluster: { x: 412, y: 14, w: 340, h: 376 },
  ctrl: [478, 96],
  keys: [600, 64],
  sealedObj: [478, 250],
  plain: [612, 250],
  pod: [612, 340],
  note: [190, 340],
}

const GN: Geo = {
  w: 400,
  h: 760,
  mono: 15,
  hand: 22,
  wide: false,
  laptop: [70, 80],
  secret: [44, 198],
  box: [150, 198],
  git: [300, 198],
  argo: [300, 90],
  cluster: { x: 8, y: 300, w: 384, h: 452 },
  ctrl: [300, 380],
  keys: [30, 384],
  sealedObj: [80, 560],
  plain: [230, 560],
  pod: [330, 560],
  note: [200, 690],
}

const WIDE_MIN = Math.ceil((GW.w * 12) / (GW.mono - 1))

function Frame({ step, g }: { step: number; g: Geo }) {
  const sc = sealedScene()
  const ring = step < 3 ? sc.rings[0] : step === 3 ? sc.rings[1] : sc.rings[2]
  const leaked = step === 4
  const c = stepColor(step)
  const box = (x: number, y: number, open: boolean, seed: number) => <LockedBox x={x - 26} y={y - 20} w={52} h={40} open={open} seed={seed} stroke={open ? 'var(--red)' : 'var(--ink)'} />
  const label = [
    'Kontroler Sealed Secrets u klasteru ima par ključeva; javni ključ smije svatko.',
    'kubeseal na Laninu laptopu zaključava Secret javnim ključem u SealedSecret.',
    'U Git ide samo SealedSecret; kontroler ga privatnim ključem otključa u običan Secret za Pod.',
    `Svakih 30 dana kontroler doda novi ključ; stari ostaju (${ring.length} ključa), vrijednosti se ne mijenjaju.`,
    'Ako privatni ključevi procure, svaki SealedSecret ikad spremljen u Git može se otključati.',
  ][step]
  return (
    <Diagram width={g.w} height={g.h} label={label}>
      {/* the cluster */}
      <Rough shape={{ k: 'rect', ...g.cluster }} seed={2701} stroke="var(--pen)" strokeWidth={1.5} />
      <Rough shape={{ k: 'rect', x: g.cluster.x + 4, y: g.cluster.y + 4, w: g.cluster.w - 8, h: g.cluster.h - 8 }} seed={2702} stroke="var(--pen)" strokeWidth={1.1} />
      <Txt x={g.cluster.x + 14} y={g.cluster.y + 28} v="hand" size={g.hand} fill="var(--pen)" anchor="start">
        klaster
      </Txt>

      {/* the controller and its key ring (private keys stay here) */}
      <K8sGlyph kind="cm-ctrl" x={g.ctrl[0] - 26} y={g.ctrl[1] - 22} w={52} h={40} />
      <Lines x={g.ctrl[0]} y={g.ctrl[1] + 38} lines={['kontroler', 'Sealed Secrets']} gap={g.mono + 3} v="display" size={g.mono} fill="var(--ink-2)" />
      <Txt x={g.keys[0] - 10} y={g.keys[1] - 26} v="hand" size={g.hand} fill="var(--ink-2)" anchor="start">
        privatni ključevi
      </Txt>
      {ring.map((k, i) => (
        <g key={k.id}>
          <KeyGlyph x={g.keys[0]} y={g.keys[1] + i * 30} s={0.9} seed={2710 + i * 5} stroke={k.leaked ? 'var(--red)' : 'var(--ink)'} fill={k.leaked ? 'var(--note-pink)' : 'var(--note-yellow)'} />
          <Txt x={g.keys[0] + 48} y={g.keys[1] + i * 30 + 5} size={g.mono - 1} anchor="start" fill={k.leaked ? 'var(--red)' : 'var(--ink-2)'}>
            {shortKey(k.id)}
          </Txt>
        </g>
      ))}
      {step === 3 && (
        <Lines x={g.wide ? g.keys[0] + 60 : 140} y={g.keys[1] + ring.length * 30 + 14} lines={['+1 ključ svakih 30 dana,', 'stari ostaju']} gap={g.hand} v="hand" size={g.hand} fill={c} />
      )}
      {leaked && <Txt x={g.wide ? g.keys[0] + 60 : 100} y={g.keys[1] + ring.length * 30 + 14} v="hand" size={g.hand} fill="var(--red)">procurili!</Txt>}

      {/* step 0: the public key goes out to anyone who asks */}
      {step === 0 && (
        <g>
          <Arrow pts={g.wide ? [[g.ctrl[0] - 34, g.ctrl[1] - 10], [g.laptop[0] + 44, g.laptop[1] - 10]] : [[g.ctrl[0], g.ctrl[1] - 30], [g.laptop[0] + 10, g.laptop[1] + 50]]} stroke="var(--pen)" strokeWidth={1.5} dash="6 5" seed={2720} />
          <Txt x={g.wide ? 270 : 180} y={g.wide ? 70 : 166} v="mono" size={g.mono} fill="var(--pen)">
            kubeseal --fetch-cert
          </Txt>
          <Txt x={g.wide ? 270 : 180} y={g.wide ? 152 : 194} v="hand" size={g.hand} fill={c}>
            javni ključ smije svatko
          </Txt>
        </g>
      )}

      {/* Lana's laptop: kubeseal */}
      <MiniLaptop x={g.laptop[0] - 36} y={g.laptop[1] - 26} w={72} h={48} />
      <Txt x={g.laptop[0]} y={g.laptop[1] + 42} v="display" size={g.mono} fill="var(--ink-2)">
        Lanin laptop
      </Txt>
      {step >= 1 && (
        <g>
          <Envelope x={g.secret[0] - 26} y={g.secret[1] - 18} w={52} h={36} seed={2730} />
          <Txt x={g.secret[0]} y={g.secret[1] + 40} size={g.mono - 1} fill="var(--ink-2)">
            Secret
          </Txt>
          <Arrow pts={[[g.secret[0] + 30, g.secret[1]], [g.box[0] - 32, g.box[1]]]} stroke="var(--ink-2)" strokeWidth={1.4} seed={2731} />
          {box(g.box[0], g.box[1], false, 2732)}
          <Txt x={g.box[0]} y={g.box[1] + 40} size={g.mono - 1} fill="var(--ink-2)">
            SealedSecret
          </Txt>
          {step === 1 && (
            <Lines x={14} y={g.wide ? 290 : 268} lines={['kubeseal: zaključa javnim ključem;', 'običan Secret ne ide nikamo']} gap={g.hand} v="hand" size={g.hand} fill={c} anchor="start" />
          )}
        </g>
      )}

      {/* Git and Argo CD */}
      <CommitString x={g.git[0] - 40} y={g.git[1] + 34} w={80} n={3} />
      <Txt x={g.git[0]} y={g.git[1] + 64} v="display" size={g.mono} fill="var(--ink-2)">
        Git
      </Txt>
      {step >= 2 && (
        <g>
          {box(g.git[0], g.git[1] - 6, leaked, 2740)}
          <Arrow pts={[[g.box[0] + 30, g.box[1] - 6], [g.git[0] - 32, g.git[1] - 6]]} stroke="var(--ink-2)" strokeWidth={1.4} seed={2741} />
          <LoopArrows cx={g.argo[0]} cy={g.argo[1]} r={22} seed={2742} />
          <Txt x={g.argo[0]} y={g.argo[1] - 32} v="display" size={g.mono} fill="var(--ink-2)">
            Argo CD
          </Txt>
          <Arrow pts={g.wide ? [[g.argo[0] + 28, g.argo[1] + 8], [g.sealedObj[0] - 30, g.sealedObj[1] - 26]] : [[g.argo[0], g.argo[1] + 28], [g.argo[0] - 4, 300], [g.sealedObj[0] + 24, g.sealedObj[1] - 28]]} stroke="var(--pen)" strokeWidth={1.4} seed={2743} />
          {box(g.sealedObj[0], g.sealedObj[1], false, 2744)}
          <Txt x={g.sealedObj[0]} y={g.sealedObj[1] + 40} size={g.mono - 1} fill="var(--ink-2)">
            SealedSecret
          </Txt>
          <Arrow pts={[[g.sealedObj[0] + 30, g.sealedObj[1]], [g.plain[0] - 32, g.plain[1]]]} stroke="var(--green)" strokeWidth={1.5} seed={2745} />
          <Txt x={(g.sealedObj[0] + g.plain[0]) / 2} y={g.sealedObj[1] - 12} v="hand" size={g.hand} fill="var(--green)">
            otključa
          </Txt>
          <Envelope x={g.plain[0] - 26} y={g.plain[1] - 18} w={52} h={36} seed={2746} />
          <Txt x={g.plain[0]} y={g.plain[1] + 40} size={g.mono - 1} fill="var(--ink-2)">
            Secret
          </Txt>
          <Arrow pts={g.wide ? [[g.plain[0], g.plain[1] + 48], [g.pod[0], g.pod[1] - 28]] : [[g.plain[0] + 30, g.plain[1]], [g.pod[0] - 26, g.pod[1]]]} stroke="var(--ink-2)" strokeWidth={1.3} seed={2747} />
          <PodShape x={g.pod[0]} y={g.pod[1]} size={40} status="running" label="v1" tone="blue" ariaLabel="Pod klopa-worker čita Secret" />
          {step === 2 && (
            <Lines x={g.note[0]} y={g.note[1]} lines={g.wide ? ['u klasteru je to opet', 'običan Secret'] : ['u klasteru je to opet običan Secret']} gap={g.hand} v="hand" size={g.hand} fill={c} />
          )}
        </g>
      )}
      {leaked && (
        <Lines
          x={g.note[0]}
          y={g.note[1]}
          lines={['svaki SealedSecret iz Gita', 'sad se može otključati']}
          gap={g.hand}
          v="hand"
          size={g.hand}
          fill="var(--red)"
        />
      )}
    </Diagram>
  )
}

/** Scene 2 „Sealed Secrets”: asymmetric keys, the key ring that grows every 30 days, and what a key leak means (key ids from E6). */
export function SealedStepper() {
  return (
    <Stepper
      title="Sealed Secrets korak po korak"
      steps={[
        { title: 'Par ključeva u klasteru', body: 'Kontroler Sealed Secrets u klasteru stvori par ključeva. Privatni ostaje u klasteru, a javni (certifikat) smije dobiti svatko.' },
        { title: 'kubeseal zaključava na laptopu', body: 'Lana napravi običan Secret, ali ga ne sprema nikamo: kubeseal ga javnim ključem pretvori u SealedSecret.' },
        { title: 'U Git ide samo zaključana kutija', body: 'Argo CD primijeni SealedSecret, a kontroler ga privatnim ključem otključa u običan Secret. Pod čita taj Secret kao i prije.' },
        { title: 'Svakih 30 dana novi ključ', body: 'Kontroler doda novi ključ za pečaćenje, a stare zadrži, pa se stari SealedSecreti i dalje otključavaju. Vrijednosti ostaju iste: to nije rotacija tajne.' },
        { title: 'Ako procure privatni ključevi', body: 'Tada se može otključati svaki SealedSecret ikad spremljen u Git. Pomaže samo ovim redom: najprije novi ključ za pečaćenje, zatim rotacija stvarnih vrijednosti i novo pečaćenje.' },
      ]}
    >
      {(step) => <Fit wideMin={WIDE_MIN}>{(wide) => <Frame step={step} g={wide ? GW : GN} />}</Fit>}
    </Stepper>
  )
}
