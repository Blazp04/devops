/**
 * Flagship part 1 „Preživljavaju li podatci?” on the E3 engine (presetStorage part 'volumes', seed 42).
 * Three Postgres Pods, 2 writes/s each: rows in the container layer, in emptyDir, on a PersistentVolume.
 * Break them (restart the container, delete the Pod, let a node die) and keep the orders through a node failure.
 */
import { useRef, useState } from 'react'
import { Badge, Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Stat, StatRow, fmt, plural, useSimulation, useWidth } from '../../../kit'
import { COMPRESSED } from '../../../engines/cluster/index.ts'
import { VOL_NARROW, VOL_WIDE } from '../lib/geometry'
import { VARIANTS, createVolLab, currentPod, deleteAll, failNode, liveOrders, markOutOfService, nodeHasOos, nodeIsOff, nodeNotReady, otherNodeDown, ordersText, repairNode, restartAll, stepVolLab, variantPods } from '../lib/volumes'
import { VolumesStage } from './VolumesStage'

const NODES = ['node-1', 'node-2', 'node-3']

export function VolumesSim() {
  const modeRef = useRef<'clean' | 'incident'>('clean')
  const sim = useSimulation({
    init: () => {
      const w = createVolLab()
      if (modeRef.current === 'incident') {
        stepVolLab(w, 60)
        deleteAll(w)
      }
      return w
    },
    step: (w, dt) => stepVolLab(w, dt),
  })
  const [target, setTarget] = useState('node-3')
  const [out, setOut] = useState<string | null>(null)
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const g = stageW !== null && stageW >= VOL_WIDE.minPx ? VOL_WIDE : VOL_NARROW
  const w = sim.state
  const cl = w.cl
  const off = nodeIsOff(cl, target)
  const oos = nodeHasOos(cl, target)
  const blocker = otherNodeDown(cl, target)
  const pvcNode = currentPod(cl, 'db-pvc')?.nodeName ?? null
  const events = [...cl.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone })), ...w.events].sort((a, b) => a.t - b.t).slice(-20)

  const incident = () => {
    modeRef.current = 'incident'
    sim.reset()
    modeRef.current = 'clean'
    setOut(null)
  }

  return (
    <SimFrame
      title="Preživljavaju li podatci?"
      subtitle="Tri Postgresa, svaki prima u prosjeku 2 narudžbe u sekundi (nasumični dolasci) · preset volumeni · seed 42"
      sim={sim}
      showTime={false}
      toolbar={<span className="k-sim__time mono">t = {fmt.num(cl.t, 1)} s</span>}
      speeds={[1, 2, 4]}
      hint="Ponovno pokrenite kontejnere, zatim obrišite Podove i gledajte gdje narudžbe prežive. Na kraju srušite čvor na kojem radi db-pvc i vratite bazu bez gubitka – uz korak out-of-service."
      controls={
        <>
          <ControlGroup title="Pokvarite sva tri Poda">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="danger" onClick={() => sim.mutate((x) => restartAll(x))}>
                Ponovno pokreni kontejner
              </Button>
              <Button variant="danger" onClick={() => sim.mutate((x) => deleteAll(x))}>
                Obriši Pod
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Pad čvora">
            <Segmented label="Koji čvor" size="sm" value={target} options={NODES.map((n) => ({ value: n, label: n, title: n === pvcNode ? 'ovdje radi db-pvc' : undefined }))} onChange={(v) => setTarget(v)} />
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>{pvcNode ? `db-pvc trenutačno radi na ${pvcNode}.` : 'db-pvc se upravo pokreće.'}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {off || oos ? (
                <Button variant="success" onClick={() => sim.mutate((x) => repairNode(x, target))}>
                  Upali čvor
                </Button>
              ) : (
                <Button variant="danger" disabled={!!blocker} title={blocker ? `Najprije upalite ${blocker}` : undefined} onClick={() => sim.mutate((x) => failNode(x, target))}>
                  Čvor pao
                </Button>
              )}
              <Button
                variant="primary"
                disabled={!off || oos || !nodeNotReady(cl, target)}
                title={!off ? 'Samo za stroj koji je stvarno ugašen' : !nodeNotReady(cl, target) ? 'Pričekajte da čvor postane NotReady' : undefined}
                onClick={() => {
                  let msg = ''
                  sim.mutate((x) => {
                    msg = markOutOfService(x, target)
                  })
                  setOut(msg)
                }}
              >
                Označi čvor kao ugašen (out-of-service)
              </Button>
            </div>
            <code className="mono" aria-live="polite" style={{ fontSize: 13, color: 'var(--ink-2)', wordBreak: 'break-all', whiteSpace: 'normal', minHeight: '4.5em' }}>
              {out ? `$ kubectl taint nodes ${target} node.kubernetes.io/out-of-service=nodeshutdown:NoExecute → ${out}` : ''}
            </code>
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>Taint samo za stroj koji je sigurno ugašen – inače bi dva procesa mogla pisati na isti disk.</span>
          </ControlGroup>
          <ControlGroup title="Sažeto vrijeme" collapsible defaultOpen={false}>
            <Badge tone="amber">{COMPRESSED.nodeMonitorGrace.label}</Badge>
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>čvor postaje NotReady</span>
            <Badge tone="amber">{COMPRESSED.podEvictionToleration.label}</Badge>
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>Podovi s mrtvog čvora označeni za brisanje</span>
            <Badge tone="amber">{COMPRESSED.forceDetach.label}</Badge>
            <span style={{ fontSize: 17, color: 'var(--ink-2)' }}>prisilno odspajanje diska</span>
          </ControlGroup>
          <Button variant="ghost" onClick={incident}>
            Ponovi incident 19 (Obriši Pod u 60. s)
          </Button>
        </>
      }
      stats={
        <>
          <StatRow>
            {VARIANTS.map((v) => {
              const n = liveOrders(cl, v)
              const deleting = n === null && variantPods(cl, v).some((p) => !!p.deletion)
              return (
                <Stat
                  key={v}
                  label={v}
                  value={n === null ? 'n/a' : n}
                  unit={n === null ? undefined : plural(n, ['narudžba', 'narudžbe', 'narudžbi'], false)}
                  tone={w.lost[v] > 0 ? 'bad' : n === null ? 'neutral' : 'ok'}
                  sub={w.lost[v] > 0 ? `izgubljeno: ${ordersText(w.lost[v])}` : deleting ? 'Pod se briše…' : n === null ? 'baza se pokreće…' : 'ništa izgubljeno'}
                />
              )
            })}
          </StatRow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
            <Goals
              goals={[
                { text: 'Ponovno pokrenite kontejnere: koja baza zaboravi narudžbe?', done: w.goals.restart },
                { text: 'Obrišite Podove: koja baza preživi novi Pod?', done: w.goals.del },
                { text: 'Sačuvajte narudžbe kroz pad čvora s db-pvc (uključujući korak out-of-service)', done: w.goals.node },
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
          <VolumesStage w={w} g={g} target={target} />
        </div>
      </div>
    </SimFrame>
  )
}
