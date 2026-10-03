/**
 * Flagship „Vi ste orkestrator → termostat za aplikacije” (E3 Klaster, L10 model `desiredState`).
 * The same seeded day (02:30 → 14:00, preset rucni-dan · seed 42) first by hand – drag containers onto servers
 * when server-2 dies at 03:00 and when lunch wants 15 API copies – then with „Predaj Kubernetesu”: a generic,
 * level-triggered loop fills dashed ghosts with solid instances every 10 s (sim · stvarno: sekunde).
 */
import { useRef, useState } from 'react'
import { Power, RotateCcw } from 'lucide-react'
import { Badge, Button, ControlGroup, Goals, Legend, Segmented, SimFrame, Slider, Stat, StatRow, plural, useSimulation, useWidth } from '../../../kit'
import { COMPRESSED } from '../../../engines/cluster'
import {
  APPS,
  DAY,
  PRESET,
  SEED,
  appViews,
  clock,
  createWorld,
  dayMinute,
  deficit,
  failServer,
  handOver,
  loseNextEvent,
  place,
  prettyEventText,
  removeOne,
  repairServer,
  requestMidChange,
  setDesired,
  skipTo,
  snapshot,
  stepWorld,
  type RunKind,
  type Snapshot,
  type World,
} from '../model'
import { ContainerTray } from './ContainerTray'
import { OrchestratorStage } from './OrchestratorStage'
import { NARROW, WIDE } from './stageGeo'
import styles from '../styles.module.css'

interface Achieved {
  manual: boolean
  loop: boolean
  mid: boolean
}

type History = Record<RunKind, Snapshot | null>

const SERVER_OPTIONS = [
  { value: 'server-1', label: '1' },
  { value: 'server-2', label: '2' },
  { value: 'server-3', label: '3' },
]

const SKIPS = [
  { minute: DAY.fail - 1, label: '02:59' },
  { minute: DAY.repair - 1, label: '07:59' },
  { minute: DAY.version - 1, label: '09:59' },
  { minute: DAY.lunch - 1, label: '11:59' },
]

export function OrchestratorSim() {
  const [startKind, setStartKind] = useState<RunKind>('manual')
  const [achieved, setAchieved] = useState<Achieved>({ manual: false, loop: false, mid: false })
  const [history, setHistory] = useState<History>({ manual: null, loop: null })
  const [selected, setSelected] = useState('api')
  const [hover, setHover] = useState<string | null>(null)
  const [target, setTarget] = useState('server-2')
  const [ref, width] = useWidth<HTMLDivElement>()
  const skipRow = useRef<HTMLDivElement>(null)
  const dayRow = useRef<HTMLDivElement>(null)
  const g = width !== null && width < 580 ? NARROW : WIDE

  const sim = useSimulation<World>({
    init: () => createWorld('manual'),
    speed: 5,
    step: (w, dt) => {
      stepWorld(w, dt)
      const f = w.flags
      if ((f.night && f.lunch && !achieved.manual) || (f.loopLunch && !achieved.loop) || (f.midDone && !achieved.mid)) {
        setAchieved((a) => ({ manual: a.manual || (f.night && f.lunch), loop: a.loop || f.loopLunch, mid: a.mid || f.midDone }))
      }
      if (w.s.finished && !w.recorded) {
        w.recorded = true
        const snap = snapshot(w)
        setHistory((h) => ({ ...h, [snap.kind]: snap }))
      }
    },
  })
  const w = sim.state
  const s = w.s
  const apps = appViews(s)
  const def = deficit(s)
  const live = snapshot(w)
  const minute = dayMinute(s)

  const act = (fn: (x: World) => void) => sim.mutate(fn)

  /** „Predaj Kubernetesu” mid-day: the manual part so far goes to the „Ručno” column, the loop column counts from now. */
  const handOverNow = () => {
    if (w.kind === 'loop') return
    if (minute > DAY.fail) {
      const snap = snapshot(w)
      setHistory((h) => ({ ...h, manual: snap }))
    }
    act((x) => handOver(x))
  }

  /** A skip button that was just used becomes disabled: keep keyboard focus on the next one (or on „Novi dan”). */
  const skip = (minuteTo: number) => {
    act((x) => skipTo(x, minuteTo))
    window.setTimeout(() => {
      const next = skipRow.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? dayRow.current?.querySelector<HTMLButtonElement>('button')
      next?.focus()
    }, 0)
  }

  /** A new day in the given mode; the day that is ending goes to the comparison (if it got past 03:00). */
  const newDay = (kind: RunKind) => {
    if (!w.recorded && minute > DAY.fail) {
      const snap = snapshot(w)
      setHistory((h) => ({ ...h, [snap.kind]: snap }))
    }
    setStartKind(kind)
    sim.reset()
    if (kind === 'loop') sim.mutate((x) => handOver(x))
  }
  const frameSim = { ...sim, reset: () => newDay(startKind) }

  const cols: { kind: RunKind; title: string; snap: Snapshot | null }[] = [
    { kind: 'manual', title: 'Ručno', snap: w.kind === 'manual' ? live : history.manual },
    { kind: 'loop', title: 'S petljom', snap: w.kind === 'loop' ? live : history.loop },
  ]
  const tv = s.servers.find((x) => x.id === target)!

  return (
    <SimFrame
      title="Vi ste orkestrator"
      subtitle={
        <>
          Isti dan dvaput: od 02:30 do 14:00 (preset <code>{PRESET}</code> · seed {SEED}). U 03:00 pada poslužitelj-2, u 08:00 se vraća popravljen, u 10:00 stiže nova verzija API-ja, a od 12:00 do 13:00 ručak traži 15 kopija API-ja.
        </>
      }
      sim={frameSim}
      speeds={[1, 5, 10, 30]}
      toolbar={<Badge tone="neutral">{`sat: ${clock(s)}`}</Badge>}
      hint="preživite 03:00 i 12:00 ručno – povucite kontejnere na poslužitelje. Zatim pritisnite „Predaj Kubernetesu” (ili novi dan s petljom) i usporedite isti dan."
      controls={
        <>
          <ControlGroup title="Tko upravlja">
            {/* one button that changes its label (a Badge in its place would drop keyboard focus to <body>) */}
            <Button variant={s.mode === 'manual' ? 'primary' : 'secondary'} icon={Power} onClick={handOverNow} active={s.mode === 'manual' ? undefined : true} title={s.mode === 'manual' ? undefined : 'Petlja već upravlja. Novi dan počnite gumbima ispod.'}>
              {s.mode === 'manual' ? 'Predaj Kubernetesu' : w.handedAt === '02:30' ? 'Petlja upravlja od početka dana' : `Petlja upravlja od ${w.handedAt}`}
            </Button>
            <div className={styles.btnRow} ref={dayRow}>
              <Button size="sm" icon={RotateCcw} onClick={() => newDay('manual')}>
                Novi dan: ručno
              </Button>
              <Button size="sm" icon={RotateCcw} onClick={() => newDay('loop')}>
                Novi dan: s petljom
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Željeno stanje">
            {APPS.map((a) => (
              <Slider
                key={a.id}
                label={`${a.name}: željeni broj kopija`}
                value={s.desired[a.id]}
                min={0}
                max={a.max}
                onChange={(n) => act((x) => setDesired(x, a.id, n))}
                format={(n) => plural(n, ['kopija', 'kopije', 'kopija'])}
              />
            ))}
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <Segmented label="Poslužitelj" value={target} options={SERVER_OPTIONS} onChange={setTarget} size="sm" />
            <div className={styles.btnRow}>
              {tv.up ? (
                <Button variant="danger" size="sm" onClick={() => act((x) => failServer(x, target))}>
                  Ugasi poslužitelj
                </Button>
              ) : (
                <Button variant="success" size="sm" onClick={() => act((x) => repairServer(x, target))}>
                  Vrati poslužitelj
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => act((x) => loseNextEvent(x))} active={s.loseNext} title="Sljedeća obavijest (pad, nova želja, nova verzija) nikad ne stigne">
                Izgubi događaj
              </Button>
              <Button size="sm" onClick={() => act((x) => requestMidChange(x))} active={w.armedMid} title="Dok se nešto popravlja, API dobije tri kopije više (ili manje). Ako se ništa ne popravlja, promjena čeka sljedeći popravak.">
                Promijeni želju usred popravka
              </Button>
            </div>
            {s.loseNext && <p className={styles.ctrlNote}>Sljedeća obavijest neće stići.</p>}
            {w.armedMid && <p className={styles.ctrlNote}>Promjena želje čeka sljedeći popravak.</p>}
          </ControlGroup>
          <ControlGroup title="Premotaj dan" collapsible>
            <div className={styles.btnRow} ref={skipRow}>
              {SKIPS.map((k) => (
                <Button key={k.minute} size="sm" disabled={minute >= k.minute || s.finished} onClick={() => skip(k.minute)}>
                  {`na ${k.label}`}
                </Button>
              ))}
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="nedostaje sada" value={def} unit={plural(def, ['kontejner', 'kontejnera', 'kontejnera'], false)} tone={def > 0 ? 'bad' : 'ok'} sub={`kapacitet ${s.servers.filter((x) => x.up).length * 14} mjesta`} />
            <Stat label="nedostajućih kopija-minuta" value={live.missing} tone={live.missing > 300 ? 'bad' : live.missing > 0 ? 'warn' : 'ok'} sub="zbroj kopija koje ne rade × minute dana" />
            <Stat label="krivih postavljanja" value={live.wrong} tone={live.wrong > 0 ? 'bad' : 'ok'} sub="na srušen ili pun poslužitelj" />
            <Stat label="Davorov san" value={`${live.slept}/${live.night}`} unit="min" tone={live.night > 0 && live.slept < live.night ? 'bad' : 'ok'} sub="noćne minute (do 07:00)" />
          </StatRow>
          <div className={styles.compare}>
            <table className={styles.cmpTable}>
              <caption className={styles.cmpCaption}>Isti dan, dva načina</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  {cols.map((c) => (
                    <th key={c.kind} scope="col">
                      {c.title}
                      {c.kind === w.kind ? <span className={styles.cmpNow}> (sada)</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">stigli smo do</th>
                  {cols.map((c) => (
                    <td key={c.kind} className="mono">
                      {c.snap ? `${c.snap.kind === 'loop' && c.snap.handedAt && c.snap.handedAt !== '02:30' ? `${c.snap.handedAt} → ` : ''}${c.snap.clock}` : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">nedostajućih kopija-minuta</th>
                  {cols.map((c) => (
                    <td key={c.kind} className="mono">
                      {c.snap ? c.snap.missing : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">ručnih radnji</th>
                  {cols.map((c) => (
                    <td key={c.kind} className="mono">
                      {c.snap ? c.snap.actions : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">krivih postavljanja</th>
                  {cols.map((c) => (
                    <td key={c.kind} className="mono">
                      {c.snap ? c.snap.wrong : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Davorov san</th>
                  {cols.map((c) => (
                    <td key={c.kind} className="mono">
                      {c.snap ? `${c.snap.slept}/${c.snap.night} min` : '–'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className={styles.cmpNote}>
              Stupac „S petljom” broji od trenutka predaje. Ni tu brojka nije nula: razliku vidi tek sljedeći prolaz petlje (u simulaciji 10 s, tj. 10 minuta na satu dana). A ni pravi Kubernetes nije trenutačan: na nestalu kopiju reagira za
              nekoliko sekundi, ali kad padne cijeli poslužitelj, po zadanim postavkama pričeka pedesetak sekundi da ga proglasi nedostupnim i još 5 minuta (možda se vrati) prije nego što zamijeni njegove kopije – i za to nitko ne mora ustati (11.
              predavanje).
            </p>
          </div>
          <div className={styles.statGrid}>
            <Goals
              goals={[
                { text: 'Preživite 03:00 i 12:00 ručno: vratite devet izgubljenih kontejnera dok poslužitelj-2 ne radi i osigurajte 15 kopija API-ja za ručak.', done: achieved.manual },
                { text: 'Isto s petljom – usporedite: odradite isti ručak s petljom („Predaj Kubernetesu” ili „Novi dan: s petljom”).', done: achieved.loop },
                { text: 'Promijenite želju usred popravka: dok su kopije još iscrtkane, promijenite željeni broj – petlja dođe do zadnje želje.', done: achieved.mid },
              ]}
            />
            <DayLog w={w} />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <div style={g.narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
          <OrchestratorStage w={w} g={g} highlight={hover} />
        </div>
        <ContainerTray s={s} apps={apps} selected={selected} onSelect={setSelected} onPlace={(app, server) => act((x) => place(x, app, server))} onRemove={(app) => act((x) => removeOne(x, app))} onHover={setHover} />
        <Legend
          items={[
            { color: 'var(--hl-blue-ink)', label: 'api = klopa-api', shape: 'square' },
            { color: 'var(--hl-green-ink)', label: 'api, nova verzija', shape: 'square' },
            { color: 'var(--hl-pink-ink)', label: 'wrk = klopa-worker', shape: 'square' },
            { color: 'var(--hl-yellow-ink)', label: 'web = klopa-web', shape: 'square' },
            { color: 'var(--ink-2)', label: 'iscrtkano = želja, još ne radi', shape: 'dashed' },
          ]}
        />
        <div className={styles.badges}>
          <Badge tone="neutral">sat dana: 1 s (sim) = 1 min</Badge>
          <Badge tone="neutral">{`prolaz petlje: ${COMPRESSED.l10LoopTick.label}`}</Badge>
          <Badge tone="neutral">kopija iscrtkana → puna: 5 s (sim) · stvarno: sekunde (dulje ako se slika tek povlači)</Badge>
        </div>
      </div>
    </SimFrame>
  )
}

/** „Što se upravo dogodilo” with the day clock instead of simulated seconds (reuses the kit's EventLog look). */
function DayLog({ w }: { w: World }) {
  const shown = w.s.events.slice(-8).reverse()
  const glyph = { ok: '✓', warn: '!', bad: '✗', info: '→', neutral: '·' } as const
  const loud = shown.find((e) => e.tone === 'bad' || e.tone === 'warn')
  return (
    <div className="k-events">
      <div className="k-events__title">Što se upravo dogodilo</div>
      <ol>
        {shown.map((e) => (
          <li key={e.id} data-tone={e.tone}>
            <span className="k-events__t mono">{e.clock ?? ''}</span>
            <span className="k-events__text">
              <span className="k-events__glyph" aria-hidden="true">
                {glyph[e.tone]}
              </span>{' '}
              {prettyEventText(e.text)}
            </span>
          </li>
        ))}
        {shown.length === 0 && <li className="k-events__empty">Još ništa – pokrenite dan.</li>}
      </ol>
      <span className="visually-hidden" role="status">
        {loud ? `${loud.clock ?? ''} ${prettyEventText(loud.text)}` : ''}
      </span>
    </div>
  )
}
