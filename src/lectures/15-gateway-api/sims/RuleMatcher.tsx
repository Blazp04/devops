import { useState } from 'react'
import { Segmented, Select, Toggle, fmt } from '../../../kit'
import { ROUTE_NAME, backendShare, matchRequest, type Host, type Rule } from './routing'
import { DEMO_HOSTS, DEMO_PATHS, DEMO_RULES, RULE_NOTE } from './matcher-data'
import css from '../styles.module.css'

const mark = (v: boolean | null) => (v === null ? '–' : v ? <span className={css.markOk}>✓</span> : <span className={css.markBad}>✗</span>)

function ruleName(r: Rule) {
  const same = DEMO_RULES.filter((x) => x.host === r.host)
  return `${ROUTE_NAME[r.host]} #${same.indexOf(r) + 1}`
}

function cond(r: Rule) {
  return `${r.host} · ${r.pathType} ${r.path}${r.beta ? ' · x-beta: 1' : ''}`
}

function target(r: Rule) {
  if (r.backends.length === 1) return r.backends[0].svc
  return r.backends.map((b, i) => `${b.svc} (${fmt.pct(backendShare(r, i))})`).join(' ili ')
}

/** „Koje pravilo vrijedi?”: build a request, see every rule checked (domena, putanja, zaglavlje) and which one wins. */
export function RuleMatcher() {
  const [host, setHost] = useState<Host>('klopa.example')
  const [path, setPath] = useState('/api/narudzbe')
  const [beta, setBeta] = useState(true)
  const res = matchRequest(DEMO_RULES, { host, path, beta })
  return (
    <div className={css.panel}>
      <div className={css.controlsRow}>
        <Segmented label="Domena" size="sm" value={host} onChange={setHost} options={DEMO_HOSTS.map((h) => ({ value: h, label: h }))} />
        <Select label="Putanja" value={path} options={DEMO_PATHS.map((p) => ({ value: p, label: p }))} onChange={setPath} />
        <Toggle label="zaglavlje x-beta: 1" checked={beta} onChange={setBeta} />
      </div>
      <p className={css.verdict} aria-live="polite">
        <span className="mono">
          GET {host}
          {path}
          {beta ? ' · x-beta: 1' : ''}
        </span>{' '}
        →{' '}
        {res.rule ? (
          <>
            <strong>{ruleName(res.rule)}</strong> → <strong>{target(res.rule)}</strong>
            {res.rule.backends.length > 1 && ' – bira se za svaki zahtjev posebno'}. {res.why}
          </>
        ) : (
          <>
            <strong className={css.bad}>404</strong>. {res.why}
          </>
        )}
      </p>
      <table className={css.matchTable}>
        <caption className="visually-hidden">Provjera svakog pravila za zahtjev</caption>
        <thead>
          <tr>
            <th scope="col">pravilo</th>
            <th scope="col">domena</th>
            <th scope="col">putanja</th>
            <th scope="col">zaglavlje</th>
          </tr>
        </thead>
        <tbody>
          {res.checks.map((c) => {
            const win = res.rule?.id === c.rule.id
            return (
              <tr key={c.rule.id} className={win ? css.winRow : c.matches ? undefined : css.shadow}>
                <td>
                  <strong>{ruleName(c.rule)}</strong>
                  {win && <span className={css.bad}> ← vrijedi</span>}
                  <br />
                  {cond(c.rule)}
                  <br />
                  <span style={{ fontFamily: 'var(--f-hand)', fontSize: 18 }}>{RULE_NOTE[c.rule.id]}</span>
                </td>
                <td className={css.mark} aria-label={c.shadowedByExact ? 'domena odgovara, ali postoji točnija ruta' : c.hostOk ? 'odgovara' : 'ne odgovara'}>
                  {c.shadowedByExact ? '(✓)' : mark(c.hostOk)}
                </td>
                <td className={css.mark}>{mark(c.pathOk)}</td>
                <td className={css.mark}>{mark(c.headerOk)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {res.checks.some((c) => c.shadowedByExact) && (
        <p className={css.note}>(✓) = zamjenski znak *.klopa.example odgovara, ali postoji ruta s točno ovom domenom, pa se pravila zamjenske rute ne gledaju.</p>
      )}
    </div>
  )
}
