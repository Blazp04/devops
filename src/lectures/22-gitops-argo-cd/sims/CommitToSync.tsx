/**
 * Scene 3 „Od commita do sinkronizacije” on the E6 engine (preset l22: manual sync, polling every 12–18 s sim):
 * the commit waits for the poll ring (or the webhook), Argo CD shows OutOfSync with a diff, „Sinkroniziraj” applies,
 * and sync status and health move separately (a bad tag: Synced but Degraded).
 */
import { Button, ControlGroup, EventLog, Goals, SimFrame, Stat, StatRow, Toggle, useSimulation } from '../../../kit'
import { TIMINGS, appView, commitBadImage, commitImage, commitReplicas, diffView, pollRing, refreshApp, setWebhook, syncApp } from '../../../engines/gitops'
import { HEALTH_GLOSS, HEALTH_MARK, SYNC_GLOSS, SYNC_MARK, healthTone, secs, shortValue, syncTone, logEvents } from '../lib/labels'
import { createCommitScene, gitReplicas, newestLatency, stepCommitScene } from '../lib/scenes'
import { GitOpsStage } from './Stage'
import styles from '../styles.module.css'

export function CommitToSync() {
  const sim = useSimulation({ init: createCommitScene, step: stepCommitScene })
  const st = sim.state
  const g = st.g
  const app = appView(g)
  const ring = pollRing(g)
  const diffs = diffView(g)
  const lat = newestLatency(g)
  const reps = gitReplicas(g) ?? 4
  return (
    <SimFrame
      title="Od commita do sinkronizacije"
      subtitle="preset l22 · ručna sinkronizacija · seed 22"
      sim={sim}
      showTime
      hint="Spremite commit i pratite prsten oko Argo CD-a: commit postaje vidljiv tek pri sljedećoj provjeri Gita. Zatim sinkronizirajte, uključite webhook i ponovite."
      controls={
        <>
          <ControlGroup title="Git">
            <div className={styles.btnCol}>
              <Button variant="primary" onClick={() => sim.mutate((x) => void commitImage(x.g, '2.0.1'))}>
                Commit u Git: slika 2.0.1
              </Button>
              <Button onClick={() => sim.mutate((x) => void commitReplicas(x.g, (gitReplicas(x.g) ?? 4) === 4 ? 5 : 4))}>Commit u Git: replicas {reps === 4 ? 5 : 4}</Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Argo CD">
            <Toggle label="Webhook iz Gita" checked={ring.mode === 'webhook'} onChange={(v) => sim.mutate((x) => setWebhook(x.g, v))} />
            <p className={styles.ctlNote}>Bez webhooka: {TIMINGS.pollTotal.label}.</p>
            <div className={styles.btnCol}>
              <Button onClick={() => sim.mutate((x) => refreshApp(x.g))}>Osvježi (provjeri Git sada)</Button>
              <Button variant="success" onClick={() => sim.mutate((x) => void syncApp(x.g))}>
                Sinkroniziraj
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Synced, a ne radi?">
            <Button variant="danger" onClick={() => sim.mutate((x) => void commitBadImage(x.g, 'typo'))}>
              Commit s greškom (2.0.l)
            </Button>
            <p className={styles.ctlNote}>
              Sinkronizirajte ga i pričekajte: nakon <code>progressDeadlineSeconds: 60</code> zdravlje postaje Degraded.
            </p>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Status sinkronizacije" value={`${SYNC_MARK[app.sync]} ${app.sync}`} tone={syncTone(app.sync)} sub={SYNC_GLOSS[app.sync]} />
            <Stat label="Zdravlje" value={`${HEALTH_MARK[app.health]} ${app.health}`} tone={healthTone(app.health) === 'blue' ? 'blue' : healthTone(app.health)} sub={HEALTH_GLOSS[app.health]} />
            <Stat
              label="Commit → Argo CD ga vidi"
              value={lat?.seen != null ? secs(lat.seen) : '—'}
              unit={lat?.seen != null ? '(sim)' : undefined}
              sub={lat?.seen != null && lat.realS.seen !== null ? `${lat.seenVia === 'poll' ? 'redovita provjera' : lat.seenVia === 'webhook' ? 'webhook' : 'ručno'} · stvarno ≈ ${secs(lat.realS.seen, 0)}` : 'još nema novog commita'}
            />
            <Stat label="Sljedeća provjera Gita" value={secs(Math.round(ring.nextInS), 0)} unit="(sim)" sub="stvarno: 120 s + do 60 s" />
          </StatRow>
          <div className={`${styles.diff} ${diffs.length ? '' : styles.diffEmpty}`} aria-live="polite">
            {diffs.length === 0 ? (
              app.behindGit ? (
                'Argo CD još uspoređuje sa starim commitom – novi još nije vidio.'
              ) : (
                'Razlika: nema. Klaster odgovara commitu koji Argo CD zna.'
              )
            ) : (
              <>
                <span className={styles.diffTitle}>Razlika (argocd app diff)</span>
                {diffs.slice(0, 4).map((d) => (
                  <div key={d.key + d.path}>
                    {d.kind}/{d.name} · {d.field}: <span className={styles.diffMinus}>klaster {shortValue(d.live, 26)}</span> → <span className={styles.diffPlus}>Git {shortValue(d.git, 26)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Argo CD vidi commit tek pri redovitoj provjeri Gita', done: st.seen.poll },
                { text: 'Sinkronizirajte pa dočekajte Synced i Healthy', done: st.seen.healthy },
                { text: 'S webhookom commit stigne za oko 1 s', done: st.seen.webhook },
                { text: 'Pronađite stanje Synced, ali ne Healthy', done: st.seen.split },
              ]}
            />
            <EventLog events={logEvents(g.events)} />
          </div>
        </>
      }
    >
      <GitOpsStage s={g} />
      <p className={styles.readout}>
        Dvije odvojene oznake uz Argo CD: <em>sinkronizacija</em> pita „je li klaster isti kao Git?”, a <em>zdravlje</em> pita „radi li to što je u klasteru?”
      </p>
    </SimFrame>
  )
}
