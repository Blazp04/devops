import type { ReactNode } from 'react'
import { usePageTitle } from '../shell/usePageTitle'
import {
  Arrow,
  Boil,
  Brain,
  Check,
  CheckBox,
  ClockIcon,
  CoffeeRing,
  Cross,
  Crowd,
  Cylinder,
  Davor,
  DOODLE_KINDS,
  DoodleIcon,
  Envelope,
  Helm,
  Iva,
  Lana,
  Laptop,
  Lunchbox,
  Mark,
  Mira,
  Petra,
  Plate,
  PROP_KINDS,
  Redar,
  Rough,
  RoughAround,
  RoughBox,
  RoughButton,
  Scribble,
  SectionProp,
  ServerCard,
  ServerFace,
  ServiceTag,
  SpeechBubble,
  Squiggle,
  Stamp,
  StickyNote,
  StudentQueue,
  SvgStamp,
  Tray,
  type Mood,
  type ServerMood,
} from '../kit'

function Cell({ name, children, viewBox }: { name: string; children: ReactNode; viewBox: string }) {
  return (
    <figure className="nb-ref__cell">
      <svg viewBox={viewBox} aria-hidden="true">
        {children}
      </svg>
      <figcaption>{name}</figcaption>
    </figure>
  )
}

const MOODS: Mood[] = ['smile', 'grin', 'flat', 'worry', 'open']
const SERVER_MOODS: ServerMood[] = ['calm', 'busy', 'panic', 'dead']

/** Live reference sheet of the notebook's doodle library (src/kit/doodles + src/kit/sketch). */
export default function DoodlesPage() {
  usePageTitle('Crteži bilježnice')
  return (
    <div className="nb-ref">
      <header className="nb-pagehead">
        <div>
          <span className="nb-kicker">pribor bilježnice</span>
          <h1 className="nb-h1">Crteži</h1>
          <p className="nb-pagehead__lead">
            Svi crteži iz <code className="k-code-inline">src/kit/doodles</code> i olovka iz <code className="k-code-inline">src/kit/sketch</code>, nacrtani istim priborom. Gramatika ilustracije:
            src/design-lab/biljeznica/README.md.
          </p>
        </div>
      </header>

      <section className="nb-ref__section">
        <h2>Likovi</h2>
        <p>Pet različitih silueta koje se prepoznaju i kao sićušni crteži. Govore samo u oblačićima (Kalam) i kratkim trenucima priče.</p>
        <div className="nb-ref__grid">
          <Cell name="<Lana /> · laptop" viewBox="-6 -4 92 124">
            <Boil slow>
              <Lana mood="grin" />
            </Boil>
          </Cell>
          <Cell name="<Davor buzz /> · pager" viewBox="-6 -4 96 124">
            <Boil slow>
              <Davor mood="worry" buzz />
            </Boil>
          </Cell>
          <Cell name="<Mira /> · kutlača" viewBox="-6 -14 92 134">
            <Boil slow>
              <Mira mood="grin" />
            </Boil>
          </Cell>
          <Cell name="<Petra /> · zahtjevi" viewBox="-6 -4 92 124">
            <Boil slow>
              <Petra />
            </Boil>
          </Cell>
          <Cell name="<Iva /> · nova u timu" viewBox="-6 -4 92 124">
            <Boil slow>
              <Iva mood="open" />
            </Boil>
          </Cell>
          <Cell name="<Redar sweat={2} /> = load balancer" viewBox="-60 -110 130 176">
            <Redar x={0} y={0} angle={-0.4} sweat={2} />
          </Cell>
        </div>
        <div className="nb-ref__grid" style={{ marginTop: 18 }}>
          {MOODS.map((m) => (
            <Cell key={m} name={`mood="${m}"`} viewBox="10 -4 60 60">
              <Lana mood={m} holding="none" />
            </Cell>
          ))}
        </div>
        <div className="nb-ref__grid nb-ref__grid--wide" style={{ marginTop: 18 }}>
          <Cell name="<StudentQueue count={7} tap /> = promet" viewBox="-10 0 420 170">
            <StudentQueue x={380} y={160} count={7} scale={0.95} gap={52} tap />
          </Cell>
          <Cell name="<Crowd label=… />" viewBox="-6 -6 200 216">
            <Crowd x={0} y={0} label="studenti · 12:00" />
          </Cell>
          <Cell name="<SpeechBubble lines tx ty />" viewBox="0 -60 230 190">
            <Davor x={10} y={40} scale={0.7} mood="worry" />
            <SpeechBubble x={70} y={-56} w={150} h={80} tx={44} ty={52} lines={['502! 502!', 'Opet pada!']} size={20} tone="red" />
          </Cell>
        </div>
      </section>

      <section className="nb-ref__section">
        <h2>Stvari iz menze</h2>
        <p>Pladanj = zahtjev, kartica s licem = poslužitelj (mozak = jezgra, tanjur = mjesto u RAM-u), kutija za ručak = Pod, etiketa = Service, omotnica s pečatom = Secret.</p>
        <div className="nb-ref__grid">
          <Cell name="<Tray /> = zahtjev" viewBox="-30 -20 60 40">
            <Tray x={0} y={0} w={44} />
          </Cell>
          {SERVER_MOODS.map((m) => (
            <Cell key={m} name={`<ServerFace mood="${m}" />`} viewBox="-34 -28 68 56">
              <ServerFace mood={m} />
            </Cell>
          ))}
          <Cell name="<ServerCard /> · down" viewBox="-6 -28 210 150">
            <ServerCard x={0} y={0} w={90} h={110} label="Mali" mood="busy" />
            <ServerCard x={108} y={0} w={90} h={110} label="Srednji" down />
          </Cell>
          <Cell name="<Brain busy /> · <Plate full />" viewBox="-4 -4 150 60">
            <Brain x={0} y={0} w={30} h={26} busy={0.2} />
            <Brain x={36} y={0} w={30} h={26} busy={0.75} />
            <Brain x={72} y={0} w={30} h={26} busy={1} />
            <Plate cx={14} cy={44} r={10} />
            <Plate cx={40} cy={44} r={10} full />
            <Plate cx={66} cy={44} r={10} full />
          </Cell>
          <Cell name="<Lunchbox /> v1 · v2 · pending · crash" viewBox="-4 -8 216 52">
            <Lunchbox x={0} y={0} />
            <Lunchbox x={54} y={0} version="v2" />
            <Lunchbox x={108} y={0} state="pending" />
            <Lunchbox x={162} y={0} state="crash" />
          </Cell>
          <Cell name="<Lunchbox name face ready />" viewBox="-6 -14 268 104">
            <Lunchbox x={0} y={0} w={120} h={86} name="klopa-api" face ready seed={4100} />
            <Lunchbox x={136} y={0} w={120} h={86} name="klopa-api" face version="v2" state="crash" seed={4110} />
          </Cell>
          <Cell name="<ServiceTag /> = Service" viewBox="-4 -4 150 56">
            <ServiceTag x={0} y={0} w={140} h={46}>
              <text x={30} y={28} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600 }}>
                klopa-api
              </text>
            </ServiceTag>
          </Cell>
          <Cell name="<Envelope dots /> = Secret" viewBox="-4 -26 140 90">
            <Envelope x={0} y={0} w={60} h={40} dots />
            <Envelope x={74} y={0} w={60} h={40} open />
          </Cell>
          <Cell name="<Laptop /> · <Cylinder />" viewBox="-12 -6 230 104">
            <Laptop x={0} y={0} w={130} />
            <Cylinder x={150} y={6} w={60} h={70} label="etcd" />
          </Cell>
          <Cell name="<Helm /> · <SvgStamp />" viewBox="-30 -30 200 60">
            <Helm x={0} y={0} r={18} />
            <SvgStamp x={100} y={0} text="SRUŠEN" />
          </Cell>
          <Cell name="<CoffeeRing />" viewBox="0 0 100 100">
            <CoffeeRing />
          </Cell>
        </div>
      </section>

      <section className="nb-ref__section">
        <h2>Rekviziti naslova</h2>
        <p>
          Isti kostur svakog naslova (crveni kicker „N · oznaka” + tiskani naslov); mijenja se samo rekvizit: <code className="k-code-inline">{'<SectionProp kind="…" />'}</code>.
        </p>
        <div className="nb-ref__grid">
          {PROP_KINDS.map((k) => (
            <figure key={k} className="nb-ref__cell">
              <SectionProp kind={k} />
              <figcaption>kind="{k}"</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="nb-ref__section">
        <h2>Male sličice (64 × 48)</h2>
        <p>
          Pojmovnik, stanice karte, legende: <code className="k-code-inline">{'<Doodle kind="…" />'}</code> unutar SVG-a ili <code className="k-code-inline">{'<DoodleIcon kind="…" />'}</code> kao
          zaseban crtež.
        </p>
        <div className="nb-ref__grid">
          {DOODLE_KINDS.map((k) => (
            <figure key={k} className="nb-ref__cell">
              <DoodleIcon kind={k} />
              <figcaption>{k}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="nb-ref__section">
        <h2>Olovka</h2>
        <p>Primitivi iz src/kit/sketch: isti seed daje isti potez, a ista olovka crta sve.</p>
        <div className="nb-ref__grid">
          <Cell name="<Rough rect fillColor />" viewBox="-4 -4 108 68">
            <Rough shape={{ k: 'rect', x: 0, y: 0, w: 100, h: 60 }} fillColor="var(--hl-blue-ink)" seed={11} />
          </Cell>
          <Cell name="hachureAngle −41 / +41" viewBox="-4 -4 108 48">
            <Rough shape={{ k: 'rect', x: 0, y: 0, w: 46, h: 40 }} fillColor="var(--hl-blue-ink)" seed={12} />
            <Rough shape={{ k: 'rect', x: 54, y: 0, w: 46, h: 40 }} fillColor="var(--hl-green-ink)" hachureAngle={41} seed={13} />
          </Cell>
          <Cell name="<Arrow /> · dash" viewBox="-4 -4 128 60">
            <Arrow pts={[[0, 40], [50, 6], [110, 30]]} stroke="var(--pen)" />
            <Arrow pts={[[0, 54], [118, 54]]} stroke="var(--ink-3)" dash="4 5" seed={9} />
          </Cell>
          <Cell name="<Check /> · <Cross /> · <Scribble />" viewBox="-14 -14 170 36">
            <Check x={0} y={4} size={10} />
            <Cross x={42} y={4} size={10} />
            <Scribble x={74} y={-6} w={70} h={20} />
          </Cell>
        </div>
        <div className="nb-ref__row" style={{ marginTop: 22 }}>
          <RoughButton className="nb-complete" stroke="var(--pen)">
            RoughButton
          </RoughButton>
          <RoughBox className="nb-goals" stroke="var(--ink)" double style={{ padding: '12px 18px' }}>
            RoughBox double
          </RoughBox>
          <span style={{ fontSize: 24 }}>
            <RoughAround>RoughAround</RoughAround>
          </span>
          <span style={{ display: 'inline-block', width: 120, height: 10 }}>
            <Squiggle />
          </span>
          <span style={{ display: 'inline-block', width: 28, height: 28 }}>
            <CheckBox checked />
          </span>
          <span style={{ display: 'inline-block', width: 28, height: 28 }}>
            <ClockIcon />
          </span>
        </div>
      </section>

      <section className="nb-ref__section">
        <h2>Papir</h2>
        <p>
          Markeri: <Mark>žuti</Mark>, <Mark c="pink">ružičasti</Mark>, <Mark c="green">zeleni</Mark>, <Mark c="blue">plavi</Mark>, <Mark c="orange">narančasti</Mark>. Pečati:{' '}
          <Stamp>završeno</Stamp> <Stamp tone="red">srušen</Stamp> <Stamp tone="pen" rotate={4}>
            provjereno
          </Stamp>
        </p>
        <div className="nb-ref__notes">
          <StickyNote tape="red" rotate={-1.5}>
            <p>
              <b>StickyNote</b> · žuti papirić sa selotejpom (na ploči: magnet).
            </p>
          </StickyNote>
          <StickyNote c="pink" tape="blue" rotate={1.2}>
            <p>ružičasti = mit</p>
          </StickyNote>
          <StickyNote c="green" rotate={-0.6}>
            <p>zeleni = činjenica</p>
          </StickyNote>
          <StickyNote c="blue" tape="green">
            <p>plavi = pojmovnik</p>
          </StickyNote>
          <StickyNote c="orange" rotate={1}>
            <p>narančasti = modul 5</p>
          </StickyNote>
          <StickyNote c="lilac" rotate={-1}>
            <p>ljubičasti = modul 6</p>
          </StickyNote>
        </div>
      </section>
    </div>
  )
}
