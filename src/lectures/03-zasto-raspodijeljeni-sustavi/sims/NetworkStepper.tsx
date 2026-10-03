/**
 * „Mreža nije pouzdana”: six things that can happen to one message (an order the Klopa server sends to the kitchen):
 * lost, delayed, duplicated, reordered, slowed by limited bandwidth, cut off by a partition. A flip-book; the trays
 * travel in straight lines at constant speed (linear), errors are loud, the drawing is a pure function of the step.
 */
import { motion, useReducedMotion } from "motion/react";
import {
  Cross,
  Mira,
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
    title: "Izgubljena",
    body: "Poruka se negdje putem izgubi. Poslužitelj ne dobije odgovor i ne zna je li narudžba uopće stigla do kuhinje.",
  },
  {
    title: "Zakašnjela",
    body: "Poruka stoji u nekom redu na putu. Stići će – ali kada? Dok čeka, pošiljatelju izgleda jednako kao izgubljena.",
  },
  {
    title: "Udvostručena",
    body: "Narudžba je stigla, ali se izgubio odgovor. Poslužitelj zato pošalje ponovno, a kuhinja dobije istu narudžbu dvaput.",
  },
  {
    title: "Pomiješan redoslijed",
    body: "Dvije poruke krenu redom, a stignu obrnuto: „otkaži” stigne prije „naruči”. TCP čuva redoslijed samo unutar jedne veze; poruke poslane različitim vezama ili ponovljene poruke mogu stići obrnutim redom.",
  },
  {
    title: "Ograničena propusnost",
    body: "Kroz vezu u sekundi prođe samo određena količina podataka. Kad poruka ima previše, čekaju u redu i kasne.",
  },
  {
    title: "Mrežna particija",
    body: "Veza je prekinuta. Obje strane rade, ali se ne čuju, pa svaka misli da je druga mrtva.",
  },
];

interface Geo {
  W: number;
  H: number;
  srv: { x: number; y: number; w: number; h: number };
  road: { x1: number; x2: number; y: number };
  mira: { x: number; y: number; s: number };
  miraLabel: Pt;
  bubble: { x: number; y: number; w: number; h: number };
  mouth: Pt;
  tray: number;
  badge: Pt;
}

const WIDE: Geo = {
  W: 720,
  H: 230,
  srv: { x: 12, y: 92, w: 132, h: 70 },
  road: { x1: 152, x2: 578, y: 127 },
  mira: { x: 592, y: 54, s: 0.95 },
  miraLabel: [630, 196],
  bubble: { x: 434, y: 0, w: 146, h: 56 },
  mouth: [614, 84],
  tray: 36,
  badge: [168, 84],
};

const NARROW: Geo = {
  W: 360,
  H: 236,
  srv: { x: 4, y: 104, w: 92, h: 56 },
  road: { x1: 100, x2: 274, y: 132 },
  mira: { x: 284, y: 70, s: 0.7 },
  miraLabel: [312, 176],
  bubble: { x: 150, y: 4, w: 130, h: 50 },
  mouth: [300, 92],
  tray: 30,
  badge: [114, 96],
};

const BUBBLES: (string[] | null)[] = [
  null,
  null,
  ["Dvaput", "ćevapi?!"],
  ["Otkazati", "što?"],
  null,
  ["Ima li", "koga?"],
];

function FateFrame({ step }: { step: number }) {
  const reduce = !!useReducedMotion();
  const [ref, w] = useWidth<HTMLDivElement>();
  // wide only where its smallest lettering (Kalam 19,5 · Caveat 19 · mono 13 in 720 units) stays ≥ 18 / 17 / 12 px
  const g = w !== null && w < 665 ? NARROW : WIDE;
  const { x1, x2, y } = g.road;
  const at = (f: number) => x1 + f * (x2 - x1);
  const ts = g.tray;
  const color = stepColor(step);
  const speed = (x2 - x1) / 1.4; // px per second, the same on every route
  const tray = (
    key: string,
    f0: number,
    f1: number,
    delay: number,
    opts: { fall?: boolean; label?: string; labelBelow?: boolean; dy?: number } = {},
  ) => {
    const xa = at(f0);
    const xb = at(f1);
    const dur = Math.abs(xb - xa) / speed;
    const end = {
      x: xb,
      y: opts.fall ? 44 : 0,
      rotate: opts.fall ? 32 : 0,
      opacity: 1,
    };
    return (
      <motion.g
        key={key}
        initial={reduce ? end : { x: xa, y: 0, rotate: 0, opacity: 0 }}
        animate={end}
        transition={
          reduce
            ? { duration: 0 }
            : {
                x: { duration: dur, delay, ease: "linear" },
                opacity: { duration: 0.1, delay },
                y: { duration: 0.35, delay: delay + dur, ease: "easeIn" },
                rotate: { duration: 0.35, delay: delay + dur },
              }
        }
      >
        <g transform={`translate(0 ${y + (opts.dy ?? 0)})`}>
          <use
            href="#l03net-tray"
            x={-ts / 2}
            y={-ts * 0.34}
            width={ts}
            height={ts * 0.68}
          />
          {opts.label && (
            <text
              x={0}
              y={opts.labelBelow ? ts * 0.34 + 14 : -ts * 0.5}
              textAnchor="middle"
              className="k-svg-mono"
              style={{ fontSize: 13, fill: "var(--ink)" }}
            >
              {opts.label}
            </text>
          )}
        </g>
      </motion.g>
    );
  };
  const late = (d: number) => (reduce ? 0 : d);
  const bubble = BUBBLES[step];
  return (
    // measure the full width; the narrow layout is capped inside, so it can switch back when the column grows
    <div ref={ref}>
      <div
        style={g === NARROW ? { maxWidth: 460, margin: "0 auto" } : undefined}
      >
        <svg
          viewBox={`0 0 ${g.W} ${g.H}`}
          role="img"
          aria-label={`Korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            overflow: "visible",
          }}
        >
          <TrayDefs id="l03net" />
          {/* the road; on a partition it is cut, with limited bandwidth it narrows */}
          {step === 5 ? (
            <g>
              <Rough
                shape={{ k: "line", x1, y1: y, x2: at(0.42), y2: y }}
                seed={9001}
                stroke="var(--ink-3)"
                strokeWidth={1.6}
                roughness={0.6}
              />
              <Rough
                shape={{ k: "line", x1: at(0.58), y1: y, x2, y2: y }}
                seed={9002}
                stroke="var(--ink-3)"
                strokeWidth={1.6}
                roughness={0.6}
              />
              <Rough
                shape={{
                  k: "lin",
                  pts: [
                    [at(0.45), y - 16],
                    [at(0.5), y - 6],
                    [at(0.46), y + 4],
                    [at(0.53), y + 16],
                  ],
                }}
                seed={9003}
                stroke="var(--red)"
                strokeWidth={2.4}
                roughness={0.6}
              />
              <text
                x={at(0.5)}
                y={y + 40}
                textAnchor="middle"
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--red)" }}
              >
                prekid veze
              </text>
            </g>
          ) : step === 4 ? (
            <g>
              <Rough
                shape={{
                  k: "lin",
                  pts: [
                    [x1, y - 18],
                    [at(0.5), y - 18],
                    [at(0.6), y - 5],
                    [x2, y - 5],
                  ],
                }}
                seed={9004}
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                roughness={0.6}
              />
              <Rough
                shape={{
                  k: "lin",
                  pts: [
                    [x1, y + 18],
                    [at(0.5), y + 18],
                    [at(0.6), y + 5],
                    [x2, y + 5],
                  ],
                }}
                seed={9005}
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                roughness={0.6}
              />
              <text
                x={at(0.78)}
                y={y + 36}
                textAnchor="middle"
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--ink-2)" }}
              >
                uska veza
              </text>
            </g>
          ) : (
            <Rough
              shape={{ k: "line", x1, y1: y, x2, y2: y }}
              seed={9006}
              stroke="var(--ink-3)"
              strokeWidth={1.6}
              roughness={0.6}
            />
          )}

          <Srv
            x={g.srv.x}
            y={g.srv.y}
            w={g.srv.w}
            h={g.srv.h}
            name="Klopa"
            mood={step === 0 || step === 1 || step === 5 ? "busy" : "calm"}
            seed={9010}
            nameSize={15}
          />
          {(step === 0 || step === 1 || step === 5) && (
            <text
              x={g.srv.x + g.srv.w / 2}
              y={g.srv.y - 10}
              textAnchor="middle"
              className="k-svg-hand"
              style={{ fontSize: 20, fill: "var(--red)" }}
            >
              je li stiglo?
            </text>
          )}
          <Mira
            x={g.mira.x}
            y={g.mira.y}
            scale={g.mira.s}
            mood={bubble ? "open" : "smile"}
          />
          <text
            x={g.miraLabel[0]}
            y={g.miraLabel[1]}
            textAnchor="middle"
            className="k-svg-hand"
            style={{ fontSize: 19, fill: "var(--ink-2)" }}
          >
            kuhinja
          </text>
          {bubble && (
            <motion.g
              key={`b${step}`}
              initial={{ opacity: reduce ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{
                delay: late(step === 2 ? 2.6 : 2.4),
                duration: 0.25,
              }}
            >
              <SpeechBubble
                x={g.bubble.x}
                y={g.bubble.y}
                w={g.bubble.w}
                h={g.bubble.h}
                tx={g.mouth[0]}
                ty={g.mouth[1]}
                lines={bubble}
                size={19.5}
                seed={9020 + step}
              />
            </motion.g>
          )}

          {/* the message(s) */}
          {step === 0 && (
            <g key="s0">
              {tray("lost", 0.05, 0.5, 0.3, { fall: true })}
              <motion.g
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: late(1.3) }}
              >
                <Cross x={at(0.5)} y={y + 52} size={11} />
              </motion.g>
            </g>
          )}
          {step === 1 && (
            <g key="s1">
              {tray("late", 0.05, 0.45, 0.3)}
              <motion.g
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: late(1.0) }}
              >
                <Rough
                  shape={{
                    k: "ellipse",
                    cx: at(0.45) + 34,
                    cy: y - 40,
                    w: 26,
                    h: 26,
                  }}
                  seed={9030}
                  stroke="var(--red)"
                  strokeWidth={1.8}
                  fillColor="var(--paper)"
                  fillStyle="solid"
                />
                <Rough
                  shape={{
                    k: "lin",
                    pts: [
                      [at(0.45) + 34, y - 49],
                      [at(0.45) + 34, y - 40],
                      [at(0.45) + 41, y - 36],
                    ],
                  }}
                  seed={9031}
                  stroke="var(--red)"
                  strokeWidth={1.8}
                  roughness={0.5}
                />
                <text
                  x={at(0.45) + 54}
                  y={y - 34}
                  className="k-svg-hand"
                  style={{ fontSize: 19, fill: "var(--red)" }}
                >
                  čeka…
                </text>
              </motion.g>
            </g>
          )}
          {step === 2 && (
            <g key="s2">
              {tray("first", 0.05, 0.95, 0.2)}
              {tray("again", 0.05, 0.84, 1.5)}
              <Rough
                shape={{
                  k: "lin",
                  pts: [
                    [at(0.9), y + 20],
                    [at(0.55), y + 20],
                  ],
                }}
                seed={9040}
                stroke="var(--green)"
                strokeWidth={1.5}
                dash="4 5"
              />
              <Cross x={at(0.5)} y={y + 21} size={8} />
              <text
                x={at(0.5)}
                y={y + 50}
                textAnchor="middle"
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--ink-2)" }}
              >
                odgovor „primljeno” se izgubio
              </text>
            </g>
          )}
          {step === 3 && (
            <g key="s3">
              {/* „1” writes its label under the road, „2” above and a little higher: they pass, not merge */}
              {tray("one", 0.05, 0.78, 0.2, {
                label: "1 naruči",
                labelBelow: true,
              })}
              {tray("two", 0.05, 0.95, 0.6, { label: "2 otkaži", dy: -8 })}
              <text
                x={at(0.42)}
                y={y + 50}
                textAnchor="middle"
                className="k-svg-hand"
                style={{ fontSize: 19, fill: "var(--ink-2)" }}
              >
                „1” je zapela na putu
              </text>
            </g>
          )}
          {step === 4 && (
            <g key="s4">
              {[0, 1, 2, 3].map((i) =>
                tray(`q${i}`, 0.04, 0.44 - i * 0.1, i * 0.25),
              )}
            </g>
          )}
          {step === 5 && <g key="s5">{tray("cut", 0.05, 0.36, 0.3)}</g>}
          <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={color} />
        </svg>
      </div>
    </div>
  );
}

export function NetworkStepper() {
  return (
    <Stepper
      title="Što se može dogoditi poruci"
      steps={STEPS}
      caption="Šest poznatih nevolja mreže. Pošiljatelj vidi samo je li i kada stigao odgovor – ne i zašto."
    >
      {(step) => <FateFrame step={step} />}
    </Stepper>
  );
}
