/**
 * The flagship's KEDA strip (E3's own fluid queue, real KEDA timings): the RabbitMQ queue `narudzbe` as a rail of
 * kitchen tickets, the two steps of KEDA (its operator wakes 0 → 1, the HPA it created does 1 ↔ N with
 * ⌈poruke / 10⌉) and the klopa-worker lunchboxes – none at night.
 */
import { Diagram, DLabel, Elastic, PodShape, Rough, useWidth } from '../../../kit'
import { kedaArrivalRate, kedaQueueMetric, podShapeView, type ClusterState } from '../../../engines/cluster'
import { WORKER, kedaHpaOf } from '../lib/flagship'
import { fmtNum, messages, pods as podsWord } from '../lib/format'

export function KedaPanel({ c }: { c: ClusterState }) {
  const [ref, measured] = useWidth<HTMLDivElement>()
  const W = Math.max(300, Math.round(measured ?? 720))
  const k = c.cfg.keda
  if (!k) return null
  const wide = W >= 600
  const metric = kedaQueueMetric(k)
  const rate = kedaArrivalRate(c, k)
  const d = c.deployments.find((x) => x.name === WORKER)
  const replicas = d?.replicas ?? 0
  const pods = c.pods.filter((p) => p.labels.app === WORKER && !p.deletion)
  const hpa = kedaHpaOf(c)
  const desired = Math.ceil(metric / k.targetQueueLength - 1e-9)
  const idle = k.lastActiveAt === null ? null : c.t - k.lastActiveAt
  const coolLeft = replicas > 0 && metric <= k.activationQueueLength + 1e-9 && idle !== null ? Math.max(0, k.cooldownS - idle) : null
  const nextPoll = Math.max(0, k.pollingIntervalS - (c.t - k.lastPollAt))
  // wide: queue rail and the KEDA notes side by side, the workers in a row underneath; narrow: everything stacked
  const railX = 10
  const railW = wide ? Math.min(280, W * 0.4) : W - 20
  const railY = 40
  const tickets = Math.min(30, Math.round(metric))
  const per = Math.max(1, Math.floor((railW - 12) / 9))
  const ex = wide ? railX + railW + 30 : 10
  const ey = wide ? 14 : 112
  const px = 10
  const py = wide ? 156 : 260
  const H = py + 40
  const status = replicas === 0 ? 'klopa-worker spava: 0 Podova' : `klopa-worker: ${podsWord(replicas)}`
  const formula =
    replicas === 0
      ? metric > 0
        ? `operator: 0 → 1 za ${Math.ceil(nextPoll)} s`
        : 'red prazan: nema koga buditi'
      : `HPA: ⌈${fmtNum(metric, 0)} / ${k.targetQueueLength}⌉ = ${desired}${desired < 1 ? ' → najmanje 1' : ''}`

  return (
    <div ref={ref}>
      <Diagram width={W} height={H} label={`Red narudzbe: ${messages(Math.round(metric))}, dolazi ${fmtNum(rate, 1)} u sekundi. ${status}.`}>
        <DLabel x={railX} y={22} anchor="start" text={`red „narudzbe”: ${messages(Math.round(metric))}`} mono bold size={14} />
        <Rough shape={{ k: 'rect', x: railX, y: railY, w: railW, h: 34 }} seed={1830} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
        {Array.from({ length: Math.min(tickets, per) }, (_, i) => (
          <Rough key={i} shape={{ k: 'rect', x: railX + 6 + i * 9, y: railY + 6, w: 6, h: 22 }} seed={1840 + i} strokeWidth={1} fillColor="var(--hl-yellow-ink)" fillStyle="solid" roughness={0.6} />
        ))}
        {metric > per && <DLabel x={railX + railW - 6} y={railY + 56} anchor="end" text={`+ još ${Math.round(metric) - per}`} mono size={13} />}
        <DLabel x={railX} y={railY + 56} anchor="start" text={`dolazi ${fmtNum(rate, 1)}/s`} mono size={13} />

        {/* KEDA = the operator (0 ↔ 1) + an HPA on the queue length (1 ↔ N) */}
        <Elastic x={ex} y={ey} w={44} h={34} />
        <DLabel x={ex + 52} y={ey + 22} anchor="start" text="KEDA" mono bold size={14} />
        <DLabel x={ex} y={ey + 54} anchor="start" text={formula} mono size={13} tone={replicas === 0 && metric > 0 ? 'warn' : 'neutral'} />
        {coolLeft !== null && <DLabel x={ex} y={ey + 76} anchor="start" text={`na 0 za ${Math.ceil(coolLeft)} s (300 s bez poruka)`} mono size={13} />}
        {hpa && coolLeft === null && replicas > 0 && <DLabel x={ex} y={ey + 76} anchor="start" text={`provjera 30 s · HPA ${hpa.minReplicas}–${hpa.maxReplicas}`} mono size={13} />}

        <DLabel x={px} y={py - 40} anchor="start" text={status} size={13} tone={replicas === 0 ? 'neutral' : 'teal'} />
        {replicas === 0 ? (
          // no Pod exists at all: an empty dashed place, not a (Pending) lunchbox
          <g aria-hidden="true">
            <Rough shape={{ k: 'rect', x: px, y: py - 20, w: 48, h: 40 }} seed={1835} dash="6 5" stroke="var(--ink-3)" strokeWidth={1.3} />
            <DLabel x={px + 60} y={py + 5} anchor="start" text="0 · nijedan Pod" mono size={13} />
          </g>
        ) : (
          pods.slice(0, Math.max(1, Math.floor((W - px - 10) / 52))).map((p, i) => {
            const sv = podShapeView(p)
            return <PodShape key={p.id} x={px + 24 + i * 52} y={py} size={42} status={sv.status} label="wrk" tone="teal" ariaLabel={`Pod ${p.name}: ${sv.label}`} />
          })
        )}
      </Diagram>
    </div>
  )
}
