import { Arrow, CommitString, Cross, Diagram, Envelope, K8sGlyph, LoopArrows, PodShape, Rough, Stepper, stepColor, SvgStamp, Vault } from '../../../kit'
import { TIMING } from '../../../engines/access/index.ts'
import { AddressCard, Fit, Lines, Txt } from './Draw'

interface Geo {
  w: number
  h: number
  mono: number
  hand: number
  wide: boolean
  git: [number, number]
  store: [number, number]
  cluster: { x: number; y: number; w: number; h: number }
  argo: [number, number]
  es: [number, number]
  eso: [number, number]
  secret: [number, number]
  podVol: [number, number]
  podEnv: [number, number]
  note: [number, number]
}

const GW: Geo = {
  w: 760,
  h: 400,
  mono: 15,
  hand: 21,
  wide: true,
  git: [96, 92],
  store: [96, 290],
  cluster: { x: 236, y: 14, w: 516, h: 378 },
  argo: [318, 92],
  es: [470, 92],
  eso: [400, 270],
  secret: [560, 270],
  podVol: [690, 200],
  podEnv: [690, 330],
  note: [470, 176],
}

const GN: Geo = {
  w: 400,
  h: 760,
  mono: 15,
  hand: 22,
  wide: false,
  git: [96, 92],
  store: [300, 92],
  cluster: { x: 8, y: 196, w: 384, h: 556 },
  argo: [76, 268],
  es: [250, 268],
  eso: [100, 440],
  secret: [270, 440],
  podVol: [110, 610],
  podEnv: [290, 610],
  note: [200, 700],
}

const WIDE_MIN = Math.ceil((GW.w * 12) / (GW.mono - 1))

/** Ring of the refreshInterval around ESO (static drawing: how far the countdown is in this step). */
function Countdown({ at, r, p, stroke }: { at: [number, number]; r: number; p: number; stroke: string }) {
  const a = -Math.PI / 2 + p * Math.PI * 2
  const x2 = at[0] + r * Math.cos(a)
  const y2 = at[1] + r * Math.sin(a)
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: at[0], cy: at[1], w: r * 2, h: r * 2 }} seed={2801} stroke="var(--ink-4)" strokeWidth={1} dash="3 5" />
      <path d={`M${at[0]} ${at[1] - r} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x2} ${y2}`} style={{ fill: 'none', stroke, strokeWidth: 2.4, strokeLinecap: 'round' }} />
      <circle cx={x2} cy={y2} r={3.2} style={{ fill: stroke }} />
    </g>
  )
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const c = stepColor(step)
  const storeV = step >= 3 ? 'v2' : 'v1'
  const secretV = step >= 3 ? 'v2' : 'v1'
  const down = step === 4
  const label = [
    'Vrijednost SMS ključa čuva vanjski trezor.',
    'U Gitu je ExternalSecret: samo adresa vrijednosti u trezoru; Argo CD ga primijeni.',
    `ESO svakih ${TIMING.esoRefresh.sim} s čita trezor i stvara Secret klopa-sms; Podovi čitaju Secret.`,
    'Rotacija: nova vrijednost u trezoru stiže u Secret pri sljedećem osvježavanju; Pod s volumenom vidi je kad agent kubelet osvježi datoteku, a Pod s varijablom okruženja tek nakon ponovnog pokretanja.',
    'Trezor je nedostupan: ESO zadržava zadnji Secret, Podovi se i dalje pokreću, ali nova vrijednost ne stiže.',
  ][step]
  return (
    <Diagram width={g.w} height={g.h} label={label}>
      {/* outside: Git + the store */}
      <Txt x={g.wide ? 14 : 14} y={g.wide ? 30 : 28} v="hand" size={g.hand} fill="var(--ink-2)" anchor="start">
        izvan klastera
      </Txt>
      <CommitString x={g.git[0] - 44} y={g.git[1] + 30} w={88} n={3} />
      <Txt x={g.git[0]} y={g.git[1] + 60} v="display" size={g.mono} fill="var(--ink-2)">
        Git
      </Txt>
      {step >= 1 && <AddressCard x={g.git[0] - 70} y={g.git[1] - 40} w={140} h={50} lines={['ExternalSecret', 'klopa/sms']} size={g.mono - 1} seed={2810} />}
      <Vault x={g.store[0] - 34} y={g.store[1] - 32} w={68} h={62} seed={2811} />
      <Lines x={g.store[0]} y={g.store[1] + 52} lines={['trezor', '(Vault, OpenBao, oblak)']} gap={g.mono + 4} v="display" size={g.mono} fill="var(--ink-2)" />
      <Txt x={g.store[0] - 40} y={g.store[1] + 4} size={g.mono} anchor="end" fill={step >= 3 ? 'var(--violet)' : 'var(--ink)'}>
        {storeV}
      </Txt>
      {down && (
        <g>
          <Cross x={g.store[0]} y={g.store[1]} size={22} />
          <SvgStamp x={g.store[0]} y={g.store[1] - 44} text="NEDOSTUPAN" size={13} />
        </g>
      )}
      {step === 0 && (
        <Lines x={g.wide ? 470 : 200} y={g.wide ? 200 : 300} lines={['vrijednost je samo u trezoru,', 'koji može bilježiti svako čitanje']} gap={g.hand} v="hand" size={g.hand} fill={c} />
      )}

      {/* the cluster */}
      <Rough shape={{ k: 'rect', ...g.cluster }} seed={2802} stroke="var(--pen)" strokeWidth={1.5} />
      <Rough shape={{ k: 'rect', x: g.cluster.x + 4, y: g.cluster.y + 4, w: g.cluster.w - 8, h: g.cluster.h - 8 }} seed={2803} stroke="var(--pen)" strokeWidth={1.1} />
      <Txt x={g.cluster.x + 14} y={g.cluster.y + 28} v="hand" size={g.hand} fill="var(--pen)" anchor="start">
        klaster
      </Txt>

      {step >= 1 && (
        <g>
          <Arrow pts={g.wide ? [[g.git[0] + 74, g.git[1] - 14], [g.argo[0] - 30, g.argo[1] - 8]] : [[g.git[0] - 20, g.git[1] + 70], [g.argo[0], g.argo[1] - 32]]} stroke="var(--pen)" strokeWidth={1.4} dash="6 5" seed={2820} />
          <LoopArrows cx={g.argo[0]} cy={g.argo[1]} r={22} seed={2821} />
          <Txt x={g.argo[0]} y={g.argo[1] + 44} v="display" size={g.mono} fill="var(--ink-2)">
            Argo CD
          </Txt>
          <Arrow pts={[[g.argo[0] + 30, g.argo[1]], [g.es[0] - 102, g.es[1]]]} stroke="var(--pen)" strokeWidth={1.4} seed={2822} />
          <AddressCard x={g.es[0] - 98} y={g.es[1] - 24} w={196} h={48} lines={['ExternalSecret', 'refreshInterval: 30s']} size={g.mono - 1} seed={2823} />
        </g>
      )}

      {step >= 2 && (
        <g>
          <K8sGlyph kind="cm-ctrl" x={g.eso[0] - 24} y={g.eso[1] - 20} w={48} h={38} />
          <Countdown at={g.eso} r={36} p={step === 3 ? 0.95 : step === 4 ? 0.6 : 0.3} stroke={down ? 'var(--red)' : 'var(--green)'} />
          <Txt x={g.eso[0]} y={g.eso[1] + 58} v="display" size={g.mono} fill="var(--ink-2)">
            ESO
          </Txt>
          <Arrow pts={[[g.es[0] - 10, g.es[1] + 28], [g.eso[0] + 10, g.eso[1] - 40]]} stroke="var(--ink-3)" strokeWidth={1.2} dash="4 5" seed={2830} />
          <Arrow
            pts={g.wide ? [[g.store[0] + 40, g.store[1] - 6], [g.eso[0] - 40, g.eso[1]]] : [[g.store[0] - 10, g.store[1] + 92], [g.eso[0] + 30, g.eso[1] - 36]]}
            stroke={down ? 'var(--red)' : 'var(--green)'}
            strokeWidth={1.6}
            dash={down ? '4 6' : undefined}
            seed={2831}
          />
          <Txt x={g.wide ? (g.store[0] + g.eso[0]) / 2 + 10 : 240} y={g.wide ? g.store[1] - 42 : 184} size={g.mono - 1} fill={down ? 'var(--red)' : 'var(--green)'} halo>
            {down ? 'SecretSyncedError' : `svakih ${TIMING.esoRefresh.sim} s`}
          </Txt>
          <Arrow pts={[[g.eso[0] + 40, g.eso[1]], [g.secret[0] - 32, g.secret[1]]]} stroke="var(--green)" strokeWidth={1.5} seed={2832} />
          <Envelope x={g.secret[0] - 26} y={g.secret[1] - 18} w={52} h={36} seed={2833} />
          <Txt x={g.secret[0]} y={g.secret[1] + 40} size={g.mono - 1} fill="var(--ink-2)">
            {`Secret ${secretV}`}
          </Txt>
          <Arrow pts={[[g.secret[0] + 20, g.secret[1] - 22], [g.podVol[0] - (g.wide ? 26 : -20), g.podVol[1] + (g.wide ? 10 : -34)]]} stroke="var(--ink-2)" strokeWidth={1.3} seed={2834} />
          <Arrow pts={[[g.secret[0] + 20, g.secret[1] + 26], [g.podEnv[0] - (g.wide ? 26 : 0), g.podEnv[1] - (g.wide ? 14 : 34)]]} stroke="var(--ink-2)" strokeWidth={1.3} seed={2835} />
          <PodShape x={g.podVol[0]} y={g.podVol[1]} size={42} status="running" label={step >= 3 ? 'v2' : 'v1'} tone={step >= 3 ? 'violet' : 'blue'} ariaLabel={`Pod s volumenom koristi ${step >= 3 ? 'v2' : 'v1'}`} />
          <Txt x={g.podVol[0]} y={g.podVol[1] + 44} size={g.mono - 1} fill="var(--ink-2)">
            volumen
          </Txt>
          <PodShape x={g.podEnv[0]} y={g.podEnv[1]} size={42} status="running" label="v1" tone="blue" ariaLabel="Pod s varijablom okruženja koristi v1" />
          <Txt x={g.podEnv[0]} y={g.podEnv[1] + 44} size={g.mono - 1} fill="var(--ink-2)">
            env
          </Txt>
        </g>
      )}
      {step === 2 && (
        <Lines x={g.note[0]} y={g.note[1]} lines={g.wide ? ['ESO stvori običan Secret', '(uz trezor Secret i dalje postoji)'] : ['ESO stvori običan Secret']} gap={g.hand} v="hand" size={g.hand} fill={c} halo />
      )}
      {step === 3 && (
        <Lines
          x={g.note[0]}
          y={g.note[1]}
          lines={['nova vrijednost bez commita;', 'varijabla okruženja čeka novi Pod']}
          gap={g.hand}
          v="hand"
          size={g.hand}
          fill={c}
          halo
        />
      )}
      {down && (
        <Lines x={g.note[0]} y={g.note[1]} lines={g.wide ? ['zadnji Secret ostaje: Podovi rade', 'i kreću, rotacija čeka trezor'] : ['zadnji Secret ostaje,', 'rotacija čeka trezor']} gap={g.hand} v="hand" size={g.hand} fill={c} halo />
      )}
    </Diagram>
  )
}

/** Scene 3 „Trezor i External Secrets Operator”: an address in Git, the value in a store, ESO copies it into a Secret every refreshInterval. */
export function EsoStepper() {
  return (
    <Stepper
      title="Od trezora do Poda"
      steps={[
        { title: 'Vrijednost živi u trezoru', body: 'Trezor (Vault, OpenBao ili upravitelj tajni u oblaku) čuva vrijednost i njezine verzije, a može bilježiti i svako čitanje (zapis revizije).' },
        { title: 'U Gitu je adresa', body: 'ExternalSecret kaže samo gdje je vrijednost: trezor i ključ klopa/sms. Argo CD ga primijeni kao svaki drugi manifest.' },
        { title: 'ESO prepisuje vrijednost u Secret', body: 'External Secrets Operator u klasteru čita trezor svakih refreshInterval (ovdje 30 s) i stvara običan Secret klopa-sms. Podovi ga čitaju kao i prije.' },
        { title: 'Rotacija bez commita', body: 'Nova vrijednost u trezoru stiže u Secret pri sljedećem osvježavanju. Pod s volumenom vidi je kad agent kubelet osvježi datoteku (ako je aplikacija ponovno pročita), a Pod s varijablom okruženja tek nakon ponovnog pokretanja.' },
        { title: 'Trezor nedostupan', body: 'ESO zadrži zadnji Secret: Podovi rade i mogu se ponovno pokrenuti. Nova vrijednost ne stiže dok se trezor ne vrati.' },
      ]}
    >
      {(step) => <Fit wideMin={WIDE_MIN}>{(wide) => <Frame step={step} g={wide ? GW : GN} />}</Fit>}
    </Stepper>
  )
}
