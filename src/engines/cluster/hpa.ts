/**
 * HorizontalPodAutoscaler (autoscaling/v2) – mirrors replica_calculator.go and horizontal.go.
 *
 * Every sync (15 s): utilisation = floor(100 · Σusage(ready Pods) / Σrequest(ready Pods)); ratio = util / target;
 * within tolerance (0,1) → keep; else ceil(ratio · readyPods). Unready Pods (not Ready, or inside the
 * cpu-initialization-period with a metric window that started before they became Ready) count as 0 % when
 * scaling up; Pods without metrics count as 100 % (down) / 0 % (up). Then: stabilisation (up 0 s, down 300 s
 * – max of recommendations), rate limits (up: max(+100 %, +4 Pods) per 15 s; down: 100 % per 15 s), min/max.
 * No CPU request ⇒ the HPA cannot compute utilisation and does nothing.
 */
import type { ClusterState, Hpa, HpaDecision, HpaMetric, HpaRules, Pod } from './types.ts'
import { REAL } from './config.ts'
import { findDeployment } from './rollout.ts'
import { PODS, hr, hrCount, kubeEvent, logEvent, matches, newId } from './util.ts'

export function defaultBehavior(): { scaleUp: HpaRules; scaleDown: HpaRules } {
  return {
    scaleUp: {
      stabilizationWindowSeconds: REAL.hpaScaleUpWindowS,
      policies: [
        { type: 'Percent', value: 100, periodSeconds: 15 },
        { type: 'Pods', value: 4, periodSeconds: 15 },
      ],
      selectPolicy: 'Max',
      tolerance: REAL.hpaTolerance,
    },
    scaleDown: {
      stabilizationWindowSeconds: REAL.hpaScaleDownWindowS,
      policies: [{ type: 'Percent', value: 100, periodSeconds: 15 }],
      selectPolicy: 'Max',
      tolerance: REAL.hpaTolerance,
    },
  }
}

export function createHpa(
  s: ClusterState,
  o: { name?: string; namespace?: string; target: string; minReplicas?: number; maxReplicas?: number; metric?: HpaMetric; behavior?: { scaleUp?: Partial<HpaRules>; scaleDown?: Partial<HpaRules> }; keda?: boolean },
): Hpa {
  const b = defaultBehavior()
  const h: Hpa = {
    id: newId(s, 'hpa'),
    name: o.name ?? o.target,
    namespace: o.namespace ?? s.cfg.namespace,
    targetDeployment: o.target,
    minReplicas: o.minReplicas ?? 2,
    maxReplicas: o.maxReplicas ?? 20,
    metric: o.metric ?? { type: 'cpu', targetUtilization: 50 },
    behavior: { scaleUp: { ...b.scaleUp, ...(o.behavior?.scaleUp ?? {}) }, scaleDown: { ...b.scaleDown, ...(o.behavior?.scaleDown ?? {}) } },
    syncPeriodS: REAL.hpaSyncS,
    recs: [],
    upEvents: [],
    downEvents: [],
    decisions: [],
    lastScaleAt: null,
    status: { currentReplicas: 0, desiredReplicas: 0, currentMetric: null, scalingActive: true, message: '' },
    keda: o.keda ?? false,
  }
  s.hpas.push(h)
  return h
}

// ---------------------------------------------------------------- metrics-server

/** Scrape: mean CPU of the last resolution window for every Pod whose container runs. */
export function scrapeMetrics(s: ClusterState): void {
  s.lastScrapeAt = s.t
  const next: Record<string, { cpuM: number; at: number }> = {}
  for (const p of s.pods) {
    if (!p.processUp || p.cpuSamples.length === 0) continue
    next[p.id] = { cpuM: p.cpuSamples.reduce((a, b) => a + b, 0) / p.cpuSamples.length, at: s.t }
  }
  s.podMetrics = next
}

// ---------------------------------------------------------------- replica calculator

export interface Within {
  (ratio: number): boolean
}

function withinFn(h: Hpa): Within {
  return (r) => 1 - h.behavior.scaleDown.tolerance <= r + 1e-12 && r <= 1 + h.behavior.scaleUp.tolerance + 1e-12
}

interface CalcResult {
  raw: number
  metric: number | null
  ratio: number | null
  ready: number
  unready: number
  missing: number
  within: boolean
  error: string | null
  text: string
}

function targetPods(s: ClusterState, h: Hpa): Pod[] {
  const d = findDeployment(s, h.targetDeployment, h.namespace)
  if (!d) return []
  return s.pods.filter((p) => p.namespace === h.namespace && matches(d.selector, p.labels))
}

function cpuReplicas(s: ClusterState, h: Hpa, current: number, target: number): CalcResult {
  const within = withinFn(h)
  const pods = targetPods(s, h)
  const ready: Pod[] = []
  const unready: Pod[] = []
  const missing: Pod[] = []
  for (const p of pods) {
    if (p.deletion || p.phase === 'Failed') continue
    if (p.phase === 'Pending') {
      unready.push(p)
      continue
    }
    const m = s.podMetrics[p.id]
    if (!m) {
      missing.push(p)
      continue
    }
    const start = p.kubelet.startTime ?? p.boundAt ?? p.createdAt
    let isUnready: boolean
    if (s.t < start + s.cfg.cpuInitializationPeriodS) {
      isUnready = !p.ready.status || m.at < p.ready.since + s.cfg.metricResolutionS - 1e-9
    } else {
      isUnready = !p.ready.status && start + 30 > p.ready.since
    }
    if (isUnready) unready.push(p)
    else ready.push(p)
  }
  const noReq = [...ready, ...unready, ...missing].find((p) => p.spec.resources.requests.cpuM === undefined && p.spec.resources.limits.cpuM === undefined)
  if (noReq) {
    const err = `failed to get cpu utilization: missing request for cpu in container ${noReq.labels.app ?? noReq.name} of Pod ${noReq.name}`
    return { raw: current, metric: null, ratio: null, ready: ready.length, unready: unready.length, missing: missing.length, within: false, error: err, text: 'nema CPU requests – HPA ne može izračunati iskorištenost' }
  }
  if (ready.length === 0) {
    const err = 'did not receive metrics for targeted pods (pods might be unready)'
    return { raw: current, metric: null, ratio: null, ready: 0, unready: unready.length, missing: missing.length, within: false, error: err, text: 'nema metrika spremnih Podova' }
  }
  const req = (p: Pod) => p.spec.resources.requests.cpuM ?? p.spec.resources.limits.cpuM ?? 0
  const usage = (p: Pod) => s.podMetrics[p.id].cpuM
  const sumUse = ready.reduce((a, p) => a + usage(p), 0)
  const sumReq = ready.reduce((a, p) => a + req(p), 0)
  const util = Math.floor((sumUse * 100) / sumReq)
  const ratio = util / target
  const base = `${util} % (cilj ${target} %)`
  const scaleUpWithUnready = unready.length > 0 && ratio > 1
  if (!scaleUpWithUnready && missing.length === 0) {
    if (within(ratio)) return { raw: current, metric: util, ratio, ready: ready.length, unready: unready.length, missing: 0, within: true, error: null, text: `${base} → omjer ${hr(ratio, 2)} unutar tolerancije ±10 % → ostaje ${current}` }
    const raw = Math.ceil(ratio * ready.length - 1e-9)
    return { raw, metric: util, ratio, ready: ready.length, unready: unready.length, missing: 0, within: false, error: null, text: `${base} → ⌈${hr(ratio, 2)} × ${ready.length}⌉ = ${raw}` }
  }
  let extraUse = 0
  let extraReq = 0
  let counted = ready.length
  // replica_calculator.go: missing Pods get the fallback utilisation only when scaling down (ratio < 1) and 0 % only
  // when scaling up (ratio > 1); at exactly 1,0 they get no metric at all and do not count
  if (missing.length && ratio !== 1) {
    const fallback = ratio < 1 ? Math.max(100, target) / 100 : 0
    for (const p of missing) {
      extraUse += req(p) * fallback
      extraReq += req(p)
    }
    counted += missing.length
  }
  if (scaleUpWithUnready) {
    for (const p of unready) extraReq += req(p)
    counted += unready.length
  }
  const newUtil = Math.floor(((sumUse + extraUse) * 100) / (sumReq + extraReq))
  const newRatio = newUtil / target
  const parts: string[] = []
  if (scaleUpWithUnready) parts.push(`${hrCount(unready.length, ['nespreman Pod', 'nespremna Poda', 'nespremnih Podova'])} kao 0 %`)
  if (missing.length) parts.push(`${hrCount(missing.length, ['Pod', 'Poda', 'Podova'])} bez metrike${ratio === 1 ? ' (ne broji se)' : ratio < 1 ? ` kao ${Math.max(100, target)} %` : ' kao 0 %'}`)
  const why = parts.join(', ')
  if (within(newRatio) || (ratio < 1 && newRatio > 1) || (ratio > 1 && newRatio < 1)) {
    return { raw: current, metric: util, ratio, ready: ready.length, unready: unready.length, missing: missing.length, within: true, error: null, text: `${base}; ${why} → ${newUtil} % → ostaje ${current}` }
  }
  let raw = Math.ceil(newRatio * counted - 1e-9)
  if ((newRatio < 1 && raw > current) || (newRatio > 1 && raw < current)) raw = current
  return { raw, metric: util, ratio, ready: ready.length, unready: unready.length, missing: missing.length, within: false, error: null, text: `${base}; ${why} → ${newUtil} % → ⌈${hr(newRatio, 2)} × ${counted}⌉ = ${raw}` }
}

function externalReplicas(s: ClusterState, h: Hpa, current: number, target: number): CalcResult {
  const within = withinFn(h)
  const k = s.cfg.keda
  // ready + unacknowledged messages, as the RabbitMQ scaler reports them (HTTP mode)
  const total = Math.round(k ? k.queueLength + (k.unacked ?? 0) : 0)
  const ratio = current > 0 ? total / (target * current) : Infinity
  const msgs = hrCount(total, ['poruka', 'poruke', 'poruka'])
  if (current > 0 && within(ratio)) return { raw: current, metric: total, ratio, ready: current, unready: 0, missing: 0, within: true, error: null, text: `u redu ${msgs} (cilj ${target} po Podu) → unutar tolerancije → ostaje ${current}` }
  const raw = Math.max(0, Math.ceil(total / target - 1e-9))
  return { raw, metric: total, ratio, ready: current, unready: 0, missing: 0, within: false, error: null, text: `u redu ${msgs} → ⌈${total} / ${target}⌉ = ${raw}` }
}

// ---------------------------------------------------------------- normalisation

function changeInPeriod(events: { t: number; d: number }[], t: number, period: number): number {
  return events.filter((e) => e.t > t - period + 1e-9).reduce((a, e) => a + e.d, 0)
}

function stabilize(s: ClusterState, h: Hpa, current: number, raw: number): number {
  let up = raw
  let down = raw
  const upCut = s.t - h.behavior.scaleUp.stabilizationWindowSeconds
  const downCut = s.t - h.behavior.scaleDown.stabilizationWindowSeconds
  for (const r of h.recs) {
    if (r.t > upCut + 1e-9) up = Math.min(up, r.v)
    if (r.t > downCut + 1e-9) down = Math.max(down, r.v)
  }
  h.recs.push({ t: s.t, v: raw })
  const keep = Math.max(h.behavior.scaleUp.stabilizationWindowSeconds, h.behavior.scaleDown.stabilizationWindowSeconds)
  h.recs = h.recs.filter((r) => r.t > s.t - keep - 1e-9)
  let rec = current
  if (rec < up) rec = up
  if (rec > down) rec = down
  return rec
}

function rateLimit(s: ClusterState, h: Hpa, current: number, desired: number): { value: number; limitedBy: HpaDecision['limitedBy'] } {
  if (desired > current) {
    const rules = h.behavior.scaleUp
    if (rules.selectPolicy === 'Disabled') return { value: current, limitedBy: 'ScaleUpLimit' }
    let limit = rules.selectPolicy === 'Min' ? Infinity : -Infinity
    for (const p of rules.policies) {
      const start = current - changeInPeriod(h.upEvents, s.t, p.periodSeconds) + changeInPeriod(h.downEvents, s.t, p.periodSeconds)
      const proposed = p.type === 'Pods' ? start + p.value : Math.ceil(start * (1 + p.value / 100) - 1e-9)
      limit = rules.selectPolicy === 'Min' ? Math.min(limit, proposed) : Math.max(limit, proposed)
    }
    if (limit < current) limit = current
    let maxAllowed = h.maxReplicas
    let reason: HpaDecision['limitedBy'] = 'TooManyReplicas'
    if (maxAllowed > limit) {
      maxAllowed = limit
      reason = 'ScaleUpLimit'
    }
    if (desired > maxAllowed) return { value: maxAllowed, limitedBy: reason }
  } else if (desired < current) {
    const rules = h.behavior.scaleDown
    if (rules.selectPolicy === 'Disabled') return { value: current, limitedBy: 'ScaleDownLimit' }
    let limit = rules.selectPolicy === 'Min' ? -Infinity : Infinity
    for (const p of rules.policies) {
      const start = current - changeInPeriod(h.upEvents, s.t, p.periodSeconds) + changeInPeriod(h.downEvents, s.t, p.periodSeconds)
      const proposed = p.type === 'Pods' ? start - p.value : Math.floor(start * (1 - p.value / 100) + 1e-9)
      limit = rules.selectPolicy === 'Min' ? Math.max(limit, proposed) : Math.min(limit, proposed)
    }
    if (limit > current) limit = current
    let minAllowed = h.minReplicas
    let reason: HpaDecision['limitedBy'] = 'TooFewReplicas'
    if (minAllowed < limit) {
      minAllowed = limit
      reason = 'ScaleDownLimit'
    }
    if (desired < minAllowed) return { value: minAllowed, limitedBy: reason }
  }
  return { value: desired, limitedBy: 'none' }
}

// ---------------------------------------------------------------- controller

export function hpaTick(s: ClusterState): void {
  if (!s.components.controllerManager || !s.components.apiServer || !s.components.etcd) return
  const sec = Math.round(s.t)
  for (const h of s.hpas) {
    if (sec <= 0 || sec % h.syncPeriodS !== 0) continue
    syncHpa(s, h)
  }
}

function pushDecision(h: Hpa, d: HpaDecision): void {
  h.decisions.push(d)
  if (h.decisions.length > 100) h.decisions.shift()
}

export function syncHpa(s: ClusterState, h: Hpa): void {
  const d = findDeployment(s, h.targetDeployment, h.namespace)
  if (!d) {
    h.status = { ...h.status, scalingActive: false, message: `Deployment ${h.targetDeployment} ne postoji` }
    return
  }
  const current = d.replicas
  h.status.currentReplicas = current
  if (current === 0 && h.minReplicas !== 0) {
    h.status = { ...h.status, scalingActive: false, message: 'scaling is disabled since the replica count of the target is zero' }
    return
  }
  let desired: number
  let calc: CalcResult | null = null
  let stabilized = current
  let limitedBy: HpaDecision['limitedBy'] = 'none'
  if (current > h.maxReplicas) desired = h.maxReplicas
  else if (current < h.minReplicas) desired = h.minReplicas
  else {
    const target = h.metric.type === 'cpu' ? h.metric.targetUtilization : h.metric.targetAverageValue
    calc =
      !(Number.isFinite(target) && target > 0)
        ? { raw: current, metric: null, ratio: null, ready: 0, unready: 0, missing: 0, within: false, error: 'invalid metric target', text: 'neispravan cilj metrike' }
        : h.metric.type === 'cpu'
          ? cpuReplicas(s, h, current, target)
          : externalReplicas(s, h, current, target)
    if (calc.error) {
      h.status = { ...h.status, scalingActive: false, currentMetric: null, message: calc.error }
      kubeEvent(s, 'Warning', 'FailedGetResourceMetric', `horizontalpodautoscaler/${h.name}`, calc.error)
      if (!h.decisions.length || h.decisions[h.decisions.length - 1].error !== calc.error) {
        logEvent(s, 'hpa-error', `HPA ${h.name}: ${calc.text}`, 'bad', h.id)
      }
      pushDecision(h, { t: s.t, current, metric: null, readyPods: calc.ready, unreadyPods: calc.unready, missingPods: calc.missing, ratio: null, withinTolerance: false, raw: current, stabilized: current, final: current, limitedBy: 'error', text: calc.text, error: calc.error })
      return
    }
    stabilized = stabilize(s, h, current, calc.raw)
    const rl = rateLimit(s, h, current, stabilized)
    desired = rl.value
    limitedBy = rl.limitedBy
    if (limitedBy === 'none' && stabilized !== calc.raw) limitedBy = 'stabilization'
    if (limitedBy === 'none' && calc.within) limitedBy = 'tolerance'
  }
  h.status = { currentReplicas: current, desiredReplicas: desired, currentMetric: calc?.metric ?? null, scalingActive: true, message: '' }
  let text = calc ? calc.text : current > h.maxReplicas ? `više od maxReplicas → ${desired}` : `manje od minReplicas → ${desired}`
  if (calc && stabilized !== calc.raw) text += ` → prozor stabilizacije (${h.behavior.scaleDown.stabilizationWindowSeconds} s) drži ${stabilized}`
  if (limitedBy === 'ScaleUpLimit') text += ` → ograničenje brzine (najviše +100 % ili +4 Poda / 15 s) → ${desired}`
  if (limitedBy === 'ScaleDownLimit') text += ` → ograničenje brzine smanjivanja → ${desired}`
  if (limitedBy === 'TooManyReplicas') text += ` → maxReplicas ${h.maxReplicas}`
  if (limitedBy === 'TooFewReplicas') text += ` → minReplicas ${h.minReplicas}`
  pushDecision(h, {
    t: s.t,
    current,
    metric: calc?.metric ?? null,
    readyPods: calc?.ready ?? 0,
    unreadyPods: calc?.unready ?? 0,
    missingPods: calc?.missing ?? 0,
    ratio: calc?.ratio ?? null,
    withinTolerance: calc?.within ?? false,
    raw: calc?.raw ?? desired,
    stabilized,
    final: desired,
    limitedBy,
    text,
    error: null,
  })
  if (desired !== current) {
    const metricName = h.metric.type === 'cpu' ? 'cpu resource utilization (percentage of request)' : `external metric ${h.metric.name}`
    const reason = desired > current ? `${metricName} above target` : 'All metrics below target'
    kubeEvent(s, 'Normal', 'SuccessfulRescale', `horizontalpodautoscaler/${h.name}`, `New size: ${desired}; reason: ${reason}`)
    logEvent(s, 'hpa-scale', `HPA ${h.name}: ${current} → ${hrCount(desired, PODS)} (${text})`, desired > current ? 'info' : 'neutral', h.id)
    if (desired > current) h.upEvents.push({ t: s.t, d: desired - current })
    else h.downEvents.push({ t: s.t, d: current - desired })
    const keep = 3600
    h.upEvents = h.upEvents.filter((e) => e.t > s.t - keep)
    h.downEvents = h.downEvents.filter((e) => e.t > s.t - keep)
    h.lastScaleAt = s.t
    d.replicas = desired
  }
}

/** The worked example from the docs: 3 Pods at 90 % with target 50 → 6; at 54 % → no change (tolerance). */
export function hpaFormula(currentReplicas: number, currentUtil: number, targetUtil: number, tolerance: number = REAL.hpaTolerance): { ratio: number; desired: number; withinTolerance: boolean } {
  const ratio = currentUtil / targetUtil
  const withinTolerance = 1 - tolerance <= ratio + 1e-12 && ratio <= 1 + tolerance + 1e-12
  return { ratio, desired: withinTolerance ? currentReplicas : Math.max(0, Math.ceil(ratio * currentReplicas - 1e-9)), withinTolerance }
}
