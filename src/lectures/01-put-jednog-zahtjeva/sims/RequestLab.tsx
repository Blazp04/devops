/**
 * Flagship simulation: "Put jednog zahtjeva" — a packet tracer. Pick where Klopa runs, who sends the request and
 * where the server stands; break one layer at a time and watch where the tray stops, the stopwatch and the
 * waterfall. Model: ../model.ts (deterministic; the seed only picks source ports). Playback: ../lab.ts.
 */
import { useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Play, RotateCcw } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, RoughBox, Segmented, Select, SimFrame, Stat, StatRow, StickyNote, Toggle, useSimulation, useWidth } from '../../../kit'
import { NARROW, WIDE, WIDE_MIN, segSeconds } from '../geometry'
import { createLab, emptySeen, finishNow, startTrace, stepBack, stepForward, stepLab, type LabState } from '../lab'
import {
  INCIDENT_FAULTS,
  IP,
  LAYER_LABEL,
  OUTCOME_LABEL,
  PLACES,
  PLACE_ORDER,
  faultApplies,
  fmtMs,
  msAt,
  urlOf,
  type ClientId,
  type Faults,
  type Place,
  type Scenario,
  type TraceParams,
} from '../model'
import { RouteStage } from './RouteStage'
import { Waterfall } from './Waterfall'
import styles from '../styles.module.css'

/** the incident card's preset: Klopa on Lana's laptop, Petra on mobile data */
const SEED = 1

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'laptop', label: 'Lanin laptop' },
  { value: 'vps', label: 'VPS bez proxyja' },
  { value: 'proxy', label: 'VPS s proxyjem' },
]

const FAULTS: { key: keyof Faults; label: string; hint: string; off: string }[] = [
  { key: 'nxdomain', label: 'Ime ne postoji (NXDOMAIN)', hint: 'domena klopa.example ne postoji (npr. istekla)', off: 'adresa je IP – nema DNS-a' },
  { key: 'stale', label: 'Zapis pokazuje na staru IP adresu', hint: `zapis A → ${IP.old}`, off: 'adresa je IP – nema DNS-a' },
  { key: 'drop', label: 'Vatrozid tiho odbacuje (DROP)', hint: 'paketi na port nestaju bez odgovora', off: 'paket ionako ne stiže do stana' },
  { key: 'appDown', label: 'Aplikacija ne radi', hint: 'gunicorn je ugašen', off: '' },
  { key: 'loopbackOnly', label: 'Sluša samo na 127.0.0.1', hint: 'gunicorn bez --bind (zadano)', off: '' },
]

function clientOptions(scenario: Scenario): { value: ClientId; label: string }[] {
  return [
    { value: 'petra', label: `Petra → ${urlOf(scenario, 'petra').replace('http://', '')}` },
    { value: 'petra-localhost', label: 'Petra → localhost:8000' },
    { value: 'lana-local', label: scenario === 'laptop' ? 'Lana (laptop) → localhost:8000' : 'Lana (ssh) → localhost:8000' },
  ]
}

export function RequestLab() {
  const [scenario, setScenario] = useState<Scenario>('laptop')
  const [client, setClient] = useState<ClientId>('petra')
  const [place, setPlace] = useState<Place>('frankfurt')
  const [faults, setFaults] = useState<Faults>(INCIDENT_FAULTS)
  const [dnsCached, setDnsCached] = useState(false)
  // goal progress survives "ispočetka" (the SimFrame reset recreates the lab state)
  const [seen] = useState(emptySeen)
  const [ref, w] = useWidth<HTMLDivElement>()
  const geo = w !== null && w < WIDE_MIN ? NARROW : WIDE
  const reduce = !!useReducedMotion()
  const params: TraceParams = { scenario, client, place, faults, dnsCached, seed: SEED }

  const sim = useSimulation<LabState>({
    init: () => {
      const s = createLab(params, seen)
      if (reduce) finishNow(s)
      return s
    },
    step: (s, dt) => stepLab(s, dt, (seg) => segSeconds(seg, s.trace.params.scenario, geo)),
  })

  const send = (p: TraceParams) => {
    sim.mutate((s) => {
      startTrace(s, p)
      if (reduce) finishNow(s)
    })
    if (!reduce && !sim.running) sim.play()
  }
  const update = (patch: Partial<TraceParams>) => send({ ...params, ...patch })

  const changeScenario = (v: Scenario) => {
    setScenario(v)
    update({ scenario: v })
  }
  const changeClient = (v: ClientId) => {
    setClient(v)
    update({ client: v })
  }
  const changePlace = (v: Place) => {
    setPlace(v)
    update({ place: v })
  }
  const changeFault = (k: keyof Faults, v: boolean) => {
    const next = { ...faults, [k]: v }
    setFaults(next)
    update({ faults: next })
  }
  const changeCached = (v: boolean) => {
    setDnsCached(v)
    update({ dnsCached: v })
  }
  const loadIncident = () => {
    setScenario('laptop')
    setClient('petra')
    setFaults(INCIDENT_FAULTS)
    setDnsCached(false)
    send({ scenario: 'laptop', client: 'petra', place, faults: INCIDENT_FAULTS, dnsCached: false, seed: SEED })
  }
  const forward = () => {
    sim.pause()
    sim.mutate((s) => stepForward(s))
  }
  const back = () => {
    sim.pause()
    sim.mutate((s) => stepBack(s))
  }

  const s = sim.state
  const t = s.trace
  const head = s.head
  const seg = t.segs[Math.min(head.seg, t.segs.length - 1)]
  const now = head.done ? t.total : msAt(t, head.seg, head.frac)
  // while the app works (no packet on the wire) keep showing the last packet's header
  let header = seg?.header
  for (let i = Math.min(head.seg, t.segs.length) - 1; !header && i >= 0; i--) header = t.segs[i].header
  const done = head.done
  const who = t.params.client === 'lana-local' ? (t.params.scenario === 'laptop' ? 'Lana (laptop)' : 'Lana (ssh)') : 'Petra'
  const resultTone = !done ? 'neutral' : t.outcome === 'ok' ? 'ok' : 'bad'
  const noPath = t.outcome === 'nxdomain' ? 'nijedan paket nije krenuo prema poslužitelju' : t.params.client === 'petra' && t.params.scenario === 'laptop' ? 'nema puta do privatne adrese' : null
  const ariaLabel = `Put zahtjeva: ${who} otvara ${t.url}. ${done ? `Rezultat: ${OUTCOME_LABEL[t.outcome]} nakon ${fmtMs(t.total)}.` : seg ? seg.note : ''}`

  return (
    <SimFrame
      title="put jednog zahtjeva"
      subtitle="Paket po paket: DNS, TCP, TLS i HTTP. Crtež nije u mjerilu – stvarno vrijeme mjere štoperica i vodopad."
      sim={sim}
      hint="ovo je Petrin problem s početka. Preselite Klopu na VPS i dovedite zahtjev do 200 OK, a zatim kvarite jedan po jedan sloj i gledajte gdje pladanj stane i koliko Petra čeka."
      controls={
        <>
          <ControlGroup title="Poslužitelj">
            <Segmented size="sm" label="Gdje radi Klopa" value={scenario} options={SCENARIOS} onChange={changeScenario} />
            {scenario === 'laptop' ? (
              <p className={styles.controlNote}>Laptop je u Laninu stanu u Zagrebu, iza kućnog usmjerivača.</p>
            ) : (
              <Select
                label="Lokacija poslužitelja"
                value={place}
                options={PLACE_ORDER.map((p) => ({ value: p, label: `${PLACES[p].label} · RTT ≥ ${fmtMs(PLACES[p].rtt)}` }))}
                onChange={changePlace}
              />
            )}
          </ControlGroup>
          <ControlGroup title="Tko šalje zahtjev">
            <Select label="Klijent i adresa" value={client} options={clientOptions(scenario)} onChange={changeClient} />
            <Toggle
              label="DNS odgovor je u predmemoriji"
              checked={dnsCached}
              onChange={changeCached}
              disabled={scenario === 'laptop' || client !== 'petra'}
              hint={scenario === 'laptop' || client !== 'petra' ? 'ovdje se DNS ne pita' : 'mobitel ga pamti dok traje TTL'}
            />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            {FAULTS.map((fd) => {
              const applies = faultApplies(scenario, fd.key)
              return (
                <Toggle
                  key={fd.key}
                  label={fd.label}
                  checked={faults[fd.key]}
                  onChange={(v) => changeFault(fd.key, v)}
                  disabled={!applies}
                  hint={applies ? (fd.key === 'loopbackOnly' && scenario === 'proxy' ? 'iza proxyja to je i preporučeno' : fd.hint) : fd.off}
                />
              )
            })}
          </ControlGroup>
          <div className={styles.buttonRow}>
            <Button variant="primary" icon={Play} onClick={() => send(params)}>
              Pošalji zahtjev
            </Button>
            <Button size="sm" icon={ChevronLeft} onClick={back} title="Natrag na prethodni korak">
              Korak natrag
            </Button>
            <Button size="sm" icon={ChevronRight} onClick={forward} disabled={done} title="Završi ovaj korak">
              Korak naprijed
            </Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={loadIncident} title="Preset lanin-laptop, seed 1: Klopa na Laninu laptopu, Petra na mobilnim podatcima">
              Incident #1
            </Button>
          </div>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="štoperica" value={fmtMs(now)} sub={done ? 'do odgovora ili greške' : `${who.split(' ')[0]} čeka…`} />
            <Stat
              label="RTT, donja granica"
              value={noPath ? '—' : t.rtt > 0 ? fmtMs(t.rtt) : '≈ 0 ms'}
              sub={noPath ?? (t.rtt > 0 ? `Zagreb → ${PLACES[t.params.place].label} · stvarni je veći` : 'isto računalo, bez mreže')}
            />
            <Stat label="rezultat" value={done ? OUTCOME_LABEL[t.outcome] : '…'} tone={resultTone} sub={done && t.layer ? `sloj: ${LAYER_LABEL[t.layer]}` : done ? 'sve je prošlo' : ' '} />
          </StatRow>

          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Dovedite Petrin zahtjev do odgovora 200 OK.', done: s.seen.okPetra },
                { text: 'Izazovite odbijenu vezu i istek vremena pa usporedite koliko je Petra čekala.', done: s.seen.refused && s.seen.timeout },
                { text: 'Izazovite NXDOMAIN: preglednik ne zna ni kamo poslati paket.', done: s.seen.nxdomain },
                { text: 'Neka Caddy odgovori 502 umjesto aplikacije.', done: s.seen.badGateway },
                { text: 'Pošaljite HTTPS zahtjev u Sydney. Koliko traje do prvog bajta?', done: s.seen.sydney },
              ]}
            />
            <EventLog events={s.events} max={7} title="Što se upravo dogodilo (lijevo: vrijeme animacije)" />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <RoughBox className={styles.urlbar} stroke="var(--ink-3)" strokeWidth={1.4} seed={9002} pad={1}>
          <span className={styles.urlwho}>{who} upisuje</span>
          <code className={styles.url}>{t.url}</code>
        </RoughBox>
        <div style={geo === NARROW ? { maxWidth: 460, width: '100%', margin: '0 auto' } : undefined}>
          <RouteStage geo={geo} trace={t} head={head} idPrefix="l01lab" ariaLabel={ariaLabel} />
        </div>
        {done ? (
          <StickyNote c={t.outcome === 'ok' ? 'green' : 'pink'} className={styles.result}>
            <p className={styles.resultHead} data-tone={t.outcome === 'ok' ? 'ok' : 'bad'}>
              <span aria-hidden="true">{t.outcome === 'ok' ? '✓' : '✗'}</span> {who === 'Petra' ? 'Petrin preglednik' : 'Lanin terminal'}: <code>{who === 'Petra' ? t.browser.code : t.curl}</code> nakon {fmtMs(t.total)}
            </p>
            <p className={styles.resultText}>{t.explain}</p>
          </StickyNote>
        ) : (
          <StickyNote c="blue" className={styles.ticker}>
            <p className={styles.tickerNote}>{seg?.note}</p>
            {header && (
              <p className={styles.tickerHeader}>
                <span>paket</span> <code>{header}</code>
              </p>
            )}
          </StickyNote>
        )}
        <Waterfall trace={t} nowMs={now} caption={t.timeoutNote ? `Istek vremena: ${t.timeoutNote}.` : 'Os ide do kraja ovog zahtjeva; iscrtkani dio HTTP-a je obrada u aplikaciji.'} />
      </div>
    </SimFrame>
  )
}
