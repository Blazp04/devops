/**
 * „Tko balansira load balancer?”: two redars share one floating address (VRRP, e.g. keepalived). The backup hears the
 * primary's heartbeats; when they stop, it takes the address over and the students never change where they send.
 */
import { motion, useReducedMotion } from 'motion/react'
import { Cross, MiniServer, Redar, Rough, StepBadge, Stepper, StudentQueue, SvgStamp, TrayDefs, stepColor, useWidth } from '../../../kit'
import type { P } from '../lib/rack'

const STEPS = [
  {
    title: 'Dva redara, jedna adresa',
    body: 'Ime klopa.example pokazuje na javnu plutajuću adresu 203.0.113.10. Drži je glavni load balancer, a rezervni svake sekunde od njega čuje „živ sam” (protokol VRRP, npr. alat keepalived).',
  },
  {
    title: 'Glavni redar padne',
    body: 'Stroj s glavnim load balancerom se ugasi. Otkucaji prestaju – rezervni ne zna je li drugi mrtav ili samo kasni, pa čeka nekoliko propuštenih otkucaja. I ovdje postoji prozor otkrivanja.',
  },
  {
    title: 'Adresa prelazi na rezervnog',
    body: 'Rezervni preuzima adresu 203.0.113.10 i javlja mreži da je ta adresa sada njegova. Studenti ništa ne mijenjaju: šalju na istu adresu, a za nekoliko sekundi sve opet radi.',
  },
]

interface Geo {
  W: number
  H: number
  students: { x: number; y: number }
  client: P
  lb: [P, P]
  servers: P[]
  vip: [P, P]
  beat: [P, P]
  badge: [P, P, P]
}

const WIDE: Geo = {
  W: 760,
  H: 300,
  students: { x: 120, y: 232 },
  client: [130, 190],
  lb: [
    [330, 120],
    [330, 250],
  ],
  servers: [
    [600, 40],
    [600, 130],
    [600, 220],
  ],
  vip: [
    [330, 30],
    [330, 160],
  ],
  beat: [
    [300, 152],
    [300, 212],
  ],
  badge: [
    [200, 70],
    [430, 140],
    [480, 284],
  ],
}

const NARROW: Geo = {
  W: 380,
  H: 470,
  students: { x: 110, y: 118 },
  client: [130, 80],
  lb: [
    [100, 268],
    [270, 268],
  ],
  servers: [
    [20, 380],
    [140, 380],
    [260, 380],
  ],
  vip: [
    [100, 176],
    [270, 176],
  ],
  beat: [
    [150, 246],
    [222, 246],
  ],
  badge: [
    [300, 60],
    [186, 312],
    [330, 210],
  ],
}

function VipFrame({ step, g }: { step: number; g: Geo }) {
  const reduce = !!useReducedMotion()
  const active = step === 2 ? 1 : 0
  const lbDown = step >= 1
  const color = stepColor(step)
  const route: P[] = [g.client, g.lb[active], [g.servers[1][0] + (g.W > 400 ? -6 : 50), g.servers[1][1] + 30]]
  // constant speed: the keyframe at the redar sits at its share of the whole path
  const d1 = Math.hypot(route[1][0] - route[0][0], route[1][1] - route[0][1])
  const d2 = Math.hypot(route[2][0] - route[1][0], route[2][1] - route[1][1])
  const split = d1 / (d1 + d2)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <TrayDefs id="l05vip" />
      <StudentQueue x={g.students.x} y={g.students.y} count={4} scale={0.42} direction={-1} />
      {g.servers.map((s, i) => (
        <MiniServer key={i} x={s[0]} y={s[1]} w={g.W > 400 ? 96 : 96} h={64} seed={7800 + i * 3} />
      ))}
      {/* the heartbeat between the two redars */}
      <Rough shape={{ k: 'line', x1: g.beat[0][0], y1: g.beat[0][1], x2: g.beat[1][0], y2: g.beat[1][1] }} seed={7810} stroke={lbDown ? 'var(--red)' : 'var(--pen)'} strokeWidth={1.8} dash="4 5" />
      <text x={(g.beat[0][0] + g.beat[1][0]) / 2 + (g.W > 400 ? -8 : 0)} y={(g.beat[0][1] + g.beat[1][1]) / 2 + (g.W > 400 ? 6 : -10)} textAnchor={g.W > 400 ? 'end' : 'middle'} className="k-svg-hand" style={{ fontSize: g.W > 400 ? 20 : 22, fill: lbDown ? 'var(--red)' : 'var(--pen)' }}>
        {lbDown ? 'tišina…' : 'živ sam!'}
      </text>
      {/* route of a request through the redar that holds the address */}
      <Rough key={`r${step}`} shape={{ k: 'lin', pts: route }} seed={7820 + step} stroke={step === 1 ? 'var(--red)' : color} strokeWidth={2} dash="3 7" roughness={0.7} />
      {g.lb.map((p, i) => (
        <g key={i}>
          <Redar x={p[0]} y={p[1]} scale={g.W > 400 ? 0.78 : 0.86} angle={i === active && !(step === 1) ? Math.atan2(route[2][1] - p[1], route[2][0] - p[0]) : Math.PI / 2} mood={i === 0 && lbDown ? 'worry' : 'smile'} slowArm />
          <text x={p[0] + (g.W > 400 ? 50 : 0)} y={p[1] + (g.W > 400 ? 6 : 64)} textAnchor={g.W > 400 ? 'start' : 'middle'} className="k-svg-display" style={{ fontSize: 15 }}>
            {i === 0 ? 'LB 1 (glavni)' : 'LB 2 (rezervni)'}
          </text>
          {i === 0 && lbDown && (
            <>
              <g transform={`translate(${p[0]} ${p[1] - 30})`}>
                <Cross x={0} y={0} size={24} seed={7830} strokeWidth={3} />
              </g>
              <SvgStamp x={p[0]} y={p[1] - 28} text="UGAŠEN" size={15} rotate={-8} />
            </>
          )}
        </g>
      ))}
      {/* the floating address: a tag that moves to whoever is in charge */}
      <motion.g initial={false} animate={{ x: g.vip[active][0], y: g.vip[active][1] }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 16 }}>
        <Rough shape={{ k: 'rect', x: -62, y: -15, w: 124, h: 30 }} seed={7840} strokeWidth={1.6} stroke="var(--pen)" fillColor="var(--note-blue)" fillStyle="solid" />
        <text x={0} y={6} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700, fill: 'var(--note-ink)' }}>
          203.0.113.10
        </text>
      </motion.g>
      <text x={g.client[0] - 10} y={g.client[1] - 30} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.W > 400 ? 20 : 22, fill: 'var(--ink-2)' }}>
        → 203.0.113.10
      </text>
      {/* narrow: the drawing is ~310 px wide inside the DeepDive, so the badge's number is drawn a size up */}
      <g transform={`translate(${g.badge[step][0]} ${g.badge[step][1]}) scale(${g.W > 400 ? 1 : 1.15})`}>
        <StepBadge n={step + 1} x={0} y={0} color={color} />
      </g>
      {step !== 1 && (
        <motion.g
          key={`t${step}`}
          initial={{ x: route[0][0], y: route[0][1], opacity: reduce ? 1 : 0 }}
          animate={reduce ? { x: route[2][0], y: route[2][1], opacity: 1 } : { x: route.map((q) => q[0]), y: route.map((q) => q[1]), opacity: 1 }}
          transition={{ duration: reduce ? 0 : 1.4, ease: 'linear', times: [0, split, 1], delay: reduce ? 0 : step === 2 ? 1.1 : 0.4, opacity: { duration: 0.1 } }}
        >
          <use href="#l05vip-tray" x={-17} y={-12} width={34} height={24} />
        </motion.g>
      )}
    </svg>
  )
}

export function VipStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  return (
    <div ref={ref} className="k-wide">
      <Stepper title="Plutajuća adresa" steps={STEPS} caption="Par load balancera s plutajućom adresom. U oblaku isto rješava upravljani load balancer: iza jednog imena radi više strojeva, a pružatelj ih sam zamjenjuje.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <VipFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
