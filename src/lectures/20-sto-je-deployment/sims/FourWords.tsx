import type { ReactNode } from 'react'
import { Arrow, DGroup, DLabel, Diagram, Doodle, MiniPerson, PodShape, RecipeCard, RoughBox, useDiagramIds } from '../../../kit'
import styles from '../styles.module.css'

function DeployArt() {
  return (
    <Diagram width={220} height={112} label="Postavljanje: četiri Poda verzije 2.0.0 rade u okruženju klopa (produkcija)">
      <DGroup x={8} y={6} w={204} h={100} label="namespace klopa" tone="blue" />
      {[0, 1, 2, 3].map((i) => (
        <PodShape key={i} x={46 + i * 44} y={58} size={30} status="running" tone="violet" ariaLabel={`Pod 2.0.0 broj ${i + 1}, Running`} />
      ))}
      <DLabel x={110} y={93} text="2.0.0 radi" mono size={12} tone="violet" />
    </Diagram>
  )
}

function ReleaseArt() {
  const ids = useDiagramIds()
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <MiniPerson cx={50 + i * 60} cy={40} s={46} seed={7910 + i * 3} hair={i === 1 ? 'pony' : i === 2 ? 'bun' : 'short'} shirt={i === 1 ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'} />
          <use href={ids?.tray} x={50 + i * 60 + 4} y={56} width={30} height={21} fill="var(--tray)" />
        </g>
      ))}
      <Doodle kind="flag" x={168} y={2} scale={0.62} />
      <DLabel x={110} y={106} text="nova košarica za sve" size={12} tone="violet" />
    </g>
  )
}

function RolloutArt() {
  const tones = ['violet', 'violet', 'blue', 'blue'] as const
  return (
    <Diagram width={220} height={112} label="Uvođenje: Podovi 1.4.1 zamjenjuju se Podovima 2.0.0 jedan po jedan">
      {tones.map((t, i) => (
        <PodShape key={i} x={36 + i * 50} y={52} size={32} status={i === 1 ? 'creating' : i === 2 ? 'terminating' : 'running'} tone={t} ariaLabel={i < 2 ? 'Pod 2.0.0' : 'Pod 1.4.1'} />
      ))}
      <Arrow pts={[[186, 92], [36, 92]]} stroke="var(--pen)" seed={2041} />
      <DLabel x={112} y={22} text="jedan po jedan" size={12} tone="blue" />
    </Diagram>
  )
}

function ObjectArt() {
  return (
    <Diagram width={220} height={112} label="Objekt Deployment: kartica recepta s replicas: 4 i slikom 2.0.0">
      <RecipeCard x={34} y={8} w={152} h={96} title="Deployment" lines={0} />
      <text x={46} y={52} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--note-ink)' }}>
        replicas: 4
      </text>
      <text x={46} y={70} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--note-ink)' }}>
        image: …:2.0.0
      </text>
      <text x={46} y={88} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--note-ink)' }}>
        strategy: …
      </text>
    </Diagram>
  )
}

function Word({ term, en, menza, art, children, friday, seed }: { term: string; en: string; menza: string; art: ReactNode; children: ReactNode; friday: ReactNode; seed: number }) {
  return (
    <RoughBox className={styles.word} seed={seed} stroke="var(--ink-2)" as="article">
      <div className={styles.wordArt}>{art}</div>
      <div className={styles.wordTerm}>{term}</div>
      <div className={styles.wordEn}>{en}</div>
      <div className={styles.wordMenza}>= {menza}</div>
      <p className={styles.wordText}>{children}</p>
      <p className={styles.wordFriday}>{friday}</p>
    </RoughBox>
  )
}

/** Scene 1: the four words that the Friday incident mixed up, as four index cards. */
export function FourWords() {
  return (
    <div className={styles.words}>
      <Word term="Postavljanje" en="engl. deploy" menza="nova kutija stigla u kuhinju" art={<DeployArt />} seed={2001} friday={<>Petak, 11:30: 2.0.0 radi u produkciji.</>}>
        Radnja kojom nova verzija počne raditi u nekom okruženju. Korisnici je pritom ne moraju vidjeti.
      </Word>
      <Word
        term="Izdanje"
        en="engl. release"
        menza="studenti dobiju novo jelo"
        seed={2002}
        art={
          <Diagram width={220} height={112} label="Izdanje: studenti dobiju novu košaricu">
            <ReleaseArt />
          </Diagram>
        }
        friday={<>Petak, 11:30: nova košarica stizala je studentima čim je koji Pod 2.0.0 postao spreman – za pola minute svima.</>}
      >
        Trenutak kad korisnici dobiju novu funkcionalnost. Poslovna odluka, a ne nužno isti trenutak kad i postavljanje.
      </Word>
      <Word term="Uvođenje" en="engl. rollout" menza="Podovi se mijenjaju jedan po jedan" art={<RolloutArt />} seed={2003} friday={<>Petak, 11:30–11:31: postupno ažuriranje, sva četiri Poda.</>}>
        Postupak kojim stari primjerci ustupaju mjesto novima: odjednom, postupno, prebacivanjem ili po malom udjelu.
      </Word>
      <Word term="Deployment" en="kind: Deployment" menza="recept na zidu kuhinje" art={<ObjectArt />} seed={2004} friday={<>Davor je promijenio jedan redak: sliku 2.0.0.</>}>
        Kubernetes objekt sa željenim stanjem: koja slika, koliko replika i kojom ugrađenom strategijom ih mijenjati.
      </Word>
    </div>
  )
}
