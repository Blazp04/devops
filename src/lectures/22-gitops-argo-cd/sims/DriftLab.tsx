/**
 * Scene 4 „Odstupanje” on the E6 engine (preset l22Auto + webhook: automated sync on, selfHeal and prune off – the
 * defaults). A manual kubectl scale stays OutOfSync until selfHeal is on; a deleted Deployment is restored only by
 * selfHeal; a file removed from Git leaves an orphan until prune is on; a manifest the API server rejects shows how
 * failed syncs are retried (automated 5× by default) and then left alone for that commit.
 */
import { Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Stat, StatRow, Toggle, useSimulation } from '../../../kit'
import {
  RETRY_LABELS,
  RETRY_PRESETS,
  appView,
  commitInvalidManifest,
  deleteFileFromGit,
  headCommit,
  FILES,
  kubectlDelete,
  kubectlScale,
  retryPresetOf,
  revertLastChange,
  setRetry,
  setSyncPolicy,
  terminateSync,
  type RetryPresetId,
} from '../../../engines/gitops'
import { HEALTH_MARK, SYNC_MARK, healthTone, syncTone, logEvents } from '../lib/labels'
import { createDriftScene, stepDriftScene } from '../lib/scenes'
import { GitOpsStage } from './Stage'
import styles from '../styles.module.css'

const RETRY_IDS: RetryPresetId[] = ['notSet', 'none', 'five', 'unlimited']
const RETRY_SHORT: Record<RetryPresetId, string> = { notSet: 'zadano (auto 5×)', none: '0×', five: '5×', unlimited: '∞' }

export function DriftLab() {
  const sim = useSimulation({ init: createDriftScene, step: stepDriftScene })
  const st = sim.state
  const g = st.g
  const app = appView(g)
  const orphans = g.argo.resources.filter((r) => r.requiresPruning).length
  const promoInGit = Boolean(headCommit(g.repo).files[FILES.promo])
  const depLive = Object.values(g.cluster.objects).some((o) => o.kind === 'Deployment' && o.name === g.mainDeployment)
  const retryId = retryPresetOf(g) ?? 'notSet'
  return (
    <SimFrame
      title="Odstupanje: tko je dirnuo klaster?"
      subtitle="preset l22Auto · automatska sinkronizacija uključena · selfHeal i prune isključeni (zadano) · seed 22"
      sim={sim}
      showTime
      hint="Ručno skalirajte na 10 replika i pogledajte da odstupanje ostaje. Zatim uključite selfHeal. Obrišite datoteku iz Gita – što ostaje u klasteru dok je prune isključen?"
      controls={
        <>
          <ControlGroup title="Pokvari">
            <div className={styles.btnCol}>
              <Button variant="danger" onClick={() => sim.mutate((x) => void kubectlScale(x.g, 10))}>
                Ručni kubectl scale --replicas=10
              </Button>
              <Button variant="danger" disabled={!depLive} onClick={() => sim.mutate((x) => void kubectlDelete(x.g, 'Deployment', x.g.mainDeployment))}>
                Ručno obriši Deployment
              </Button>
              <Button variant="danger" disabled={!promoInGit} onClick={() => sim.mutate((x) => void deleteFileFromGit(x.g))}>
                Obriši datoteku iz Gita
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Application · syncPolicy">
            <Toggle label="selfHeal (vraća ručne promjene)" checked={app.policy.selfHeal} onChange={(v) => sim.mutate((x) => setSyncPolicy(x.g, { selfHeal: v }))} />
            <Toggle label="prune (briše što nije u Gitu)" checked={app.policy.prune} onChange={(v) => sim.mutate((x) => setSyncPolicy(x.g, { prune: v }))} />
            <p className={styles.ctlNote}>Automatska sinkronizacija je uključena; oba prekidača su po zadanom isključena.</p>
          </ControlGroup>
          <ControlGroup title="Napredno: neuspjela sinkronizacija" collapsible defaultOpen={false}>
            <div className={styles.btnCol}>
              <Button variant="danger" onClick={() => sim.mutate((x) => void commitInvalidManifest(x.g))}>
                Commit: replicas: "četiri"
              </Button>
              <Segmented
                label="syncPolicy.retry"
                size="sm"
                value={retryId}
                options={RETRY_IDS.map((id) => ({ value: id, label: RETRY_SHORT[id], title: RETRY_LABELS[id] }))}
                onChange={(id) => sim.mutate((x) => setRetry(x.g, RETRY_PRESETS[id]))}
              />
              <p className={styles.ctlNote}>{RETRY_LABELS[retryId]}</p>
              <Button disabled={!app.operation} onClick={() => sim.mutate((x) => void terminateSync(x.g))}>
                Prekini sinkronizaciju
              </Button>
              <Button variant="success" onClick={() => sim.mutate((x) => void revertLastChange(x.g))}>
                git revert zadnjeg commita
              </Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Sinkronizacija" value={`${SYNC_MARK[app.sync]} ${app.sync}`} tone={syncTone(app.sync)} sub={app.outOfSyncForS !== null ? `OutOfSync već ${Math.round(app.outOfSyncForS)} s` : 'klaster = Git'} />
            <Stat label="Zdravlje" value={`${HEALTH_MARK[app.health]} ${app.health}`} tone={healthTone(app.health)} />
            <Stat label="Ručne promjene vraćene" value={g.stats.kubectlDriftsReverted} tone={g.stats.kubectlDriftsReverted ? 'ok' : 'neutral'} sub="selfHeal" />
            <Stat label="Višak u klasteru" value={orphans} tone={orphans ? 'warn' : 'neutral'} sub="nije u Gitu, nije obrisan" />
          </StatRow>
          {app.autoSyncNote && <p className={styles.note}>Argo CD: {app.autoSyncNote}</p>}
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Ručno odstupanje ostaje dok je selfHeal isključen', done: st.seen.stayed },
                { text: 'selfHeal vraća ručnu promjenu', done: st.seen.healed },
                { text: 'Datoteka obrisana iz Gita ostavlja višak u klasteru', done: st.seen.orphan },
                { text: 'prune briše višak', done: st.seen.pruned },
              ]}
            />
            <EventLog events={logEvents(g.events)} />
          </div>
        </>
      }
    >
      <GitOpsStage s={g} />
    </SimFrame>
  )
}
