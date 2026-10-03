/**
 * DeepDive „spektar izolacije”: plain container → container with a user namespace → gVisor → microVM → full VM.
 * One slider; the drawing marks the chosen stop, the card says what is shared and what it costs.
 */
import { useState } from 'react'
import { Arrow, Rough, Slider, useWidth } from '../../../kit'
import { Band, ContainerBox, VmFrame } from './parts'
import styles from '../styles.module.css'

const STOPS = [
  {
    short: 'kontejner',
    title: 'Običan kontejner',
    kernel: 'dijeli jezgru domaćina.',
    escape: 'tko pobjegne iz kontejnera koji radi kao root, root je i na domaćinu; napad na jezgru prolazi do svih kontejnera.',
    cost: 'najmanja – to je samo proces.',
  },
  {
    short: '+ userns',
    title: 'Kontejner s korisničkim imenskim prostorom',
    kernel: 'i dalje zajednička.',
    escape: 'root u kontejneru na domaćinu je neprivilegirani korisnik (npr. UID 100000), pa bijeg kroz pogrešnu konfiguraciju napravi manje štete. Napad na samu jezgru i dalje prolazi.',
    cost: 'gotovo nikakva; poneki program ne radi bez pravog roota.',
  },
  {
    short: 'gVisor',
    title: 'gVisor',
    kernel: 'između aplikacije i jezgre domaćina stoji „jezgra u korisničkom prostoru” (program u Go-u) koja sama obrađuje većinu sistemskih poziva. Do prave jezgre stiže manje poziva.',
    escape: 'napad na jezgru domaćina puno je teži – manja je površina napada.',
    cost: 'sporiji sistemski pozivi (osobito kod programa koji puno čitaju i pišu), poneki program ne radi.',
  },
  {
    short: 'mikro-VM',
    title: 'Mikro-VM (Kata Containers, Firecracker)',
    kernel: 'svaki kontejner (ili Pod) dobiva malu vlastitu jezgru u minimalnom VM-u. Tako radi i Appleov alat container na Macu: svaki Linux kontejner u svojem malom VM-u.',
    escape: 'napad na jezgru zaustavlja hipervizor.',
    cost: 'nešto više memorije i pokretanje od djelića sekunde do oko sekunde; treba hardversku virtualizaciju.',
  },
  {
    short: 'VM',
    title: 'Puni virtualni stroj',
    kernel: 'vlastiti cijeli operacijski sustav.',
    escape: 'napad na jezgru zaustavlja hipervizor.',
    cost: 'OS gosta (≈ 1 GB) i pokretanje kao pravo računalo.',
  },
]

export function IsolationSpectrum() {
  const [i, setI] = useState(0)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 640
  // narrow: two rows (stops 0–2, then 3–4) in a 300-wide drawing, so the lettering stays ≥ 12 px (Caveat ≥ 17) at 390
  const W = narrow ? 300 : 620
  const H = narrow ? 284 : 150
  const pos = (k: number): [number, number] => (narrow ? (k < 3 ? [50 + k * 100, 70] : [100 + (k - 3) * 100, 194]) : [62 + k * 124, 62])
  const mono = narrow ? 15.5 : 13.5
  const hand = narrow ? 21 : 19
  const left = narrow ? 12 : pos(0)[0] - 20
  const right = narrow ? W - 12 : pos(4)[0] + 20
  const st = STOPS[i]
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spektar izolacije, odabrano: ${st.title}.`} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0.6em auto 0', height: 'auto', overflow: 'visible' }}>
        <Arrow pts={[[left, 14], [right, 14]]} stroke="var(--ink-3)" seed={8501} />
        <text x={left} y={38} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
          gušće, brže
        </text>
        <text x={right} y={38} textAnchor="end" className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
          jača izolacija
        </text>
        {STOPS.map((s, k) => {
          const [cx, y] = pos(k)
          const bw = narrow ? 40 : 52
          return (
            <g key={s.short}>
              {k >= 3 && <VmFrame x={cx - bw / 2 - 7} y={y - 6} w={bw + 14} h={52} label="" seed={8510 + k} />}
              <ContainerBox x={cx - bw / 2} y={y} w={bw} h={k >= 3 ? 26 : 38} name="" seed={8520 + k} tint={k === 4 ? 'var(--hl-lilac-ink)' : 'var(--hl-orange-ink)'} />
              {k === 1 && <text x={cx + bw / 2 - 4} y={y - 2} className="k-svg-mono" style={{ fontSize: narrow ? 15.5 : 13, fontWeight: 700, fill: 'var(--pen)' }}>uid</text>}
              {k === 2 && <Band x={cx - bw / 2} y={y + 38} w={bw} h={8} hatch="var(--pen)" seed={8530} />}
              {k >= 3 && <Band x={cx - bw / 2} y={y + 30} w={bw} h={8} hatch="var(--hl-blue-ink)" seed={8540 + k} />}
              <text x={cx} y={y + 72} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fontWeight: k === i ? 700 : 400, fill: k === i ? 'var(--ink)' : 'var(--ink-2)' }}>
                {s.short}
              </text>
              {/* the red-pencil ring goes round the drawing only, so it never crosses the name under it */}
              {k === i && <Rough shape={{ k: 'ellipse', cx, cy: y + 22, w: bw + 36, h: 72 }} seed={8550 + k} stroke="var(--red)" strokeWidth={2} multi />}
            </g>
          )
        })}
      </svg>
      <div className={styles.controls}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Slider label="Koliko izolacije?" value={i} min={0} max={4} onChange={setI} format={(v) => STOPS[v].short} />
        </div>
      </div>
      <div className={`k-card ${styles.spectrumCard}`} aria-live="polite">
        <p className={styles.spectrumTitle}>{st.title}</p>
        <p>
          <strong>Jezgra:</strong> {st.kernel}
        </p>
        <p>
          <strong>Nakon proboja:</strong> {st.escape}
        </p>
        <p>
          <strong>Cijena:</strong> {st.cost}
        </p>
      </div>
    </div>
  )
}
