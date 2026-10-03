import { useState } from 'react'
import { Badge, Button, ControlGroup, EventLog, Goals, Legend, Segmented, SimFrame, Stat, StatRow, Toggle, fmt, plural, useSimulation, useWidth } from '../../../kit'
import {
  COMPRESSED,
  deletePod,
  getEndpointSlice,
  requestStats,
  setPodLabel,
  setPodReadiness,
  setServiceSelectorByName,
  setServiceSessionAffinity,
  setServiceTypeByName,
  setTrafficClient,
  setTrafficEnabled,
  setTrafficTarget,
  type ClusterState,
} from '../../../engines/cluster'
import { STREAM, SVC, stageView, type StagePod } from '../lab'
import {
  breakSelector,
  createLabSim,
  failReadiness,
  hardcodeIpAndRoll,
  labEvents,
  nextVersion,
  note,
  preStopOn,
  rebuildLabSim,
  rollOut,
  rolling,
  setPreStop,
  stepLabSim,
  templateVersion,
  traceOne,
  type LabSim,
} from '../labsim'
import { WIDE_MIN_PX } from '../stage'
import { ServiceStage } from './ServiceStage'
import css from '../styles.module.css'

export type LabVariant = 'labels' | 'ready' | 'full'

type ClientMode = 'per' | 'one' | 'four'

const CLIENT_OPTIONS: { value: ClientMode; label: string; title: string }[] = [
  { value: 'per', label: 'nova po zahtjevu', title: 'Svaki zahtjev otvara novu vezu' },
  { value: 'one', label: '1 dugotrajna', title: 'keep-alive: jedna dugotrajna veza za sve zahtjeve' },
  { value: 'four', label: '4 veze', title: 'keep-alive: 4 dugotrajne veze koje se izmjenjuju' },
]

const FAILED_FORMS: [string, string, string] = ['neuspio zahtjev', 'neuspjela zahtjeva', 'neuspjelih zahtjeva']

/** The stage's line marks, as the drawing draws them (labels lab: no readiness, no shutdown). */
const LEGEND_FULL = [
  { shape: 'line' as const, color: 'var(--green)', label: 'u pravilima – dobiva promet' },
  { shape: 'cross' as const, color: 'var(--ink-3)', label: 'iscrtkano s ✗: u EndpointSliceu, ready: false' },
  { shape: 'dashed' as const, color: 'var(--orange)', label: 'iscrtkano narančasto: gasi se (terminating)' },
  { shape: 'line' as const, color: 'var(--orange)', label: '„!”: izbačen, ali pravila kasne 1 s (sim)' },
  { shape: 'dashed' as const, color: 'var(--pen)', label: 'točkasto: novi, pravila ga još nemaju' },
]
const LEGEND_LABELS = [LEGEND_FULL[0], LEGEND_FULL[4], LEGEND_FULL[3]]

function clientModeOf(c: ClusterState): ClientMode {
  const st = c.traffic.find((x) => x.id === STREAM)
  if (!st?.keepAlive) return 'per'
  return st.keepAlive.connections > 1 ? 'four' : 'one'
}

function maxAgeOf(c: ClusterState): boolean {
  const st = c.traffic.find((x) => x.id === STREAM)
  return !!st?.keepAlive?.maxAgeS
}

function applyClient(st: LabSim, mode: ClientMode, maxAge: boolean): void {
  if (mode === 'per') setTrafficClient(st.c, STREAM, { mode: 'per-request' })
  else setTrafficClient(st.c, STREAM, { mode: 'keep-alive', connections: mode === 'four' ? 4 : 1, maxAgeS: maxAge ? 2 : null })
}

function setSelectorKey(st: LabSim, key: 'app' | 'version', value: string | null): void {
  const sel = { ...st.c.services[0].selector }
  if (value === null) delete sel[key]
  else sel[key] = value
  setServiceSelectorByName(st.c, SVC, sel)
}

function Yes({ on }: { on: boolean }) {
  return <span className={on ? css.yes : css.no}>{on ? '✓ true' : '✗ false'}</span>
}

/** EndpointSlice of klopa-api as `kubectl get endpointslice -o yaml` would list the conditions. */
function SliceTable({ c }: { c: ClusterState }) {
  const eps = getEndpointSlice(c, SVC)
  return (
    <div className={css.tableWrap} tabIndex={0} role="region" aria-label="EndpointSlice Servicea klopa-api">
      <table className={css.slice}>
        <caption>EndpointSlice klopa-api</caption>
        <thead>
          <tr>
            <th scope="col">Pod</th>
            <th scope="col">IP</th>
            <th scope="col">ready</th>
            <th scope="col">serving</th>
            <th scope="col">terminating</th>
          </tr>
        </thead>
        <tbody>
          {eps.length === 0 ? (
            <tr>
              <td colSpan={5} className={css.no}>
                (prazno – selektor ne odgovara nijednom Podu)
              </td>
            </tr>
          ) : (
            eps.map((e) => (
              <tr key={e.podId}>
                <td>…{e.podName.split('-').pop()}</td>
                <td>{e.ip}</td>
                <td>
                  <Yes on={e.ready} />
                </td>
                <td>
                  <Yes on={e.serving} />
                </td>
                <td>{e.terminating ? <span className={css.warn}>! true</span> : <span>false</span>}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Controls for the Pod picked on the stage; always the same controls (disabled until a Pod is picked), so the panel keeps its height. */
function PickedPod({ st, pod, mutate, labelsOnly }: { st: LabSim; pod: StagePod | undefined; mutate: (fn: (x: LabSim) => void) => void; labelsOnly: boolean }) {
  const live = pod ? st.c.pods.find((p) => p.id === pod.id) : undefined
  const readyOk = live?.readyOverride !== false
  const v = live?.spec.app.version ?? '1.4.0'
  const probe = st.opts.readinessProbe !== false
  return (
    <>
      {pod ? <div className={css.picked}>…{pod.short}</div> : <p className={css.muted}>Kliknite Pod na crtežu da ga odaberete.</p>}
      <Toggle
        label="oznaka app=klopa-api"
        checked={!!pod && pod.app === 'klopa-api'}
        disabled={!pod}
        onChange={(on) => pod && mutate((x) => void setPodLabel(x.c, pod.name, 'app', on ? 'klopa-api' : null))}
      />
      {labelsOnly && (
        <Toggle
          label={`oznaka version=${v}`}
          checked={!!pod && pod.version !== null}
          disabled={!pod}
          onChange={(on) => pod && mutate((x) => void setPodLabel(x.c, pod.name, 'version', on ? v : null))}
        />
      )}
      {!labelsOnly && (
        <Toggle
          label="/ready odgovara 200"
          checked={!!pod && readyOk}
          disabled={!pod}
          onChange={(on) =>
            pod &&
            mutate((x) => {
              setPodReadiness(x.c, pod.name, on ? null : false)
              if (on) note(x, `${pod.name}: /ready opet odgovara 200`, 'info')
              else if (!probe) note(x, `${pod.name}: /ready vraća 503 – ali bez provjere spremnosti nitko ne pita /ready, pa Pod i dalje dobiva promet`, 'bad')
              else note(x, `${pod.name}: /ready vraća 503 – Pod radi dalje, ali uskoro ready: false`, 'warn')
            })
          }
        />
      )}
      {!labelsOnly && (
        <Button size="sm" onClick={() => pod && !pod.terminating && mutate((x) => void deletePod(x.c, pod.name))} disabled={!pod}>
          {pod?.terminating ? 'Pod se gasi…' : 'Obriši Pod'}
        </Button>
      )}
    </>
  )
}

const HINTS: Record<LabVariant, string> = {
  labels: 'Promijenite selektor u app=klopa-apii pa pogledajte linije. Zatim kliknite Pod i odlijepite mu oznaku app.',
  ready: 'Uvedite 1.4.0 s provjerom spremnosti, pa odaberite „bez provjere” i uvedite opet. Usporedite neuspjele zahtjeve (stari Podovi već imaju preStop – više u 6. odjeljku).',
  full: 'Riješite četiri zadatka ispod crteža. Gumbi s munjom kvare Service – svaki kvar popravite.',
}

const TITLES: Record<LabVariant, string> = {
  labels: 'Selektor bira Podove',
  ready: 'Samo spremni dobivaju promet',
  full: 'Laboratorij selektora i put paketa',
}

/** The Service lab on E3 (klopa-web → Service klopa-api → Pods), in three sizes: labels, readiness, everything. */
export function ServiceLab({ variant }: { variant: LabVariant }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [picked, setPicked] = useState<string | null>(null)
  const sim = useSimulation<LabSim>({
    init: () =>
      createLabSim(
        variant === 'labels'
          ? { staging: true, rps: 12 }
          : // scene 2 varies only the readiness probe: the old Pods already have preStop (scene 6), so the shutdown side is clean
            variant === 'ready'
            ? { version: '1.3.2', sigterm: 'exit', preStopSleepS: 5, readinessProbe: true }
            : { version: '1.4.0' },
      ),
    step: (st, dt) => stepLabSim(st, dt),
  })
  const st = sim.state
  const c = st.c
  const view = stageView(c)
  const kind = w !== null && w >= WIDE_MIN_PX ? 'wide' : 'narrow'
  const req = requestStats(c, 10)
  const failed = req.total - req.ok
  const pod = view.pods.find((p) => p.name === picked)
  const sel = view.svc.selector
  const mode = clientModeOf(c)
  const maxAge = maxAgeOf(c)
  const stream = c.traffic.find((x) => x.id === STREAM)
  const flowing = stream?.enabled !== false
  const probe = st.opts.readinessProbe !== false
  const nv = nextVersion(st)
  const last = st.rollout
  const busy = rolling(st)
  const lastReq = last?.rec ? last.rec.requests : null
  // a rollout while klopa-web dials a Pod IP: the Service carried no traffic, so its „0 failed” means nothing
  const bypassed = !!view.targetIp || !!last?.viaIp || (lastReq !== null && lastReq.ok + lastReq.failed === 0 && !!last?.reported)
  const lastFailed = lastReq && !bypassed ? lastReq.failed : null
  const selectorBroken = sel.app === 'klopa-apii'
  const mutate = (fn: (x: LabSim) => void) => sim.mutate(fn)
  const waitNote = (x: LabSim) => note(x, 'Uvođenje je u tijeku – pričekajte da završi', 'info')

  const selectorControls = (
    <>
      <Segmented
        label="selector: app ="
        value={sel.app ?? 'klopa-api'}
        options={[
          { value: 'klopa-api', label: 'klopa-api' },
          { value: 'klopa-apii', label: 'klopa-apii' },
        ]}
        onChange={(v) => mutate((x) => setSelectorKey(x, 'app', v))}
        size="sm"
      />
      {variant !== 'ready' && (
        <Segmented
          label="selector: version ="
          value={sel.version ?? 'bez'}
          options={[
            { value: 'bez', label: '(ne traži)' },
            { value: '1.4.0', label: '1.4.0' },
            { value: '1.4.1', label: '1.4.1' },
          ]}
          onChange={(v) => mutate((x) => setSelectorKey(x, 'version', v === 'bez' ? null : v))}
          size="sm"
        />
      )}
    </>
  )

  const controls = (
    <>
      {variant !== 'ready' && <ControlGroup title="Service klopa-api">{selectorControls}</ControlGroup>}
      {variant === 'full' && (
        <ControlGroup title="Pokvarite">
          {selectorBroken ? (
            <Button size="sm" variant="success" onClick={() => mutate((x) => setSelectorKey(x, 'app', 'klopa-api'))}>
              Popravi selektor
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => mutate((x) => breakSelector(x))}>
              Pokvari selektor
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => mutate((x) => void failReadiness(x))}>
            Sruši provjeru spremnosti
          </Button>
          {view.targetIp ? (
            <Button
              size="sm"
              variant="success"
              onClick={() =>
                mutate((x) => {
                  setTrafficTarget(x.c, STREAM, null)
                  note(x, 'klopa-web opet zove ime klopa-api – Service bira spreman Pod', 'ok')
                })
              }
            >
              Koristi ime klopa-api
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => mutate((x) => (rolling(x) ? waitNote(x) : hardcodeIpAndRoll(x)))}>
              Upiši IP pa uvedi novu verziju
            </Button>
          )}
        </ControlGroup>
      )}
      {variant === 'ready' && (
        <ControlGroup title="Deployment klopa-api">
          <Segmented
            label="readinessProbe u predlošku"
            value={probe ? 's' : 'bez'}
            options={[
              { value: 's', label: 's provjerom' },
              { value: 'bez', label: 'bez provjere' },
            ]}
            onChange={(v) =>
              mutate((x) => {
                rebuildLabSim(x, { ...x.opts, readinessProbe: v === 's' })
                note(x, v === 's' ? 'Novi klaster: Podovi imaju provjeru spremnosti (/ready)' : 'Novi klaster: Podovi nemaju provjeru spremnosti – spremni su čim se proces pokrene', 'info')
              })
            }
            size="sm"
          />
          <Button variant="primary" onClick={() => mutate((x) => (rolling(x) ? waitNote(x) : rollOut(x, templateVersion(x) === '1.3.2' ? '1.4.0' : '1.3.2')))}>
            {busy ? 'Uvođenje u tijeku…' : templateVersion(st) === '1.3.2' ? 'Uvedi 1.4.0' : 'Vrati 1.3.2'}
          </Button>
        </ControlGroup>
      )}
      <ControlGroup title="Odabrani Pod">
        <PickedPod st={st} pod={pod} mutate={mutate} labelsOnly={variant === 'labels'} />
      </ControlGroup>
      {variant === 'full' && (
        <>
          <ControlGroup title="Uvođenje i gašenje">
            <Button variant="primary" onClick={() => mutate((x) => (rolling(x) ? waitNote(x) : rollOut(x)))}>
              {busy ? 'Uvođenje u tijeku…' : nv === '1.4.1' ? 'Uvedi 1.4.1' : 'Vrati 1.4.0'}
            </Button>
            <Toggle label="preStop: sleep 5 (novo uvođenje)" checked={preStopOn(st)} onChange={(on) => mutate((x) => (rolling(x) ? waitNote(x) : setPreStop(x, on)))} />
          </ControlGroup>
          <ControlGroup title="Klijent klopa-web (veze)" collapsible>
            <Segmented label="Veze prema Serviceu" value={mode} options={CLIENT_OPTIONS} onChange={(v) => mutate((x) => applyClient(x, v, maxAgeOf(x.c)))} size="sm" />
            <Toggle
              label="zatvori vezu nakon 2 s"
              checked={maxAge}
              onChange={(on) => mutate((x) => applyClient(x, clientModeOf(x.c), on))}
              disabled={mode === 'per'}
            />
            <Toggle label="stalni promet (20/s)" checked={flowing} onChange={(on) => mutate((x) => void setTrafficEnabled(x.c, STREAM, on))} />
          </ControlGroup>
          <ControlGroup title="Vrsta i afinitet" collapsible>
            <Segmented
              label="type"
              value={view.svc.type}
              options={[
                { value: 'ClusterIP', label: 'ClusterIP' },
                { value: 'NodePort', label: 'NodePort' },
                { value: 'LoadBalancer', label: 'LoadBalancer' },
              ]}
              onChange={(v) => mutate((x) => void setServiceTypeByName(x.c, SVC, v as 'ClusterIP' | 'NodePort' | 'LoadBalancer'))}
              size="sm"
            />
            <Toggle
              label="sessionAffinity: ClientIP"
              checked={view.svc.affinity === 'ClientIP'}
              onChange={(on) => mutate((x) => void setServiceSessionAffinity(x.c, SVC, on ? 'ClientIP' : 'None'))}
            />
          </ControlGroup>
        </>
      )}
      {variant === 'ready' && (
        <ControlGroup title="Pokvarite">
          <Button variant="danger" onClick={() => mutate((x) => void failReadiness(x))}>
            Sruši provjeru spremnosti
          </Button>
        </ControlGroup>
      )}
    </>
  )

  const goals =
    variant === 'full'
      ? [
          { text: 'Pokvarite selektor pa popravite Service bez endpointa', done: st.fixedEmpty },
          { text: 'Uvedite 1.4.1 bez ijednog neuspjelog zahtjeva', done: st.cleanRollout },
          { text: 'Rasporedite dugotrajne (keep-alive) veze na sva 4 Poda', done: st.spread },
          { text: 'Pošaljite jedan zahtjev i pratite njegov put', done: st.traced !== null },
        ]
      : variant === 'ready'
        ? [
            { text: 'Uvedite 1.4.0 s provjerom spremnosti', done: !!st.results.s },
            { text: 'Uvedite 1.4.0 bez provjere spremnosti', done: !!st.results.bez },
          ]
        : [
            { text: 'Napravite tipkarsku pogrešku u selektoru: 0 endpointa', done: st.sawEmpty },
            { text: 'Vratite selektor: promet opet teče', done: st.fixedEmpty },
          ]

  const result = (key: 's' | 'bez', label: string) => {
    const r = st.results[key]
    if (!r) return <Badge tone="neutral">{label}: –</Badge>
    return (
      <Badge tone={r.failed ? 'bad' : 'ok'}>
        {r.failed ? '✗' : '✓'} {label}: {plural(r.failed, FAILED_FORMS)}
      </Badge>
    )
  }

  return (
    <SimFrame
      title={TITLES[variant]}
      sim={sim}
      showTime
      hint={
        <>
          {HINTS[variant]} <span style={{ whiteSpace: 'nowrap' }}>{variant === 'labels' ? 'kube-proxy kasni 1 s (sim).' : `Provjera spremnosti: ${COMPRESSED.rolloutReadinessPeriod.label}.`}</span>
        </>
      }
      controls={controls}
      stats={
        <>
          <StatRow>
            <Stat label="Spremni endpointi" value={`${view.readyCount}/${view.sliceCount}`} sub="ready / u EndpointSliceu" tone={view.readyCount === 0 ? 'bad' : 'ok'} />
            <Stat label="Uspješno (10 s)" value={req.total ? fmt.pct(req.ok / req.total, 0) : '–'} sub={`${req.ok} od ${req.total} zahtjeva`} />
            <Stat
              label="Neuspjelo (10 s)"
              value={failed}
              tone={failed > 0 ? 'bad' : 'ok'}
              sub={
                view.targetIp
                  ? `greška veze (upisana IP adresa): ${req.errors.refused + req.errors.timeout} · 503: ${req.errors.http503}`
                  : `0 endpointa: ${req.errors.noEndpoints} · odbijena veza: ${req.errors.refused} · 503: ${req.errors.http503}`
              }
            />
            {variant !== 'labels' && (
              <Stat
                label="Zadnje uvođenje (kroz Service)"
                value={lastFailed === null ? '–' : lastFailed}
                sub={
                  !last
                    ? 'još nije pokrenuto'
                    : bypassed
                      ? view.targetIp
                        ? 'klopa-web zaobilazi Service – zove upisanu IP adresu'
                        : 'promet tog uvođenja nije išao kroz Service'
                      : `neuspjelih · ${last.kind === 'version' ? last.version : 'preStop'} · ${last.reported ? 'gotovo' : 'u tijeku'}`
                }
                tone={bypassed ? 'bad' : lastFailed ? 'bad' : lastFailed === 0 ? 'ok' : 'neutral'}
              />
            )}
          </StatRow>
          {variant === 'full' && (
            <div className={css.trace}>
              <div className={css.traceHead}>
                <Button size="sm" onClick={() => mutate((x) => traceOne(x))}>
                  Pošalji zahtjev
                </Button>
                <p className={css.muted}>
                  {st.traced ? `Put zadnjeg poslanog zahtjeva${st.traced.pod ? ` (Pod …${st.traced.pod.split('-').pop()})` : ''}:` : 'Pošaljite jedan zahtjev da vidite njegov put.'}
                </p>
              </div>
              {st.traced &&
                (st.traced.hops ? (
                  <ol className={css.hops}>
                    {st.traced.hops.map((h) => (
                      <li key={h.step}>
                        {h.label}
                        <br />
                        <span className={css.addr}>
                          {h.src} → {h.dst}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={css.muted}>klopa-web zove upisanu IP adresu izravno – nema DNS-a ni Servicea.</p>
                ))}
            </div>
          )}
          <div className={css.statsGrid}>
            <Goals goals={goals} />
            <EventLog events={labEvents(st)} max={6} />
          </div>
        </>
      }
    >
      <div ref={ref} style={{ marginBottom: 'auto' }}>
        <div className={kind === 'wide' ? css.stageWide : css.stageNarrow}>
          <ServiceStage
            s={c}
            view={view}
            kind={kind}
            selected={picked}
            onSelect={(n) => setPicked((p) => (p === n ? null : n))}
            traced={st.traced?.id ?? null}
            label={`Klijent klopa-web na čvoru node-1 i Service klopa-api sa selektorom ${Object.entries(sel)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}; ${view.readyCount} od ${view.pods.length} Podova prima promet.`}
          />
        </div>
        <Legend items={variant === 'labels' ? LEGEND_LABELS : LEGEND_FULL} />
        {variant !== 'labels' && (
          <div className={css.statsGrid}>
            <SliceTable c={c} />
            {variant === 'ready' && (
              <div className={css.results}>
                {result('s', 's provjerom')}
                {result('bez', 'bez provjere')}
              </div>
            )}
          </div>
        )}
      </div>
    </SimFrame>
  )
}
