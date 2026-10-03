import { useEffect, useRef } from 'react'
import { RoughBox } from '../../../kit'
import { OWNER_LABEL, type YamlLine } from './gateway-yaml'
import type { Access } from './gateway-model'
import css from '../styles.module.css'

/**
 * The config as YAML on graph paper. Lines of the rule that the last requests matched are marked with the yellow
 * marker (the same `Mark` look); in the roles view every document gets its owner's colour strip + a word.
 * When the structure changes, the sheet scrolls itself to the first problem line, else to the first HTTPRoute
 * (the part the requests light up), so the lit rule is on screen without scrolling.
 */
export function YamlPanel({ lines, lit, roles, title }: { lines: YamlLine[]; lit: Set<number>; roles: boolean; title: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const hasRules = lines.some((l) => l.ruleId !== undefined)
  const firstBad = lines.findIndex((l) => l.bad)
  const firstRoute = lines.findIndex((l) => l.owner === 'route')
  const target = firstBad >= 0 ? firstBad : Math.max(0, firstRoute)
  const lead = firstBad >= 0 ? 4 : 0
  const count = lines.length
  useEffect(() => {
    const pre = preRef.current
    if (!pre) return
    const el = pre.children[Math.max(0, target - lead)] as HTMLElement | undefined
    pre.scrollTop = el ? Math.max(0, el.offsetTop - 2) : 0
  }, [title, count, target, lead])
  return (
    <div className={css.yamlWrap}>
      <div className={css.yamlHead}>
        <span className={css.yamlFile}>{title}</span>
        {hasRules && (
          <span className={css.yamlHint}>
            <span className={css.litSwatch} aria-hidden="true" /> pravilo koje upravo odgovara
          </span>
        )}
      </div>
      <RoughBox className={css.yamlBox} stroke="var(--ink-3)" strokeWidth={1.4} pad={2} seed={1951}>
        <pre ref={preRef} className={css.yaml} tabIndex={0} aria-label={`${title}: trenutačna konfiguracija`}>
          {lines.map((l, i) => {
            const showOwner = roles && l.owner !== (i > 0 ? lines[i - 1].owner : null) && l.owner !== 'ingress'
            const on = l.ruleId !== undefined && lit.has(l.ruleId)
            const cls = [css.yl, roles ? css[`own_${l.owner}`] : '', on ? css.lit : '', l.bad ? css.ybad : '', l.note ? css.ynote : ''].filter(Boolean).join(' ')
            return (
              <span key={i} className={cls}>
                {showOwner && <span className={css.ownerChip}>{OWNER_LABEL[l.owner]}</span>}
                {l.bad ? '✗ ' : ''}
                {l.text}
                {'\n'}
              </span>
            )
          })}
        </pre>
      </RoughBox>
    </div>
  )
}

const CODE_TONE: Record<string, string> = { ok: css.aOk, leak: css.aWarn, app404: css.aBad, gw404: css.aBad, gw500: css.aBad, tls: css.aBad }

/** The Gateway's access log: the last decisions, newest first (what came in, which rule, which Pod, what came back). */
export function AccessLog({ items, mode }: { items: Access[]; mode: 'lb' | 'gw' }) {
  return (
    <div className={css.access}>
      <div className={css.accessHead}>{mode === 'gw' ? 'Dnevnik Gatewaya · zadnji zahtjevi' : 'Što je stiglo do aplikacije · zadnji zahtjevi'}</div>
      <ol className={css.accessList}>
        {items.slice(0, 5).map((a) => (
          <li key={a.id} className={css.accessItem}>
            <span className={css.aReq}>
              {a.tls ? 'https' : 'http'}://{a.host}
              {a.path}
              {a.beta && <span className={css.aBeta}> x-beta: 1</span>}
            </span>
            <span className={css.aDec}>
              → {a.route}
              {a.svc && a.outcome !== 'tls' && a.outcome !== 'gw404' ? ` → ${a.svc}` : ''}
              {a.pod ? ` · ${a.pod}` : ''}{' '}
              <span className={CODE_TONE[a.outcome]}>
                {a.outcome === 'ok' ? '✓ 200' : a.outcome === 'leak' ? '! 200 (admin javno)' : a.outcome === 'tls' ? '✗ TLS' : `✗ ${a.code}`}
              </span>
            </span>
          </li>
        ))}
        {!items.length && <li className={css.accessItem}>čekamo prve zahtjeve…</li>}
      </ol>
    </div>
  )
}
