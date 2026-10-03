import { useEffect, useState } from 'react'
import { Lock, RotateCcw, Unplug, FileX } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, Segmented, Select, SimFrame, Stat, StatRow, Toggle, fmt, useSimulation, useWidth } from '../../../kit'
import {
  INCIDENT_SECONDS,
  LB_PRICE,
  PRESET_INCIDENT,
  SECRETS,
  SEED,
  START_RULES,
  T_IN,
  T_OUT,
  T_SERVE,
  canaryShare,
  createGw,
  entryCost,
  gwMetrics,
  log,
  ruleLabel,
  secretReason,
  secretValid,
  stepGw,
  svcByName,
  type Config,
  type GwState,
  type Mode,
  type SecretRef,
} from './gateway-model'
import { describeRule, type Rule } from './routing'
import { MEDIUM, NARROW, WIDE } from './gateway-geo'
import { gatewayYaml, ingressYaml, lbYaml } from './gateway-yaml'
import { GatewayStage } from './GatewayStage'
import { AccessLog, YamlPanel } from './YamlPanel'
import { RuleBuilder } from './RuleBuilder'
import css from '../styles.module.css'

const TYPO: Record<string, string> = { 'klopa-api': 'klopa-apl', 'klopa-web': 'klopa-wbe', 'klopa-admin': 'klopa-admn', 'klopa-api-141': 'klopa-api-14l' }

const cloneCfg = (c: Config): Config => ({ ...c, rules: c.rules.map((r) => ({ ...r, backends: r.backends.map((b) => ({ ...b })) })) })

function bubbleFor(s: GwState, allDone: boolean): { lines: string[]; buzz: boolean } {
  if (s.cfg.mode === 'lb') return { lines: ['Tri računa,', 'a /api je 404!'], buzz: true }
  const recent = s.done.filter((d) => d.t > s.t - 3)
  const has = (o: string) => recent.some((d) => d.outcome === o)
  if (has('tls')) return { lines: ['Lokot je', 'crven!'], buzz: true }
  if (has('gw500')) return { lines: ['500?!', 'Krivi Service?'], buzz: true }
  if (has('leak')) return { lines: ['Admin je', 'javan!'], buzz: true }
  if (has('gw404') || has('app404')) return { lines: ['Opet 404?!'], buzz: true }
  if (allDone) return { lines: ['Jedna vrata,', 'sve radi!'], buzz: false }
  return { lines: ['Jedna vrata!'], buzz: false }
}

export function GatewaySim() {
  const [cfg, setCfg] = useState<Config>(() => cloneCfg(PRESET_INCIDENT))
  const [roles, setRoles] = useState(false)
  const [asIngress, setAsIngress] = useState(false)
  const [showPath, setShowPath] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const [stageRef, stageW] = useWidth<HTMLDivElement>()

  const sim = useSimulation<GwState>({
    init: () => createGw(cfg, SEED),
    step: (st, dt) => stepGw(st, dt),
  })
  const { reset } = sim
  useEffect(() => {
    if (resetToken > 0) reset()
  }, [resetToken, reset])

  const s = sim.state
  const m = gwMetrics(s)
  const g = stageW === null || stageW >= 600 ? WIDE : stageW >= 480 ? MEDIUM : NARROW
  const gw = cfg.mode === 'gw'
  const cost = entryCost(cfg.mode)

  /** apply a config change right away (also while paused) and log it */
  const apply = (next: Config, text: string, tone: 'info' | 'warn' | 'bad' | 'ok' = 'info') => {
    setCfg(next)
    sim.mutate((st) => {
      if (st.cfg.mode !== next.mode) {
        st.reqs = []
        for (const k of Object.keys(st.inflight)) st.inflight[k] = st.inflight[k].map(() => 0)
      }
      st.cfg = cloneCfg(next)
      log(st, text, tone)
      const missing = next.rules.flatMap((r) => r.backends.filter((b) => !svcByName(b.svc)).map((b) => `${ruleLabel(next.rules, r.id)}: ${b.svc}`))
      if (next.mode === 'gw' && missing.length) log(st, `HTTPRoute: ResolvedRefs=False (BackendNotFound – ${missing.join(', ')}).`, 'bad')
      if (next.mode === 'gw' && next.https && !secretValid(next.secret)) log(st, `Gateway klopa-gw: slušatelj https Programmed=False (${secretReason(next.secret)}).`, 'bad')
    })
  }

  const setMode = (mode: Mode) => {
    if (mode === cfg.mode) return
    const next = mode === 'gw' ? { ...cloneCfg(cfg), mode, rules: cfg.rules.length ? cfg.rules : START_RULES() } : { ...cloneCfg(cfg), mode }
    apply(next, mode === 'gw' ? 'Ulaz: jedan Gateway iza jednog load balancera (jedna javna adresa).' : 'Ulaz: tri LoadBalancer Servicea (tri javne adrese).', 'info')
  }
  const saveRule = (r: Rule, isNew: boolean) => {
    const rules = isNew ? [...cfg.rules, r] : cfg.rules.map((x) => (x.id === r.id ? r : x))
    apply({ ...cloneCfg(cfg), rules }, `${isNew ? 'Novo pravilo' : 'Promijenjeno pravilo'}: ${describeRule(r)}`, 'info')
  }
  const deleteRule = (id: number) => {
    const r = cfg.rules.find((x) => x.id === id)
    if (!r) return
    apply({ ...cloneCfg(cfg), rules: cfg.rules.filter((x) => x.id !== id) }, `Obrisano pravilo ${ruleLabel(cfg.rules, id)} (${describeRule(r)}).`, 'warn')
  }
  const breakApi = () => {
    const rules = cfg.rules.filter((r) => !(r.host === 'klopa.example' && r.path.startsWith('/api')))
    if (rules.length === cfg.rules.length) {
      apply(cloneCfg(cfg), 'Pravila za /api već nema: zahtjeve na /api hvata prefiks / (ako postoji).', 'warn')
      return
    }
    apply({ ...cloneCfg(cfg), rules }, 'Pokvareno: obrisana pravila za /api na klopa.example.', 'bad')
  }
  const breakSecret = () => {
    apply({ ...cloneCfg(cfg), https: true, secret: 'klopa-db' }, 'Pokvareno: certificateRefs pokazuje na Secret klopa-db (lozinka baze, a ne certifikat).', 'bad')
  }
  const breakSvc = () => {
    const target = cfg.rules.find((r) => r.host === 'klopa.example' && r.path.startsWith('/api')) ?? cfg.rules[0]
    if (!target) return
    const rules = cfg.rules.map((r) => (r.id === target.id ? { ...r, backends: r.backends.map((b, i) => (i === 0 ? { ...b, svc: TYPO[b.svc] ?? b.svc } : b)) } : r))
    apply({ ...cloneCfg(cfg), rules }, `Pokvareno: pogrešno ime Servicea u backendRefs pravila ${ruleLabel(cfg.rules, target.id)}.`, 'bad')
  }
  const preset = (c: Config) => {
    setCfg(cloneCfg(c))
    setResetToken((t) => t + 1)
  }

  const goalsState = s.goals
  const goals = [
    { text: <>„/api → klopa-api, ostalo → klopa-web” (bez grešaka)</>, done: goalsState.g1.done },
    { text: <>„admin.klopa.example samo na klopa-admin”</>, done: goalsState.g2.done },
    { text: <>„10 % /api prometa na verziju 1.4.1” (weight 90 / 10)</>, done: goalsState.g3.done },
    { text: <>„HTTPS radi” (slušatelj :443 s ispravnim Secretom)</>, done: goalsState.g4.done },
    { text: <>Bonus: zahtjevi sa zaglavljem x-beta: 1 uvijek na 1.4.1</>, done: goalsState.g5.done },
  ]
  const allMain = goals.slice(0, 4).every((x) => x.done)
  const bub = bubbleFor(s, allMain)
  const lit = new Set<number>(Object.entries(s.lastHit).filter(([, t]) => s.t - t < 0.45).map(([k]) => +k))
  const hits: Record<number, number> = Object.fromEntries(Object.entries(s.hits).map(([k, v]) => [+k, v.length]))
  const yaml = !gw ? lbYaml() : asIngress ? ingressYaml(cfg) : gatewayYaml(cfg)
  const share = canaryShare(cfg)
  const n = Math.max(1, m.n)
  const errTone = (v: number) => (v > 0 ? 'bad' : 'ok')
  const firstN = Object.values(s.first).reduce((a, b) => a + b, 0)
  const firstReady = cfg.mode === 'lb' && s.t >= INCIDENT_SECONDS + T_IN + T_OUT + T_SERVE

  return (
    <SimFrame
      title="Gradska vrata"
      subtitle={`λ = 6 zahtjeva/s (seed ${SEED}): 45 % web, 38 % /api, 7 % /api sa zaglavljem x-beta: 1, 10 % admin.klopa.example. Gateway bira Pod po načelu „najmanje zahtjeva u obradi” (ovisi o implementaciji).`}
      sim={sim}
      showTime
      minHeight={420}
      hint="simulacija kreće od incidenta: tri LoadBalancera. Prebacite ulaz na Gateway, složite pravila i uključite HTTPS – zadaci se sami označe kvačicom. Zatim nešto pokvarite gumbima u skupini „Pokvarite”."
      controls={
        <>
          <ControlGroup title="Ulaz u klaster">
            <Segmented
              value={cfg.mode}
              onChange={setMode}
              options={[
                { value: 'lb', label: '3 × LoadBalancer', title: 'Svaki Service svoj load balancer (L4)' },
                { value: 'gw', label: 'Gateway', title: 'Jedan L7 ulaz za sve' },
              ]}
            />
          </ControlGroup>
          <ControlGroup title={roles ? 'HTTPRoute pravila · Lana' : 'HTTPRoute pravila'}>
            {!gw && <p className={css.note}>L4 load balancer ne vidi domenu ni putanju – pravila postoje tek s Gatewayem.</p>}
            <RuleBuilder rules={cfg.rules} hits={hits} onSave={saveRule} onDelete={deleteRule} disabled={!gw} />
          </ControlGroup>
          <ControlGroup title={roles ? 'Gateway · Davor' : 'Gateway: slušatelji'}>
            <Toggle
              label="HTTPS slušatelj (:443)"
              checked={cfg.https}
              disabled={!gw}
              onChange={(v) => apply({ ...cloneCfg(cfg), https: v }, v ? 'Slušatelj https (:443) uključen: TLS završava na Gatewayu; :80 preusmjerava na https.' : 'Slušatelj https isključen: promet ide nešifriran na :80.', 'info')}
            />
            <Select
              label="certificateRefs → Secret"
              value={cfg.secret}
              options={SECRETS.map((x) => ({ value: x.ref, label: x.label }))}
              onChange={(v: SecretRef) => apply({ ...cloneCfg(cfg), secret: v }, `certificateRefs → ${v}${secretValid(v) ? ' (kubernetes.io/tls, isti Namespace)' : ''}.`, secretValid(v) ? 'info' : 'warn')}
            />
          </ControlGroup>
          <ControlGroup title="Prikaz">
            <Toggle label="Uloge" checked={roles} onChange={setRoles} hint="tko piše koji objekt" />
            <Toggle label="Prikaži kao Ingress" checked={asIngress} onChange={setAsIngress} disabled={!gw} hint={gw ? undefined : 'samo uz Gateway'} />
            <Toggle label="Prikaži put do Podova" checked={showPath} onChange={setShowPath} hint="EndpointSlice → Pod IP" />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <Button variant="danger" icon={FileX} onClick={breakApi} disabled={!gw}>
              Obriši pravilo za /api
            </Button>
            <Button variant="danger" icon={Lock} onClick={breakSecret} disabled={!gw}>
              Krivi Secret za certifikat
            </Button>
            <Button variant="danger" icon={Unplug} onClick={breakSvc} disabled={!gw || !cfg.rules.length}>
              Krivi naziv Servicea
            </Button>
          </ControlGroup>
          <ControlGroup title="Početna stanja" collapsible defaultOpen={false}>
            <Button size="sm" icon={RotateCcw} onClick={() => preset(PRESET_INCIDENT)}>
              Incident: tri LoadBalancera
            </Button>
            <Button size="sm" icon={RotateCcw} onClick={() => preset({ mode: 'gw', rules: START_RULES(), https: false, secret: 'klopa-tls' })}>
              Prvi Gateway (samo /)
            </Button>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="javne adrese" value={fmt.num(cost.ips)} tone={cost.ips > 1 ? 'warn' : 'ok'} sub={`${fmt.num(cost.eur)} €/mj. (pretpostavka: ${LB_PRICE} € po LB-u)`} />
            <Stat label="uspješno (20 s)" value={m.n ? fmt.pct(m.ok / n) : 'n/a'} tone={m.n && m.ok / n > 0.99 ? 'ok' : 'warn'} sub={`${fmt.num(m.rate, 1)} zahtjeva/s`} />
            <Stat label="404" value={fmt.num(m.err404)} tone={errTone(m.err404)} sub="nema pravila / kriva aplikacija" />
            <Stat label="500" value={fmt.num(m.err500)} tone={errTone(m.err500)} sub="ResolvedRefs=False" />
            <Stat label="TLS greške" value={fmt.num(m.tls)} tone={errTone(m.tls)} sub={gw ? (cfg.https ? (secretValid(cfg.secret) ? 'HTTPS radi' : 'slušatelj nije programiran') : 'HTTPS isključen') : 'HTTPS: nema'} />
            <Stat
              label="/api na 1.4.1 (20 s)"
              value={m.canaryObserved === null ? 'n/a' : fmt.pct(m.canaryObserved, 1)}
              sub={
                share === null
                  ? 'pravilo ne dijeli promet'
                  : `težine: ${fmt.pct(share)} · zbirno od promjene: ${m.canaryCum === null ? '…' : fmt.pct(m.canaryCum, 1)} od ${fmt.num(m.cumN)}`
              }
            />
            {cfg.mode === 'lb' && (
              <Stat label={`prvih ${INCIDENT_SECONDS} s`} value={firstReady ? fmt.pct(s.first.app404 / Math.max(1, firstN)) : '…'} tone="bad" sub={firstReady ? `404 od ${fmt.num(firstN)} zahtjeva` : 'mjerimo…'} />
            )}
          </StatRow>
          <div className={css.statsGrid}>
            <Goals goals={goals} title="Zadaci (Lana i Davor)" />
            <EventLog events={s.events} max={6} />
          </div>
        </>
      }
    >
      <div ref={stageRef} className={css.stage}>
        <GatewayStage s={s} g={g} showPath={showPath} roles={roles} bubble={g.kind !== 'narrow' ? bub.lines : null} davorBuzz={bub.buzz} />
        {g.kind === 'narrow' && (
          <p className={css.speech}>
            <strong>Davor:</strong> {bub.lines.join(' ')}
          </p>
        )}
        <YamlPanel lines={yaml} lit={lit} roles={roles} title={!gw ? 'services-lb.yaml' : asIngress ? 'ingress.yaml (usporedba)' : 'gateway-api.yaml'} />
        <AccessLog items={s.access} mode={cfg.mode} />
      </div>
    </SimFrame>
  )
}
