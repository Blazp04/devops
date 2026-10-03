import { useMemo, useState } from 'react'
import { Segmented, SimFrame } from '../../../kit'
import { actorLabel, attemptOptions, createAccessPreset, roleLabel, setActorRules, setApproach, verdictOf } from '../../../engines/access/index.ts'
import type { ActorId } from '../../../engines/access/index.ts'
import { EyeIcon } from './Eye'
import styles from '../styles.module.css'

type Who = 'view' | 'edit' | 'deployer' | 'watch' | 'app'
type Where = 'configmap' | 'secret'

const WHO: { value: Who; label: string; who: string; title: string; actor: ActorId }[] = [
  { value: 'view', label: 'uloga view', who: 'Petra', title: 'Petra: ugrađena uloga view u Namespaceu klopa', actor: 'view-user' },
  { value: 'edit', label: 'uloga edit', who: 'Lana', title: 'Lana: ugrađena uloga edit u Namespaceu klopa', actor: 'developer' },
  { value: 'deployer', label: 'smije stvarati Podove', who: 'CI bot', title: 'CI bot: smije stvarati Deploymente i Podove, nema nijedno pravo na secrets', actor: 'pod-creator' },
  { value: 'watch', label: 'view + watch na secrets', who: 'Petra', title: 'Petra: uloga view i još jedno pravilo – watch na secrets', actor: 'view-user' },
  { value: 'app', label: 'Pod aplikacije', who: 'Napadač', title: 'napadač unutar kontejnera klopa-api (ServiceAccount bez uloga)', actor: 'compromised-pod' },
]

/**
 * Scene „Tko može pročitati?” on engine E5: pick an identity and where the password lives; every row is one thing
 * that identity can try (kubectl get / list / watch, a new Pod that mounts it, exec) and what RBAC says.
 */
export function WhoCanRead() {
  const [who, setWho] = useState<Who>('view')
  const [where, setWhere] = useState<Where>('secret')
  const pick = WHO.find((w) => w.value === who) ?? WHO[0]
  const view = useMemo(() => {
    const s = createAccessPreset('l16')
    setApproach(s, 'db', where)
    if (who === 'watch') setActorRules(s, 'view-user', [{ resources: ['secrets'], verbs: ['watch'] }], 'watch na secrets')
    const v = verdictOf(s, pick.actor)
    return { label: actorLabel(s, pick.actor), role: roleLabel(s, pick.actor), reads: v.reads, options: attemptOptions(s, pick.actor) }
  }, [who, where, pick.actor])

  return (
    <SimFrame
      title="Tko može pročitati?"
      subtitle="Namespace klopa · lozinka baze · RBAC samo dopušta"
      hint="Ulogu view isprobajte prvo sa Secretom, pa s ConfigMapom. Zatim dodajte samo watch – i pogledajte CI bota koji ne smije ništa sa Secretima."
      controls={
        <>
          <Segmented<Who> label="Tko pokušava" value={who} options={WHO.map(({ value, label, title }) => ({ value, label, title }))} onChange={setWho} />
          <Segmented<Where>
            label="Lozinka je u"
            value={where}
            options={[
              { value: 'configmap', label: 'ConfigMapu' },
              { value: 'secret', label: 'Secretu' },
            ]}
            onChange={setWhere}
          />
        </>
      }
    >
      <div className={styles.explorer}>
        <div className={styles.explorerHead}>
          <p className={styles.bigVerdict} data-reads={view.reads ? 'da' : 'ne'} aria-live="polite">
            <EyeIcon open={view.reads} seed={2301} size={54} />
            <span>
              {pick.who} ({pick.label}): {view.reads ? 'čita lozinku' : 'ne čita lozinku'}
            </span>
          </p>
        </div>
        <ul className={styles.rows} aria-label={`Što pokušava: ${view.label} (uloga ${view.role})`}>
          {view.options.map((o) => (
            <li key={o.pathId} className={styles.row}>
              <EyeIcon open={o.ok} seed={2310 + o.pathId.length} size={34} />
              <code className={styles.rowCmd} style={{ whiteSpace: 'normal' }}>{o.action}</code>
              <span className={styles.rowOut} data-ok={o.ok ? 'da' : 'ne'}>
                {o.ok ? '✗ čita lozinku' : `✓ ${o.outcome}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SimFrame>
  )
}
