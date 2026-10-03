import { useEffect, useState } from 'react'
import { Badge, Button, ControlGroup, EventLog, Goals, plural, RoughBox, Segmented, SimFrame, Stat, StatRow, StickyNote, Toggle, useSimulation, useWidth } from '../../../kit'
import {
  actorLabel,
  APPROACHES,
  argoHardRefresh,
  assetsOf,
  attempt,
  commitPlainSecret,
  deleteLeakedCommit,
  effectiveConsumeOf,
  encryptionScopeInfo,
  evaluateAccess,
  eyeSummary,
  forceEsoSync,
  l23Goals,
  L23_APPROACHES,
  leakControllerKey,
  leakToCiLog,
  loseControllerKey,
  rebuildCluster,
  renewSealingKey,
  restartPods,
  roleLabel,
  rotateSecret,
  rotationEstimate,
  rotationStatus,
  setAnimationScale,
  setApproach,
  setConsume,
  setCsiRotation,
  setEncryption,
  setKeyBackup,
  setLeastPrivilege,
  setStoreAvailable,
  staleConsumers,
  step,
  storeOutageStatus,
  TIMING,
} from '../../../engines/access/index.ts'
import type { AccessState, ActorId, Approach, ConsumeMode } from '../../../engines/access/index.ts'
import { createStart, EYES, INCIDENT_AT, MEDIUM, NARROW, SEED, START_LABEL, START_PRESET, WIDE } from '../lib/flagship'
import type { StartId } from '../lib/flagship'
import { codeSegments } from '../lib/mapText'
import { EyeIcon } from './Eye'
import { PipelineMap } from './PipelineMap'
import styles from '../styles.module.css'

const CONSUME_OPTIONS: { value: ConsumeMode; label: string; title: string }[] = [
  { value: 'env', label: 'env', title: 'varijabla okruženja (secretKeyRef) – čita se samo pri pokretanju' },
  { value: 'volume', label: 'volumen', title: 'datoteka u montiranom volumenu – kubelet je osvježava' },
]

/** A layout is used only where its printed lettering stays ≥ 12 px and its handwriting ≥ 17 px on screen. */
const minWidth = (L: { w: number; font: number; hand: number }) => Math.ceil(Math.max((L.w * 12) / L.font, (L.w * 17) / L.hand))
const WIDE_MIN = minWidth(WIDE)
const MEDIUM_MIN = minWidth(MEDIUM)

/** „Put tajne (2. dio)” – the flagship: E5 access graph across the GitOps pipeline. Changing the start remounts the sim. */
export function PutTajneGitOps() {
  const [start, setStart] = useState<StartId>('incident')
  return <Flagship key={start} start={start} onStart={setStart} />
}

function Flagship({ start, onStart }: { start: StartId; onStart: (s: StartId) => void }) {
  const sim = useSimulation<AccessState>({ init: () => createStart(start), step: (st, dt) => step(st, dt) })
  const { mutate, speed } = sim
  // tokens keep their wall-clock pace at 2× / 4× (cosmetic; outcomes do not change)
  useEffect(() => mutate((st) => setAnimationScale(st, speed)), [mutate, speed])
  const [selected, setSelected] = useState<ActorId | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = width === null || width >= WIDE_MIN ? WIDE : width >= MEDIUM_MIN ? MEDIUM : NARROW

  const s = sim.state
  const focus = s.secrets.find((x) => x.id === s.config.focusSecretId) ?? s.secrets[0]
  const sms = s.secrets.find((x) => x.id === 'sms') ?? focus
  const approach = sms.approach
  const report = evaluateAccess(s)
  const verdicts = new Map(report.verdicts.map((v) => [v.actorId, v]))
  const eyes = eyeSummary(s)
  const goals = l23Goals(s)
  const rot = rotationStatus(s, 'sms')
  const est = rotationEstimate(s, 'sms')
  const stale = staleConsumers(s, 'sms').length
  const outage = storeOutageStatus(s)
  const apiPods = s.pods.filter((p) => p.workloadId === 'api' && p.status !== 'Terminating')
  const apiReady = apiPods.filter((p) => p.status === 'Running').length
  const encOn = s.config.encryption.provider !== 'identity'
  const storeUp = s.config.store.available
  const consume = effectiveConsumeOf(s, 'worker')
  const sel = selected ? verdicts.get(selected) : undefined
  const t0 = start === 'incident' ? INCIDENT_AT : 0
  const apiFailing = apiPods.filter((p) => p.status === 'CreateContainerConfigError' || p.reason === 'FailedMount').length
  const apiStarting = apiPods.length - apiReady - apiFailing
  const noSecret = apiPods.length > 0 && apiReady === 0
  /** Klopa has used Sealed Secrets at some point (otherwise there is no controller key to lose or leak) */
  const everSealed = s.commits.some((c) => c.form === 'sealed')

  const act = (fn: (st: AccessState) => void, msg: string | null = null) => {
    setNote(msg)
    mutate(fn)
  }

  const pickEye = (id: ActorId) => {
    setSelected(id)
    mutate((st) => {
      attempt(st, id)
    })
  }

  return (
    <SimFrame
      title="Put tajne (2. dio)"
      subtitle={`ključ za SMS-gateway i lozinka baze · preset ${START_PRESET[start]} · seed ${SEED} · oči se računaju odmah`}
      sim={sim}
      showTime
      minHeight={420}
      hint={
        <>
          Vratite <code>klopa-api</code> u rad bez ručnog koraka, pa rotirajte SMS ključ.
        </>
      }
      controls={
        <>
          <Segmented<Approach>
            label="Pristup (obje tajne)"
            size="sm"
            value={approach}
            options={L23_APPROACHES.map((a) => ({ value: a, label: APPROACHES[a].label, title: APPROACHES[a].plaintextLivesIn }))}
            onChange={(a) => {
              let reason: string | null = null
              mutate((st) => {
                reason = setApproach(st, 'all', a).reason
              })
              setNote(reason)
            }}
          />
          <Toggle
            label="Šifriranje u mirovanju (KMS v2)"
            checked={encOn}
            hint={encOn ? encryptionScopeInfo(s).label : 'zapis u bazi etcd nije šifriran'}
            onChange={(on) => act((st) => setEncryption(st, on ? 'kms-v2' : 'identity'))}
          />
          <Toggle label="RBAC s najmanjim ovlastima" checked={s.config.leastPrivilege} hint={`programer ima ulogu ${roleLabel(s, 'developer')}`} onChange={(on) => act((st) => setLeastPrivilege(st, on))} />
          <Segmented<ConsumeMode> label="Kako Podovi čitaju tajne" value={consume} options={CONSUME_OPTIONS} onChange={(m) => act((st) => setConsume(st, 'all', m))} />
          <div className={styles.btnRow}>
            <Button
              variant="primary"
              onClick={() => {
                let ok = true
                mutate((st) => {
                  ok = rotateSecret(st, 'sms')
                })
                setNote(ok ? null : 'Trezor je nedostupan: nova vrijednost ne može u izvor istine.')
              }}
            >
              Rotiraj ključ
            </Button>
            <Button
              onClick={() => {
                // the Secret in the cluster may still hold the old value (ESO refresh / Argo CD sync pending): say so
                const inCluster = assetsOf(s, 'sms').find((a) => a.kind === 'etcd')
                const behind = approach !== 'csi' && inCluster !== undefined && !inCluster.versions.includes(sms.current)
                const wait = approach === 'eso' ? 'ESO ga osvježava svakih 30 s' : 'čeka da Argo CD sinkronizira novi commit'
                act((st) => restartPods(st), behind ? `Secret klopa-sms još ima staru vrijednost: ${wait} (ili „Osvježi odmah” u Naprednom). Podove ponovno pokrenite kad Secret dobije novu verziju.` : null)
              }}
            >
              Ponovno pokreni Podove
            </Button>
          </div>
          <ControlGroup title="Pokvarite">
            <div className={styles.btnCol}>
              <Button variant="danger" onClick={() => act((st) => void commitPlainSecret(st, 'sms'))}>
                Spremi običan Secret u Git
              </Button>
              <Button variant="danger" onClick={() => (everSealed ? act((st) => loseControllerKey(st)) : setNote('Klopa još ne koristi Sealed Secrets: nema ključa kontrolera koji bi se izgubio. Najprije odaberite SealedSecret.'))}>
                Izgubi privatni ključ kontrolera
              </Button>
              <Button variant="danger" onClick={() => (everSealed ? act((st) => leakControllerKey(st)) : setNote('Klopa još ne koristi Sealed Secrets: nema ključa kontrolera koji bi procurio. Najprije odaberite SealedSecret.'))}>
                Procurio privatni ključ kontrolera
              </Button>
              {storeUp ? (
                <Button variant="danger" onClick={() => act((st) => setStoreAvailable(st, false))}>
                  Trezor nedostupan
                </Button>
              ) : (
                <Button variant="success" onClick={() => act((st) => setStoreAvailable(st, true))}>
                  Vrati trezor
                </Button>
              )}
              <Button variant="danger" onClick={() => act((st) => void leakToCiLog(st, 'sms'))}>
                Token u CI logu
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible defaultOpen={start !== 'incident'}>
            <div className={styles.btnCol}>
              <Segmented<StartId>
                label="Početno stanje"
                size="sm"
                value={start}
                options={(['incident', 'l23'] as const).map((id) => ({ value: id, label: START_LABEL[id], title: `preset ${START_PRESET[id]} · seed ${SEED}` }))}
                onChange={onStart}
              />
              <p className={styles.timingNote}>
                <Badge tone="blue">Argo CD: {TIMING.argoPoll.label}</Badge> <Badge tone="green">ESO: {TIMING.esoRefresh.label}</Badge> <Badge tone="neutral">datoteka u volumenu: {TIMING.kubeletSync.sim} s (sim) · stvarno do ~1,5 min</Badge> <Badge tone="neutral">novi ključ za pečaćenje: {TIMING.sealedKeyRenewal.label}</Badge>
              </p>
              <Button
                onClick={() => {
                  let n = 0
                  mutate((st) => {
                    n = deleteLeakedCommit(st, 'sms')
                  })
                  setNote(
                    n
                      ? 'Commit je nestao s grane, ali klonovi ga i dalje imaju. Oko Gita ostaje otvoreno.'
                      : null, // the engine's event says why (e.g. the leaked commit is still HEAD: move the key out of Git first)
                  )
                }}
              >
                Obriši procurjeli commit
              </Button>
              <Button onClick={() => act((st) => renewSealingKey(st))}>Obnovi ključ za pečaćenje</Button>
              <Toggle label="Sigurnosna kopija ključeva" checked={s.config.sealed.keyBackup} hint="ključevi kontrolera izvan klastera" onChange={(on) => act((st) => setKeyBackup(st, on))} />
              <Button
                onClick={() =>
                  act((st) => {
                    argoHardRefresh(st)
                    forceEsoSync(st)
                  })
                }
              >
                Osvježi odmah
              </Button>
              <Toggle label="CSI: automatska rotacija" checked={s.config.csi.rotation} hint="alfa, po zadanom isključena" onChange={(on) => act((st) => setCsiRotation(st, on))} />
              <Button onClick={() => act((st) => rebuildCluster(st))}>Podigni novi klaster</Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          {note && (
            <p className={styles.ctlNote} role="status">
              {note}
            </p>
          )}
          <StatRow>
            <Stat
              label="Crvene oči"
              value={`${eyes.red} od ${eyes.total}`}
              tone={eyes.red <= eyes.honestLimit ? (noSecret ? 'warn' : 'ok') : eyes.red > 5 ? 'bad' : 'warn'}
              sub={noSecret && eyes.red <= eyes.honestLimit ? 'malo jer klopa-api ne radi' : eyes.honestLimit ? `iskrena granica: ${eyes.honestLimit}` : undefined}
            />
            <Stat
              label="klopa-api spremno"
              value={`${apiReady} / ${apiPods.length}`}
              tone={apiReady === apiPods.length && apiPods.length > 0 ? 'ok' : apiFailing ? 'bad' : 'warn'}
              sub={
                apiFailing
                  ? `${plural(apiFailing, ['Pod ne može', 'Poda ne mogu', 'Podova ne može'])} krenuti`
                  : apiStarting > 0
                    ? plural(apiStarting, ['Pod se pokreće', 'Poda se pokreću', 'Podova se pokreće'])
                    : 'svi Podovi rade'
              }
            />
            <Stat label="SMS ključ" value={`v${sms.current}`} tone={stale ? 'warn' : 'ok'} sub={stale ? `${stale} na staroj vrijednosti` : `svi Podovi koriste v${sms.current}`} />
            <Stat label="Rotacija" value={rot.phase === 'idle' ? '–' : rot.phase === 'done' ? 'gotova' : 'u tijeku'} sub={rot.phase === 'idle' ? `procjena: ${est.label}` : rot.label} />
          </StatRow>
          {outage.active && outage.next && <p className={styles.timingNote}>Trezor je nedostupan. {outage.next}</p>}
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Svi čitatelji Gita sivi', done: goals.gitGrey },
                { text: 'Rotirajte SMS ključ u < 5 min bez lozinke u Gitu', done: goals.rotateFast.done },
                { text: 'Ispravno reagirajte na procurjeli commit', done: goals.leakHandled },
                { text: 'Preživite nedostupan trezor', done: goals.survivedStoreOutage },
              ]}
            />
            {/* the „incident” start is already INCIDENT_AT s into the engine's clock: show times on the sim's clock */}
            <EventLog events={s.events.map((e) => ({ id: e.id, t: Math.max(0, e.t - t0), text: e.text, tone: e.tone }))} />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.mapWrap}>
        <div style={L === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
          <PipelineMap s={s} L={L} selected={selected} />
        </div>
      </div>
      <div className={styles.board} role="group" aria-label={`Tko vidi ${focus.labelAcc}: kliknite oko za pokušaj čitanja`}>
        {EYES.map((id, i) => {
          const v = verdicts.get(id)
          if (!v) return null
          const why = v.reads ? v.paths[0]?.short : v.level === 'stale' ? 'zna samo opozvanu vrijednost' : (v.blocked[0]?.reason ?? 'nema puta do vrijednosti')
          return (
            <RoughBox key={id} className={styles.eyeCard} stroke={v.reads ? 'var(--red)' : 'var(--ink-3)'} double={v.reads} dash={v.reads ? undefined : '5 4'} strokeWidth={v.reads ? 1.7 : 1.3} seed={2560 + i * 11} pad={2}>
              <button type="button" className={styles.eyeBtn} aria-pressed={selected === id} data-reads={v.reads ? 'da' : 'ne'} onClick={() => pickEye(id)}>
                <span className={styles.eyeHead}>
                  <EyeIcon open={v.reads} seed={2500 + i * 13} size={36} />
                  <span className={styles.eyeNo}>{i + 1}</span>
                  <span className={styles.eyeName}>{actorLabel(s, id)}</span>
                </span>
                <span className={styles.eyeVerdict}>{v.reads ? (v.honestLimit ? 'čita · iskrena granica' : 'čita') : 'ne čita'}</span>
                <span className={styles.eyeWhy}>
                  {codeSegments(why ?? '').map((seg, k) =>
                    seg.code ? (
                      <span key={k} className={styles.noteCmd}>
                        {seg.t}
                      </span>
                    ) : (
                      seg.t
                    ),
                  )}
                </span>
              </button>
            </RoughBox>
          )
        })}
      </div>
      {sel && selected && (
        <StickyNote c={sel.reads ? 'pink' : 'green'} className={styles.why}>
          <p className={styles.whyHead}>
            {actorLabel(s, selected)}: {sel.reads ? `čita ${focus.labelAcc}` : `ne čita ${focus.labelAcc}`}
          </p>
          <ul>
            {sel.reads
              ? sel.paths.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    {p.text} <span className={styles.noteCmd}>{p.action}</span>
                  </li>
                ))
              : sel.blocked.slice(0, 3).map((b, i) => (
                  <li key={i}>
                    <span className={styles.noteCmd}>{b.action}</span> → {b.reason}
                  </li>
                ))}
          </ul>
          {sel.honestLimit && <p>Ovo oko ne zatvara nijedan alat za tajne: na kraju svaki pristup daje vrijednost Podu, a tko smije stvoriti Pod u Namespaceu, smije u njega montirati i tajnu.</p>}
        </StickyNote>
      )}
    </SimFrame>
  )
}
