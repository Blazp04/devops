import { useState } from 'react'
import { Power } from 'lucide-react'
import { LectureProvider } from '../kit/lecture-context'
import { usePageTitle } from '../shell/usePageTitle'
import {
  Analogy,
  Badge,
  Button,
  Callout,
  Compare,
  DBar,
  DeepDive,
  DGroup,
  Diagram,
  DLabel,
  DNode,
  Edge,
  Figure,
  KeyIdea,
  Legend,
  K8sIcon,
  NodeFrame,
  PodShape,
  Myth,
  Packet,
  Quiz,
  Recap,
  Section,
  Slider,
  Tabs,
  Term,
  Toggle,
} from '../kit'
// text area: the pieces shown in the "tekst", "raspored" and "kraj" sections (kept in their own import)
import { Arrow, CostNote, IncidentCard, Kbd, MarginNote, MythOrFact, Predict, Redar, ScrollX, ServerCard, StudentQueue, Tray } from '../kit'
// interactive area: the live examples of the "kod", stepper and "simulacija" sections live in their own module
import { KitCodeDemo, KitSimDemo, KitStepperDemo } from './KitInteractive'
// diagram area: the galleries in the "dijagrami", "kubernetes" and "karta" sections (kept in their own import)
import { GLYPH_KINDS, K8S_KINDS, STORY_LECTURES, StoryMap, useWidth, type DiagramTone, type PodStatus, type PodTone } from '../kit'

/* ---------- Diagram area: galleries for the "dijagrami", "kubernetes" and "karta" sections ---------- */

const DEMO_TONES: DiagramTone[] = ['neutral', 'blue', 'violet', 'teal', 'amber', 'rose', 'ok', 'warn', 'bad', 'idle']

/** The load balancer demo in two layouts (by container width): requests are trays, a server that is down gets red pencil. */
function LbDemo({ down }: { down: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  // the wide layout is 760 units: below 760 px its 12-unit lettering would shrink under 12 px
  const narrow = w !== null && w < 760
  const G = narrow
    ? { W: 316, H: 372, user: [158, 40] as P2, lb: [158, 150] as P2, a: [79, 290] as P2, b: [237, 290] as P2, uw: 130, lw: 176, sw: 150 }
    : { W: 760, H: 260, user: [80, 130] as P2, lb: [290, 130] as P2, a: [560, 70] as P2, b: [560, 190] as P2, uw: 110, lw: 140, sw: 150 }
  // where lines leave / enter the boxes
  const uOut: P2 = narrow ? [158, 68] : [135, 130]
  const lIn: P2 = narrow ? [158, 122] : [220, 130]
  const lOut: P2 = narrow ? [158, 178] : [360, 130]
  const aIn: P2 = narrow ? [G.a[0], G.a[1] - 28] : [G.a[0] - 75, G.a[1]]
  const bIn: P2 = narrow ? [G.b[0], G.b[1] - 28] : [G.b[0] - 75, G.b[1]]
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
      <Diagram width={G.W} height={G.H} maxHeight={narrow ? 520 : undefined} label="Korisnik šalje zahtjeve load balanceru, a on ih dijeli na dva poslužitelja">
        <Edge from={uOut} to={lIn} flow tone="blue" />
        <Edge from={lOut} to={aIn} tone="blue" />
        <Edge from={lOut} to={bIn} tone={down ? 'bad' : 'blue'} dashed={down} />
        <Packet path={[uOut, lIn, lOut, aIn]} repeat duration={1.8} />
        {!down && <Packet path={[uOut, lIn, lOut, bIn]} repeat duration={1.8} delay={0.9} />}
        <DNode x={G.user[0]} y={G.user[1]} w={G.uw} h={56} icon="user" title="Korisnik" />
        <DNode x={G.lb[0]} y={G.lb[1]} w={G.lw} h={56} icon="lb" tone="violet" title="Load balancer" subtitle="round robin" />
        <DNode x={G.a[0]} y={G.a[1]} w={G.sw} h={56} icon="server" tone="teal" title="Server A" subtitle="2 GB RAM" />
        <DNode x={G.b[0]} y={G.b[1]} w={G.sw} h={56} icon="server" tone="teal" title="Server B" subtitle="4 GB RAM" status={down ? 'down' : 'normal'} />
        <DLabel x={G.b[0]} y={G.b[1] + 56} text={down ? 'server ne odgovara' : 'zdrav'} tone={down ? 'bad' : 'ok'} />
      </Diagram>
      </div>
    </div>
  )
}

type P2 = [number, number]

/** The menza as a figure, in two layouts by container width (queue → redar → three counters). */
function MenzaFigure() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 520
  if (narrow) {
    const cards: P2[] = [
      [8, 232],
      [127, 232],
      [246, 232],
    ]
    return (
      <div ref={ref} style={{ maxWidth: 460, margin: '0 auto' }}>
        <svg viewBox="0 0 360 336" role="img" aria-label="Studenti u redu, redar na ulazu i tri pulta" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <StudentQueue x={92} y={176} count={3} scale={0.5} />
          <Tray x={138} y={134} />
          <Redar x={206} y={116} scale={0.78} angle={1.9} />
          {cards.map(([x, y], i) => (
            <Arrow key={i} pts={[[214, 176], [x + 53, y - 8]]} stroke="var(--pen)" dash="5 5" seed={5700 + i * 3} />
          ))}
          {cards.map(([x, y], i) => (
            <ServerCard key={i} x={x} y={y} w={106} h={50} mood={i === 0 ? 'busy' : 'calm'} seed={5710 + i * 5} />
          ))}
          <text x={180} y={326} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 22 }}>
            redar = load balancer
          </text>
        </svg>
      </div>
    )
  }
  return (
    <div ref={ref}>
      <svg viewBox="0 0 560 200" role="img" aria-label="Studenti u redu, redar na ulazu i tri pulta" style={{ width: '100%', height: 'auto' }}>
        <StudentQueue x={110} y={176} count={3} scale={0.55} />
        <Tray x={160} y={132} />
        <Redar x={232} y={112} scale={0.8} angle={-0.45} />
        {[0, 1, 2].map((i) => (
          <Arrow key={i} pts={[[272, 102], [380, 40 + i * 62]]} stroke="var(--pen)" dash="5 5" seed={5700 + i * 3} />
        ))}
        {[0, 1, 2].map((i) => (
          <ServerCard key={i} x={392} y={16 + i * 62} w={130} h={50} mood={i === 0 ? 'busy' : 'calm'} seed={5710 + i * 5} />
        ))}
        <text x={232} y={194} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 19 }}>
          redar = load balancer
        </text>
      </svg>
    </div>
  )
}

/** Every DNode icon: a doodle from the illustration grammar. Columns follow the container width. */
function GlyphGallery() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const cw = 124
  // as many columns as fit at full size (lettering ≥ 12 px), 3–7
  const cols = w === null ? 7 : Math.max(3, Math.min(7, Math.floor(w / cw)))
  const ch = 70
  const rows = Math.ceil(GLYPH_KINDS.length / cols)
  return (
    <div ref={ref}>
      <Diagram width={cols * cw} height={rows * ch + 6} label="Sve ikone čvorova: poslužitelj s licem, studenti, redar, baza, red, omotnica, commitovi, police, pladnjevi, kutije i ostalo">
        {GLYPH_KINDS.map((k, i) => (
          <DNode key={k} x={(i % cols) * cw + cw / 2} y={Math.floor(i / cols) * ch + ch / 2 + 3} w={cw - 10} h={56} icon={k} title={k} animate={false} />
        ))}
      </Diagram>
    </div>
  )
}

/** DNode states and tones, edges, groups, labels and fuel bars. */
function DiagramPieces() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 860
  const cols = narrow ? 2 : 5
  const cw = narrow ? 160 : 172
  const states: { t: string; status: 'normal' | 'active' | 'down' | 'dim'; dashed?: boolean }[] = [
    { t: 'normal', status: 'normal' },
    { t: 'active', status: 'active' },
    { t: 'down', status: 'down' },
    { t: 'dim', status: 'dim' },
    { t: 'dashed', status: 'normal', dashed: true },
  ]
  const W = cols * cw
  const top2 = Math.ceil(states.length / cols) * 76 + 14
  const toneRows = Math.ceil(DEMO_TONES.length / cols)
  const top3 = top2 + toneRows * 70 + 18
  const g = narrow
    ? { grp: [10, top3, W - 20, 150] as const, e: top3 + 190, h: top3 + 590 }
    : { grp: [10, top3, 380, 150] as const, e: top3, h: top3 + 200 }
  const ex = narrow ? 20 : 420
  // width of the two nodes inside the group
  const gn = narrow ? 116 : 124
  const ey = g.e
  // notes and bars: right of the edges (wide) or under them (narrow)
  const lx = narrow ? 20 : ex + 190
  const ly = narrow ? ey + 214 : ey
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
      <Diagram width={W} height={g.h} label="Stanja i boje čvorova, olovkom nacrtane veze, okviri, bilješke i trake goriva">
        {states.map((s, i) => (
          <DNode key={s.t} x={(i % cols) * cw + cw / 2} y={Math.floor(i / cols) * 76 + 44} w={cw - 22} h={56} icon="server" title={s.t} subtitle="status" status={s.status} dashed={s.dashed} animate={false} />
        ))}
        {DEMO_TONES.map((t, i) => (
          <DNode key={t} x={(i % cols) * cw + cw / 2} y={top2 + Math.floor(i / cols) * 70 + 30} w={cw - 22} h={52} icon="pod" tone={t} title={t} subtitle="tone" animate={false} />
        ))}
        <DGroup x={g.grp[0]} y={g.grp[1]} w={g.grp[2]} h={g.grp[3]} label="poslužitelj (VM)">
          <DNode x={g.grp[0] + gn / 2 + 18} y={g.grp[1] + 92} w={gn} h={52} icon="container" title="api" subtitle=":8000" animate={false} />
          <DNode x={g.grp[0] + g.grp[2] - gn / 2 - 18} y={g.grp[1] + 92} w={gn} h={52} icon="database" title="Postgres" subtitle=":5432" animate={false} />
          <Edge from={[g.grp[0] + gn + 20, g.grp[1] + 92]} to={[g.grp[0] + g.grp[2] - gn - 20, g.grp[1] + 92]} label="SQL" />
        </DGroup>
        <Edge from={[ex, ey + 20]} to={[ex + 150, ey + 20]} tone="neutral" label="obična" />
        <Edge from={[ex, ey + 70]} to={[ex + 150, ey + 70]} tone="blue" flow label="flow" />
        <Edge from={[ex, ey + 120]} to={[ex + 150, ey + 120]} tone="bad" dashed label="dashed" />
        <Edge from={[ex, ey + 170]} to={[ex + 150, ey + 170]} tone="ok" arrow="both" curve={-18} label="curve · both" />
        <Packet path={[[ex, ey + 70], [ex + 150, ey + 70]]} repeat duration={1.4} />
        <DLabel x={lx} y={ly + 26} anchor="start" text="DLabel (rukopis)" />
        <DLabel x={lx} y={ly + 56} anchor="start" text="DLabel mono: 10.0.0.11" mono size={13} />
        <DLabel x={lx} y={ly + 92} anchor="start" text="502 · greška" tone="bad" bold />
        {[0.3, 0.75, 0.95].map((v, i) => (
          <g key={v}>
            <DBar x={lx} y={ly + 112 + i * 22} w={150} h={10} value={v} />
            <DLabel x={lx + 158} y={ly + 122 + i * 22} anchor="start" text={`${Math.round(v * 100)} %`} mono size={13} />
          </g>
        ))}
      </Diagram>
      </div>
    </div>
  )
}

/** Every Kubernetes kind as a hand-drawn doodle with its kubectl short name. */
function K8sGallery() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const cw = 100
  // as many columns as fit at full size (lettering ≥ 12 px), 3–9
  const cols = w === null ? 9 : Math.max(3, Math.min(9, Math.floor(w / cw)))
  const size = 52
  const ch = 100
  const rows = Math.ceil(K8S_KINDS.length / cols)
  return (
    <div ref={ref}>
      <Diagram width={cols * cw} height={rows * ch + 6} label="Kubernetes vrste nacrtane rukom: kutija za ručak, etiketa, omotnica, recept, zgrada, mapa, ulaz u menzu, kuhinjski sat, hladnjak i ostalo">
        {K8S_KINDS.map((k, i) => (
          <K8sIcon key={k} kind={k} x={(i % cols) * cw + cw / 2} y={Math.floor(i / cols) * ch + size / 2 + 8} size={size} />
        ))}
      </Diagram>
    </div>
  )
}

const POD_DEMO: { s: PodStatus; label: string; hint: string; tone: PodTone; tape: string }[] = [
  { s: 'running', label: 'Running', hint: 'radi i spreman', tone: 'blue', tape: 'v1' },
  { s: 'pending', label: 'Pending', hint: 'čeka čvor…', tone: 'green', tape: 'v2' },
  { s: 'creating', label: 'ContainerCreating', hint: 'priprema se', tone: 'green', tape: 'v2' },
  { s: 'terminating', label: 'Terminating', hint: 'gasi se', tone: 'blue', tape: 'v1' },
  { s: 'crash', label: 'CrashLoopBackOff', hint: 'pada, pa ponovo', tone: 'green', tape: 'v2' },
  { s: 'oom', label: 'OOMKilled', hint: 'premašio RAM', tone: 'blue', tape: 'v1' },
  { s: 'notready', label: 'Running', hint: 'ali nije spreman', tone: 'green', tape: 'v2' },
  { s: 'completed', label: 'Completed', hint: 'posao gotov', tone: 'amber', tape: 'job' },
  { s: 'imagepull', label: 'ImagePullBackOff', hint: 'slika ne stiže', tone: 'green', tape: 'v2' },
  { s: 'crash', label: 'CrashLoopBackOff', hint: 'duga traka: ↻ ispod', tone: 'rose', tape: '1.5.0' },
]

/** PodShape in every state, and three nodes: ready (with free room), NotReady, cordoned. */
function PodsAndNodes() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 840
  const cols = narrow ? 2 : 4
  const cw = narrow ? 160 : 210
  const ch = 140
  const podsH = Math.ceil(POD_DEMO.length / cols) * ch
  const W = cols * cw
  const nw = narrow ? W - 20 : 270
  const nh = 186
  const nodes = [0, 1, 2].map((i) => (narrow ? { x: 10, y: podsH + 20 + i * (nh + 18) } : { x: 10 + i * (nw + 15), y: podsH + 20 }))
  const H = narrow ? nodes[2].y + nh + 10 : podsH + nh + 34
  const slot = (n: { x: number; y: number }, k: number): [number, number] => [n.x + 52 + k * (narrow ? 100 : 84), n.y + 92]
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
      <Diagram width={W} height={H} label="Podovi u svim stanjima i tri čvora: spreman sa slobodnim mjestom, NotReady i cordon">
        {POD_DEMO.map((p, i) => {
          const cx = (i % cols) * cw + cw / 2
          const cy = Math.floor(i / cols) * ch + 50
          return (
            <g key={`${p.s}-${i}`}>
              <PodShape x={cx} y={cy} size={48} status={p.s} tone={p.tone} label={p.tape} restarts={p.s === 'crash' ? 4 : undefined} selected={p.s === 'running'} />
              <DLabel x={cx} y={cy + 62} text={p.label} mono size={14} bold tone={p.s === 'crash' || p.s === 'oom' ? 'bad' : p.s === 'running' ? 'ok' : p.s === 'imagepull' ? 'warn' : 'neutral'} />
              <DLabel x={cx} y={cy + 82} text={p.hint} />
            </g>
          )
        })}
        <NodeFrame x={nodes[0].x} y={nodes[0].y} w={nw} h={nh} name="čvor 1" spec="worker · 4 vCPU · 8 GB" cpu={{ used: 2, total: 4 }} mem={{ used: 5, total: 8 }} free={[{ x: slot(nodes[0], 2)[0] - 36, y: nodes[0].y + 58, w: 72, h: 64 }]} highlight>
          <PodShape x={slot(nodes[0], 0)[0]} y={slot(nodes[0], 0)[1]} size={46} status="running" label="v1" />
          <PodShape x={slot(nodes[0], 1)[0]} y={slot(nodes[0], 1)[1]} size={46} status="running" tone="green" label="v2" />
        </NodeFrame>
        <NodeFrame x={nodes[1].x} y={nodes[1].y} w={nw} h={nh} name="čvor 2" status="notready" cpu={{ used: 3, total: 4 }} mem={{ used: 7.4, total: 8 }}>
          <PodShape x={slot(nodes[1], 0)[0]} y={slot(nodes[1], 0)[1]} size={46} status="terminating" label="v1" />
          <PodShape x={slot(nodes[1], 1)[0]} y={slot(nodes[1], 1)[1]} size={46} status="crash" tone="green" label="v2" restarts={7} />
        </NodeFrame>
        <NodeFrame x={nodes[2].x} y={nodes[2].y} w={nw} h={nh} name="čvor 3" status="cordoned" cpu={{ used: 1, total: 4 }} mem={{ used: 2, total: 8 }}>
          <PodShape x={slot(nodes[2], 0)[0]} y={slot(nodes[2], 0)[1]} size={46} status="running" label="v1" />
        </NodeFrame>
      </Diagram>
      </div>
    </div>
  )
}

/** Klopa karta with a lecture slider: the running example grows lecture by lecture. */
function StoryMapDemo() {
  const [n, setN] = useState(4)
  const [tags, setTags] = useState(false)
  const at = String(n).padStart(2, '0')
  return (
    <>
      <Slider label="Predavanje" value={n} min={1} max={24} onChange={setN} format={(v) => `${String(v).padStart(2, '0')} · ${STORY_LECTURES[v - 1]?.title ?? ''}`} />
      <Toggle label="Brojevi predavanja" checked={tags} onChange={setTags} hint="tags: uz svaki crtež broj predavanja u kojem je ušao u Klopu" />
      <StoryMap at={at} tags={tags} />
    </>
  )
}

/* ---------- Page ---------- */

export default function KitPage() {
  const [down, setDown] = useState(false)
  usePageTitle('Komponente predavanja')

  return (
    <LectureProvider slug="kit">
      <div className="nb-lecture" data-module="m4">
        <header className="nb-lhead">
          <p className="nb-lhead__no">
            <b>Za autore</b> · pribor bilježnice · <a href="/kit/crtezi">crteži →</a>
          </p>
          <h1 className="nb-h1">Komponente predavanja</h1>
          <p className="nb-lhead__sub">Sve gradivne komponente na jednom mjestu. Ova stranica služi kao referenca pri pisanju predavanja (vidi docs/AUTHORING.md).</p>
        </header>
        <div className="nb-lecture__body">
          <Section id="tekst" title="Tekst, bilješke i papirići" kicker="priča" lead="Uvodna rečenica odjeljka (lead): Newsreader u kurzivu, nešto veća od običnog teksta.">
            <MarginNote>MarginNote: bilješka na margini. Stavite je ispred odlomka na koji se odnosi.</MarginNote>
            <p>
              Običan tekst predavanja. <strong>Podebljano</strong> za ključne riječi, <code>inline kod</code> za naredbe i nazive datoteka. Pojam iz pojmovnika: <Term id="load-balancer">load balancer</Term>, a sklonjeni oblik: u{' '}
              <Term id="pod">Podu</Term>. Tipke: <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>.
            </p>
            <p>
              Svaki odjeljak ima isti kostur: crveni kicker „N · oznaka” (broj se dodaje sam), tiskani naslov i nacrtani rekvizit. Rekvizit se bira prema kickeru (priča → sat, isprobajte → munja, kod → kutije, provjera → upitnik…) ili
              izravno: <code>prop="helm"</code>.
            </p>
            <Callout kind="info" title="Što je stvarno, a što pojednostavljeno">
              Napomena s dodatnim kontekstom: plavi ljepljivi papirić. Naslov (<code>title</code>) je tiskan, a vrsta je napisana rukom.
            </Callout>
            <Callout kind="tip" title="Probajte">
              Praktičan savjet: zeleni papirić zalijepljen u kutu.
            </Callout>
            <Callout kind="warn" title="Zamka: crna rupa">
              Upozorenje na čestu grešku: indeksna kartica zalijepljena selotejpom. Srušeni poslužitelj odmah odbija veze, pa algoritmu „najmanje veza” izgleda kao najmanje zauzet.
            </Callout>
            <Callout kind="danger" title="Tajne nikad u Git">
              Nešto opasno: okvir crvenom olovkom. Vrijednosti u Secretu samo su kodirane u base64 – tko vidi repozitorij, vidi i lozinku.
            </Callout>
            <Callout kind="fact" title="Ingress NGINX">
              Činjenica vezana uz datum: isječak s pečatom. Zajednički kontroler Ingress NGINX povučen je u ožujku 2026., pa za nove klastere učimo Gateway API.
            </Callout>
            <Analogy
              title="Analogija: ulaz u menzu"
              breaksDown="osoba na ulazu vidi koliko je ljudi kod kojeg pulta. Load balancer zna samo ono što sam broji i ono što mu jave provjere ispravnosti."
            >
              Menza u podne: jedan red studenata, nekoliko pultova i osoba na ulazu koja svakog studenta šalje na slobodan pult. Studenti ne moraju znati koliko pultova postoji – vide samo ulaz.
            </Analogy>
            <Myth myth="Kubernetes Secret je kriptiran.">
              Prema zadanim postavkama vrijednosti su samo <strong>base64 kodirane</strong>, što nije enkripcija. Enkripciju u etcd-u treba posebno uključiti.
            </Myth>
            <KeyIdea>
              Kubernetes ne izvršava naredbe – on stalno <strong>uspoređuje željeno i stvarno stanje</strong> i ispravlja razliku.
            </KeyIdea>
            <Callout kind="key" title="ključno za ovaj odjeljak">
              Callout <code>kind="key"</code>: isti okvir kao KeyIdea, ali s običnim tekstom.
            </Callout>
            <DeepDive title="Kako točno radi round robin s težinama?">
              <p>Detalji za znatiželjne, skriveni po zadanim postavkama: dodatna stranica milimetarskog papira pričvršćena spajalicom.</p>
              <ul>
                <li>NGINX zahtjeve prema težinama glatko isprepliće.</li>
                <li>Za težine 1&nbsp;:&nbsp;2&nbsp;:&nbsp;4 redoslijed je V, S, V, M, V, S, V.</li>
              </ul>
            </DeepDive>
            <p>
              Oznake (privjesci): <Badge tone="ok">Running</Badge> <Badge tone="warn">Pending</Badge> <Badge tone="bad">CrashLoopBackOff</Badge> <Badge tone="violet">v2</Badge> <Badge tone="neutral">2 s (sim) · stvarno: 30 s</Badge>
            </p>
          </Section>

          <Section id="raspored" title="Slike, usporedbe i kartice" kicker="raspored">
            <Figure caption="Figure: crtež u okviru nacrtanom olovkom, s potpisom ispod. Natpise stavljajte na sam crtež.">
              <MenzaFigure />
              <Legend
                items={[
                  { color: 'var(--tray)', label: 'zahtjev (pladanj)', shape: 'tray' },
                  { color: 'var(--pen)', label: 'raspodjela', shape: 'dashed' },
                  { color: 'var(--ok)', label: 'zdrav', shape: 'check' },
                ]}
              />
            </Figure>
            <Compare
              left={{ title: 'Vertikalno skaliranje', tone: 'amber', points: ['Jači poslužitelj (više CPU-a i RAM-a)', 'Jednostavno', 'Ima gornju granicu i jednu točku kvara'] }}
              right={{ title: 'Horizontalno skaliranje', tone: 'green', points: ['Više poslužitelja', 'Treba load balancer', 'Preživi kvar jednog poslužitelja'] }}
            />
            <Tabs
              tabs={[
                { label: 'Kružno', content: <p>Tabs: obojene indeksne kartice. Otvorena kartica stoji na crti stranice, ostale su malo niže. Strelice ← → mijenjaju karticu.</p> },
                { label: 'Težinsko', content: <p>Druga kartica: težine kažu koliko je koji poslužitelj jači.</p> },
                { label: 'Najmanje veza', content: <p>Treća kartica: novi zahtjev ide poslužitelju s najmanje aktivnih veza.</p> },
              ]}
            />
            <ScrollX minWidth={760}>
              <p style={{ margin: 0 }}>ScrollX: široki sadržaj koji se na mobitelu povlači prstom (rezervno rješenje; bolje je nacrtati uži raspored).</p>
            </ScrollX>
          </Section>

          <Section id="kod" title="Kod i terminal" kicker="Kod">
            <KitCodeDemo />
          </Section>

          <Section id="dijagrami" title="Dijagrami i koraci" kicker="dijagrami" prop="flip">
            <Figure wide caption="Statični dijagram s animiranim zahtjevima.">
              <LbDemo down={down} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <Button variant={down ? 'success' : 'danger'} icon={Power} onClick={() => setDown((d) => !d)}>
                  {down ? 'Upali server B' : 'Ugasi server B'}
                </Button>
              </div>
              <Legend
                items={[
                  { color: 'var(--tray)', label: 'zahtjev', shape: 'tray' },
                  { color: 'var(--ok)', label: 'zdrav', shape: 'check' },
                  { color: 'var(--bad)', label: 'ne radi', shape: 'cross' },
                ]}
              />
            </Figure>
            <KitStepperDemo />
            <Figure wide caption="Ikone čvorova (DNode icon): svaka je crtež iz gramatike bilježnice.">
              <GlyphGallery />
            </Figure>
            <Figure wide caption="Stanja (status) i boje (tone) čvorova, okvir DGroup, veze Edge s pladnjem (Packet), bilješke DLabel i trake DBar.">
              <DiagramPieces />
            </Figure>
            <Compare
              left={{ title: 'Vertikalno skaliranje', points: ['Jači server (više CPU/RAM)', 'Jednostavno', 'Ima gornju granicu i jednu točku kvara'] }}
              right={{ title: 'Horizontalno skaliranje', points: ['Više servera', 'Treba load balancer', 'Otporno na kvar jednog servera'] }}
            />
          </Section>

          <Section id="kubernetes" title="Kubernetes u bilježnici" kicker="kubernetes" prop="helm">
            <Figure wide caption="K8sIcon: svaka vrsta objekta ima svoj crtež iz menze i kratko ime iz kubectla.">
              <K8sGallery />
            </Figure>
            <Figure wide caption="PodShape je kutija za ručak: stanje se vidi na licu i obrisu, verzija na traci (v1 plava, v2 zelena). NodeFrame je čvor s trakama goriva i slobodnim mjestom.">
              <PodsAndNodes />
            </Figure>
          </Section>

          <Section id="karta" title="Klopa karta" kicker="priča tečaja" prop="clock">
            <p>
              Arhitektura Klope raste iz predavanja u predavanje. <code>{'<StoryMap at="04" />'}</code> crta je onakvu kakva je na kraju zadanog predavanja, a ono što je to predavanje dodalo označeno je markerom i pečatom NOVO.
            </p>
            <StoryMapDemo />
          </Section>

          <Section id="simulacija" title="Simulacija" kicker="Interaktivno">
            <KitSimDemo />
          </Section>

          <Section id="incident" title="Incident na početku, cijena na kraju" kicker="priča tečaja" prop="clock">
            <p>
              Svako predavanje počinje incidentom (<code>IncidentCard</code>): poruka s dojavljivača otrgnuta i zalijepljena u bilježnicu, s brojkama koje se mogu ponoviti u simulaciji
              predavanja. Završava stranicom „Cijena rješenja” (<code>CostNote</code>): što smo dobili, što smo platili i koji nas incident čeka na sljedećoj stranici.
            </p>
            <IncidentCard
              no={4}
              when="ponedjeljak, 12:03"
              title="U podne Klopa svakom trećem studentu vraća 502"
              who="davor"
              says="502! Opet podne!"
              metrics={[
                { label: 'zahtjeva/s', value: '15' },
                { label: 'p95', value: '4,8 s', tone: 'bad' },
                { label: 'greške', value: '31 %', tone: 'bad' },
                { label: 'poslužitelja', value: '3' },
              ]}
              preset="podne-kruzno"
              seed={42}
            >
              Tri poslužitelja, a narudžbe i dalje padaju: Mali je zagušen, a Veliki se dosađuje.
            </IncidentCard>
            <CostNote
              gained={['Tri poslužitelja zajedno obrade oko 35 zahtjeva u sekundi.', 'Pad jednog poslužitelja više ne ruši Klopu – provjere ga izbace za nekoliko sekundi.']}
              paid={['Load balancer je nova jedinstvena točka kvara.', 'Svaki poslužitelj ima svoju kopiju aplikacije – nadogradnja znači ručno ažurirati tri stroja.']}
              next="Utorak, 12:05: Lana je izdala novu verziju, a pola studenata i dalje vidi stari jelovnik."
              nextTo="/predavanje/docker"
              nextLabel={
                <>
                  sljedeća stranica → <b>08</b> Docker
                </>
              }
            />
          </Section>

          <Section id="kraj" title="Provjere, zadaci i sažetak" kicker="provjera">
            <Predict
              question="Kružno raspoređivanje, Mali + Srednji + Veliki, 15 zahtjeva u sekundi. Koji poslužitelj prvi posustaje?"
              options={['Mali', 'Srednji', 'Veliki', 'Nijedan – ukupni kapacitet je 35 zahtjeva/s']}
              correct={0}
              explain="Kružno raspoređivanje svakom poslužitelju šalje trećinu prometa, 5 zahtjeva/s – a Mali (1 vCPU) obradi najviše oko 5. Ukupni kapacitet nije problem, problem je raspodjela."
            />
            <MythOrFact
              items={[
                { statement: 'Load balancer ubrzava svaki pojedini zahtjev.', fact: false, explain: 'Ne ubrzava – zahtjev ide jedan skok dulje. Dobivamo kapacitet: više zahtjeva u sekundi bez čekanja u redu.' },
                { statement: 'Kubernetes Service raspoređuje promet po vezama, a ne po zahtjevima.', fact: true, explain: 'kube-proxy bira poslužitelj (Pod) jednom po vezi; svi zahtjevi te veze idu istom Podu.' },
                { statement: 'Čim imamo load balancer, nemamo jedinstvenu točku kvara.', fact: false, explain: 'Load balancer i sam postaje jedinstvena točka kvara ako nije redundantan.' },
              ]}
            />
            <p>
              Zadaci (<code>Goals</code>) i dnevnik događaja (<code>EventLog</code>) žive uz simulaciju: pogledajte odjeljak <a href="#simulacija">Simulacija</a> – zadatak se sam
              označi kad ga riješite, a dnevnik se puni dok mijenjate klizače ili šaljete nalet.
            </p>
            <Recap points={['Load balancer dodaje kapacitet, a ne brzinu pojedinog zahtjeva.', 'Jezgre određuju propusnost, a RAM koliko zahtjeva istodobno stane.', 'Kvar se otkriva provjerama ispravnosti, nikad trenutačno.']} />
            <Quiz
              questions={[
                {
                  q: 'Što se dogodi kad Pod prekorači memorijski limit?',
                  options: ['Kubernetes ga uspori', 'Kernel ga ubije (OOMKilled)', 'Ništa'],
                  correct: 1,
                  explain: 'Memorija se ne može „usporiti” kao CPU; proces koji prijeđe limit kernel ubija (OOMKilled).',
                },
                {
                  q: 'Load balancer provjerava poslužitelje svakih 10 s i izbacuje ih nakon 3 neuspjele provjere. Koliko najdulje šalje promet palom poslužitelju?',
                  options: ['Nimalo – zna to odmah.', 'Oko 10 s.', 'Oko 30 s.'],
                  correct: 2,
                  explain: 'Prozor otkrivanja je do interval × prag = 10 s × 3 = 30 s.',
                },
              ]}
            />
          </Section>
        </div>
      </div>
    </LectureProvider>
  )
}
