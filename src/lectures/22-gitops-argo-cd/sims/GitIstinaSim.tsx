/**
 * Flagship „Git je istina” on the E6 engine (preset l22, seed 22: Argo CD defaults – manual sync, selfHeal, prune
 * off, no webhook, retry not set). Left: the config repo with its commit string and the CI bot lane; right: Argo CD
 * in the cluster with the poll ring, sync + health tags and the resource tree. The four tasks are the engine's own
 * `l22Goals`, so they tick exactly when the model says the job is done.
 */
import {
  Button,
  ControlGroup,
  EventLog,
  Goals,
  SimFrame,
  Stat,
  StatRow,
  Toggle,
  useSimulation,
} from '../../../kit'
import {
  FILES,
  PRESETS,
  TIMINGS,
  addHpaToGit,
  appView,
  commitBadImage,
  commitReplicas,
  createGitOps,
  deleteFileFromGit,
  diffView,
  gitRevert,
  headCommit,
  kubectlDelete,
  kubectlScale,
  l22Goals,
  pollRing,
  removeReplicasFromGit,
  replicaFight,
  setIgnoreReplicas,
  setRespectIgnoreDifferences,
  setSyncPolicy,
  setWebhook,
  startCiRelease,
  step,
  syncApp,
} from '../../../engines/gitops'
import { HEALTH_MARK, SYNC_MARK, healthTone, secs, shortValue, syncTone, logEvents } from '../lib/labels'
import { gitReplicas } from '../lib/scenes'
import { GitOpsStage } from './Stage'
import styles from '../styles.module.css'

const init = () => createGitOps({ ...PRESETS.l22 })

export function GitIstinaSim() {
  const sim = useSimulation({ init, step })
  const s = sim.state
  const app = appView(s)
  const ring = pollRing(s)
  const goals = l22Goals(s)
  const fight = replicaFight(s)
  const diffs = diffView(s).filter((d) => !d.ignored)
  const files = headCommit(s.repo).files
  const hpaInGit = Boolean(files[FILES.hpa])
  const promoInGit = Boolean(files[FILES.promo])
  const depLive = Object.values(s.cluster.objects).some((o) => o.kind === 'Deployment' && o.name === s.mainDeployment)
  const ciBusy = s.ci.runs.some((r) => r.status === 'running')
  const reps = gitReplicas(s)
  const p = app.policy
  const hpaWaits = hpaInGit && !(p.automated && p.selfHeal)
  return (
    <SimFrame
      title="Git je istina"
      subtitle="preset l22 · zadane postavke Argo CD-a · seed 22"
      sim={sim}
      showTime
      hint="Riješite četiri zadatka samo kroz Git i postavke Argo CD-a – bez naredbi kubectl. Svaki gumb za kvar ispod crteža pokvari nešto drugo; gledajte što Argo CD primijeti, a što popravi."
      controls={
        <>
          <ControlGroup title="Git (config repozitorij)">
            <div className={styles.btnCol}>
              <Button variant="primary" disabled={ciBusy} onClick={() => sim.mutate((x) => void startCiRelease(x, '2.0.1'))}>
                Izdaj 2.0.1 kroz CI (commit bota)
              </Button>
              <Button disabled={reps === null} onClick={() => sim.mutate((x) => void commitReplicas(x, (gitReplicas(x) ?? 4) === 4 ? 5 : 4))}>
                Commit u Git: replicas {reps === 4 ? 5 : 4}
              </Button>
              <Button variant="success" onClick={() => sim.mutate((x) => void gitRevert(x))}>
                git revert HEAD
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Argo CD · syncPolicy">
            <Toggle label="Automatska sinkronizacija" checked={p.automated} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { automated: v }))} />
            <Toggle label="selfHeal (vraća ručne promjene)" checked={p.selfHeal} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { selfHeal: v }))} />
            <Toggle label="prune (briše što nije u Gitu)" checked={p.prune} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { prune: v }))} />
            <Toggle label="Webhook" checked={ring.mode === 'webhook'} onChange={(v) => sim.mutate((x) => setWebhook(x, v))} />
            <p className={styles.ctlNote}>Bez webhooka: {TIMINGS.pollTotal.label}. selfHeal radi samo uz automatsku sinkronizaciju.</p>
            <Button variant="success" onClick={() => sim.mutate((x) => void syncApp(x))}>
              Sinkroniziraj
            </Button>
          </ControlGroup>
          {/* remounted when the HPA appears in Git, so the group opens exactly when its buttons become useful */}
          <ControlGroup key={hpaInGit ? 'hpa-on' : 'hpa-off'} title="Mir s HPA-om" collapsible defaultOpen={hpaInGit}>
            <div className={styles.btnCol}>
              <Button disabled={!hpaInGit || !fight.replicasInGit} onClick={() => sim.mutate((x) => void removeReplicasFromGit(x, true))}>
                Ukloni replicas iz Gita (uz migraciju)
              </Button>
              <Button disabled={!hpaInGit} active={fight.ignoreDifferences && !fight.respectIgnoreDifferences} onClick={() => sim.mutate((x) => setIgnoreReplicas(x, true))}>
                ignoreDifferences
              </Button>
              <Button
                disabled={!hpaInGit}
                active={fight.ignoreDifferences && fight.respectIgnoreDifferences}
                onClick={() =>
                  sim.mutate((x) => {
                    setIgnoreReplicas(x, true)
                    setRespectIgnoreDifferences(x, true)
                  })
                }
              >
                ignoreDifferences + RespectIgnoreDifferences
              </Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Sinkronizacija" value={`${SYNC_MARK[app.sync]} ${app.sync}`} tone={syncTone(app.sync)} sub={app.behindGit ? 'Git ima commit koji Argo CD još nije vidio' : 'u odnosu na commit koji Argo CD zna'} />
            <Stat label="Zdravlje" value={`${HEALTH_MARK[app.health]} ${app.health}`} tone={healthTone(app.health)} />
            <Stat label="Sljedeća provjera Gita" value={secs(Math.round(ring.nextInS), 0)} unit="(sim)" sub={ring.mode === 'webhook' ? 'webhook: ≈ 1 s nakon commita' : 'stvarno: 120 s + do 60 s'} />
            <Stat label="Borbe s HPA-om" value={fight.fights} tone={fight.fights ? 'bad' : 'neutral'} sub={fight.drops ? `pad na 1: ${fight.drops}×` : hpaInGit ? 'HPA u Gitu' : 'još nema HPA-a'} />
          </StatRow>
          {app.autoSyncNote && <p className={styles.note}>Argo CD: {app.autoSyncNote}</p>}
          {diffs.length > 0 && (
            <div className={styles.diff}>
              <span className={styles.diffTitle}>Razlika Git ↔ klaster</span>
              {diffs.slice(0, 3).map((d) => (
                <div key={d.key + d.path}>
                  {d.kind}/{d.name} · {d.field}: <span className={styles.diffMinus}>klaster {shortValue(d.live, 24)}</span> → <span className={styles.diffPlus}>Git {shortValue(d.git, 24)}</span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.statsGrid}>
            <Goals
              title="Zadaci"
              goals={[
                { text: 'Uvedite 2.0.1 samo commitom', done: goals.shipped },
                { text: 'Neka se ručno odstupanje vrati samo od sebe', done: goals.driftReverted },
                { text: 'Vratite loš commit na GitOps način', done: goals.badCommitReverted },
                { text: 'Zaustavite borbu Argo CD-a i HPA-a – i nakon sljedećeg commita', done: goals.hpaPeace },
              ]}
            />
            <EventLog events={logEvents(s.events)} max={7} />
          </div>
        </>
      }
    >
      <div className={styles.stageTop}>
        <GitOpsStage s={s} ci caption={`Borbi s HPA-om: ${fight.fights}.`} />
        <div className={styles.breakRow} role="group" aria-label="Pokvari">
          <span className={styles.breakLabel} aria-hidden="true">
            pokvari →
          </span>
          <Button variant="danger" disabled={!depLive} onClick={() => sim.mutate((x) => void kubectlScale(x, 10))}>
            Ručni kubectl scale --replicas=10
          </Button>
          <Button variant="danger" disabled={!depLive} onClick={() => sim.mutate((x) => void kubectlDelete(x, 'Deployment', x.mainDeployment))}>
            Ručno obriši Deployment
          </Button>
          <Button variant="danger" disabled={!promoInGit} onClick={() => sim.mutate((x) => void deleteFileFromGit(x))}>
            Obriši datoteku iz Gita
          </Button>
          <Button variant="danger" onClick={() => sim.mutate((x) => void commitBadImage(x, 'typo'))}>
            Loš commit (2.0.l)
          </Button>
          <Button variant="danger" disabled={hpaInGit} onClick={() => sim.mutate((x) => void addHpaToGit(x))}>
            Dodaj HPA uz replicas u Gitu
          </Button>
        </div>
        {hpaWaits && <p className={styles.note}>Borba s HPA-om počinje tek uz automatsku sinkronizaciju i selfHeal – uključite ih.</p>}
      </div>
    </SimFrame>
  )
}
