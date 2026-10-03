/**
 * Flagship: „Slagač stoga” — a 16 GB host in VM mode or container mode (and containers inside node VMs, as in the
 * cloud). Add Klopa's apps, start them all at once (the start race), make one leak memory with or without
 * memory.max, attack the kernel. Model: ../model.ts (seeded, pure); drawing: ./StackStage.tsx.
 */
import { useState } from 'react'
import { FastForward, Play, Plus, ShieldCheck, Undo2 } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, Legend, LineChart, Segmented, Select, SimFrame, Stat, StatRow, Toggle, useSimulation, useWidth } from '../../../kit'
import {
  CATALOG,
  FF_LEFT_MB,
  HOST_MB,
  HOST_OS_MB,
  KINDS,
  MAX_APPS,
  PRESETS,
  SEED,
  addApp,
  appName,
  applyPreset,
  createState,
  duration,
  exploit,
  fastForward,
  fitCount,
  gb,
  hostGb,
  leakRoom,
  LEAK_MB_S,
  mbLabel,
  patchKernel,
  rangeLabel,
  removeLast,
  secs,
  setCloud,
  setLimit,
  setMode,
  setUserns,
  startAll,
  startLeak,
  step,
  usage,
  type Mode,
  type PresetId,
  type StackState,
} from '../model'
import { StackStage } from './StackStage'
import styles from '../styles.module.css'

/** one race's sampled time is context only („ova utrka ≈ …”); the headline number is the illustrative range */
function raceSub(r: number[] | null, mode: Mode): string {
  if (!r || !r.length) return 'još nije bilo utrke'
  const last = r[r.length - 1]
  return `ova utrka ≈ ${mode === 'vm' ? `${Math.round(last)} s` : secs(last)} · ilustrativno`
}

export function StackSim() {
  const [preset, setPreset] = useState<PresetId>('vm12')
  const [ref, w] = useWidth<HTMLDivElement>()
  const sim = useSimulation<StackState>({
    init: () => createState(preset),
    step: (s, dt) => step(s, dt),
  })
  const s = sim.state
  const sel = s.apps.find((a) => a.id === s.selected) ?? null
  const u = usage(s)
  const fit = fitCount(s)
  const room = leakRoom(s)
  const anyRunning = s.apps.some((a) => a.status === 'running')
  const attacked = s.attacker !== null
  const vm = s.mode === 'vm'
  const lastVm = s.lastRace.vm
  const lastCt = s.lastRace.ct
  const cloud = s.mode === 'ct' && s.cloud
  const bigHost = s.hostMb === HOST_MB
  const vmMb = s.hostMb - HOST_OS_MB
  const ffSec = room ? Math.max(10, Math.round((room.free - FF_LEFT_MB) / LEAK_MB_S / 10) * 10) : 0

  const choosePreset = (p: PresetId) => {
    setPreset(p)
    sim.mutate((st) => applyPreset(st, p))
  }

  return (
    <SimFrame
      title="Slagač stoga"
      subtitle={`Jedan fizički poslužitelj od ${hostGb(s)} GB · brojke su ilustrativne (seed ${SEED})`}
      sim={sim}
      minHeight={420}
      hint={
        <>
          prebacite se na kontejnere i smjestite svih 12 aplikacija. Zatim odaberite primjer „Kontejneri, pun domaćin” i pustite <em>curenje memorije</em> – jednom bez pojasa <code>memory.max</code>, jednom s njim. Na kraju napadnite jezgru u
          svakom načinu i pronađite onaj u kojem napad ostaje iza granice.
        </>
      }
      controls={
        <>
          <ControlGroup title="Način">
            <Segmented<Mode>
              label="Kako dijelimo računalo"
              value={s.mode}
              onChange={(m) => sim.mutate((st) => setMode(st, m))}
              options={[
                { value: 'vm', label: 'VM-ovi' },
                { value: 'ct', label: 'Kontejneri' },
              ]}
            />
            <Toggle
              label="U oblaku: kontejneri u VM-ovima"
              checked={s.cloud}
              disabled={vm || !bigHost}
              onChange={(v) => sim.mutate((st) => setCloud(st, v))}
              hint={vm ? 'samo u načinu Kontejneri' : bigHost ? 'dva VM-a u oblaku po 7,5 GB' : 'samo na domaćinu od 16 GB'}
            />
            <Select<PresetId> label="Primjer" value={preset} onChange={choosePreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
          </ControlGroup>
          <ControlGroup title="Aplikacije">
            <div className={styles.addGrid} role="group" aria-label="Dodaj aplikaciju">
              {KINDS.map((k) => (
                <Button key={k} size="sm" icon={Plus} disabled={s.apps.length >= MAX_APPS} onClick={() => sim.mutate((st) => addApp(st, k))} title={`Dodaj ${CATALOG[k].name} (${mbLabel(CATALOG[k].mem)})`}>
                  {CATALOG[k].button}
                </Button>
              ))}
            </div>
            <div className={styles.row}>
              <Button variant="primary" icon={Play} onClick={() => sim.mutate((st) => startAll(st))} disabled={!s.apps.length}>
                Pokreni sve
              </Button>
              <Button size="sm" variant="ghost" icon={Undo2} onClick={() => sim.mutate((st) => removeLast(st))} disabled={!s.apps.length}>
                Ukloni zadnju
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Odabrana aplikacija">
            <Select<string>
              label="Aplikacija"
              value={sel ? String(sel.id) : ''}
              onChange={(v) => sim.mutate((st) => { st.selected = Number(v) })}
              options={s.apps.length ? s.apps.map((a) => ({ value: String(a.id), label: appName(a, s) })) : [{ value: '', label: '(nema aplikacija)' }]}
            />
            <Toggle
              label="memory.max (pojas)"
              checked={!!sel?.limitOn}
              disabled={!sel || vm}
              onChange={(v) => sel && sim.mutate((st) => setLimit(st, sel.id, v))}
              hint={vm ? 'u VM-u granicu daje veličina VM-a' : sel ? `${CATALOG[sel.kind].name}: ${mbLabel(CATALOG[sel.kind].limit)}` : undefined}
            />
            <div className={styles.row}>
              <Button variant="danger" disabled={!sel || sel.status !== 'running' || sel.leaking} onClick={() => sel && sim.mutate((st) => startLeak(st, sel.id))} title={`+${LEAK_MB_S} MB/s`}>
                Curenje memorije
              </Button>
              <Button variant="danger" disabled={!anyRunning} onClick={() => sim.mutate((st) => exploit(st, sel?.id ?? -1))}>
                Napad na jezgru
              </Button>
            </div>
            {room && room.free > FF_LEFT_MB + 50 && (
              <Button icon={FastForward} onClick={() => sim.mutate((st) => fastForward(st))} title="Preskoči čekanje dok curenje jede slobodnu memoriju">
                {`Premotaj ≈ ${duration(ffSec)}`}
              </Button>
            )}
            {attacked && (
              <Button variant="success" icon={ShieldCheck} onClick={() => sim.mutate((st) => patchKernel(st))}>
                Zakrpaj jezgru
              </Button>
            )}
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible>
            <Toggle label="Korisnički imenski prostor (user namespace)" checked={s.userns} disabled={vm} onChange={(v) => sim.mutate((st) => setUserns(st, v))} hint="root u kontejneru → neprivilegirani korisnik na domaćinu" />
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            {cloud ? (
              <Stat label="RAM u VM-ovima" value={gb(u.used - HOST_OS_MB)} unit={`/ ${gb(vmMb)} GB`} tone={u.free < 400 ? 'bad' : u.free < 2000 ? 'warn' : 'ok'} sub={`VM-ovi drže ${gb(vmMb)} GB domaćina · slobodno ${gb(Math.max(0, u.free))} GB`} />
            ) : (
              <Stat label="Zauzeti RAM" value={gb(u.used)} unit={`/ ${hostGb(s)} GB`} tone={u.free < 400 ? 'bad' : u.free < 2000 ? 'warn' : 'ok'} sub={`slobodno ${gb(Math.max(0, u.free))} GB`} />
            )}
            <Stat label="Stalo aplikacija" value={`${fit} / ${s.apps.length}`} tone={fit < s.apps.length ? 'bad' : 'ok'} sub={fit < s.apps.length ? `za ${s.apps.length - fit} nema mjesta` : vm ? 'svaka u svojem VM-u' : s.cloud ? 'u dva VM-a u oblaku' : 'sve na jednoj jezgri'} />
            <Stat label="VM-ovi kreću" value={rangeLabel('vm')} tone="neutral" sub={raceSub(lastVm, 'vm')} />
            <Stat label="Kontejneri kreću" value={rangeLabel('ct')} tone="neutral" sub={raceSub(lastCt, 'ct')} />
          </StatRow>
          <LineChart
            series={[{ label: 'zauzeto (GB)', values: s.ramSeries, color: 'var(--pen)', area: true }]}
            threshold={{ value: s.hostMb / 1000, label: `${hostGb(s)} GB` }}
            yMax={s.hostMb / 1000}
            window={120}
            height={110}
            yLabel="GB"
            xLabel="zadnjih 60 s (simulacije)"
            formatY={(v) => String(Math.round(v))}
          />
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Smjestite 12 aplikacija na 16 GB.', done: s.goals.packed12 },
                { text: 'Usporedite pokretanje: VM-ovi i kontejneri.', done: s.goals.raceBoth },
                { text: 'Pojasom memory.max ograničite curenje na jedan kontejner.', done: s.goals.leakContained },
                { text: 'Pronađite način u kojem napad na jezgru ne prelazi granicu.', done: s.goals.exploitStopped },
              ]}
            />
            <EventLog events={s.events} />
          </div>
        </>
      }
    >
      <div ref={ref}>
        <StackStage s={s} narrow={w !== null && w < 540} />
        <div className={styles.legend}>
          {/* only what this mode can draw: plain containers never have a guest OS */}
          <Legend
            items={[
              { color: 'var(--ink-3)', label: 'OS domaćina', shape: 'square' as const },
              ...(vm || cloud ? [{ color: 'var(--pen)', label: 'OS gostiju (≈ 1 GB po VM-u; stvarno 0,5–2 GB)', shape: 'square' as const }] : []),
              ...(!vm ? [{ color: 'var(--green)', label: 'izvršno okruženje', shape: 'square' as const }] : []),
              { color: 'var(--food)', label: 'aplikacije', shape: 'square' as const },
              { color: 'var(--red)', label: 'curenje', shape: 'square' as const },
            ]}
          />
        </div>
      </div>
    </SimFrame>
  )
}
