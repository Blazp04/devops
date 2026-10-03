/**
 * Flagship: „Laboratorij zdravlja Poda” on the E3 engine (presetPodHealth, seed 42). Three bare klopa-api Pods,
 * 20 requests/s only to Ready Pods, a shared database. The student edits pod.yaml (behaviour, image tag, three probes),
 * applies it (new Pods: same names, new IPs), breaks things and watches probe lanes, restarts and back-off.
 */
import { memo, useRef, useState } from 'react'
import { Button, ControlGroup, EventLog, Goals, LineChart, Segmented, Select, SimFrame, Slider, Stat, StatRow, Terminal, Toggle, fmt, useSimulation, useWidth } from '../../../kit'
import { COMPRESSED, kubectlGetPods } from '../../../engines/cluster/index.ts'
import type { L12Behaviour, ProbeKind } from '../../../engines/cluster/index.ts'
import {
  DB_OUTAGE_S,
  DIAGNOSIS_ANSWERS,
  DIAGNOSIS_OPTIONS,
  LAB_PRESETS,
  POD_NAMES,
  applyConfig,
  cloneConfig,
  createLab,
  deleteLabPod,
  hangPod,
  markDiagnosis,
  nodeOf,
  presetConfig,
  sameConfig,
  startDbOutage,
  stepLab,
  toggleNode,
  totalsSinceStart,
} from '../lib/lab'
import type { Diagnosis, LabConfig, LabPresetId, ProbeDraft, ProbePath } from '../lib/lab'
import { MEDIUM, MEDIUM_MIN_PX, NARROW, WIDE, WIDE_MIN_PX } from '../lib/geometry'
import { labStats, rowViews } from '../lib/view'
import { LabStage } from './LabStage'

const BEHAVIOURS: { value: L12Behaviour; label: string; title: string }[] = [
  { value: 'healthy', label: 'zdrava', title: 'Pokrene se za 1 s, spremna nakon 5 s' },
  { value: 'slowStart', label: 'spori start 40 s', title: 'Puni predmemoriju: 40 s ne odgovara ni na /healthz' },
  { value: 'crashOnStart', label: 'ruši se pri pokretanju', title: 'Izađe s kodom 1 dvije sekunde nakon pokretanja' },
  { value: 'hangsAfter60', label: 'zaglavi nakon 60 s', title: 'Nakon 60 s proces živi, ali više ne odgovara' },
]

const PATHS: { value: ProbePath; label: string; title: string }[] = [
  { value: '/healthz', label: '/healthz', title: 'samo proces: živ sam' },
  { value: '/ready', label: '/ready', title: 'zagrijan, bez baze' },
  { value: '/ready-db', label: '/ready-db', title: 'provjerava i bazu' },
]

const PROBE_TITLE: Record<ProbeKind, string> = { startup: 'Provjera pokretanja', liveness: 'Provjera živosti', readiness: 'Provjera spremnosti' }

const PodsTable = memo(function PodsTable({ text }: { text: string }) {
  return <Terminal title="kubectl get pods" animate={false} lines={[{ cmd: 'kubectl get pods -o wide' }, { out: text }]} />
})

function ProbeEditor({ kind, d, onChange }: { kind: ProbeKind; d: ProbeDraft; onChange: (d: ProbeDraft) => void }) {
  const summary = d.on ? `${d.path} · ${d.periodSeconds} s × ${d.failureThreshold}` : 'isključena'
  const last = d.initialDelaySeconds + d.periodSeconds * (d.failureThreshold - 1)
  const hint = kind === 'readiness' ? `nakon ${d.failureThreshold}. neuspjeha zaredom: izvan prometa` : `zadnja provjera prije gašenja ≈ ${last} s nakon starta`
  return (
    <ControlGroup collapsible title={`${PROBE_TITLE[kind]} · ${summary}`}>
      <Toggle label="uključena" checked={d.on} onChange={(v) => onChange({ ...d, on: v })} />
      {d.on && (
        <>
          <Segmented label="putanja" size="sm" value={d.path} options={PATHS} onChange={(v) => onChange({ ...d, path: v })} />
          <Slider label="initialDelaySeconds" value={d.initialDelaySeconds} min={0} max={60} step={5} format={(v) => `${v} s`} onChange={(v) => onChange({ ...d, initialDelaySeconds: v })} />
          <Slider label="periodSeconds" value={d.periodSeconds} min={1} max={30} format={(v) => `${v} s`} onChange={(v) => onChange({ ...d, periodSeconds: v })} />
          <Slider label="failureThreshold" value={d.failureThreshold} min={1} max={30} format={(v) => `${v}×`} onChange={(v) => onChange({ ...d, failureThreshold: v })} hint={hint} />
        </>
      )}
    </ControlGroup>
  )
}

export function HealthLab() {
  const cfgRef = useRef<{ config: LabConfig; preset: LabPresetId | 'custom' }>({ config: presetConfig('incident'), preset: 'incident' })
  const [presetId, setPresetId] = useState<LabPresetId | 'custom'>('incident')
  const [draft, setDraft] = useState<LabConfig>(() => presetConfig('incident'))
  const [applied, setApplied] = useState<LabConfig>(() => presetConfig('incident'))
  const [target, setTarget] = useState<string>('klopa-api-1')
  const [answers, setAnswers] = useState<Record<string, Diagnosis | ''>>({ 'klopa-api-1': '', 'klopa-api-2': '', 'klopa-api-3': '' })
  const sim = useSimulation({ init: () => createLab(cfgRef.current.config, cfgRef.current.preset), step: (w, dt) => stepLab(w, dt), speed: 2 })
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const geo = stageW === null || stageW >= WIDE_MIN_PX ? WIDE : stageW >= MEDIUM_MIN_PX ? MEDIUM : NARROW
  const w = sim.state
  const s = w.cl
  const rows = rowViews(w, geo.row(0).lanes.slots)
  const st = labStats(w)
  const restarts = rows.reduce((a, r) => a + r.restarts, 0)
  const table = w.diagnosis ? kubectlGetPods(s, { wide: geo.kind === 'wide' }).join('\n') : ''
  const dirty = !sameConfig(draft, applied)
  const targetNode = nodeOf(w, target)
  const targetNodeOff = targetNode ? s.nodes.find((n) => n.name === targetNode)?.machine !== 'running' : false
  const targetGone = !rows.find((r) => r.name === target && !r.gone)
  const allRight = (a: Record<string, Diagnosis | ''>) => POD_NAMES.every((n) => a[n] === DIAGNOSIS_ANSWERS[n])
  const diagnosisDone = w.diagnosis && allRight(answers)
  const since = totalsSinceStart(w)
  const readyNow = rows.filter((r) => !r.gone && r.ready && !r.terminating).length

  // engine events (Pods, probes, kubelet) and the lab's own (goals, actions), oldest first
  const events = [...s.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone })), ...w.events].sort((a, b) => a.t - b.t).slice(-20)

  const loadPreset = (id: LabPresetId) => {
    const c = presetConfig(id)
    cfgRef.current = { config: c, preset: id }
    setPresetId(id)
    setDraft(cloneConfig(c))
    setApplied(cloneConfig(c))
    setAnswers({ 'klopa-api-1': '', 'klopa-api-2': '', 'klopa-api-3': '' })
    sim.reset()
  }
  const apply = () => {
    const c = cloneConfig(draft)
    cfgRef.current = { config: c, preset: 'custom' }
    setApplied(c)
    setPresetId('custom')
    sim.mutate((x) => applyConfig(x, c))
  }
  const setProbe = (kind: ProbeKind, d: ProbeDraft) => setDraft((c) => ({ ...c, probes: { ...c.probes, [kind]: d } }))

  const answer = (n: string, v: Diagnosis | '') => {
    const next = { ...answers, [n]: v }
    setAnswers(next)
    if (w.diagnosis && allRight(next)) sim.mutate((x) => markDiagnosis(x))
  }

  const presetOptions = [...LAB_PRESETS.map((p) => ({ value: p.id as LabPresetId | 'custom', label: p.label })), ...(presetId === 'custom' ? [{ value: 'custom' as const, label: 'vaš pod.yaml' }] : [])]

  const breakIt = (
    <ControlGroup title={`Pokvarite · odabran ${target}`}>
      <Segmented label="Odabrani Pod (ili klik na crtež)" size="sm" value={target} options={POD_NAMES.map((n) => ({ value: n, label: n.replace('klopa-', '') }))} onChange={setTarget} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="danger" disabled={targetGone} onClick={() => sim.mutate((x) => hangPod(x, target))}>
          Zaglavi proces
        </Button>
        <Button variant="danger" disabled={s.db.downUntil !== null || !s.db.up} onClick={() => sim.mutate((x) => startDbOutage(x))}>
          Baza pala {DB_OUTAGE_S} s
        </Button>
        <Button variant="danger" disabled={targetGone} onClick={() => sim.mutate((x) => deleteLabPod(x, target))}>
          Obriši Pod
        </Button>
        {targetNode && targetNodeOff ? (
          <Button variant="success" onClick={() => sim.mutate((x) => toggleNode(x, targetNode))}>
            Upali {targetNode}
          </Button>
        ) : (
          <Button variant="danger" disabled={!targetNode} onClick={() => targetNode && sim.mutate((x) => toggleNode(x, targetNode))}>
            Ugasi čvor{targetNode ? ` ${targetNode}` : ''}
          </Button>
        )}
      </div>
    </ControlGroup>
  )

  return (
    <SimFrame
      title="Laboratorij zdravlja Poda"
      subtitle="Tri gola Poda klopa-api, 20 zahtjeva/s samo spremnima, zajednička baza · seed 42"
      sim={sim}
      showTime
      speeds={[1, 2, 4, 8]}
      hint="Krenite od incidenta i popravite ga: dodajte provjeru pokretanja i spremnosti i primijenite pod.yaml. Zatim srušite bazu na 60 s – bez ijednog restarta, a da Service nijednom ne ostane bez endpointa."
      controls={
        <>
          {geo.kind !== 'wide' && breakIt}
          <Select label="Polazište" value={presetId} options={presetOptions} onChange={(v) => v !== 'custom' && loadPreset(v)} />
          <ControlGroup title="pod.yaml">
            <Segmented label="Ponašanje aplikacije" size="sm" value={draft.behaviour} options={BEHAVIOURS} onChange={(v) => setDraft((c) => ({ ...c, behaviour: v }))} />
            <Segmented
              label="Slika"
              size="sm"
              value={draft.wrongTag ? 'bad' : 'good'}
              options={[
                { value: 'good', label: 'dobar tag 1.3.2' },
                { value: 'bad', label: 'krivi tag 1.3.20' },
              ]}
              onChange={(v) => setDraft((c) => ({ ...c, wrongTag: v === 'bad' }))}
            />
            {(['startup', 'liveness', 'readiness'] as ProbeKind[]).map((k) => (
              <ProbeEditor key={k} kind={k} d={draft.probes[k]} onChange={(d) => setProbe(k, d)} />
            ))}
            <Button variant="primary" onClick={apply} disabled={!dirty}>
              Primijeni pod.yaml
            </Button>
            <span className="k-sim__note" style={{ fontSize: 17, color: 'var(--ink-2)' }}>
              {dirty ? (
                <>
                  Promjene čekaju. Provjere postojećeg Poda ne mogu se mijenjati (<code>kubectl apply</code> bi javio grešku), pa gumb radi kao <code>kubectl replace --force</code>: novi Podovi, isto ime, nova IP adresa.
                </>
              ) : (
                <>
                  Podovi rade prema ovoj datoteci <code>pod.yaml</code>.
                </>
              )}
            </span>
          </ControlGroup>
          {geo.kind === 'wide' && breakIt}
          {w.diagnosis && (
            <ControlGroup title="Dijagnoza iz stupca STATUS">
              {POD_NAMES.map((n) => (
                <Select key={n} label={n} value={answers[n]} options={DIAGNOSIS_OPTIONS} onChange={(v) => answer(n, v)} />
              ))}
              {POD_NAMES.some((n) => answers[n] !== '') && (
                <span style={{ fontSize: 17, color: diagnosisDone ? 'var(--green)' : 'var(--ink-2)' }}>
                  {diagnosisDone ? '✓ Sva tri uzroka su točna.' : `${POD_NAMES.filter((n) => answers[n] === DIAGNOSIS_ANSWERS[n]).length} / 3 točno`}
                </span>
              )}
            </ControlGroup>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 17, color: 'var(--ink-2)' }}>
            <span>
              <strong>Sažeto vrijeme:</strong> ugašen čvor postaje NotReady nakon {COMPRESSED.nodeMonitorGrace.label},
            </span>
            <span>a još {COMPRESSED.podEvictionToleration.label} nakon toga Podovi s njega označeni su za brisanje</span>
            <span>Provjere i pauze (10 → 300 s) imaju stvarne vrijednosti.</span>
          </div>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Restarti" value={restarts} tone={restarts > 0 ? 'bad' : 'ok'} sub="isti Pod, isto ime i IP" />
            <Stat label="Uspješno (10 s)" value={st.okRate === null ? 'n/a' : fmt.pct(st.okRate, 0)} tone={st.okRate === null ? 'neutral' : st.okRate > 0.95 ? 'ok' : 'bad'} sub={`${st.ok} od ${st.total}`} />
            <Stat label="Uspješno od početka" value={since.total === 0 ? 'n/a' : fmt.pct(since.ok / since.total, 0)} tone={since.total === 0 ? 'neutral' : since.ok / since.total > 0.95 ? 'ok' : 'bad'} sub={`${fmt.num(since.ok)} od ${fmt.num(since.total)}`} />
            <Stat label="Bez odgovora (10 s)" value={st.conn} tone={st.conn > 0 ? 'bad' : 'ok'} sub={`odbijeno ${st.refused} · bez endpointa ${st.noEndpoints} · isteklo ${st.timeout}`} />
            <Stat label="Brzi 503 (10 s)" value={st.http503} tone={st.http503 > 0 ? 'warn' : 'neutral'} sub="jasan odgovor „probajte kasnije”" />
          </StatRow>
          <LineChart
            height={130}
            window={120}
            yLabel="zahtjeva/s"
            xLabel="zadnje 2 minute"
            series={[
              { label: 'uspješni', values: s.series.okPerS.values, color: 'var(--green)', area: true },
              { label: 'neuspjeli', values: s.series.errPerS.values, color: 'var(--red)' },
            ]}
          />
          {w.diagnosis && <PodsTable text={table} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
            <Goals
              goals={[
                { text: 'Spori start (40 s) do Ready bez ubijanja', done: w.goals.slowStart },
                { text: 'Zaglavljeni proces neka se sam oporavi', done: w.goals.hangRecovered },
                { text: `Ispad baze od ${DB_OUTAGE_S} s bez ijednog restarta, a da Service nijednom ne ostane bez endpointa`, done: w.goals.dbOutage },
                { text: 'Dijagnosticirajte tri Poda iz stupca STATUS', done: w.goals.diagnosis || diagnosisDone },
              ]}
            />
            <EventLog events={events} max={6} />
          </div>
        </>
      }
    >
      <div ref={stageRef} style={{ width: '100%', flex: 1 }}>
        <div style={geo.kind === 'narrow' ? { maxWidth: 460, margin: '0 auto' } : geo.kind === 'medium' ? { maxWidth: 640, margin: '0 auto' } : { position: 'sticky', top: 76 }}>
          <LabStage w={w} rows={rows} geo={geo} target={target} onPick={setTarget} />
          {geo.kind !== 'wide' && (
            <p className="mono" style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', textAlign: 'center' }} aria-hidden="true">
              spremni {readyNow}/3 · restarti {restarts} · baza {s.db.up ? 'radi ✓' : 'pala ✗'}
            </p>
          )}
        </div>
      </div>
    </SimFrame>
  )
}
