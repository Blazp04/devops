import { useEffect, useState } from 'react'
import { Button, ControlGroup, EventLog, Goals, plural, RoughBox, Segmented, SimFrame, Stat, StatRow, StickyNote, Toggle, useSimulation, useWidth } from '../../../kit'
import {
  actorLabel,
  APPROACHES,
  attempt,
  commitPlainSecret,
  consumeLocked,
  effectiveConsumeOf,
  encryptionScopeInfo,
  evaluateAccess,
  eyeSummary,
  l16Goals,
  L16_APPROACHES,
  leakEnvToLog,
  restartPods,
  roleLabel,
  rotateSecret,
  rotationStatus,
  setAnimationScale,
  setApproach,
  setConsume,
  setEncryption,
  setLeastPrivilege,
  staleConsumers,
  stealControlPlaneDisk,
  stealEtcdBackup,
  step,
  TIMING,
} from '../../../engines/access/index.ts'
import type { AccessState, ActorId, Approach, ConsumeMode, Provider } from '../../../engines/access/index.ts'
import { createIncidentState, EYES, INCIDENT_PRESET, INCIDENT_SEED, NARROW, WIDE } from '../lib/flagship'
import { EyeIcon } from './Eye'
import { SecretMap } from './SecretMap'
import styles from '../styles.module.css'

type KeyChoice = Extract<Provider, 'secretbox' | 'kms-v2'>

const CONSUME_OPTIONS: { value: ConsumeMode; label: string; title: string }[] = [
  { value: 'env', label: 'env', title: 'varijabla okruženja (secretKeyRef)' },
  { value: 'volume', label: 'volumen', title: 'datoteka u montiranom volumenu' },
  { value: 'subPath', label: 'subPath', title: 'jedna datoteka montirana sa subPath' },
]

/** The wide map needs its smallest lettering (font − 1 units) to stay ≥ 12 px on screen. */
const WIDE_MIN = Math.ceil((WIDE.w * 12) / (WIDE.font - 1))

export function PutTajne() {
  const sim = useSimulation<AccessState>({ init: createIncidentState, step: (st, dt) => step(st, dt) })
  const { mutate, speed } = sim
  // tokens keep their wall-clock pace at 2× / 4× (cosmetic; outcomes do not change)
  useEffect(() => mutate((st) => setAnimationScale(st, speed)), [mutate, speed])
  const [keyChoice, setKeyChoice] = useState<KeyChoice>('secretbox')
  const [selected, setSelected] = useState<ActorId | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = width === null || width >= WIDE_MIN ? WIDE : NARROW

  const s = sim.state
  const secret = s.secrets[0]
  const report = evaluateAccess(s)
  const verdicts = new Map(report.verdicts.map((v) => [v.actorId, v]))
  const eyes = eyeSummary(s)
  const goals = l16Goals(s)
  const rot = rotationStatus(s)
  const stale = staleConsumers(s).length
  const encOn = s.config.encryption.provider !== 'identity'
  const scope = encryptionScopeInfo(s)
  const lock = consumeLocked(s, 'api')
  const consume = effectiveConsumeOf(s, 'api')
  const sel = selected ? verdicts.get(selected) : undefined

  // paused (e.g. prefers-reduced-motion): resolve the attempt at once instead of leaving the token at its start
  const settle = () => {
    if (sim.running) return
    let need = 0
    mutate((st) => {
      for (const a of st.attempts) if (a.doneAt === null) need = Math.max(need, a.hops.length * a.hopDur - (st.t - a.startedAt))
    })
    if (need > 0) sim.stepOnce(need + 0.1)
  }
  const act = (fn: (st: AccessState) => void) => {
    mutate(fn)
    settle()
  }
  const pickEye = (id: ActorId) => {
    setSelected(id)
    act((st) => {
      attempt(st, id)
    })
  }

  return (
    <SimFrame
      title="Put tajne"
      subtitle={`lozinka baze Klope · preset ${INCIDENT_PRESET} · seed ${INCIDENT_SEED} · oči se računaju odmah`}
      sim={sim}
      showTime
      hint={
        <>
          Zatvorite što više očiju: premjestite lozinku i uključite zaštite. Kliknite karticu oka ispod crteža da vidite kojim putem čita. Na kraju rotirajte lozinku bez ponovnog pokretanja Poda.
        </>
      }
      controls={
        <>
          <Segmented<Approach>
            label="Gdje je lozinka"
            value={secret.approach}
            options={L16_APPROACHES.map((a) => ({ value: a, label: APPROACHES[a].label }))}
            onChange={(a) =>
              mutate((st) => {
                setApproach(st, 'db', a)
              })
            }
          />
          <Toggle
            label="Šifriranje u mirovanju"
            checked={encOn}
            hint={encOn ? scope.label : 'pružatelj identity: zapis u bazi etcd nije šifriran'}
            onChange={(on) => mutate((st) => setEncryption(st, on ? keyChoice : 'identity'))}
          />
          <Segmented<KeyChoice>
            label="Gdje je ključ"
            size="sm"
            value={keyChoice}
            options={[
              { value: 'secretbox', label: 'lokalni ključ (secretbox/aesgcm)', title: 'ključ u datoteci na upravljačkoj ravnini' },
              { value: 'kms-v2', label: 'KMS v2', title: 'ključ (KEK) u vanjskom KMS-u' },
            ]}
            onChange={(k) => {
              // picking a key also turns encryption on – otherwise the choice would change nothing on the map
              setKeyChoice(k)
              mutate((st) => setEncryption(st, k))
            }}
          />
          <Toggle
            label="RBAC s najmanjim ovlastima"
            checked={s.config.leastPrivilege}
            hint={`razvojni tim ima ulogu ${roleLabel(s, 'developer')}`}
            onChange={(on) => mutate((st) => setLeastPrivilege(st, on))}
          />
          <Segmented<ConsumeMode>
            label="Kako Pod čita lozinku"
            value={consume}
            options={CONSUME_OPTIONS}
            onChange={(m) => mutate((st) => setConsume(st, 'api', m))}
          />
          {secret.approach === 'image' && <p className={styles.ctlNote}>5 očiju, ali drugih: registar i Git – njih ne zatvara nijedna zaštita.</p>}
          {lock.locked && <p className={styles.ctlNote}>{lock.reason}</p>}
          <div className={styles.btnRow}>
            <Button
              variant="primary"
              onClick={() =>
                mutate((st) => {
                  rotateSecret(st)
                })
              }
            >
              Rotiraj lozinku
            </Button>
            <Button onClick={() => mutate((st) => restartPods(st))}>Ponovno pokreni Podove</Button>
          </div>
          <ControlGroup title="Pokvarite">
            <div className={styles.btnCol}>
              <Button
                variant="danger"
                onClick={() =>
                  act((st) => {
                    stealEtcdBackup(st)
                  })
                }
              >
                Ukradi kopiju baze etcd
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  act((st) => {
                    stealControlPlaneDisk(st)
                  })
                }
              >
                Ukradi disk upravljačke ravnine
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  mutate((st) => {
                    commitPlainSecret(st)
                  })
                }
              >
                Spremi secret.yaml u Git
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  mutate((st) => {
                    leakEnvToLog(st)
                  })
                }
              >
                Ispiši env u log
              </Button>
            </div>
          </ControlGroup>
          {!sim.running && rot.phase !== 'idle' && rot.phase !== 'done' && <p className={styles.ctlNote}>Simulacija stoji – pokrenite je da rotacija napreduje.</p>}
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Crvene oči" value={`${eyes.red} od ${eyes.total}`} tone={goals.closeEyes ? 'ok' : eyes.red > 4 ? 'bad' : 'warn'} sub={eyes.honestLimit ? `ne može se zatvoriti: ${eyes.honestLimit}` : undefined} />
            <Stat label="Važeća lozinka" value={`v${secret.current}`} sub={stale ? `${plural(stale, ['Pod', 'Poda', 'Podova'])} na staroj` : 'svi Podovi na njoj'} tone={stale ? 'warn' : 'ok'} />
            <Stat label="Rotacija" value={rot.phase === 'idle' ? '–' : rot.phase === 'done' ? 'gotova' : 'u tijeku'} sub={rot.phase === 'idle' ? 'još nije pokrenuta' : rot.label} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Zatvorite što više očiju', done: goals.closeEyes },
                { text: 'Objasnite zašto oko „Smije stvarati Podove” ostaje crveno (kliknite ga kad ostanu samo dva crvena)', done: goals.podCreatorShown },
                { text: 'Rotirajte lozinku bez ponovnog pokretanja Poda', done: goals.rotateWithoutRestart },
              ]}
            />
            <EventLog events={s.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))} />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.mapWrap}>
        <div style={L === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
          <SecretMap s={s} L={L} selected={selected} />
        </div>
      </div>
      <p className={styles.timingNote}>
        Osvježavanje datoteke u volumenu: {TIMING.kubeletSync.label}
      </p>
      <div className={styles.board} role="group" aria-label="Tko vidi lozinku: kliknite oko za pokušaj čitanja">
        {EYES.map((id, i) => {
          const v = verdicts.get(id)
          if (!v) return null
          const why = v.reads ? v.paths[0]?.short : (v.blocked[0]?.reason ?? 'nema puta do lozinke')
          return (
            <RoughBox key={id} className={styles.eyeBox} stroke={v.reads ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={v.reads ? 1.8 : 1.3} dash={v.reads ? undefined : '6 5'} fillColor="var(--paper)" fillStyle="solid" seed={1900 + i * 7} pad={2}>
              <button type="button" className={styles.eyeCard} aria-pressed={selected === id} data-reads={v.reads ? 'da' : 'ne'} onClick={() => pickEye(id)}>
                <span className={styles.eyeHead}>
                  <EyeIcon open={v.reads} seed={1800 + i * 13} size={38} />
                  <span className={styles.eyeNo}>{i + 1}</span>
                  <span className={styles.eyeName}>{actorLabel(s, id)}</span>
                </span>
                <span className={styles.eyeVerdict}>{v.reads ? (v.honestLimit ? 'čita · ne može se zatvoriti' : 'čita lozinku') : 'ne čita'}</span>
                <span className={styles.eyeWhy}>{why}</span>
              </button>
            </RoughBox>
          )
        })}
      </div>
      {sel && selected && (
        <StickyNote c={sel.reads ? 'pink' : 'green'} className={styles.why}>
          <p className={styles.whyHead}>
            {actorLabel(s, selected)}: {sel.reads ? 'čita lozinku' : 'ne čita lozinku'}
          </p>
          <ul>
            {sel.reads
              ? sel.paths.map((p) => (
                  <li key={p.id}>
                    {p.text} <span className={styles.noteCmd}>{p.action}</span>
                  </li>
                ))
              : sel.blocked.slice(0, 4).map((b, i) => (
                  <li key={i}>
                    <span className={styles.noteCmd}>{b.action}</span> → {b.reason}
                  </li>
                ))}
          </ul>
          {selected === 'pod-creator' && sel.reads && (
            <p>
              Ovo oko ne zatvara ni šifriranje ni oduzimanje prava get na Secrete: tko smije stvoriti Pod, smije u njega montirati i Secret, a Pod vrijednost iznese sam.
            </p>
          )}
        </StickyNote>
      )}
    </SimFrame>
  )
}
