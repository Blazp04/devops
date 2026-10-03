import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, RoughBox, Segmented, Select, Slider, Toggle, fmt, plural } from '../../../kit'
import { HOST_MATCHES, describeRule, type HostMatch, type PathType, type Rule } from './routing'
import { PATH_CHOICES, SVC_NAMES, ruleLabel, svcByName } from './gateway-model'
import css from '../styles.module.css'

interface Draft {
  id: number | null
  host: HostMatch
  pathType: PathType
  path: string
  beta: boolean
  svc1: string
  split: boolean
  svc2: string
  share: number
}

const blank = (): Draft => ({ id: null, host: 'klopa.example', pathType: 'PathPrefix', path: '/api', beta: false, svc1: 'klopa-api', split: false, svc2: 'klopa-api-141', share: 10 })

function fromRule(r: Rule): Draft {
  const t = r.backends.reduce((s, b) => s + b.weight, 0)
  return {
    id: r.id,
    host: r.host,
    pathType: r.pathType,
    path: r.path,
    beta: r.beta,
    svc1: r.backends[0]?.svc ?? 'klopa-web',
    split: r.backends.length > 1,
    svc2: r.backends[1]?.svc ?? 'klopa-api-141',
    share: r.backends.length > 1 && t > 0 ? Math.round((100 * r.backends[1].weight) / t) : 10,
  }
}

function toRule(d: Draft, id: number): Rule {
  return {
    id,
    host: d.host,
    pathType: d.pathType,
    path: d.path,
    beta: d.beta,
    backends: d.split ? [{ svc: d.svc1, weight: 100 - d.share }, { svc: d.svc2, weight: d.share }] : [{ svc: d.svc1, weight: 1 }],
  }
}

const svcOptions = (cur: string) => {
  const opts = SVC_NAMES.map((n) => ({ value: n as string, label: n as string }))
  if (!svcByName(cur)) opts.push({ value: cur, label: `${cur} (ne postoji!)` })
  return opts
}

/**
 * Graditelj pravila: the HTTPRoute rules as cards (edit / delete) and a form for one rule
 * (hostname, PathPrefix/Exact, path, header, backendRefs with weights).
 */
export function RuleBuilder({ rules, hits, onSave, onDelete, disabled }: { rules: Rule[]; hits: Record<number, number>; onSave: (r: Rule, isNew: boolean) => void; onDelete: (id: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const nextId = Math.max(0, ...rules.map((r) => r.id)) + 1
  const editingGone = draft?.id != null && !rules.some((r) => r.id === draft.id)
  const d = editingGone ? null : draft

  return (
    <div className={css.builder}>
      <ul className={css.ruleList} aria-label="Pravila u HTTPRouteovima">
        {rules.map((r) => {
          const broken = r.backends.some((b) => !svcByName(b.svc))
          return (
            <RoughBox
              as="li"
              key={r.id}
              className={`${css.ruleCard} ${broken ? css.ruleBroken : ''}`}
              stroke={broken ? 'var(--red)' : d?.id === r.id ? 'var(--pen)' : 'var(--ink-3)'}
              dash={d?.id === r.id ? '5 4' : undefined}
              strokeWidth={1.4}
              pad={1}
              seed={1960 + r.id}
            >
              <span className={css.ruleName}>{ruleLabel(rules, r.id)}</span>
              <span className={css.ruleText}>
                {broken ? '✗ ' : ''}
                {describeRule(r)}
              </span>
              <span className={css.ruleFoot}>
                <span className={css.ruleHits}>{hits[r.id] ? `${fmt.num(hits[r.id])} ${plural(hits[r.id], ['zahtjev', 'zahtjeva', 'zahtjeva'])} u 20 s` : 'još nijedan zahtjev'}</span>
                <span className={css.ruleBtns}>
                  <Button size="sm" variant="ghost" icon={Pencil} disabled={disabled} onClick={() => setDraft(fromRule(r))}>
                    Uredi<span className="visually-hidden"> pravilo {ruleLabel(rules, r.id)}</span>
                  </Button>
                  <Button size="sm" variant="ghost" icon={Trash2} disabled={disabled} onClick={() => onDelete(r.id)}>
                    Obriši<span className="visually-hidden"> pravilo {ruleLabel(rules, r.id)}</span>
                  </Button>
                </span>
              </span>
            </RoughBox>
          )
        })}
        {!rules.length && (
          <RoughBox as="li" className={css.ruleCard} stroke="var(--ink-3)" dash="5 4" strokeWidth={1.4} pad={1} seed={1959}>
            Nema nijednog pravila: sve završava s 404.
          </RoughBox>
        )}
      </ul>
      {!d ? (
        <Button size="sm" icon={Plus} disabled={disabled} onClick={() => setDraft(blank())}>
          Dodaj pravilo
        </Button>
      ) : (
        <div className={css.form} role="group" aria-label={d.id == null ? 'Novo pravilo' : 'Uređivanje pravila'}>
          <div className={css.formTitle}>{d.id == null ? 'Novo pravilo' : `Uređujete ${ruleLabel(rules, d.id)}`}</div>
          <Select label="hostnames" value={d.host} options={HOST_MATCHES.map((h) => ({ value: h, label: h }))} onChange={(v) => set({ host: v })} />
          <Segmented
            label="putanja"
            size="sm"
            value={d.pathType}
            options={[
              { value: 'PathPrefix', label: 'PathPrefix', title: 'Prefiks po cijelim dijelovima putanje: /api hvata /api i /api/…' },
              { value: 'Exact', label: 'Exact', title: 'Samo točno ta putanja' },
            ]}
            onChange={(v) => set({ pathType: v })}
          />
          <Select label="value" value={d.path} options={PATH_CHOICES.map((p) => ({ value: p, label: p }))} onChange={(v) => set({ path: v })} />
          <Toggle label="zaglavlje x-beta: 1" checked={d.beta} onChange={(v) => set({ beta: v })} />
          <Select label="backendRefs" value={d.svc1} options={svcOptions(d.svc1)} onChange={(v) => set({ svc1: v })} />
          <Toggle label="Podijeli promet težinama" checked={d.split} onChange={(v) => set({ split: v })} />
          {d.split && (
            <>
              <Select label="drugi backend" value={d.svc2} options={svcOptions(d.svc2)} onChange={(v) => set({ svc2: v })} />
              <Slider label="udio drugog" value={d.share} min={0} max={50} step={5} onChange={(v) => set({ share: v })} format={(v) => `weight ${100 - v} / ${v}`} />
            </>
          )}
          <div className={css.formBtns}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onSave(toRule(d, d.id ?? nextId), d.id == null)
                setDraft(null)
              }}
            >
              Spremi pravilo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Odustani
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
