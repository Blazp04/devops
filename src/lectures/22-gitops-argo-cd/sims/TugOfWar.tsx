/**
 * Scene 6 „Argo CD i HPA” on the E6 engine (preset l22Hpa + webhook: replicas 4 in Git, HPA 2–10 wanting 6,
 * automated sync with selfHeal). Every 15 s the HPA writes 6, Argo CD writes 4 back – a tug of war over
 * spec.replicas (stats.replicaFights). Fixes: remove replicas from Git (with or without the migration step),
 * ignoreDifferences alone (quiet until the next commit, then one more fight), or ignoreDifferences +
 * RespectIgnoreDifferences=true (peace).
 */
import { useReducedMotion } from 'motion/react'
import { Button, ControlGroup, Diagram, Elastic, EventLog, Goals, LineChart, LoopMagnifier, Rough, SimFrame, Slider, Stat, StatRow, Toggle, plural, useSimulation, useWidth } from '../../../kit'
import { FILES, PATHS, commitField, hpaView, removeReplicasFromGit, replicaFight, setHpaDemand, setIgnoreReplicas, setRespectIgnoreDifferences, type GitOpsState } from '../../../engines/gitops'
import { createHpaScene, nextPopust, stepHpaScene } from '../lib/scenes'
import { T } from './parts'
import { logEvents } from '../lib/labels'
import styles from '../styles.module.css'

export function TugOfWar() {
  const sim = useSimulation({ init: createHpaScene, step: stepHpaScene })
  const st = sim.state
  const g = st.g
  const f = replicaFight(g)
  const hpa = hpaView(g)
  const m = g.metrics
  const gitLine = m.gitReplicas.values.map((v, i) => (m.gitReplicasPresent.values[i] ? v : NaN))
  const popust = nextPopust(g)
  return (
    <SimFrame
      title="Tko drži uže: Argo CD ili HPA?"
      subtitle="preset l22Hpa · replicas: 4 u Gitu · HPA 2–10 · selfHeal uključen · seed 22"
      sim={sim}
      showTime
      hint="Gledajte kako HPA svakih 15 s postavi 6 replika, a Argo CD ih vrati na 4. Probajte svaki popravak – i nakon njega spremite još jedan commit."
      controls={
        <>
          <ControlGroup title="Popravci">
            <div className={styles.btnCol}>
              <Button variant="success" disabled={!f.replicasInGit} onClick={() => sim.mutate((x) => void removeReplicasFromGit(x.g, false))}>
                Ukloni replicas iz Gita
              </Button>
              <Button variant="success" disabled={!f.replicasInGit} onClick={() => sim.mutate((x) => void removeReplicasFromGit(x.g, true))}>
                Ukloni replicas iz Gita (uz migraciju)
              </Button>
            </div>
            <Toggle
              label="ignoreDifferences: /spec/replicas"
              checked={f.ignoreDifferences}
              onChange={(v) =>
                sim.mutate((x) => {
                  setIgnoreReplicas(x.g, v)
                  x.fightsAtIgnore = v ? x.g.stats.replicaFights : null
                })
              }
            />
            <Toggle label="syncOptions: RespectIgnoreDifferences=true" checked={f.respectIgnoreDifferences} onChange={(v) => sim.mutate((x) => setRespectIgnoreDifferences(x.g, v))} />
          </ControlGroup>
          <ControlGroup title="Sljedeći commit">
            <Button variant="primary" onClick={() => sim.mutate((x) => void commitField(x.g, FILES.deployment, PATHS.envValue(0), nextPopust(x.g)))}>
              Commit u Git: popust {popust} %
            </Button>
            <p className={styles.ctlNote}>Bilo koji commit pokreće punu sinkronizaciju Deploymenta.</p>
          </ControlGroup>
          <ControlGroup title="Promet">
            <Slider label="HPA želi" value={g.cluster.hpaDemand} min={2} max={10} onChange={(v) => sim.mutate((x) => setHpaDemand(x.g, v))} format={(v) => plural(v, ['Pod', 'Poda', 'Podova'])} />
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Borbe za replicas" value={f.fights} tone={f.fights ? 'bad' : 'ok'} sub="Argo CD prepisao HPA" />
            <Stat label="replicas u klasteru" value={f.liveReplicas ?? '—'} sub={f.replicasInGit ? `u Gitu: ${f.gitReplicas}` : 'nema ga u Gitu'} />
            <Stat label="HPA želi" value={hpa?.desired ?? '—'} sub={hpa ? `sljedeća procjena za ${Math.ceil(hpa.nextEvalInS)} s` : ''} />
            <Stat label="Jednokratni pad na 1" value={f.drops} tone={f.drops ? 'warn' : 'neutral'} sub="replicas uklonjen bez migracije" />
          </StatRow>
          <LineChart
            series={[
              { label: 'replicas u klasteru', values: m.liveReplicas.values, color: 'var(--ink)' },
              { label: 'replicas u Gitu', values: gitLine, color: 'var(--pen)' },
              { label: 'HPA želi', values: m.hpaDesired.values, color: 'var(--red)' },
            ]}
            yMax={10}
            yLabel="Podovi"
            xLabel="zadnje 2 minute (sim)"
            height={150}
          />
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Pogledajte tri borbe za replicas', done: st.seen.fight3 },
                { text: 'Samo ignoreDifferences: mir traje do sljedećeg commita', done: st.seen.ignoreAloneFight },
                { text: 'Mir s HPA-om – i nakon sljedećeg commita', done: st.seen.peace },
              ]}
            />
            <EventLog events={logEvents(g.events)} />
          </div>
        </>
      }
    >
      <div className={styles.stageTop}>
        <Rope g={g} />
      </div>
    </SimFrame>
  )
}

function Rope({ g }: { g: GitOpsState }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const reduce = useReducedMotion()
  const wide = width !== null && width >= 640
  const f = replicaFight(g)
  const hpa = hpaView(g)
  const W = wide ? 720 : 360
  const H = wide ? 282 : 286
  const ax = wide ? 78 : 46
  const ay = wide ? 104 : 96
  const hx = wide ? 640 : 312
  const r0 = wide ? 132 : 82
  const r1 = wide ? 588 : 278
  const xOf = (n: number) => r0 + ((Math.min(10, Math.max(1, n)) - 1) / 9) * (r1 - r0)
  const live = f.liveReplicas ?? 0
  const knot = xOf(live)
  const argoLetGo = !f.replicasInGit
  const respected = f.ignoreDifferences && f.respectIgnoreDifferences
  const hidden = f.ignoreDifferences && !f.respectIgnoreDifferences
  const recent = f.lastFightAt !== null && g.t - f.lastFightAt < 3
  // rope: taut while both pull; slack when Argo CD only watches; Argo CD's end on the floor once it let go
  const sag = argoLetGo ? 0 : respected ? 26 : hidden ? 14 : 3
  const startX = argoLetGo ? r0 - 4 : ax + 30
  // once Argo CD lets go, its end of the rope lies slack next to (not across) its name
  const ropePts: [number, number][] = argoLetGo
    ? [
        [startX, ay + 24],
        [startX + 30, ay + 12],
        [knot, ay],
        [hx - 42, ay],
      ]
    : [
        [startX, ay],
        [(startX + knot) / 2, ay + sag],
        [knot, ay + sag * 0.6],
        [(knot + hx - 42) / 2, ay + sag * 0.4],
        [hx - 42, ay],
      ]
  const status: [string, string] = argoLetGo
    ? ['replicas nije u Gitu', 'broj Podova vodi samo HPA']
    : respected
      ? ['Argo CD ignorira replicas', 'i pri sinkronizaciji: mir']
      : hidden
        ? ['razlika se samo ne prikazuje', 'sljedeća sinkronizacija opet piše Git']
        : ['Argo CD i HPA pišu isto polje', 'spec.replicas']
  const statusInk = argoLetGo || respected ? 'var(--green)' : hidden ? 'var(--orange)' : 'var(--red)'
  const label = `Uže između Argo CD-a (Git: ${f.replicasInGit ? f.gitReplicas : 'bez replicas'}) i HPA-a (želi ${hpa?.desired ?? '—'}). U klasteru ${plural(live, ['je', 'su', 'je'], false)} ${plural(live, ['replika', 'replike', 'replika'])}. Borbi: ${f.fights}. ${status.join(' ')}.`
  const ticks = wide ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 4, 6, 8, 10]
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ maxWidth: wide ? undefined : 460, margin: '0 auto' }}>
        <Diagram width={W} height={H} label={label}>
          {/* tally of fights */}
          <T x={W / 2} y={30} size={wide ? 15 : 14} anchor="middle" font="ui" weight={700} fill={f.fights ? 'var(--red)' : 'var(--ink-2)'}>
            borbe: {f.fights}
          </T>
          {Array.from({ length: Math.min(10, f.fights) }, (_, i) => {
            const grp = Math.floor(i / 5)
            const k = i % 5
            const x0 = W / 2 + 46 + grp * 40
            return k < 4 ? (
              <Rough key={i} shape={{ k: 'line', x1: x0 + k * 7, y1: 16, x2: x0 + k * 7 + 1, y2: 34 }} seed={2601 + i} stroke="var(--red)" strokeWidth={1.8} />
            ) : (
              <Rough key={i} shape={{ k: 'line', x1: x0 - 4, y1: 30, x2: x0 + 26, y2: 18 }} seed={2601 + i} stroke="var(--red)" strokeWidth={1.8} />
            )
          })}
          {/* Argo CD on the left */}
          <LoopMagnifier cx={ax} cy={ay} r={wide ? 28 : 22} seed={2611} />
          <T x={ax} y={ay + (wide ? 56 : 46)} font="hand" size={20} anchor="middle" fill="var(--pen)">
            Argo CD
          </T>
          <T x={ax} y={ay + (wide ? 78 : 66)} size={wide ? 13.5 : 14} anchor="middle" fill={f.replicasInGit ? 'var(--ink)' : 'var(--ink-3)'}>
            {f.replicasInGit ? `Git: ${f.gitReplicas}` : 'Git: —'}
          </T>
          {/* HPA on the right */}
          <Elastic x={hx - 36} y={ay - 30} w={72} h={56} seed={2612} />
          <T x={hx} y={ay + (wide ? 56 : 46)} font="hand" size={20} anchor="middle" fill="var(--red)">
            HPA
          </T>
          <T x={hx} y={ay + (wide ? 78 : 66)} size={wide ? 13.5 : 14} anchor="middle">
            želi {hpa?.desired ?? '—'}
          </T>
          {/* the rope and the knot = spec.replicas live */}
          <Rough shape={{ k: 'curve', pts: ropePts }} seed={2613} stroke={argoLetGo || respected ? 'var(--ink-3)' : 'var(--ink-2)'} strokeWidth={2.4} roughness={0.9} dash={argoLetGo || respected ? '7 6' : undefined} />
          {(argoLetGo || respected) && (
            <T x={W / 2} y={ay - 24} font="hand" size={22} anchor="middle" fill="var(--green)">
              ✓ mir
            </T>
          )}
          <g style={{ transform: `translateX(${knot}px)`, transition: reduce ? undefined : 'transform 0.5s ease-out' }}>
            <Rough shape={{ k: 'ellipse', cx: 0, cy: ay + (argoLetGo ? 0 : sag * 0.6), w: 18, h: 16 }} seed={2614} stroke={recent ? 'var(--red)' : 'var(--ink)'} strokeWidth={2} fillColor={recent ? 'var(--red)' : 'var(--ink-2)'} fillStyle="solid" />
          </g>
          {/* ruler: spec.replicas */}
          <Rough shape={{ k: 'line', x1: r0, y1: ay + (wide ? 104 : 96), x2: r1, y2: ay + (wide ? 104 : 96) }} seed={2615} strokeWidth={1.2} stroke="var(--ink-3)" />
          {ticks.map((n) => (
            <g key={n}>
              <Rough shape={{ k: 'line', x1: xOf(n), y1: ay + (wide ? 98 : 90), x2: xOf(n), y2: ay + (wide ? 110 : 102) }} seed={2620 + n} strokeWidth={1.1} stroke="var(--ink-3)" />
              <T x={xOf(n)} y={ay + (wide ? 128 : 120)} size={wide ? 13.5 : 14} anchor="middle" fill={n === live ? 'var(--ink)' : 'var(--ink-3)'} weight={n === live ? 700 : 400}>
                {n}
              </T>
            </g>
          ))}
          <T x={r0 - 10} y={ay + (wide ? 128 : 120)} size={wide ? 13.5 : 14} anchor="end" fill="var(--ink-3)">
            {wide ? 'replicas' : ''}
          </T>
          {wide ? (
            <T x={W / 2} y={H - 16} font="hand" size={20} anchor="middle" fill={statusInk}>
              {status.join(' – ')}
            </T>
          ) : (
            status.map((line, i) => (
              <T key={i} x={W / 2} y={H - 44 + i * 24} font="hand" size={20} anchor="middle" fill={statusInk}>
                {line}
              </T>
            ))
          )}
        </Diagram>
      </div>
    </div>
  )
}
