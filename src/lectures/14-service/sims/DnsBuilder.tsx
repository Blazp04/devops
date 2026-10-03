import { useState } from 'react'
import { RoughBox, Segmented } from '../../../kit'
import { dnsCandidates, resolveDns } from '../../../engines/cluster'
import { createLab } from '../lab'
import css from '../dns.module.css'

type Ns = 'klopa' | 'klopa-staging'
type Form = 'short' | 'ns' | 'fqdn'

const QUERY: Record<Form, string> = {
  short: 'klopa-api',
  ns: 'klopa-api.klopa',
  fqdn: 'klopa-api.klopa.svc.cluster.local',
}

/** The four pieces of a Service's DNS name, each with its meaning. */
function pieces(fqdn: string): { text: string; role: string }[] {
  const [svc, ns, ...rest] = fqdn.split('.')
  return [
    { text: svc, role: 'ime Servicea' },
    { text: `.${ns}`, role: 'Namespace' },
    { text: `.${rest[0]}`, role: 'Service' },
    { text: `.${rest.slice(1).join('.')}`, role: 'domena klastera' },
  ]
}

/** Scene 3: the name is assembled piece by piece; the Pod's resolver tries its search path (E3 resolveDns). */
export function DnsBuilder() {
  // a cluster to ask (Services klopa-api in Namespace klopa); nothing runs, so no simulation loop is needed
  const [cluster] = useState(() => createLab({ staging: true }))
  const [ns, setNs] = useState<Ns>('klopa')
  const [form, setForm] = useState<Form>('short')
  const query = QUERY[form]
  const answer = resolveDns(cluster, query, ns)
  const candidates = dnsCandidates(query, ns)
  // try the names in order, as the Pod's resolver does, until one exists
  const tried: { name: string; ok: boolean }[] = []
  for (const c of candidates) {
    const ok = resolveDns(cluster, `${c}.`, ns).kind !== 'NXDOMAIN'
    tried.push({ name: c, ok })
    if (ok) break
  }
  const found = answer.kind !== 'NXDOMAIN'
  const typed = query.split('.').length
  const parts = pieces(found ? answer.name : `${query}.${ns}.svc.cluster.local`.split('.').slice(0, 5).join('.'))
  return (
    <RoughBox className={css.box} stroke="var(--ink-3)" strokeWidth={1.4} dash="6 5" fillColor="var(--paper-2)" fillStyle="solid" seed={1460}>
      <div className={css.controls}>
        <Segmented<Ns>
          label="Pod koji pita živi u Namespaceu"
          value={ns}
          options={[
            { value: 'klopa', label: 'klopa' },
            { value: 'klopa-staging', label: 'klopa-staging' },
          ]}
          onChange={setNs}
          size="sm"
        />
        <Segmented<Form>
          label="U kodu piše"
          value={form}
          options={[
            { value: 'short', label: 'klopa-api' },
            { value: 'ns', label: 'klopa-api.klopa' },
            { value: 'fqdn', label: 'puno ime' },
          ]}
          onChange={setForm}
          size="sm"
        />
      </div>
      <div className={css.name} aria-label={`Ime koje se traži: ${parts.map((p) => p.text).join('')}`}>
        {parts.map((p, i) => (
          <span key={i} className={`${css.piece} ${i < typed ? css.typed : css.added} ${!found && i === 1 ? css.wrong : ''}`}>
            <span className={css.pieceText}>{p.text}</span>
            <span className={css.role}>{i < typed ? p.role : `${p.role} · dodaje razrješivač`}</span>
          </span>
        ))}
      </div>
      <ol className={css.tries}>
        {tried.map((t) => (
          <li key={t.name} className={t.ok ? css.ok : css.nx}>
            <span className={css.mark} aria-hidden="true">
              {t.ok ? '✓' : '✗'}
            </span>
            <code>{t.name}</code> {t.ok ? `→ ${answer.ips[0] ?? ''}` : '→ NXDOMAIN (ne postoji)'}
          </li>
        ))}
      </ol>
      <p className={css.answer}>
        {found ? (
          <>
            <strong>{answer.ips[0]}</strong> – ClusterIP Servicea klopa-api. Isti odgovor dobiva svaki Pod, koliko god se Podovi iza Servicea mijenjali.
          </>
        ) : (
          <>
            <strong className={css.bad}>NXDOMAIN.</strong> Kratko ime traži se samo u Namespaceu Poda koji pita. U <code>klopa-staging</code> nema Servicea klopa-api – trebalo je napisati barem{' '}
            <code>klopa-api.klopa</code>.
          </>
        )}
      </p>
    </RoughBox>
  )
}
