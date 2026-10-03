/**
 * Scene 2 „Mjeri se prema requests”: one klopa-api Pod as a measuring glass. Usage = requests/s × 25 ms of CPU,
 * capped by the limit (2 × request, throttled above it); utilisation = usage / request, the HPA's only view of load.
 * Without a request the HPA has nothing to divide by (FailedGetResourceMetric).
 */
import { useState } from 'react'
import { DLabel, Diagram, PodShape, Rough, Slider, SvgStamp, Toggle, useWidth } from '../../../kit'
import { hpaFormula } from '../../../engines/cluster'
import { replicasWord } from '../lib/format'
import styles from '../styles.module.css'

const WIDE_MIN = 680
const CPU_PER_REQ_MS = 25
const TARGET = 50
const REPLICAS = 2

export function RequestsLab() {
  const [rps, setRps] = useState(16)
  const [req, setReq] = useState(500)
  const [none, setNone] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= WIDE_MIN
  const demand = rps * CPU_PER_REQ_MS
  const limit = 2 * req
  const usage = none ? demand : Math.min(demand, limit)
  const throttled = !none && demand > limit
  const util = none ? null : Math.floor((100 * usage) / req)
  const f = util === null ? null : hpaFormula(REPLICAS, util, TARGET)
  // the HPA never goes below minReplicas (2 in this lecture), whatever the formula says
  const asks = f ? Math.max(REPLICAS, f.desired) : REPLICAS
  const W = wide ? 720 : 340
  const H = wide ? 330 : 560
  // the glass is scaled to the limit, so the 50 % / 100 % / 200 % marks never crowd; more demand = arrow at the top
  const scaleMax = none ? Math.max(400, demand * 1.1) : Math.max(400, limit * 1.25)
  const gx = wide ? 110 : 70
  const gw = wide ? 90 : 80
  const gTop = wide ? 70 : 70
  const gBot = wide ? 300 : 300
  const yOf = (m: number) => gBot - (Math.min(m, scaleMax) / scaleMax) * (gBot - gTop)
  const tx = wide ? 360 : 14
  const ty = wide ? 70 : 350
  const label = none
    ? `Pod bez CPU requesta troši ${demand}m; HPA ne može izračunati iskorištenost.`
    : `Pod troši ${usage}m uz request ${req}m: iskorištenost ${util} %, HPA traži ${replicasWord(asks)}.`

  return (
    <div ref={ref} className={styles.lab}>
      <div className={wide ? undefined : styles.narrowFig}>
      <Diagram width={W} height={H} label={label}>
        <Glass x={gx} w={gw} top={gTop} bottom={gBot} yOf={yOf} usage={usage} demand={demand} req={none ? null : req} limit={none ? null : limit} throttled={throttled} wide={wide} />
        <PodShape x={gx + gw / 2} y={gTop - 30} size={40} status="running" tone="blue" ariaLabel="Pod klopa-api" />
        <DLabel x={tx} y={ty} anchor="start" mono size={15} text={`potrošnja = ${rps} × 25 ms = ${demand}m`} />
        {throttled && <DLabel x={tx} y={ty + 26} anchor="start" mono size={14} tone="bad" text={`limit ${limit}m: Pod dobije samo ${usage}m`} />}
        {none ? (
          <g>
            <DLabel x={tx} y={ty + 56} anchor="start" mono bold size={15} text={`iskorištenost = ${demand}m / ? `} />
            <DLabel x={tx} y={ty + 84} anchor="start" mono size={14} tone="bad" text="TARGETS: cpu: <unknown>/50%" />
            <DLabel x={tx} y={ty + 108} anchor="start" mono size={13} tone="bad" text="FailedGetResourceMetric:" />
            <DLabel x={tx} y={ty + 128} anchor="start" mono size={13} tone="bad" text="missing request for cpu" />
            <SvgStamp x={tx + (wide ? 250 : 200)} y={ty + 166} text="HPA SLIJEP" tone="red" size={15} rotate={-6} />
          </g>
        ) : (
          <g>
            <DLabel x={tx} y={ty + 56} anchor="start" mono bold size={wide ? 15 : 14} text={`iskorištenost = ${usage}m / ${req}m = ${util} %`} />
            <DLabel
              x={tx}
              y={ty + 86}
              anchor="start"
              mono
              size={15}
              tone={asks > REPLICAS ? 'blue' : 'neutral'}
              text={f ? `HPA (2 Poda): ${f.withinTolerance ? 'unutar tolerancije → 2' : `⌈2 × ${util}/${TARGET}⌉ = ${f.desired}${f.desired < REPLICAS ? ' → minReplicas 2' : ''}`}` : ''}
            />
            <DLabel x={tx} y={ty + 118} anchor="start" size={14} text={`isti promet uz request ${req / 2}m: ${Math.floor((100 * Math.min(demand, req)) / (req / 2))} %`} />
            <DLabel x={tx} y={ty + 142} anchor="start" size={14} text={`isti promet uz request ${req * 2}m: ${Math.floor((100 * Math.min(demand, 4 * req)) / (req * 2))} %`} />
            {util !== null && util >= 200 && <DLabel x={tx} y={ty + 172} anchor="start" size={14} tone="warn" text="vrh: 200 % = limit, korak HPA-a najviše ×4" />}
          </g>
        )}
      </Diagram>
      </div>
      <div className={styles.labControls}>
        <div className={styles.sliders}>
          <Slider label="Promet na jedan Pod" value={rps} min={0} max={60} format={(v) => `${v} zahtjeva/s`} onChange={setRps} />
          <Slider label="CPU request" value={req} min={100} max={1000} step={50} disabled={none} format={(v) => `${v}m`} onChange={setReq} />
          <Toggle label="Bez CPU requesta (i limita)" checked={none} onChange={setNone} />
          <p className={styles.ctlNote}>{none ? 'Bez requesta nema ni 100 %, ni cilja, ni limita.' : `Limit = 2 × request = ${limit}m. Iznad limita CPU se prigušuje.`}</p>
        </div>
      </div>
    </div>
  )
}

function Glass({
  x,
  w,
  top,
  bottom,
  yOf,
  usage,
  demand,
  req,
  limit,
  throttled,
  wide,
}: {
  x: number
  w: number
  top: number
  bottom: number
  yOf: (m: number) => number
  usage: number
  demand: number
  req: number | null
  limit: number | null
  throttled: boolean
  wide: boolean
}) {
  const uy = yOf(usage)
  const lx = x + w + 8
  // demand above the top of the glass: the red box runs to the rim and the label says how much was asked for
  const over = demand > 0 && yOf(demand) <= top + 1
  const dy = over ? top + 4 : yOf(demand)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: top, w, h: bottom - top }} seed={1881} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      {usage > 0 && bottom - uy > 4 && <Rough shape={{ k: 'rect', x: x + 4, y: uy, w: w - 8, h: bottom - uy - 3 }} seed={1887} stroke="none" strokeWidth={0} fillColor="var(--hl-blue-ink)" hachureGap={5} />}
      {usage > 0 && <Rough shape={{ k: 'line', x1: x + 2, y1: uy, x2: x + w - 2, y2: uy }} seed={1882} stroke="var(--pen)" strokeWidth={2} />}
      {throttled && (
        <g>
          <Rough shape={{ k: 'rect', x: x + 6, y: dy, w: w - 12, h: uy - dy }} seed={1883} stroke="var(--red)" strokeWidth={1.3} dash="5 4" />
          {over ? (
            <DLabel x={x + w / 2} y={dy + 20} text={`↑ traženo ${demand}m`} tone="bad" mono size={12} />
          ) : (
            <DLabel x={x + w / 2} y={uy - dy >= 26 ? dy + 18 : dy - 6} text="traženo" tone="bad" size={12} />
          )}
        </g>
      )}
      {req !== null && (
        <g>
          <Rough shape={{ k: 'line', x1: x - 10, y1: yOf(req), x2: x + w + 4, y2: yOf(req) }} seed={1884} stroke="var(--ink)" strokeWidth={2.2} />
          <DLabel x={x - 14} y={yOf(req) + 5} anchor="end" text="100 %" mono bold size={13} />
          <DLabel x={lx} y={yOf(req) + 5} anchor="start" text={wide ? `request ${req}m` : `req ${req}m`} mono size={13} />
          <Rough shape={{ k: 'line', x1: x - 10, y1: yOf(req / 2), x2: x + w + 4, y2: yOf(req / 2) }} seed={1885} stroke="var(--green)" strokeWidth={1.6} dash="6 4" />
          <DLabel x={x - 14} y={yOf(req / 2) + 5} anchor="end" text="50 %" mono size={13} tone="ok" />
          <DLabel x={lx} y={yOf(req / 2) + 5} anchor="start" text="cilj" size={13} tone="ok" />
        </g>
      )}
      {limit !== null && (
        <g>
          <Rough shape={{ k: 'line', x1: x - 10, y1: yOf(limit), x2: x + w + 4, y2: yOf(limit) }} seed={1886} stroke="var(--red)" strokeWidth={2} />
          <DLabel x={x - 14} y={yOf(limit) + 5} anchor="end" text="200 %" mono size={13} tone="bad" />
          <DLabel x={lx} y={yOf(limit) + 5} anchor="start" text={wide ? `limit ${limit}m` : `lim ${limit}m`} mono size={13} tone="bad" />
        </g>
      )}
      <DLabel x={x + w / 2} y={bottom + 22} text={`troši ${usage}m`} mono size={13} tone="blue" />
    </g>
  )
}
