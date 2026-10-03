import { useState } from 'react'
import { Button, Check, CommitString, DLabel, Diagram, Drawer, LoopArrows, PodShape, Rough, ServiceTag, Shelf, Slider, TrayStack, useWidth } from '../../../kit'
import { buildJourney, type Station, type Zone } from '../journey'
import { lectureHref, lectureRef } from '../lectures'
import css from '../styles.module.css'

const ZONES: { id: Zone; title: string }[] = [
  { id: 'ci', title: 'CI' },
  { id: 'registar', title: 'registar' },
  { id: 'git', title: 'Git + Argo CD' },
  { id: 'klaster', title: 'klaster' },
]

const PW = 210
const PH = 206

function Panel({ zone, st, active, x, y, j }: { zone: Zone; st: Station; active: boolean; x: number; y: number; j: ReturnType<typeof buildJourney> }) {
  const title = ZONES.find((z) => z.id === zone)?.title ?? zone
  return (
    <g transform={`translate(${x} ${y})`}>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: PW, h: PH }} stroke={active ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={active ? 2.4 : 1.3} dash={active ? undefined : '6 5'} seed={4100 + x + y} />
      <DLabel x={PW / 2} y={24} text={title} size={15} tone={active ? 'bad' : 'neutral'} bold={active} />
      {zone === 'ci' &&
        st.jobs.map((job, i) => {
          const cx = 18 + (i % 2) * 96
          const cy = 40 + Math.floor(i / 2) * 74
          return (
            <g key={job.name}>
              <g opacity={job.state === 'waiting' ? 0.4 : 1}>
                <Drawer x={cx} y={cy} w={78} h={40} />
              </g>
              {job.state === 'running' && <Rough shape={{ k: 'ellipse', cx: cx + 39, cy: cy + 20, w: 100, h: 58 }} stroke="var(--pen)" strokeWidth={1.6} dash="5 4" seed={4180 + i} />}
              <DLabel x={cx + 39} y={cy + 60} text={job.name} mono size={14} tone={job.state === 'running' ? 'blue' : 'neutral'} />
              {job.state === 'done' && <Check x={cx + 70} y={cy + 4} size={11} />}
            </g>
          )
        })}
      {zone === 'ci' && <DLabel x={PW / 2} y={196} text={st.ciNote} mono size={14} tone={st.pushed ? 'ok' : 'neutral'} />}
      {zone === 'registar' &&
        (st.pushed ? (
          <>
            <TrayStack x={62} y={42} w={86} h={84} n={5} />
            <Shelf x={20} y={124} w={170} h={30} />
            <DLabel x={PW / 2} y={174} text={`${j.changedLayers}/${j.totalLayers} novi sloj`} mono size={14} />
            <DLabel x={PW / 2} y={196} text={`2.0.2@${j.digest.slice(0, 11)}…`} mono size={14} tone={st.id === 'push' ? 'blue' : 'neutral'} bold={st.id === 'push'} />
          </>
        ) : (
          <>
            <Rough shape={{ k: 'rect', x: 66, y: 44, w: 78, h: 15 }} stroke="var(--ink-3)" strokeWidth={1.2} dash="5 4" seed={4171} />
            <TrayStack x={62} y={59} w={86} h={67} n={4} />
            <Shelf x={20} y={124} w={170} h={30} />
            <DLabel x={PW / 2} y={174} text="2.0.2: još nije tu" mono size={14} />
            <DLabel x={PW / 2} y={196} text="zadnja: 2.0.1" mono size={14} />
          </>
        ))}
      {zone === 'git' && (
        <>
          <CommitString x={22} y={58} w={166} n={st.botCommit ? 3 : 2} />
          <DLabel x={PW / 2} y={88} text={st.botCommit ? 'bot: 2.0.2@sha256' : 'produkcija: 2.0.1'} mono size={14} />
          <LoopArrows cx={PW / 2} cy={134} r={24} check={st.argo.sync === 'Synced' && st.argo.health === 'Healthy'} />
          <DLabel x={PW / 2} y={190} text={`${st.argo.sync} · ${st.argo.health}`} mono size={14} tone={st.argo.health === 'Healthy' && st.argo.sync === 'Synced' ? 'ok' : st.argo.sync === 'OutOfSync' ? 'warn' : 'blue'} />
        </>
      )}
      {zone === 'klaster' && (
        <>
          <ServiceTag x={30} y={38} w={150} h={30}>
            <DLabel x={112} y={58} text="Service" mono size={14} />
          </ServiceTag>
          {st.pods.slice(0, 6).map((p, i) => (
            <PodShape key={i} x={48 + (i % 3) * 57} y={104 + Math.floor(i / 3) * 46} size={28} status={p.status} tone={p.tag === '2.0.2' ? 'green' : 'blue'} />
          ))}
          <DLabel x={PW / 2} y={196} text={`spremni: ${st.endpoints} · 2.0.2: ${st.pods.filter((p) => p.tag === '2.0.2' && p.status === 'running').length}`} mono size={14} />
        </>
      )}
    </g>
  )
}

/** „Put jednog commita”: scrub the release of 2.0.2 station by station; each zone shows the engines' state at that moment. */
export function CommitJourney() {
  const [j] = useState(buildJourney)
  const [i, setI] = useState(0)
  const [ref, width] = useWidth<HTMLDivElement>()
  const w = width ?? 900
  const layout: 'row' | 'grid' | 'single' = w >= 900 ? 'row' : w >= 440 ? 'grid' : 'single'
  const st = j.stations[i]
  const zones = layout === 'single' ? ZONES.filter((z) => z.id === st.zone) : ZONES
  const W = layout === 'row' ? 4 * PW + 3 * 16 + 8 : layout === 'grid' ? 2 * PW + 16 + 8 : PW + 8
  const H = layout === 'grid' ? 2 * PH + 24 : PH + 8
  const pos = (k: number): [number, number] => (layout === 'row' ? [4 + k * (PW + 16), 4] : layout === 'grid' ? [4 + (k % 2) * (PW + 16), 4 + Math.floor(k / 2) * (PH + 16)] : [4, 4])
  return (
    <div ref={ref}>
      {layout === 'single' && (
        <p className={css.zoneRow} aria-hidden="true">
          {ZONES.map((z) => (
            <span key={z.id} data-on={z.id === st.zone}>
              {z.title}
            </span>
          ))}
        </p>
      )}
      <div style={{ maxWidth: layout === 'row' ? undefined : layout === 'grid' ? 520 : 330, margin: '0 auto' }}>
        <Diagram width={W} height={H} label={`Put commita 2.0.2, postaja ${i + 1} od ${j.stations.length} u ${st.clock}: ${st.title}. Aktivna zona: ${st.zone}.`}>
          {zones.map((z, k) => {
            const [x, y] = pos(k)
            return <Panel key={z.id} zone={z.id} st={st} active={z.id === st.zone} x={x} y={y} j={j} />
          })}
        </Diagram>
      </div>
      <div className={css.journeyCtl}>
        <Button size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          ← Natrag
        </Button>
        <div className={css.journeySlider}>
          <Slider label="Postaja" value={i} min={0} max={j.stations.length - 1} step={1} onChange={setI} format={(v) => `${j.stations[v].clock}`} />
        </div>
        <Button size="sm" variant="primary" onClick={() => setI(Math.min(j.stations.length - 1, i + 1))} disabled={i === j.stations.length - 1}>
          Dalje →
        </Button>
      </div>
      <div className={css.stationCard} aria-live="polite">
        <div className={css.stationHead}>
          <span className={css.stationClock}>{st.clock}</span>
          <strong>{st.title}</strong>
          <span className={css.stationNo}>
            {i + 1}/{j.stations.length}
          </span>
        </div>
        <p>{renderCode(st.body)}</p>
        <p className={css.stationRisk}>
          <strong>Što ako ovdje pukne?</strong> {renderCode(st.risk)}
        </p>
        <p className={css.stationLinks}>
          {st.lectures.map((id) => (
            <a key={id} href={lectureHref(id)}>
              {id} · {lectureRef(id)?.title}
            </a>
          ))}
        </p>
      </div>
    </div>
  )
}

/** `code` spans in station texts (the texts are plain strings with backticks). */
function renderCode(t: string) {
  return t.split(/(`[^`]+`)/).map((part, k) => (part.startsWith('`') ? <code key={k}>{part.slice(1, -1)}</code> : <span key={k}>{part}</span>))
}
