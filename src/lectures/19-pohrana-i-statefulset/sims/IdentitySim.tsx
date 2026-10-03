/**
 * Flagship part 2 „Deployment ili StatefulSet?” on the E3 engine (presetStorage part 'statefulset', seed 42):
 * the StatefulSet db (ordinals, one PVC each, headless Service, never two db-N) next to a Postgres Deployment with
 * replicas: 3 (no volume = three databases behind one Service, or one shared RWO PVC = Multi-Attach / lock).
 */
import { useRef, useState } from 'react'
import { Button, ControlGroup, EventLog, Goals, Segmented, Select, SimFrame, Slider, Stat, StatRow, fmt, useSimulation, useWidth } from '../../../kit'
import { NODE_FAILURE_BADGE } from '../../../engines/cluster/index.ts'
import { ID_NARROW, ID_WIDE } from '../lib/geometry'
import { shortName } from '../lib/view'
import { nodeNotReady } from '../lib/volumes'
import type { DeployVariant, DnsQuery } from '../lib/identity'
import {
  ORDER_NO,
  anyNodeDown,
  createIdLab,
  dbPod,
  dbPvc,
  deleteClaim,
  deleteDbPod,
  deleteSts,
  distinctDbs,
  dnsLines,
  duplicateNames,
  failNodeOf,
  findChance,
  markOos,
  nodeOff,
  nodeOos,
  readOrder,
  recreateSts,
  repair,
  saveOrder,
  setReplicas,
  stepIdLab,
  stsReplicas,
} from '../lib/identity'
import { DnsCard } from './DnsCard'
import { IdentityStage } from './IdentityStage'

type Diagnosis = '' | 'random' | 'slow' | 'replication' | 'disk'
const DIAGNOSES: { value: Diagnosis; label: string }[] = [
  { value: '', label: '— odaberite uzrok —' },
  { value: 'slow', label: 'Postgres ne stigne zapisati narudžbu' },
  { value: 'replication', label: 'Replikacija između Podova kasni' },
  { value: 'random', label: 'Service bira Pod za svaku vezu, a svaki Pod ima svoju bazu' },
  { value: 'disk', label: 'Zajednički disk je pun' },
]

const VARIANTS: { value: DeployVariant; label: string; title: string }[] = [
  { value: 'none', label: 'nema', title: 'Samo StatefulSet' },
  { value: 'no-volume', label: 'bez volumena', title: 'replicas: 3, svaki Pod piše u svoj kontejner' },
  { value: 'shared-pvc', label: 'jedan zajednički PVC', title: 'replicas: 3, svi Podovi traže isti RWO disk' },
]

export function IdentitySim() {
  const variantRef = useRef<DeployVariant>('none')
  const sim = useSimulation({ init: () => createIdLab(variantRef.current), step: (w, dt) => stepIdLab(w, dt) })
  const [sel, setSel] = useState(1)
  const [diag, setDiag] = useState<Diagnosis>('')
  const [query, setQuery] = useState<DnsQuery>('db-1.db')
  const [out, setOut] = useState<string | null>(null)
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const g = stageW !== null && stageW >= ID_WIDE.minPx ? ID_WIDE : ID_NARROW
  const w = sim.state
  const cl = w.cl
  const reps = stsReplicas(cl)
  const selPod = dbPod(cl, sel)
  const selNode = selPod?.nodeName ?? null
  const down = anyNodeDown(cl)
  const downOff = down ? nodeOff(cl, down) : false
  const downOos = down ? nodeOos(cl, down) : false
  const chance = findChance(cl)
  const dbs = distinctDbs(cl)
  const selPvcDeleting = !!dbPvc(cl, sel)?.deletion
  // the preset's per-ordinal test Services (db-0, db-1, db-2) are not in statefulset.yaml – keep them out of the log
  const engineEvents = cl.events.filter((e) => !/^Service db-\d/.test(e.text))
  const events = [...engineEvents.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone })), ...w.events].sort((a, b) => a.t - b.t).slice(-20)
  const run = (fn: () => string) => setOut(fn())

  const pickVariant = (v: DeployVariant) => {
    variantRef.current = v
    setDiag('')
    setOut(null)
    if (v === 'none' && query === 'postgres') setQuery('db-1.db')
    sim.reset()
  }

  return (
    <SimFrame
      title="Deployment ili StatefulSet?"
      subtitle="StatefulSet db ×3 s PVC-om po Podu · svaki db-N dobiva svoje testne zapise · preset statefulset · seed 42"
      sim={sim}
      showTime={false}
      toolbar={<span className="k-sim__time mono">t = {fmt.num(cl.t, 1)} s</span>}
      speeds={[1, 2, 4]}
      hint="Smanjite StatefulSet na 1 pa vratite na 3 i provjerite podatke db-2. Zatim uključite Postgres u Deploymentu bez volumena i otkrijte zašto narudžba „nestaje”. Za kraj srušite čvor s odabranim db-N."
      controls={
        <>
          <ControlGroup title={`StatefulSet db · odabran db-${sel}`}>
            <Slider label="replicas" value={reps ?? 0} min={0} max={3} step={1} disabled={reps === null} onChange={(v) => sim.mutate((x) => void setReplicas(x, v))} />
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>Smanjuje se od najvišeg rednog broja, a PVC-ovi ostaju.</span>
            <Segmented label="Odabrani Pod (ili kliknite na crtežu)" size="sm" value={sel} options={[0, 1, 2].map((i) => ({ value: i, label: `db-${i}` }))} onChange={(v) => setSel(v)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="danger" disabled={!selPod || !!selPod.deletion} onClick={() => sim.mutate((x) => deleteDbPod(x, sel))}>
                Obriši Pod db-{sel}
              </Button>
              {down && (downOff || downOos) ? (
                <Button variant="success" onClick={() => sim.mutate((x) => repair(x, down))}>
                  Upali {down}
                </Button>
              ) : (
                <Button variant="danger" disabled={!selNode || !!down} onClick={() => sim.mutate((x) => failNodeOf(x, sel))}>
                  Čvor pao{selNode ? ` (${selNode})` : ''}
                </Button>
              )}
              <Button variant="primary" disabled={!down || !downOff || downOos || !nodeNotReady(cl, down)} title="Samo za ugašen stroj koji je već NotReady" onClick={() => down && run(() => { let m = ''; sim.mutate((x) => { m = markOos(x, down) }); return `kubectl taint nodes ${down} node.kubernetes.io/out-of-service=nodeshutdown:NoExecute → ${m}` })}>
                Označi čvor kao ugašen (out-of-service)
              </Button>
            </div>
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>
              Sažeto vrijeme:{' '}
              <span className="mono" style={{ fontSize: 13, color: 'var(--orange)' }}>
                {NODE_FAILURE_BADGE}
              </span>
            </span>
          </ControlGroup>
          <ControlGroup title="Gumbi za kvar">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="danger" disabled={!cl.pvcs.some((c) => c.name === `data-db-${sel}` && !c.deletion)} onClick={() => run(() => { let m = ''; sim.mutate((x) => { m = deleteClaim(x, sel) }); return `kubectl delete pvc data-db-${sel} → ${m}` })}>
                Obriši PVC data-db-{sel}
              </Button>
              {reps === null ? (
                <Button variant="success" onClick={() => sim.mutate((x) => recreateSts(x))}>
                  Primijeni statefulset.yaml
                </Button>
              ) : (
                <Button variant="danger" onClick={() => run(() => { let m = ''; sim.mutate((x) => { m = deleteSts(x) }); return `kubectl delete statefulset db → ${m}` })}>
                  Obriši StatefulSet
                </Button>
              )}
            </div>
            {selPvcDeleting && (
              <span style={{ fontSize: 17, color: 'var(--red)' }}>
                PVC data-db-{sel} se briše: kad stari db-{sel} nestane, nestaju i disk i podatci, a novi db-{sel} dobiva prazan disk.
              </span>
            )}
            <code className="mono" aria-live="polite" style={{ fontSize: 13, color: 'var(--ink-2)', wordBreak: 'break-all', whiteSpace: 'normal', minHeight: '3em' }}>
              {out ? `$ ${out}` : ''}
            </code>
          </ControlGroup>
          <ControlGroup title="replicas: 3 za Postgres u Deploymentu">
            <Segmented size="sm" value={w.variant} options={VARIANTS} onChange={pickVariant} />
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>Promjena varijante kreće ispočetka (isti seed).</span>
            {w.variant === 'no-volume' && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Button variant="secondary" onClick={() => sim.mutate((x) => saveOrder(x))}>
                    Spremi narudžbu {ORDER_NO}
                  </Button>
                  <Button variant="secondary" disabled={!w.order} onClick={() => sim.mutate((x) => readOrder(x))}>
                    Pročitaj narudžbu {ORDER_NO}
                  </Button>
                </div>
                {w.order && (
                  <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>
                    Spremljena u Podu {shortName(w.order.pod)}.{' '}
                    {w.reads.total > 0 ? `Pronađena u ${w.reads.found} od ${w.reads.total} čitanja.` : 'Pročitajte je nekoliko puta.'}
                  </span>
                )}
                <Select label="Dijagnoza: zašto narudžba „nestaje”?" value={diag} options={DIAGNOSES} onChange={setDiag} />
                {diag && (
                  <span style={{ fontSize: 17, color: diag === 'random' ? 'var(--green)' : 'var(--red)' }}>
                    {diag === 'random'
                      ? '✓ Točno: tri Poda = tri odvojene baze, a Service svaku novu vezu šalje nasumičnom spremnom Podu.'
                      : '✗ Ne baš: pogledajte brojeve narudžbi u svakom Podu – razlikuju se.'}
                  </span>
                )}
              </>
            )}
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Zamjenski db-N dok stari postoji" value={duplicateNames(cl)} tone={duplicateNames(cl) === 0 ? 'ok' : 'bad'} sub="StatefulSet čeka da stari db-N nestane (ime je zauzeto)" />
            <Stat label="Baze iza Servicea postgres" value={w.variant === 'none' ? 'n/a' : dbs} tone={w.variant === 'none' ? 'neutral' : dbs > 1 ? 'bad' : 'warn'} sub={w.variant === 'shared-pvc' ? 'ostali Podovi ne mogu do diska' : 'svaki Pod svoja baza'} />
            <Stat label="Čitanje nađe narudžbu" value={chance === null ? 'n/a' : fmt.pct(chance, 0)} tone={chance === null ? 'neutral' : chance < 0.9 ? 'bad' : 'ok'} sub="nova veza → nasumičan Pod" />
          </StatRow>
          <div style={{ marginTop: 12 }}>
            <Segmented label="DNS upit iz Poda u Namespaceu klopa" size="sm" value={query} options={(['db-1.db', 'db', ...(w.variant === 'none' ? [] : ['postgres'])] as DnsQuery[]).map((q) => ({ value: q, label: q }))} onChange={setQuery} />
            <DnsCard query={query} lines={dnsLines(cl, query)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
            <Goals
              goals={[
                { text: 'Smanjite na 1 pa vratite na 3 – podatci db-2 ostaju', done: w.scale.done },
                { text: 'Dijagnosticirajte bug s tri baze (Deployment bez volumena)', done: diag === 'random' },
                { text: 'Srušite čvor s odabranim db-N i vratite db-N bez dva Poda istog imena', done: w.nodeDone },
              ]}
            />
            <div style={{ minHeight: 280 }}>
              <EventLog events={events} max={6} />
            </div>
          </div>
        </>
      }
    >
      <div ref={stageRef} style={{ width: '100%', flex: 1 }}>
        <div style={g.kind === 'narrow' ? { maxWidth: 460, margin: '0 auto' } : { position: 'sticky', top: 76 }}>
          <IdentityStage w={w} g={g} selected={sel} onPick={setSel} />
        </div>
      </div>
    </SimFrame>
  )
}
