import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Rough, RoughBox, Arrow, Boil, Check, Cross } from './Sketch'
import { Mark, SecHead, Tape, Term, CheckBox, ClockIcon, MarginDoodle, PropClock, PropIndex } from './Bits'
import { Bubble, Davor, Mira, Redar, Lana, TrayDefs } from './Doodles'
import { useSize } from './useSize'
import s from './bj.module.css'

/* ---------- 3. Curriculum: the notebook's handwritten table of contents ---------- */

const LECTURES = [
  { n: '01', title: 'Klopa izlazi na internet', sub: 'Jedan poslužitelj, jedna adresa i prvi pravi korisnici.', min: 20, page: 4, state: 'done' as const },
  { n: '02', title: 'Ručak u 12:00: granice jednog poslužitelja', sub: 'Što se točno potroši kad stotine studenata naruče u istoj minuti.', min: 30, page: 12, state: 'todo' as const },
  { n: '03', title: 'Veći poslužitelj ili više njih?', sub: 'Vertikalno i horizontalno skaliranje: gdje koje staje.', min: 25, page: 20, state: 'todo' as const },
  { n: '04', title: 'Load balancer: tko dijeli promet?', sub: 'Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.', min: 35, page: 28, state: 'current' as const },
]

const MODULES = [
  { n: 1, name: 'sustavi', c: 'yellow' },
  { n: 2, name: 'Docker', c: 'pink' },
  { n: 3, name: 'Kubernetes', c: 'green' },
  { n: 4, name: 'CI/CD', c: 'blue' },
  { n: 5, name: 'Argo CD', c: 'orange' },
  { n: 6, name: 'praksa', c: 'lilac' },
]

export function Curriculum() {
  return (
    <section className={`${s.section} ${s.secToc}`} id="kurikulum" aria-labelledby="kurikulum-title">
      <nav className={s.indexTabs} aria-label="Moduli tečaja">
        <ol>
          {MODULES.map((mo) => (
            <li key={mo.n} data-c={mo.c} aria-current={mo.n === 1 ? 'true' : undefined}>
              <span>
                <b>{mo.n}</b> <span className={s.tabName}>{mo.name}</span>
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <div className={s.tocHead}>
        <span className={s.kicker}>sadržaj bilježnice</span>
        <h2 className={s.h2} id="kurikulum-title">
          Kurikulum
        </h2>
        <svg className={s.tocRule} viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">
          <Rough shape={{ k: 'line', x1: 2, y1: 4, x2: 398, y2: 6 }} seed={2002} strokeWidth={1.8} roughness={1.4} />
          <Rough shape={{ k: 'line', x1: 6, y1: 10, x2: 392, y2: 11 }} seed={2003} strokeWidth={1.4} roughness={1.4} />
        </svg>
      </div>
      <div className={s.toc}>
        <div className={s.tocMain}>
          <h3 className={s.tocModule}>Modul 1 · Zašto raspodijeljeni sustavi</h3>
          <ol className={s.tocList}>
            {LECTURES.map((l) => (
              <li key={l.n} className={s.tocItem} data-state={l.state}>
                <span className={s.tocBox} aria-hidden="true">
                  <CheckBox checked={l.state === 'done'} seed={2010 + Number(l.n) * 3} color="var(--ink-2)" />
                </span>
                <a href={l.state === 'current' ? '#predavanje' : '#kurikulum'} className={s.tocLink}>
                  <span className={s.tocLine}>
                    <span className={s.tocNum}>{l.n}</span>
                    <span className={s.tocTitle}>
                      <span className={s.srOnly}>Predavanje {l.n}: </span>
                      {l.title}
                    </span>
                    <span className={s.tocDots} aria-hidden="true" />
                    <span className={s.tocPage}>str. {l.page}</span>
                  </span>
                  <span className={s.tocSub}>
                    {l.sub} <span className={s.tocMin}>· {l.min} min</span>
                  </span>
                </a>
                {l.state === 'done' && <span className={s.stamp}>završeno</span>}
                {l.state === 'current' && (
                  <span className={s.ribbon}>
                    <span>čitate</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
        <p className={s.tocAside}>
          <svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true">
            <Arrow
              pts={[
                [42, 6],
                [18, 8],
                [4, 30],
              ]}
              stroke="var(--pen)"
              seed={2031}
              draw
            />
          </svg>
          Predavanja idu redom, ali svako ima svoju simulaciju. Kad nešto nije jasno: pokvarite to i gledajte što se dogodi.
        </p>
      </div>
      <MarginDoodle kind="coffee" style={{ right: '4%', bottom: -54 }} />
    </section>
  )
}

/* ---------- 4. Lecture header ---------- */

export function LectureHeader() {
  return (
    <header className={s.lecture} id="predavanje" aria-labelledby="lecture-title">
      <svg className={s.lectureRule} viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true">
        <Rough shape={{ k: 'line', x1: 0, y1: 12, x2: 1000, y2: 14 }} seed={2101} stroke="var(--ink-3)" strokeWidth={1.2} roughness={1.6} />
        <Rough shape={{ k: 'line', x1: 0, y1: 18, x2: 1000, y2: 17 }} seed={2102} stroke="var(--ink-3)" strokeWidth={1} roughness={1.6} />
      </svg>
      <div className={s.lectureGrid}>
        <div>
          <span className={s.lectureNo}>
            <b>Predavanje 04</b> · modul 1 · str. 28
          </span>
          <h1 className={s.h1} id="lecture-title">
            Load balancer: tko dijeli <Mark c="yellow">promet?</Mark>
          </h1>
          <p className={s.lectureSub}>Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.</p>
          <div className={s.metaRow}>
            <span>
              <ClockIcon />
              ~35 min
            </span>
            <span>1 simulacija · 1 pitanje</span>
          </div>
        </div>
        <RoughBox className={s.goals} seed={2110} stroke="var(--pen)" strokeWidth={1.8} double>
          <h3>Nakon ovog predavanja moći ćete:</h3>
          <ul>
            {[
              'objasniti zašto za horizontalno skaliranje treba load balancer',
              'razlikovati ulogu procesora i RAM-a na poslužitelju',
              'usporediti kružno raspoređivanje i „najmanje aktivnih veza”',
            ].map((g, i) => (
              <li key={g}>
                <CheckBox seed={2120 + i * 3} color="var(--pen)" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </RoughBox>
      </div>
    </header>
  )
}

/* ---------- 5. Prose: "Podne u menzi" ---------- */

function BrainDoodle() {
  const outline: [number, number][] = [
    [10, 30],
    [5, 20],
    [10, 10],
    [20, 5],
    [29, 8],
    [38, 4],
    [48, 9],
    [53, 19],
    [50, 30],
    [42, 37],
    [29, 35],
    [17, 38],
    [10, 30],
  ]
  return (
    <svg viewBox="0 0 58 46" aria-hidden="true">
      <Rough shape={{ k: 'curve', pts: outline }} seed={2201} strokeWidth={1.8} fillColor="var(--hl-pink-ink)" hachureGap={4.5} />
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [29, 8],
            [27, 20],
            [30, 35],
          ],
        }}
        seed={2202}
        strokeWidth={1.3}
      />
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [13, 15],
            [20, 19],
            [15, 27],
          ],
        }}
        seed={2203}
        strokeWidth={1.2}
      />
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [41, 13],
            [45, 20],
            [39, 28],
          ],
        }}
        seed={2204}
        strokeWidth={1.2}
      />
      <Rough shape={{ k: 'line', x1: 28, y1: 36, x2: 30, y2: 44 }} seed={2205} strokeWidth={1.5} />
    </svg>
  )
}

/** A fully busy brain with a sweat drop (100 % CPU). */
function BrainMini() {
  const outline: [number, number][] = [
    [10, 30],
    [5, 20],
    [10, 10],
    [20, 5],
    [29, 8],
    [38, 4],
    [48, 9],
    [53, 19],
    [50, 30],
    [42, 37],
    [29, 35],
    [17, 38],
    [10, 30],
  ]
  return (
    <g transform="scale(1.25)">
      <Rough shape={{ k: 'curve', pts: outline }} seed={2621} strokeWidth={1.8} fillColor="var(--hl-pink-ink)" fillStyle="cross-hatch" hachureGap={3.2} />
      <Rough shape={{ k: 'path', d: 'M62 6 Q57 15 62 18 Q67 15 62 6 Z' }} seed={2622} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
      <Rough shape={{ k: 'path', d: 'M64 24 Q60 31 64 33 Q68 31 64 24 Z' }} seed={2623} strokeWidth={1.2} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
    </g>
  )
}

function PlateDoodle() {
  return (
    <svg viewBox="0 0 58 46" aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: 29, cy: 26, w: 52, h: 26 }} seed={2211} strokeWidth={1.8} />
      <Rough shape={{ k: 'ellipse', cx: 29, cy: 25, w: 34, h: 14 }} seed={2212} strokeWidth={1.2} />
      <Rough shape={{ k: 'ellipse', cx: 22, cy: 22, w: 12, h: 8 }} seed={2213} strokeWidth={1.2} fillColor="var(--hl-orange-ink)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: 35, cy: 23, w: 12, h: 8 }} seed={2214} strokeWidth={1.2} fillColor="var(--hl-green-ink)" fillStyle="solid" />
    </svg>
  )
}

/**
 * One line of a myth, crossed out with the red pen — but only after the reader has had a moment to read it
 * (the strike draws itself ~0,7 s after the note scrolls into view). The text stays fully legible under the line.
 */
function StruckLine({ children, delay, seed }: { children: ReactNode; delay: number; seed: number }) {
  const [ref, size] = useSize<HTMLSpanElement>()
  return (
    <span ref={ref} className={s.struckLine}>
      {children}
      {size && (
        <svg className={s.struckSvg} width={size.w + 12} height={size.h} viewBox={`0 0 ${size.w + 12} ${size.h}`} aria-hidden="true">
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [2, size.h * 0.6],
                [size.w * 0.35, size.h * 0.52],
                [size.w * 0.7, size.h * 0.6],
                [size.w + 4, size.h * 0.5],
              ],
            }}
            seed={seed}
            stroke="var(--red)"
            strokeWidth={2.6}
            roughness={0.9}
            draw
            delay={delay}
            duration={0.32}
          />
        </svg>
      )}
    </span>
  )
}

export function Prose() {
  return (
    <section className={s.section} aria-labelledby="podne-title">
      <SecHead n="1" kicker="priča" title="Podne u menzi" id="podne-title" prop={<PropClock />} />
      <div className={s.proseGrid}>
        <div className={s.prose}>
          <p>
            Svaki radni dan u 12:00 menza se napuni za pet minuta. Stotine studenata u istom trenutku otvore Klopu da naruče ručak, a jedan poslužitelj ispod Lanina stola odjednom
            dobije više posla nego cijelo jutro. Stranica se učitava sporo, neke narudžbe ne prođu, a Davor dobije poruku: <em>„Klopa opet ne radi.”</em>
          </p>
          <p>
            Davor je prošlog tjedna dodao još dva poslužitelja, ali gužva nije nestala: svi studenti i dalje šalju zahtjeve na istu adresu. Treba nam netko tko stoji na ulazu i
            svaki zahtjev pošalje na poslužitelj koji ga može primiti — to je{' '}
            <Term def="Program ili uređaj koji prima sve dolazne zahtjeve i raspoređuje ih na više poslužitelja, tako da nijedan ne dobije više nego što može obraditi.">
              load balancer
            </Term>
            . Pitanje je samo: <Mark c="yellow">po kojem pravilu dijeli?</Mark>
          </p>
        </div>
        <div className={s.margin} aria-hidden="true">
          <div className={s.marginNote}>
            <svg width="40" height="34" viewBox="0 0 40 34" style={{ position: 'absolute', left: -46, top: 4 }}>
              <Arrow
                pts={[
                  [38, 8],
                  [20, 4],
                  [4, 20],
                ]}
                stroke="var(--pen)"
                seed={2301}
                draw
              />
            </svg>
            12:00 → 400 narudžbi u 5 minuta. Ostatak dana: tišina.
          </div>
          <svg className={s.marginDavor} viewBox="0 0 270 196">
            <Boil>
              <Davor x={6} y={66} scale={0.95} mood="worry" holding="mug" />
            </Boil>
            <Bubble x={86} y={0} w={178} h={100} tx={52} ty={104} lines={['Dodao sam još', 'dva poslužitelja…', 'i opet pada!']} size={19} seed={2311} tail={20} />
            <text x={104} y={160} className={s.svgHand} style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
              Davor, dežuran
            </text>
            <text x={104} y={182} className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-3)' }}>
              (pager mu ne da spavati)
            </text>
          </svg>
        </div>
      </div>

      <div className={s.callouts}>
        <RoughBox className={s.keyIdea} seed={2401} stroke="var(--ink)" strokeWidth={2.2} double roughness={1.1}>
          <span className={s.keyLabel}>ključna ideja!</span>
          <p className={s.keyText}>
            <Mark c="pink">Jezgre</Mark> određuju propusnost, a <Mark c="orange">RAM</Mark> određuje koliko zahtjeva istodobno stane.
          </p>
          <div className={s.keyDoodle} aria-hidden="true">
            <div>
              <BrainDoodle />
              <span>
                CPU = mozak
                <br />
                koliko brzo radi
              </span>
            </div>
            <div>
              <PlateDoodle />
              <span>
                RAM = tanjuri
                <br />
                koliko toga drži odjednom
              </span>
            </div>
          </div>
        </RoughBox>

        <aside className={`${s.note} ${s.analogy}`} aria-label="Analogija">
          <Tape style={{ top: -13, left: '38%', transform: 'rotate(4deg)' }} />
          <h3>Analogija: menza</h3>
          <svg viewBox="0 -62 300 178" style={{ width: '100%', height: 'auto', overflow: 'visible', marginBottom: 4 }} aria-hidden="true">
            <Bubble x={70} y={-58} w={170} h={62} tx={262} ty={8} lines={['Šaljite ih k meni,', 'kod mene je prazno!']} size={18} seed={2521} tail={14} />
            <Redar x={50} y={74} scale={0.62} angle={-0.25} />
            <Rough shape={{ k: 'line', x1: 110, y1: 86, x2: 296, y2: 86 }} seed={2501} strokeWidth={1.6} stroke="#2a251a" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <Rough shape={{ k: 'rect', x: 120 + i * 60, y: 50, w: 46, h: 36 }} seed={2510 + i} strokeWidth={1.5} stroke="#2a251a" />
                <text x={143 + i * 60} y={73} textAnchor="middle" style={{ fontFamily: 'var(--f-hand)', fontSize: 15, fill: '#2a251a' }}>
                  pult {i + 1}
                </text>
              </g>
            ))}
            <Mira x={244} y={-12} scale={0.5} />
          </svg>
          <p>
            Menza ima jedan ulaz i nekoliko pultova. Na ulazu stoji redar koji svakog studenta uputi na pult gdje će ga najprije poslužiti. Ulaz je adresa aplikacije, pultovi su
            poslužitelji, a redar je load balancer.
          </p>
          <div className={s.analogyBreak}>
            <strong>Gdje analogija ne vrijedi:</strong>
            <p style={{ margin: 0 }}>
              Redar vidi redove svojim očima. Load balancer zna samo ono što izmjeri: broj otvorenih veza i odgovore na health check. Ako pult tiho prestane raditi, redar to vidi
              odmah, a load balancer tek nakon nekoliko neuspjelih provjera.
            </p>
          </div>
        </aside>

        <div className={s.myth}>
          <div className={`${s.note} ${s.mythNote}`} data-c="pink">
            <span className={s.mythLabel}>mit</span>
            <p className={s.mythText}>
              {['„Više RAM-a', 'znači brži', 'poslužitelj.”'].map((l, i) => (
                <StruckLine key={l} delay={0.7 + i * 0.28} seed={2602 + i}>
                  {l}{' '}
                </StruckLine>
              ))}
            </p>
          </div>
          <div className={s.mythNe} aria-hidden="true">
            <motion.span
              initial={{ opacity: 0, scale: 0.4, rotate: -24 }}
              whileInView={{ opacity: 1, scale: 1, rotate: -10 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ delay: 1.6, type: 'spring', stiffness: 380, damping: 14 }}
            >
              NE!
            </motion.span>
            <svg viewBox="0 0 120 90">
              <Arrow
                pts={[
                  [6, 20],
                  [40, 4],
                  [62, 30],
                  [42, 50],
                  [36, 30],
                  [70, 22],
                  [112, 54],
                ]}
                stroke="var(--red)"
                strokeWidth={2.2}
                seed={2611}
                draw
                delay={1.8}
              />
            </svg>
          </div>
          <div className={s.fact}>
            <span className={`${s.mythLabel} ${s.factLabel}`}>činjenica</span>
            <p className={s.factText}>
              RAM određuje koliko zahtjeva stane <em>istodobno</em>. Brzinu obrade određuje procesor. Dodatni RAM pomaže tek kad poslužitelju ponestane mjesta za istodobne
              zahtjeve; ako je procesor već stalno zauzet, obrada neće biti ništa brža.
            </p>
            <figure className={s.factDoodle} aria-label="Crtež: puno praznih tanjura, a mozak je i dalje stopostotno zauzet.">
              <svg viewBox="0 0 330 96" aria-hidden="true">
                <g transform="translate(4 14)">
                  <BrainMini />
                </g>
                <text x={14} y={92} className={s.svgHand} style={{ fontSize: 18.5, fill: 'var(--red)' }}>
                  CPU 100 %
                </text>
                {Array.from({ length: 8 }, (_, i) => (
                  <g key={i}>
                    <circle cx={112 + (i % 4) * 30} cy={28 + Math.floor(i / 4) * 30} r={11} className={s.plateDoodle} />
                    <circle cx={112 + (i % 4) * 30} cy={28 + Math.floor(i / 4) * 30} r={6.5} className={s.plateRimDoodle} />
                    {i < 2 && <circle cx={112 + (i % 4) * 30} cy={28 + Math.floor(i / 4) * 30} r={5} className={s.foodDoodle} />}
                  </g>
                ))}
                <text x={232} y={40} className={s.svgHand} style={{ fontSize: 18.5, fill: 'var(--ink-2)' }}>
                  8 GB tanjura,
                </text>
                <text x={232} y={61} className={s.svgHand} style={{ fontSize: 18.5, fill: 'var(--ink-2)' }}>
                  6 ih je prazno
                </text>
              </svg>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 7. Glossary: the back page of the notebook ---------- */

type Doodle = 'lb' | 'hc' | 'p95' | 'err' | 'pod' | 'svc' | 'node' | 'crash' | 'sched'

const GLOSSARY: { term: string; is: string; def: string; d: Doodle }[] = [
  { term: 'load balancer', is: 'redar na ulazu', def: 'Prima sve zahtjeve na jednoj adresi i raspoređuje ih na više poslužitelja.', d: 'lb' },
  { term: 'health check', is: 'kuc-kuc, jesi živ?', def: 'Redovita provjera poslužitelja. Tek nakon nekoliko neuspjeha zaredom ispada iz rotacije.', d: 'hc' },
  { term: 'p95', is: '95 % brže od ovoga', def: 'Vrijeme od kojeg je 95 % zahtjeva brže. Pokazuje kako je onima koji najdulje čekaju.', d: 'p95' },
  { term: '502 / 503', is: 'pladanj na podu', def: '502: poslužitelj iza load balancera ne odgovara. 503: nema mjesta u redu ili nema zdravog poslužitelja.', d: 'err' },
  { term: 'Pod', is: 'kutija za ručak', def: 'Najmanja jedinica u Kubernetesu: jedan ili više kontejnera koji rade zajedno.', d: 'pod' },
  { term: 'Service', is: 'etiketa s adresom', def: 'Stalna adresa za skupinu Podova. Bira ih po oznaci i promet šalje samo spremnima.', d: 'svc' },
  { term: 'čvor (node)', is: 'zgrada menze', def: 'Stvarni ili virtualni stroj na kojem rade Podovi. Ima svoj CPU i RAM.', d: 'node' },
  { term: 'CrashLoopBackOff', is: 'pada, pa čeka sve dulje', def: 'Kontejner se stalno ruši; Kubernetes ga ponovo pokreće, a pauze između pokušaja rastu.', d: 'crash' },
  { term: 'scheduler', is: 'traži slobodno mjesto', def: 'Dio control planea koji novom Podu traži čvor s dovoljno slobodnog CPU-a i RAM-a.', d: 'sched' },
]

/** Each glossary word gets its own tiny doodle from the illustration grammar (64 × 48). */
function GlossDoodle({ d }: { d: Doodle }) {
  const k = 2700 + d.length * 7
  switch (d) {
    case 'lb':
      return (
        <g>
          <use href="#bjgl-tray" x={2} y={18} width={22} height={15} />
          {[8, 24, 40].map((y, i) => (
            <Arrow
              key={i}
              pts={[
                [28, 25],
                [44, (25 + y) / 2],
                [60, y],
              ]}
              stroke="var(--ink-2)"
              strokeWidth={1.4}
              head={6}
              seed={k + i * 3}
            />
          ))}
        </g>
      )
    case 'hc':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 14, y: 6, w: 34, h: 40 }} seed={k} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'rect', x: 23, y: 2, w: 16, h: 7 }} seed={k + 1} strokeWidth={1.3} fillColor="var(--ink-3)" fillStyle="solid" />
          <Check x={26} y={22} size={6} seed={k + 2} />
          <Cross x={26} y={36} size={4.5} seed={k + 3} strokeWidth={1.8} />
          <Rough shape={{ k: 'line', x1: 35, y1: 22, x2: 44, y2: 22 }} seed={k + 4} strokeWidth={1.1} />
          <Rough shape={{ k: 'line', x1: 35, y1: 36, x2: 44, y2: 36 }} seed={k + 5} strokeWidth={1.1} />
        </g>
      )
    case 'p95':
      return (
        <g>
          {[30, 22, 12, 8, 5, 3].map((h, i) => (
            <Rough key={i} shape={{ k: 'rect', x: 4 + i * 9, y: 44 - h, w: 7, h }} seed={k + i} strokeWidth={1.2} fillColor="var(--hl-orange-ink)" hachureGap={2.6} />
          ))}
          <Rough shape={{ k: 'line', x1: 46, y1: 4, x2: 46, y2: 46 }} seed={k + 8} strokeWidth={1.8} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 2, y1: 45, x2: 62, y2: 45 }} seed={k + 9} strokeWidth={1.4} />
        </g>
      )
    case 'err':
      return (
        <g>
          <g transform="translate(28 30) rotate(24)">
            <use href="#bjgl-tray" x={-14} y={-9} width={28} height={19} />
          </g>
          <Cross x={30} y={24} size={11} seed={k} strokeWidth={2.4} />
          <Rough shape={{ k: 'line', x1: 4, y1: 44, x2: 60, y2: 44 }} seed={k + 1} strokeWidth={1.3} stroke="var(--ink-3)" />
        </g>
      )
    case 'pod':
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: 32, cy: 12, w: 18, h: 13, start: Math.PI, stop: Math.PI * 2 }} seed={k} strokeWidth={1.6} />
          <Rough shape={{ k: 'rect', x: 12, y: 12, w: 40, h: 30 }} seed={k + 1} strokeWidth={1.8} fillColor="var(--hl-blue-ink)" hachureGap={4.5} />
          <rect x={38} y={9} width={14} height={8} transform="rotate(6 45 13)" className={s.glTape} />
        </g>
      )
    case 'svc':
      return (
        <g>
          <Rough shape={{ k: 'path', d: 'M18 12 L58 12 L58 38 L18 38 L6 25 Z' }} seed={k} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: 15, cy: 25, w: 6, h: 6 }} seed={k + 1} strokeWidth={1.3} />
          <Rough shape={{ k: 'line', x1: 24, y1: 22, x2: 50, y2: 22 }} seed={k + 2} strokeWidth={1.1} stroke="var(--ink-3)" />
          <Rough shape={{ k: 'line', x1: 24, y1: 30, x2: 44, y2: 30 }} seed={k + 3} strokeWidth={1.1} stroke="var(--ink-3)" />
        </g>
      )
    case 'node':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 4, y: 6, w: 56, h: 38 }} seed={k} strokeWidth={1.8} roughness={1.5} />
          <Rough shape={{ k: 'rect', x: 10, y: 18, w: 18, h: 20 }} seed={k + 1} strokeWidth={1.3} fillColor="var(--hl-blue-ink)" hachureGap={3.5} />
          <Rough shape={{ k: 'rect', x: 34, y: 18, w: 18, h: 20 }} seed={k + 2} strokeWidth={1.1} stroke="var(--ink-3)" dash="2 4" />
          <Rough shape={{ k: 'line', x1: 10, y1: 12, x2: 30, y2: 12 }} seed={k + 3} strokeWidth={2.4} stroke="var(--hl-orange-ink)" />
        </g>
      )
    case 'crash':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 8, y: 12, w: 36, h: 28 }} seed={k} strokeWidth={1.8} stroke="var(--red)" fillColor="var(--red)" hachureGap={3.2} />
          <Rough shape={{ k: 'arc', cx: 52, cy: 20, w: 16, h: 16, start: -2.6, stop: 1.6 }} seed={k + 1} strokeWidth={1.7} stroke="var(--red)" />
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [55, 28],
                [52, 28.5],
                [53, 25],
              ],
            }}
            seed={k + 2}
            strokeWidth={1.6}
            stroke="var(--red)"
          />
        </g>
      )
    case 'sched':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 26, y: 18, w: 30, h: 24 }} seed={k} strokeWidth={1.2} stroke="var(--ink-3)" dash="3 4" />
          <Rough shape={{ k: 'ellipse', cx: 20, cy: 18, w: 22, h: 22 }} seed={k + 1} strokeWidth={1.9} stroke="var(--pen)" />
          <Rough shape={{ k: 'line', x1: 28, y1: 26, x2: 38, y2: 36 }} seed={k + 2} strokeWidth={2.6} stroke="var(--pen)" />
        </g>
      )
  }
}

export function Glossary() {
  return (
    <section className={`${s.section} ${s.secGloss}`} id="pojmovnik" aria-labelledby="pojmovnik-title">
      <SecHead n="7" kicker="zadnja stranica bilježnice" title="Pojmovnik" id="pojmovnik-title" prop={<PropIndex />} />
      <p className={s.lede}>Svaka riječ ima svoj crtež iz menze. Kad je sretnete u predavanju, potražite isti crtež.</p>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <TrayDefs id="bjgl" />
      </svg>
      <dl className={s.gloss}>
        {GLOSSARY.map((g) => (
          <div key={g.term} className={s.glossItem}>
            <svg className={s.glossDoodle} viewBox="0 0 64 48" aria-hidden="true">
              <GlossDoodle d={g.d} />
            </svg>
            <dt>
              <span className={s.glossTerm}>{g.term}</span>
              <span className={s.glossIs}>= {g.is}</span>
            </dt>
            <dd>{g.def}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ---------- 8. Footer ---------- */

export function Footer() {
  return (
    <footer className={s.footer}>
      <svg className={s.footerCast} viewBox="0 -64 250 200" aria-hidden="true">
        <Boil slow>
          <Lana x={0} y={6} scale={0.85} mood="grin" />
          <Davor x={74} y={6} scale={0.85} mood="smile" holding="mug" />
          <Mira x={154} y={6} scale={0.85} mood="grin" />
        </Boil>
        <Bubble x={130} y={-62} w={116} h={52} tx={190} ty={30} lines={['Dobar tek!']} size={21} seed={2801} tail={16} />
        <text x={34} y={128} textAnchor="middle" className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          Lana
        </text>
        <text x={108} y={128} textAnchor="middle" className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          Davor
        </text>
        <text x={188} y={128} textAnchor="middle" className={s.svgHand} style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          teta Mira
        </text>
      </svg>
      <p className={s.footerText}>
        <strong>Kubernetes od nule</strong>
        Bilježnica s predavanja iz raspodijeljenih sustava: Docker, Kubernetes, CI/CD i Argo CD, objašnjeni na primjeru Klope. Sve je nacrtano rukom (uz malo pomoći biblioteke
        roughjs), a simulacije smijete rušiti koliko god želite.
      </p>
      <a className={s.footerTurn} href="#vrh">
        na početak ↑
      </a>
    </footer>
  )
}
