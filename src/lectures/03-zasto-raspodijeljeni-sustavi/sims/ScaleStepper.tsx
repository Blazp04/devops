/**
 * „Gore ili u širinu?” — one server, a bigger server up to the ceiling (vertical scaling), then many servers
 * (horizontal scaling), then the whole thing named: a distributed system. User-paced flip-book (kit Stepper).
 */
import { motion, useReducedMotion } from "motion/react";
import {
  Crowd,
  Cylinder,
  Davor,
  Rough,
  SpeechBubble,
  StepBadge,
  Stepper,
  TrayDefs,
  stepColor,
  useWidth,
  type Pt,
} from "../../../kit";
import { Srv } from "./parts";

const STEPS = [
  {
    title: "Danas: jedan poslužitelj",
    body: "Cijela Klopa radi na jednom stroju, Velikom (4 vCPU, 8 GB). Svaki zahtjev ide njemu, a baza stoji uz njega. Stroj ima jedan izvor napajanja.",
  },
  {
    title: "Vertikalno skaliranje: veći stroj",
    body: "Prvi refleks: još veći poslužitelj. Jednostavno je i kod se ne mijenja. Ali postoji strop (najveći stroj koji pružatelj nudi), promjena veličine obično znači ponovno pokretanje, a stroj je i dalje samo jedan. Kad on padne, nema Klope.",
  },
  {
    title: "Horizontalno skaliranje: više strojeva",
    body: "Umjesto većeg stroja kupimo više njih. Svaki ima svoje napajanje, a zajedno mogu nositi više od bilo kojeg pojedinačnog stroja. Svi i dalje koriste istu bazu. Otvoreno je pitanje tko će im dijeliti promet.",
  },
  {
    title: "To je raspodijeljeni sustav",
    body: (
      <>
        Više računala koja surađuju šaljući si poruke preko mreže, a korisniku
        izgledaju kao jedna aplikacija (<code>klopa.example</code>). Dobili smo
        kapacitet i otpornost. Platili smo mrežom između njih, a o toj cijeni
        govori ostatak predavanja.
      </>
    ),
  },
];

interface Geo {
  W: number;
  H: number;
  crowd: { x: number; y: number; s: number };
  crowdLabel: Pt;
  crowdOut: Pt;
  one: { x: number; y: number; w: number; h: number };
  big: { x: number; y: number; w: number; h: number };
  ceiling: {
    x1: number;
    x2: number;
    y: number;
    label: Pt;
    anchor: "start" | "end";
  };
  three: { x: number; y: number; w: number; h: number }[];
  fork: Pt;
  forkLabel: Pt;
  db: { x: number; y: number; w: number; h: number };
  dbIn: Pt;
  frame: { x: number; y: number; w: number; h: number };
  frameLabel: Pt;
  netLabel: Pt;
  badges: Pt[];
  davor?: {
    x: number;
    y: number;
    bubble: { x: number; y: number; w: number; h: number };
  };
  side: boolean;
}

const WIDE: Geo = {
  W: 760,
  H: 362,
  crowd: { x: 2, y: 96, s: 0.62 },
  crowdLabel: [60, 250],
  crowdOut: [126, 176],
  one: { x: 300, y: 168, w: 168, h: 96 },
  big: { x: 300, y: 70, w: 168, h: 194 },
  ceiling: { x1: 262, x2: 506, y: 56, label: [262, 44], anchor: "start" },
  three: [
    { x: 228, y: 176, w: 112, h: 88 },
    { x: 350, y: 176, w: 112, h: 88 },
    { x: 472, y: 176, w: 112, h: 88 },
  ],
  fork: [196, 132],
  forkLabel: [196, 110],
  db: { x: 652, y: 180, w: 76, h: 84 },
  dbIn: [646, 222],
  frame: { x: 212, y: 150, w: 532, h: 164 },
  frameLabel: [222, 336],
  netLabel: [604, 294],
  badges: [
    [490, 176],
    [530, 60],
    [606, 150],
    [722, 140],
  ],
  davor: { x: 610, y: 18, bubble: { x: 664, y: 8, w: 92, h: 50 } },
  side: true,
};

const NARROW: Geo = {
  W: 360,
  H: 486,
  crowd: { x: 6, y: 2, s: 0.5 },
  crowdLabel: [52, 122],
  crowdOut: [96, 92],
  one: { x: 104, y: 196, w: 160, h: 90 },
  big: { x: 104, y: 136, w: 160, h: 150 },
  ceiling: { x1: 92, x2: 290, y: 124, label: [352, 116], anchor: "end" },
  three: [
    { x: 8, y: 208, w: 108, h: 80 },
    { x: 126, y: 208, w: 108, h: 80 },
    { x: 244, y: 208, w: 108, h: 80 },
  ],
  fork: [180, 160],
  forkLabel: [204, 158],
  db: { x: 142, y: 352, w: 76, h: 72 },
  dbIn: [180, 346],
  frame: { x: 2, y: 184, w: 356, h: 252 },
  frameLabel: [10, 458],
  netLabel: [232, 336],
  badges: [
    [290, 196],
    [314, 150],
    [118, 162],
    [340, 452],
  ],
  side: false,
};

const plugAt = (b: { x: number; y: number; w: number; h: number }): Pt => [
  b.x + 24,
  b.y + b.h,
];

function PlugDoodle({
  at,
  seed,
  stroke = "var(--ink)",
}: {
  at: Pt;
  seed: number;
  stroke?: string;
}) {
  const [x, y] = at;
  return (
    <g aria-hidden="true">
      <Rough
        shape={{ k: "line", x1: x, y1: y, x2: x, y2: y + 10 }}
        seed={seed}
        strokeWidth={1.4}
        stroke={stroke}
      />
      <Rough
        shape={{ k: "rect", x: x - 8, y: y + 10, w: 16, h: 10 }}
        seed={seed + 1}
        strokeWidth={1.4}
        stroke={stroke}
        fillColor="var(--paper)"
        fillStyle="solid"
      />
      <Rough
        shape={{ k: "line", x1: x - 4, y1: y + 20, x2: x - 4, y2: y + 25 }}
        seed={seed + 2}
        strokeWidth={1.3}
        stroke={stroke}
      />
      <Rough
        shape={{ k: "line", x1: x + 4, y1: y + 20, x2: x + 4, y2: y + 25 }}
        seed={seed + 3}
        strokeWidth={1.3}
        stroke={stroke}
      />
    </g>
  );
}

function ScaleFrame({ step }: { step: number }) {
  const reduce = !!useReducedMotion();
  const [ref, w] = useWidth<HTMLDivElement>();
  const g = w !== null && w < 700 ? NARROW : WIDE;
  const color = stepColor(step);
  const many = step >= 2;
  const card = step === 1 ? g.big : g.one;
  const cardIn: Pt = g.side
    ? [card.x - 3, card.y + card.h * 0.55]
    : [card.x + card.w / 2, card.y - 3];
  const cardOut: Pt = g.side
    ? [card.x + card.w + 3, card.y + card.h * 0.6]
    : [card.x + card.w / 2 + 40, card.y + card.h + 3];
  const bigCx = g.big.x + g.big.w / 2;
  const t = (d = 0) => ({
    duration: reduce ? 0 : 0.55,
    delay: reduce ? 0 : d,
    type: "spring" as const,
    bounce: 0.2,
  });
  const label = `Korak ${step + 1}: ${STEPS[step].title}.`;
  return (
    // measure the full width; the narrow layout is capped inside, so it can switch back when the column grows
    <div ref={ref}>
      <div style={g.side ? undefined : { maxWidth: 460, margin: "0 auto" }}>
        <svg
          viewBox={`0 0 ${g.W} ${g.H}`}
          role="img"
          aria-label={label}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            overflow: "visible",
          }}
        >
          <TrayDefs id="l03scale" />
          <Crowd x={g.crowd.x} y={g.crowd.y} scale={g.crowd.s} />
          <text
            x={g.crowdLabel[0]}
            y={g.crowdLabel[1]}
            textAnchor="middle"
            className="k-svg-hand"
            style={{ fontSize: 19, fill: "var(--ink-2)" }}
          >
            studenti
          </text>

          {/* roads */}
          {!many && (
            <g key={`road-${step}-${g.W}`}>
              <Rough
                shape={{
                  k: "line",
                  x1: g.crowdOut[0],
                  y1: g.crowdOut[1],
                  x2: cardIn[0],
                  y2: cardIn[1],
                }}
                seed={8101}
                stroke="var(--ink-3)"
                strokeWidth={1.4}
                roughness={0.7}
              />
              <Rough
                shape={{
                  k: "line",
                  x1: cardOut[0],
                  y1: cardOut[1],
                  x2: g.dbIn[0],
                  y2: g.dbIn[1],
                }}
                seed={8102}
                stroke="var(--ink-3)"
                strokeWidth={1.4}
                roughness={0.7}
              />
              <use
                href="#l03scale-tray"
                x={(g.crowdOut[0] + cardIn[0]) / 2 - 17}
                y={(g.crowdOut[1] + cardIn[1]) / 2 - 18}
                width={34}
                height={23}
              />
            </g>
          )}
          {many && (
            <g key={`roads-${g.W}`}>
              <Rough
                shape={{
                  k: "line",
                  x1: g.crowdOut[0],
                  y1: g.crowdOut[1],
                  x2: g.fork[0],
                  y2: g.fork[1],
                }}
                seed={8111}
                stroke="var(--ink-3)"
                strokeWidth={1.4}
                roughness={0.7}
              />
              {g.three.map((b, i) => (
                <g key={i}>
                  <Rough
                    shape={{
                      k: "line",
                      x1: g.fork[0],
                      y1: g.fork[1],
                      x2: b.x + b.w / 2,
                      y2: b.y - 3,
                    }}
                    seed={8112 + i}
                    stroke="var(--ink-3)"
                    strokeWidth={1.4}
                    roughness={0.7}
                  />
                  <Rough
                    shape={
                      g.side
                        ? {
                            k: "line",
                            x1: b.x + b.w - 22,
                            y1: b.y + b.h + 3,
                            x2: b.x + b.w - 22,
                            y2: 302,
                          }
                        : {
                            k: "line",
                            x1: b.x + b.w - 22,
                            y1: b.y + b.h + 3,
                            x2: g.dbIn[0],
                            y2: g.dbIn[1],
                          }
                    }
                    seed={8120 + i}
                    stroke={step === 3 ? "var(--pen)" : "var(--ink-3)"}
                    strokeWidth={1.4}
                    roughness={0.7}
                    dash={step === 3 ? "5 5" : undefined}
                  />
                </g>
              ))}
              {g.side && (
                <Rough
                  shape={{
                    k: "lin",
                    pts: [
                      [g.three[0].x + g.three[0].w - 22, 302],
                      [g.db.x + g.db.w / 2, 302],
                      [g.db.x + g.db.w / 2, g.db.y + g.db.h + 6],
                    ],
                  }}
                  seed={8125}
                  stroke={step === 3 ? "var(--pen)" : "var(--ink-3)"}
                  strokeWidth={1.4}
                  roughness={0.7}
                  dash={step === 3 ? "5 5" : undefined}
                />
              )}
              <Rough
                shape={{
                  k: "ellipse",
                  cx: g.fork[0],
                  cy: g.fork[1],
                  w: 26,
                  h: 24,
                }}
                seed={8130}
                stroke="var(--red)"
                strokeWidth={1.8}
                fillColor="var(--paper)"
                fillStyle="solid"
              />
              <text
                x={g.fork[0]}
                y={g.fork[1] + 6}
                textAnchor="middle"
                className="k-svg-hand"
                style={{ fontSize: 20, fill: "var(--red)" }}
              >
                ?
              </text>
              <text
                x={g.forkLabel[0] + (g.side ? 0 : 18)}
                y={g.forkLabel[1]}
                textAnchor={g.side ? "middle" : "start"}
                className="k-svg-hand"
                style={{ fontSize: 18, fill: "var(--red)" }}
              >
                tko dijeli promet?
              </text>
              <use
                href="#l03scale-tray"
                x={(g.crowdOut[0] + g.fork[0]) / 2 - 17}
                y={(g.crowdOut[1] + g.fork[1]) / 2 - 20}
                width={34}
                height={23}
              />
            </g>
          )}

          {/* one server, then a bigger one */}
          {!many && (
            <motion.g
              key={`one-${step}`}
              initial={{ opacity: reduce ? 1 : 0.4 }}
              animate={{ opacity: 1 }}
              transition={t()}
            >
              <Srv
                x={card.x}
                y={card.y}
                w={card.w}
                h={card.h}
                name={step === 1 ? "Još veći" : "Veliki"}
                spec={step === 1 ? "16 vCPU · 64 GB" : "4 vCPU · 8 GB"}
                seed={8140 + step}
                nameSize={16}
              />
              <PlugDoodle
                at={plugAt(card)}
                seed={8150}
                stroke={step === 1 ? "var(--red)" : "var(--ink)"}
              />
            </motion.g>
          )}
          {step === 1 && (
            <g>
              <Rough
                shape={{
                  k: "line",
                  x1: g.ceiling.x1,
                  y1: g.ceiling.y,
                  x2: g.ceiling.x2,
                  y2: g.ceiling.y,
                }}
                seed={8160}
                stroke="var(--red)"
                strokeWidth={2}
                dash="8 6"
                roughness={0.8}
                draw="mount"
              />
              <text
                x={g.ceiling.label[0]}
                y={g.ceiling.label[1]}
                textAnchor={g.ceiling.anchor}
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--red)" }}
              >
                strop: najveći stroj u ponudi
              </text>
              <Rough
                shape={{
                  k: "ellipse",
                  cx: plugAt(card)[0],
                  cy: plugAt(card)[1] + 16,
                  w: 44,
                  h: 40,
                }}
                seed={8161}
                stroke="var(--red)"
                strokeWidth={2}
                multi
                draw="mount"
                delay={reduce ? 0 : 0.5}
              />
              <text
                x={plugAt(card)[0] + 28}
                y={plugAt(card)[1] + 26}
                className="k-svg-hand"
                style={{ fontSize: 18, fill: "var(--red)" }}
              >
                i dalje jedan stroj
              </text>
            </g>
          )}

          {/* many servers: they slide out of where the big one stood */}
          {many &&
            g.three.map((b, i) => (
              <motion.g
                key={`m${i}`}
                initial={{
                  x: step === 2 && !reduce ? bigCx - (b.x + b.w / 2) : 0,
                  opacity: step === 2 && !reduce ? 0.3 : 1,
                }}
                animate={{ x: 0, opacity: 1 }}
                transition={t(i * 0.08)}
              >
                <Srv
                  x={b.x}
                  y={b.y}
                  w={b.w}
                  h={b.h}
                  name={`app${i + 1}`}
                  spec="4 vCPU"
                  seed={8170 + i * 5}
                  nameSize={15}
                />
                <PlugDoodle at={plugAt(b)} seed={8180 + i * 5} />
              </motion.g>
            ))}

          <Cylinder
            x={g.db.x}
            y={g.db.y}
            w={g.db.w}
            h={g.db.h}
            label="baza"
            seed={8190}
          />

          {step === 3 && (
            <g>
              <Rough
                shape={{ k: "rect", ...g.frame }}
                seed={8200}
                stroke="var(--pen)"
                strokeWidth={1.8}
                dash="9 6"
                roughness={1}
                draw="mount"
              />
              <text
                x={g.frameLabel[0]}
                y={g.frameLabel[1]}
                className="k-svg-hand"
                style={{ fontSize: 20, fill: "var(--pen)" }}
              >
                raspodijeljeni sustav
              </text>
              <text
                x={g.frameLabel[0]}
                y={g.frameLabel[1] + (g.side ? 17 : 19)}
                className="k-svg-mono"
                style={{ fontSize: 13, fill: "var(--ink-2)" }}
              >
                izvana: jedno ime, klopa.example
              </text>
              <text
                x={g.netLabel[0]}
                y={g.netLabel[1]}
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--pen)" }}
              >
                mreža
              </text>
            </g>
          )}

          {g.davor && (step === 1 || step === 2) && (
            <g>
              <Davor
                x={g.davor.x}
                y={g.davor.y}
                scale={0.62}
                mood={step === 1 ? "worry" : "grin"}
              />
              <SpeechBubble
                x={g.davor.bubble.x}
                y={g.davor.bubble.y}
                w={g.davor.bubble.w}
                h={g.davor.bubble.h}
                tx={g.davor.x + 40}
                ty={g.davor.y + 22}
                lines={step === 1 ? ["Još veći?"] : ["Kupimo", "još!"]}
                size={18}
                seed={8210 + step}
              />
            </g>
          )}
          <StepBadge
            n={step + 1}
            x={g.badges[step][0]}
            y={g.badges[step][1]}
            color={color}
          />
        </svg>
      </div>
    </div>
  );
}

export function ScaleStepper() {
  return (
    <Stepper
      title="Gore ili u širinu?"
      steps={STEPS}
      caption="Vertikalno skaliranje (engl. scale up) kupuje veći stroj, horizontalno (engl. scale out) kupuje više strojeva."
    >
      {(step) => <ScaleFrame step={step} />}
    </Stepper>
  );
}
