import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Check, Cross, Cylinder, Person, Phone, Rough, StepBadge, Stepper, SvgStamp, Tray, TrayDefs, stepColor, useWidth } from '../../../kit'
import { SYNC_GEO, SYNC_STEPS, type SyncGeo } from '../syncChain'
import { ApiCard, CookCard, Ticket, TicketDefs } from './parts'

/** A pencil clock with a reading: how long the student waits for an answer. */
function WaitClock({ x, y, r, text, tone }: { x: number; y: number; r: number; text: string; tone: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--orange)' : 'var(--red)'
  const a = tone === 'ok' ? -1.2 : tone === 'warn' ? 0.6 : 2.4
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={9701} stroke={color} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[x, y - r * 0.62], [x, y], [x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7]] }} seed={9702} stroke={color} strokeWidth={1.8} roughness={0.4} />
      <text x={x + r + 6} y={y + 6} className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700, fill: color }}>
        {text}
      </text>
    </g>
  )
}

function Kitchen({ g, active }: { g: SyncGeo; active: boolean }) {
  const b = g.kitchen
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={9711} strokeWidth={1.6} stroke={active ? 'var(--ink)' : 'var(--ink-3)'} fillColor="var(--paper-2)" fillStyle="solid" />
      <Ticket id="sync" x={b.x + 22} y={b.y + b.h / 2} label="42" />
      <text x={b.x + 44} y={b.y + 26} className="k-svg-display" style={{ fontSize: 14.5 }}>
        kuhinja
      </text>
      <text x={b.x + 44} y={b.y + 46} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
        listić
      </text>
    </g>
  )
}

function SyncFrame({ step, g }: { step: number; g: SyncGeo }) {
  const reduce = !!useReducedMotion()
  const queue = step === 3
  // the gateway stays slow in step 4 too: the queue does not fix it, nobody waiting for an answer depends on it any more
  const slow = step >= 1
  const color = stepColor(step)
  const apiRight: [number, number] = [g.api.x + g.api.w, g.api.y + g.api.h / 2]
  const fromWorker: [number, number] = queue ? [g.consumer.x + g.consumer.w, g.consumer.y + g.consumer.h / 2] : apiRight
  const pg = g.postgres
  const pgIn: [number, number] = [pg.x - 4, pg.y + pg.h / 2]
  const kIn: [number, number] = [g.kitchen.x - 4, g.kitchen.y + g.kitchen.h / 2]
  const sIn: [number, number] = [g.sms.x - 4, g.sms.y + g.sms.h / 2]
  const answer = queue ? '202 · #42' : step === 0 ? '200 OK' : step === 1 ? '200 OK' : '503'
  const answerTone = queue || step === 0 ? 'var(--green)' : step === 1 ? 'var(--orange)' : 'var(--red)'
  const delay = reduce ? 0 : 0.35
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${SYNC_STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <TicketDefs id="sync" />
      <TrayDefs id="sync" />
      {/* the student and how long she waits */}
      <Person x={g.student.x} y={g.student.y} scale={g.student.s} hair="pony" holding="phone" shirt="var(--hl-pink-ink)" mood={step === 2 ? 'worry' : step === 1 ? 'flat' : 'smile'} seed={9601} />
      <text x={g.student.label[0]} y={g.student.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        studentica
      </text>
      <WaitClock x={g.clock[0]} y={g.clock[1]} r={16} text={queue ? '0,05 s' : step === 0 ? '~1 s' : step === 1 ? '~4 s' : '0 s · 503'} tone={queue || step === 0 ? 'ok' : step === 1 ? 'warn' : 'bad'} />
      {/* the API */}
      <ApiCard box={g.api} status={queue ? 'spremi + objavi' : step === 2 ? '4 / 4 zauzeto' : step === 1 ? 'čeka SMS…' : 'radi sve'} statusTone={step === 2 ? 'red' : queue ? 'green' : 'ink'} mood={step === 2 ? 'panic' : step === 1 ? 'busy' : 'calm'} seed={9620} />
      {step === 2 && (
        <g>
          {[0, 1, 2, 3].map((i) => {
            const w = (g.workers.w - 10) / 4
            const x = g.workers.x + 5 + i * w
            return (
              <g key={i}>
                <Rough shape={{ k: 'rect', x: x + 1, y: g.workers.y, w: w - 4, h: g.workers.h }} seed={9630 + i} strokeWidth={1.2} stroke="var(--red)" />
                <Tray x={x + w / 2 - 1} y={g.workers.y + g.workers.h / 2 + 1} w={w - 10} />
              </g>
            )
          })}
          <text x={g.workers.x + g.workers.w / 2} y={g.workers.y + g.workers.h + 20} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18.5, fill: 'var(--red)' }}>
            svi čekaju SMS
          </text>
          {/* new orders bounce off the API */}
          {g.rejected.map(([x, y], i) => (
            <motion.g key={i} initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.5 + i * 0.25, duration: 0.3 }}>
              <use href="#sync-tray" x={x - 15} y={y - 10} width={30} height={20} transform={`rotate(${i % 2 ? 18 : -14} ${x} ${y})`} />
              <Cross x={x + 12} y={y - 12} size={6} seed={9640 + i} />
            </motion.g>
          ))}
          <SvgStamp x={g.stamp[0]} y={g.stamp[1]} text="503" size={17} />
        </g>
      )}
      {/* the queue (step 4): API → rail → consumer */}
      {queue && (
        <motion.g initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <text x={g.rail.x + 2} y={g.rail.y - 8} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
            red poruka
          </text>
          <Rough shape={{ k: 'line', x1: g.rail.x, y1: g.rail.y + 4, x2: g.rail.x + g.rail.w, y2: g.rail.y + 4 }} seed={9650} strokeWidth={2.2} />
          {[0, 1, 2].map((i) => (
            <Ticket key={i} id="sync" x={g.rail.x + g.rail.w - 22 - i * 36} y={g.rail.y + 26} label={String(40 + i)} />
          ))}
          <Arrow pts={g.apiToRail} stroke={color} strokeWidth={1.8} seed={9651} draw={!reduce} />
          <Arrow pts={g.railToConsumer} stroke="var(--ink-3)" strokeWidth={1.6} seed={9652} />
          <CookCard box={g.consumer} info={{ key: 1, title: 'potrošač', status: 'kuha #39', statusTone: 'ink', mood: 'busy', down: false, dashed: false, progress: 0.55, deadline: null, armed: false, slow: false }} seed={9660} />
        </motion.g>
      )}
      {/* the dependencies */}
      <Cylinder x={pg.x} y={pg.y} w={pg.w} h={pg.h} label="Postgres" seed={9670} />
      <Kitchen g={g} active />
      <g>
        <Rough shape={{ k: 'rect', x: g.sms.x, y: g.sms.y, w: g.sms.w, h: g.sms.h }} seed={9680} strokeWidth={1.4} stroke={slow ? 'var(--orange)' : 'var(--ink-2)'} dash="6 4" />
        <Phone x={g.sms.x + 6} y={g.sms.y + 12} w={46} h={g.sms.h - 20} seed={9681} textSize={13} />
        <text x={g.sms.x + 60} y={g.sms.y + 30} className="k-svg-display" style={{ fontSize: 14.5 }}>
          gateway
        </text>
        <text x={g.sms.x + 60} y={g.sms.y + 52} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: slow ? 'var(--orange)' : 'var(--ink-2)' }}>
          {slow ? '! 3 s' : 'odmah'}
        </text>
        {queue && (
          <text x={g.sms.x + g.sms.w} y={g.layout === 'wide' ? g.sms.y - 8 : g.sms.y + g.sms.h + 20} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--orange)' }}>
            sporo, nitko ne čeka
          </text>
        )}
      </g>
      {/* who calls whom: ① ② ③ in call order */}
      <Arrow pts={[apiRight, pgIn]} stroke={queue ? 'var(--ink-3)' : color} strokeWidth={1.8} seed={9690} draw={!reduce} />
      <Arrow pts={[fromWorker, kIn]} stroke={queue ? 'var(--ink-3)' : color} strokeWidth={1.8} seed={9691} draw={!reduce} delay={reduce ? 0 : 0.25} />
      <Arrow pts={[fromWorker, sIn]} stroke={slow ? 'var(--orange)' : queue ? 'var(--ink-3)' : color} strokeWidth={slow ? 2.4 : 1.8} seed={9692} draw={!reduce} delay={reduce ? 0 : 0.5} />
      {g.badges.map(([x, y], i) => (
        <StepBadge key={i} n={i + 1} x={x} y={y} r={13} color={queue ? 'var(--ink-3)' : i === 2 && slow ? 'var(--orange)' : color} />
      ))}
      {/* the answer goes back */}
      <motion.g initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + (queue ? 0.2 : 0.9), duration: 0.3 }}>
        <Rough shape={{ k: 'line', x1: g.answer[0][0], y1: g.answer[0][1], x2: g.answer[1][0], y2: g.answer[1][1] }} seed={9693} stroke={answerTone} strokeWidth={1.8} dash="4 5" />
        <text x={g.answerLabel[0]} y={g.answerLabel[1]} className="k-svg-mono" style={{ fontSize: 14, fontWeight: 700, fill: answerTone }}>
          {answer}
        </text>
        {(queue || step === 0) && <Check x={g.answer[1][0] - 10} y={g.answer[1][1]} size={6} seed={9694} />}
      </motion.g>
    </svg>
  )
}

/** Scene „Sinkroni lanac”: one request waits for the database, the kitchen ticket and the SMS – then 202 + a queue. */
export function SyncChainStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  // wide only when mono 13 stays ≥ 12 px and the step badges (Caveat 18,9) ≥ 17 px: 700 × 12 / 13 ≈ 647 px
  const g = w !== null && w < Math.ceil((SYNC_GEO.wide.W * 12) / 13) ? SYNC_GEO.narrow : SYNC_GEO.wide
  return (
    <Stepper title="Sinkroni lanac" steps={SYNC_STEPS} autoPlay={0} caption="Brojevi ① ② ③ su redoslijed poziva. Dok lanac traje, radnik API-ja je zauzet.">
      {(step) => (
        <div ref={ref} style={{ width: '100%' }}>
          <div style={g.layout === 'narrow' ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <SyncFrame step={step} g={g} />
          </div>
        </div>
      )}
    </Stepper>
  )
}
