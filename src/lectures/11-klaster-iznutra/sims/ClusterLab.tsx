import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  ControlGroup,
  Diagram,
  EventLog,
  Goals,
  Segmented,
  SimFrame,
  Slider,
  Stat,
  StatRow,
  StepBadge,
  Terminal,
  Toggle,
  fmt,
  stepColor,
  useSimulation,
  useWidth,
} from '../../../kit'
import {
  COMPRESSED,
  applyBarePod,
  applyReplicaSetReplicas,
  deletePod,
  fillNodes,
  apiPod,
  podStatus,
  podView,
  powerOffNode,
  powerOnNode,
  requestStats,
  setComponent,
  setKubelet,
  setReplicaSetImage,
  timelineIsLive,
  type ComponentName,
} from '../../../engines/cluster'
import { BAD_IMAGE, GOOD_IMAGE, INCIDENT_PRESET, KUBELET_NODE, POWER_NODE, SEED, actLab, createLab, isPullError, readLab, seekLab, stepLab, workerTpl, type Scenario } from '../model'
import { ClusterStage } from './ClusterStage'
import { WIDE_MIN_PX, stageGeo } from './stage'
import { chainOf, consoleLines, kubectlProblem, pickPod, shortPod } from './labView'
import styles from '../styles.module.css'

const COMPONENTS: { key: ComponentName; label: string }[] = [
  { key: 'apiServer', label: 'API poslužitelj' },
  { key: 'etcd', label: 'etcd' },
  { key: 'scheduler', label: 'raspoređivač' },
  { key: 'controllerManager', label: 'controller-manager' },
]

const START_REPLICAS: Record<Scenario, number> = { incident: 1, zdrav: 3 }

export function ClusterLab() {
  const [scenario, setScenario] = useState<Scenario>('incident')
  const [draft, setDraft] = useState(START_REPLICAS.incident)
  const [selected, setSelected] = useState<string | null>(null)
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const sim = useSimulation({ init: () => createLab(scenario), step: (lab, dt) => stepLab(lab, dt) })
  const lab = sim.state
  const s = lab.tl.state
  const c = s.components
  const layout = (width ?? 900) >= WIDE_MIN_PX ? 'wide' : 'narrow'
  const g = useMemo(() => stageGeo(layout), [layout])

  const rs = s.replicaSets.find((r) => r.name === 'klopa-api')
  const tagBad = rs?.template.image === BAD_IMAGE
  const ivina = s.pods.filter((p) => p.labels.app === 'ivina-proba' && !p.deletion)
  const worker = s.pods.find((p) => p.name === 'klopa-worker')
  const node2 = s.nodes.find((n) => n.name === KUBELET_NODE)
  const node3 = s.nodes.find((n) => n.name === POWER_NODE)
  const picked = pickPod(s, selected)
  const clicked = selected ? (s.pods.find((p) => p.name === selected && !p.deletion) ?? null) : null
  const pv = picked ? podView(s, picked) : null
  const req = requestStats(s, 10)
  const okPct = req.total > 0 ? fmt.pct(req.ok / req.total, 0) : 'n/a'
  const trafficMark = req.total === 0 ? '·' : req.ok === req.total ? '✓' : req.ok === 0 ? '✗' : '!'
  const traffic = { text: `${trafficMark} ${okPct} (10 s)`, tone: req.total === 0 || req.ok === req.total ? 'ok' : req.ok === 0 ? 'bad' : 'warn' } as const
  const klopa = s.pods.filter((p) => !p.deletion && (p.labels.app === 'klopa-api' || p.labels.app === 'klopa-worker'))
  // what kubectl STATUS says (a NotReady node's containers still count as Running)
  const running = klopa.filter((p) => podStatus(apiPod(p)) === 'Running').length
  const pendingN = s.pods.filter((p) => !p.deletion && p.nodeName === null).length
  const live = timelineIsLive(lab.tl)
  const chain = chainOf(lab)
  const problem = kubectlProblem(s)
  const brokenStillThere = !tagBad && s.pods.some((p) => p.labels.app === 'klopa-api' && !p.deletion && isPullError(p))

  const doAct = (label: string, fn: Parameters<typeof actLab>[2]) => sim.mutate((l) => actLab(l, label, fn))
  const read = (cmd: string) => sim.mutate((l) => readLab(l, cmd))
  const switchScenario = (v: Scenario) => {
    setScenario(v)
    setDraft(START_REPLICAS[v])
    setSelected(null)
    sim.mutate((l) => Object.assign(l, createLab(v)))
  }

  const d = lab.done
  const answer = (done: boolean, who: string) => (done ? <strong> → {who}</strong> : <span className={styles.qmark}> → ?</span>)
  const incidentGoals = [
    { text: <>klopa-api: iz ImagePullBackOff do Running</>, done: d.apiFixed },
    { text: <>klopa-worker: iz Pendinga do Running</>, done: d.workerFixed },
  ]
  const symptomGoals = [
    { text: <>Novi Pod zauvijek čeka, a mjesta ima{answer(d.schedPending, 'raspoređivač')}</>, done: d.schedPending },
    { text: <>Obrisani Pod nitko ne zamjenjuje{answer(d.cmNotReplaced, 'controller-manager')}</>, done: d.cmNotReplaced },
    { text: <>kubectl: „connection refused”{answer(d.apiRefused, 'API poslužitelj')}</>, done: d.apiRefused },
    { text: <>„etcdserver: request timed out”{answer(d.etcdTimeout, 'etcd')}</>, done: d.etcdTimeout },
    { text: <>Čvor NotReady, a kontejneri rade{answer(d.kubeletNotReady, 'kubelet')}</>, done: d.kubeletNotReady },
    { text: <>Bonus: zamjene drugdje, stari Podovi vise u Terminating</>, done: d.evicted },
  ]

  const notes: { tone: 'red' | 'pen' | 'green'; text: string }[] = []
  if (!live) notes.push({ tone: 'pen', text: 'Premotano: promjena sada briše sve što je bilo poslije ove točke.' })
  if (!c.apiServer) notes.push({ tone: 'red', text: 'API poslužitelj ne radi: kubectl ne može ništa, a Klopa i dalje odgovara.' })
  else if (!c.etcd) notes.push({ tone: 'red', text: 'etcd ne radi: nijedna promjena se ne može zapisati.' })
  if (!c.apiServer || !c.etcd) notes.push({ tone: 'pen', text: 'kubectl vidi zamrznuto stanje; crtež pokazuje stvarnost na čvorovima.' })
  if (brokenStillThere) notes.push({ tone: 'pen', text: 'Tag je popravljen u ReplicaSetu, ali postojeći Pod ga nema. Obrišite pokvareni Pod.' })
  if (node2 && !node2.kubeletUp && node2.machine === 'running')
    notes.push({ tone: 'red', text: node2.condition.ready === 'True' ? 'kubelet na node-2 ne javlja se… čvor će uskoro postati NotReady.' : 'node-2 je NotReady: kontejneri rade, ali promet na njih više ne ide.' })

  return (
    <SimFrame
        title="Klaster pod mikroskopom"
        subtitle={`početak: ${scenario === 'incident' ? `incident 11 · preset ${INCIDENT_PRESET}` : 'zdrav klaster'} · seed ${SEED}`}
        sim={sim}
        speeds={[0.25, 1, 4]}
        toolbar={<Badge tone={live ? 'neutral' : 'amber'}>{`t = ${fmt.num(s.t, 1)} s${live ? '' : ' · premotano'}`}</Badge>}
        hint="Riješite incident (popravite tag, kliknite pokvareni Pod i obrišite ga, oslobodite mjesto), a zatim gasite komponente jednu po jednu i povežite pet simptoma s krivcem. Brojke s kartice incidenta vrijede oko t = 60 s."
        controls={
          <>
            <ControlGroup title="Početno stanje">
              <Segmented
                label="Scenarij"
                value={scenario}
                options={[
                  { value: 'incident', label: 'Incident 11' },
                  { value: 'zdrav', label: 'Zdrav klaster' },
                ]}
                onChange={switchScenario}
              />
            </ControlGroup>
            <ControlGroup title="Lanin manifest">
              <Slider label="replicas (ReplicaSet – više u L13)" value={draft} min={0} max={9} onChange={setDraft} hint={`zapisano: ${rs?.replicas ?? 0}`} />
              <Button variant="primary" onClick={() => doAct(`kubectl apply · replicas: ${draft}`, (st) => applyReplicaSetReplicas(st, 'klopa-api', draft))}>
                kubectl apply
              </Button>
              {tagBad && (
                <Button variant="success" onClick={() => doAct('popravi tag', (st) => setReplicaSetImage(st, 'klopa-api', GOOD_IMAGE))}>
                  Popravi tag slike
                </Button>
              )}
              {!worker && (
                <Button
                  variant="success"
                  onClick={() =>
                    doAct('kubectl apply klopa-worker', (st) => {
                      const tpl = workerTpl()
                      if (tpl) applyBarePod(st, 'klopa-worker', tpl)
                    })
                  }
                >
                  Ponovno primijeni klopa-worker
                </Button>
              )}
            </ControlGroup>
            <ControlGroup title="Upravljačka ravnina">
              {COMPONENTS.map((k) => (
                <Toggle key={k.key} label={k.label} checked={c[k.key]} onChange={(on) => doAct(`${k.label} ${on ? 'uključen' : 'isključen'}`, (st) => setComponent(st, k.key, on))} />
              ))}
            </ControlGroup>
            <ControlGroup title="Čvor node-2">
              <Toggle
                label="kubelet na node-2"
                checked={!!node2?.kubeletUp}
                disabled={node2?.machine !== 'running'}
                onChange={(on) => doAct(`kubelet node-2 ${on ? 'uključen' : 'isključen'}`, (st) => setKubelet(st, KUBELET_NODE, on))}
              />
              <div className={styles.badges}>
                <span>NotReady nakon</span>
                <span className={`mono ${styles.timeTag}`}>{COMPRESSED.nodeMonitorGrace.label}</span>
                <span>brisanje Podova nakon</span>
                <span className={`mono ${styles.timeTag}`}>{COMPRESSED.podEvictionToleration.label}</span>
              </div>
            </ControlGroup>
            <ControlGroup title="Pokvarite">
              <Button variant="danger" onClick={() => doAct('krivi tag slike', (st) => setReplicaSetImage(st, 'klopa-api', BAD_IMAGE, { recreateOne: true }))}>
                Krivi tag slike
              </Button>
              <Button variant="danger" onClick={() => doAct('napuni čvorove', (st) => fillNodes(st))}>
                Napuni čvorove
              </Button>
              <Button
                variant="danger"
                disabled={!clicked}
                onClick={() => {
                  const name = clicked?.name
                  if (name) doAct(`obriši ${name}`, (st) => deletePod(st, name))
                }}
              >
                {clicked ? `Obriši Pod ${shortPod(clicked.name)}` : 'Obriši Pod (kliknite Pod)'}
              </Button>
              {node3?.machine === 'running' ? (
                <Button variant="danger" onClick={() => doAct('ugasi node-3', (st) => powerOffNode(st, POWER_NODE))}>
                  Ugasi čvor node-3
                </Button>
              ) : (
                <Button variant="success" onClick={() => doAct('upali node-3', (st) => powerOnNode(st, POWER_NODE))}>
                  Upali čvor node-3
                </Button>
              )}
              {ivina.length > 0 && (
                <Button
                  variant="success"
                  onClick={() => {
                    const names = ivina.map((p) => p.name)
                    doAct('obriši ivina-proba', (st) => names.forEach((n) => deletePod(st, n)))
                  }}
                >
                  Obriši Ivinu probu
                </Button>
              )}
            </ControlGroup>
            <ControlGroup title="Vremenska crta">
              <Slider label="Premotaj" value={s.t} min={lab.t0} max={Math.max(lab.t0 + 1, lab.tl.headT)} step={0.5} format={(v) => `${fmt.num(v, 1)} s`} onChange={(t) => sim.mutate((l) => seekLab(l, t))} />
              <Button variant="ghost" disabled={live} onClick={() => sim.mutate((l) => seekLab(l, l.tl.headT))}>
                Natrag na sada
              </Button>
            </ControlGroup>
          </>
        }
        stats={
          <>
            <StatRow>
              <Stat label="Podovi Running" value={`${running} od ${klopa.length}`} tone={running === klopa.length && running > 0 ? 'ok' : running > 0 ? 'warn' : 'bad'} />
              <Stat label="Pending" value={pendingN} tone={pendingN > 0 ? 'warn' : 'ok'} />
              <Stat label="uspjeh (10 s)" value={okPct} sub={`${req.ok} od ${req.total} zahtjeva`} tone={req.total === 0 ? 'neutral' : req.ok === req.total ? 'ok' : 'bad'} />
            </StatRow>
            <div className={styles.labGrid}>
              <div className={styles.goalsCol}>
                <Goals title="Incident 11" goals={incidentGoals} />
                <Goals title="Pet simptoma, pet krivaca" goals={symptomGoals} />
              </div>
              <EventLog events={s.events.slice(-12).map((e) => ({ t: e.t, text: shortEvent(e.text), tone: e.tone, id: e.id }))} max={8} />
            </div>
          </>
        }
      >
        <div ref={wrapRef}>
          <div style={layout === 'narrow' ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Diagram width={g.W} height={g.H} label="Klaster: upravljačka ravnina (API poslužitelj, etcd, controller-manager, raspoređivač) gore, tri čvora s agentom kubelet i Podovima dolje; numerirane poruke putuju preko API poslužitelja.">
              <ClusterStage s={s} g={g} selected={picked?.name ?? null} onSelect={setSelected} traffic={traffic} />
            </Diagram>
          </div>
        </div>
        {pv && (
          <p className={styles.podLine}>
            <span className="mono">{pv.name}</span> · <strong>{pv.status}</strong> · {pv.node ?? 'bez čvora'} · {pv.owner ? `vlasnik ${pv.owner}` : 'nema vlasnika (goli Pod)'}
            {pv.backoff && pv.backoff.kind === 'image' && ` · novi pokušaj povlačenja za ${fmt.num(pv.backoff.remainingS, 0)} s (odgoda ${fmt.num(pv.backoff.delayS, 0)} s)`}
            {pv.stale && pv.status !== pv.live.status && ` · kubectl vidi zamrznuto „${pv.status}”, a stvarno je ${pv.live.status}`}
            {pv.pendingMessage && (
              <>
                <br />
                <span className={`mono ${styles.small}`}>{pv.pendingMessage}</span>
              </>
            )}
          </p>
        )}
        {notes.length > 0 && (
          <ul className={styles.notes} aria-live="polite">
            {notes.map((n) => (
              <li key={n.text} data-tone={n.tone}>
                {n.text}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.consoleRow}>
          <div className={`k-card k-pinned ${styles.chain}`}>
            <div className={styles.chainHead}>Put zadnje izjave · poruke od zadnje naredbe</div>
            {problem && (
              <p className={styles.refused}>
                {problem === 'refused' ? 'Zadnja naredba nije stigla do API poslužitelja (connection refused) – na ploči se ništa nije promijenilo.' : 'API poslužitelj nije mogao zapisati promjenu u etcd (request timed out) – na ploči se ništa nije promijenilo.'}
              </p>
            )}
            {chain ? (
              <>
                <p className={`mono ${styles.small}`}>kubectl {chain.command}</p>
                <ol className={styles.chainList}>
                  {chain.rows.map((r) => (
                    <li key={r.step} className={r.count ? undefined : styles.chainTodo} data-tone={r.tone}>
                      <svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
                        <StepBadge n={r.step} x={17} y={17} r={12} color={r.count ? (r.step === 6 ? 'var(--ink)' : stepColor(r.step - 1)) : r.tone === 'bad' ? 'var(--red)' : r.tone === 'warn' ? 'var(--orange)' : 'var(--ink-3)'} />
                      </svg>
                      <span>
                        {r.tone && <span aria-hidden="true">{r.tone === 'bad' ? '✗ ' : '! '}</span>}
                        {r.from ? (
                          <>
                            <strong>{r.from}</strong> → {r.to}: {r.text}
                            {r.count > 1 ? ` ×${r.count}` : ''}
                          </>
                        ) : (
                          r.text
                        )}
                        {r.step === 2 && chain.reply && (
                          <span className={styles.reply}>
                            {' '}
                            ↩ ovdje kubectl ispisuje <span className="mono">{chain.reply}</span>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {chain.others && <p className={styles.chainOthers}>istodobno, za druge Podove: {chain.others}</p>}
              </>
            ) : (
              <p className={styles.hintText}>Pritisnite „kubectl apply” ili obrišite Pod pa pratite brojeve.</p>
            )}
          </div>
          <div className={styles.console}>
            <div className={styles.consoleButtons} role="group" aria-label="Naredbe kubectl">
              <Button size="sm" onClick={() => read('kubectl get pods -o wide')}>
                get pods
              </Button>
              <Button size="sm" onClick={() => read('kubectl get nodes')}>
                get nodes
              </Button>
              <Button size="sm" onClick={() => read('kubectl get events')}>
                get events
              </Button>
              <Button size="sm" disabled={!picked} onClick={() => picked && read(`kubectl describe pod ${picked.name}`)}>
                describe pod
              </Button>
            </div>
            <Terminal title="Lanin laptop · kubectl" animate={false} lines={consoleLines(s)} />
          </div>
        </div>
    </SimFrame>
  )
}

/** The kit writes events by hand (Caveat, ≤ ~90 characters): keep the first clause of the engine's long texts. */
function shortEvent(text: string): string {
  return text.length > 90 ? text.split(' – ')[0] : text
}
