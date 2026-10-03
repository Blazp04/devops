import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Arrow, MiniFace, Rough, Segmented, Signpost, Stepper, stepColor, useWidth } from '../../../kit'
import { fanoutScript, type FanoutStep } from '../../../engines/queue'
import { ApiCard, Ticket, TicketDefs } from './parts'

type Mode = 'work-queue' | 'fanout'

const QUEUE_NAME: Record<string, string> = { narudzbe: 'red narudzbe', kuhinja: 'red kuhinja', sms: 'red sms', analitika: 'red analitika' }
const CONSUMER_NAME: Record<string, string> = { narudzbe: 'kuhar', kuhinja: 'kuhar', sms: 'SMS', analitika: 'analitika' }
/** The engine's first fan-out sentence starts with the queue names in lower case; the lecture says it in prose. */
const FANOUT_FIRST = 'API objavi događaj „NarudzbaZaprimljena” na fanout exchange. Kuhinja, SMS i analitika imaju svaka svoj red i dobivaju vlastitu kopiju.'

function Frame({ step, snap, mode, narrow }: { step: number; snap: FanoutStep; mode: Mode; narrow: boolean }) {
  const reduce = !!useReducedMotion()
  const fan = mode === 'fanout'
  const q = snap.queues
  const newest = snap.deliveries.reduce((m, d) => Math.max(m, d.msg), 0)
  const color = stepColor(step)
  const W = narrow ? 330 : 680
  const rowH = narrow ? 112 : fan ? 92 : 150
  const rowsTop = narrow ? (fan ? 96 : 92) : fan ? 18 : 40
  const H = rowsTop + q.length * rowH + (narrow ? 6 : 10)
  const api = narrow ? { x: 6, y: 8, w: 132, h: 62 } : { x: 6, y: H / 2 - 31, w: 124, h: 62 }
  const ex = narrow ? { x: 182, y: 10, w: 142, h: 60 } : { x: 160, y: H / 2 - 32, w: 116, h: 64 }
  const consumers = 2
  const rowY = (i: number) => rowsTop + i * rowH
  const queueBox = (i: number) => (narrow ? { x: 6, y: rowY(i) + 22, w: 318, h: 4 } : { x: fan ? 318 : 200, y: rowY(i) + rowH / 2 - 2, w: fan ? 118 : 200, h: 4 })
  const cardBox = (i: number, c: number) =>
    narrow ? { x: 6 + c * 164, y: rowY(i) + 36, w: 154, h: 70 } : { x: (fan ? 470 : 450) + c * 106, y: rowY(i) + rowH / 2 - (fan ? 38 : 44), w: 98, h: fan ? 76 : 88 }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${snap.title}. ${snap.body}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <TicketDefs id={`fan-${mode}`} />
      <ApiCard box={api} status={fan ? 'objavi događaj' : 'pošalji naredbu'} statusTone="ink" mood="calm" seed={9900} />
      {fan && (
        <g>
          <Rough shape={{ k: 'rect', x: ex.x, y: ex.y, w: ex.w, h: ex.h }} seed={9910} strokeWidth={1.6} fillColor="var(--paper-2)" fillStyle="solid" />
          <Signpost x={ex.x + 6} y={ex.y + 8} w={34} h={ex.h - 16} seed={9911} />
          <text x={ex.x + 44} y={ex.y + 26} className="k-svg-display" style={{ fontSize: 14 }}>
            exchange
          </text>
          <text x={ex.x + 44} y={ex.y + 46} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
            fanout
          </text>
          {narrow ? <Arrow pts={[[api.x + api.w + 2, api.y + api.h / 2], [ex.x - 4, ex.y + ex.h / 2]]} stroke="var(--ink-3)" strokeWidth={1.5} seed={9912} /> : <Arrow pts={[[api.x + api.w + 2, api.y + api.h / 2], [ex.x - 4, ex.y + ex.h / 2]]} stroke="var(--ink-3)" strokeWidth={1.5} seed={9912} />}
        </g>
      )}
      {q.map((name, i) => {
        const qb = queueBox(i)
        const from: [number, number] = fan ? (narrow ? [ex.x + ex.w / 2, ex.y + ex.h + 2] : [ex.x + ex.w + 2, ex.y + ex.h / 2]) : narrow ? [api.x + 40, api.y + api.h + 2] : [api.x + api.w + 2, api.y + api.h / 2]
        const to: [number, number] = narrow ? [qb.x + qb.w - 40, qb.y - 2] : [qb.x - 4, qb.y + 2]
        // narrow fan-out: down the right margin (a spine) and a short branch into each queue, never across the cards
        const pts: [number, number][] =
          fan && narrow ? [[ex.x + ex.w, ex.y + ex.h / 2], [W - 2, ex.y + ex.h / 2], [W - 2, qb.y - 10], [qb.x + qb.w - 8, qb.y - 10]] : [from, to]
        return (
          <g key={name}>
            <Arrow pts={pts} stroke={newest > 0 ? color : 'var(--ink-3)'} strokeWidth={1.6} seed={9920 + i} />
            <text x={narrow ? qb.x + 2 : qb.x + 2} y={qb.y - 8} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
              {QUEUE_NAME[name] ?? name}
            </text>
            <Rough shape={{ k: 'line', x1: qb.x, y1: qb.y, x2: qb.x + qb.w, y2: qb.y }} seed={9930 + i} strokeWidth={2.2} />
            {Array.from({ length: consumers }, (_, c) => {
              const b = cardBox(i, c)
              const got = snap.deliveries.filter((d) => d.queue === name && d.consumer === c + 1)
              const hot = got.some((d) => d.msg === newest)
              return (
                <g key={c}>
                  {!narrow && <Rough shape={{ k: 'line', x1: qb.x + qb.w, y1: qb.y, x2: b.x - 4, y2: b.y + b.h / 2 }} seed={9940 + i * 3 + c} stroke={hot ? color : 'var(--ink-4)'} strokeWidth={hot ? 1.8 : 1.1} />}
                  <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={9950 + i * 5 + c} strokeWidth={hot ? 2 : 1.5} stroke={hot ? color : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
                  <MiniFace cx={b.x + b.w - 14} cy={b.y + 15} r={10} mood={hot ? 'busy' : 'calm'} seed={9960 + i * 5 + c} />
                  <text x={b.x + 8} y={b.y + 19} className="k-svg-display" style={{ fontSize: 13.5 }}>
                    {CONSUMER_NAME[name] ?? 'potrošač'} {c + 1}
                  </text>
                  {got.slice(-(narrow ? 4 : 2)).map((d, j) => (
                    <motion.g key={`${d.msg}-${d.queue}`} initial={d.msg === newest && !reduce ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : 0.15 }}>
                      <Ticket id={`fan-${mode}`} x={b.x + 22 + j * 36} y={b.y + b.h - 24} label={String(41 + d.msg)} tone={d.msg === newest ? 'warn' : 'info'} />
                    </motion.g>
                  ))}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/** Scene „Red, pub/sub ili log”: a command to one consumer vs an event copied to every subscriber (E2 fanoutScript). */
export function FanoutStepper() {
  const [mode, setMode] = useState<Mode>('work-queue')
  const steps = useMemo(() => fanoutScript({ mode }).map((s, i) => (mode === 'fanout' && i === 0 ? { ...s, body: FANOUT_FIRST } : s)), [mode])
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 628
  return (
    <div className="k-wide">
      <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 12px' }}>
        <Segmented
          label="Topologija"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'work-queue', label: 'naredba · radni red' },
            { value: 'fanout', label: 'događaj · objavi-pretplati' },
          ]}
        />
      </div>
      <Stepper key={mode} title={mode === 'fanout' ? 'Događaj: svaki pretplatnik dobiva kopiju' : 'Naredba: posao za jednog potrošača'} steps={steps.map((s) => ({ title: s.title, body: s.body }))} autoPlay={0} wide={false}>
        {(step) => (
          <div ref={ref} style={{ width: '100%' }}>
            <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
              <Frame step={step} snap={steps[step]} mode={mode} narrow={narrow} />
            </div>
          </div>
        )}
      </Stepper>
    </div>
  )
}
