/**
 * Cliffhanger „Dodajmo drugi poslužitelj”: Srednji stands next to Veliki and shares the database, but DNS (the phone
 * book) only knows Veliki's address, so Srednji idles. Adding the address does not help at once (resolvers remember
 * the old answer until its TTL expires), so the lecture ends with Srednji still at 0 %. The blind DNS split itself is
 * L04's opening scene. CPU numbers come from the engine (dns mode, API workload, λ 12, seed 42) via model.dnsNumbers().
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Crowd,
  Cylinder,
  DBar,
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
import { dnsNumbers, num } from "../model";
import { Srv } from "./parts";

const STEPS = [
  {
    title: "Srednji je spreman",
    body: "Davor je uz Velikog postavio drugi poslužitelj, Srednji (2 vCPU, 4 GB). Oba koriste istu bazu. U podne Veliki radi, a Srednji se dosađuje.",
  },
  {
    title: "DNS zna samo jednu adresu",
    body: (
      <>
        Studenti Klopu traže po imenu <code>klopa.example</code>. DNS, imenik
        interneta, za to ime vraća samo adresu Velikog. Srednji ima svoju
        adresu, ali nju nitko ne zna.
      </>
    ),
  },
  {
    title: "Davor dopiše drugu adresu",
    body: "Sad DNS vraća obje adrese. Ali razrješivači i preglednici pamte stari odgovor dok ne istekne njegov rok trajanja (TTL, često nekoliko minuta), pa promet još neko vrijeme ide samo Velikom. A ni poslije DNS ne zna koji je poslužitelj jači ni je li uopće živ.",
  },
];

interface Geo {
  W: number;
  H: number;
  wide: boolean;
  crowd: { x: number; y: number; s: number };
  crowdOut: Pt;
  book: { x: number; y: number; w: number; h: number };
  velik: { x: number; y: number; w: number; h: number };
  sred: { x: number; y: number; w: number; h: number };
  db: { x: number; y: number; w: number; h: number };
  who: {
    x: number;
    y: number;
    s: number;
    bubble: { x: number; y: number; w: number; h: number };
    mouth: Pt;
  };
  badges: Pt[];
}

const WIDE: Geo = {
  W: 760,
  H: 310,
  wide: true,
  crowd: { x: 0, y: 112, s: 0.6 },
  crowdOut: [118, 190],
  book: { x: 150, y: 10, w: 290, h: 74 },
  velik: { x: 330, y: 118, w: 190, h: 66 },
  sred: { x: 330, y: 214, w: 190, h: 66 },
  db: { x: 620, y: 150, w: 76, h: 86 },
  who: {
    x: 640,
    y: 18,
    s: 0.6,
    bubble: { x: 470, y: 4, w: 150, h: 64 },
    mouth: [660, 38],
  },
  badges: [
    [548, 230],
    [460, 40],
    [460, 66],
  ],
};

const NARROW: Geo = {
  W: 360,
  H: 446,
  wide: false,
  crowd: { x: 0, y: 64, s: 0.46 },
  crowdOut: [90, 120],
  book: { x: 112, y: 4, w: 244, h: 74 },
  velik: { x: 120, y: 132, w: 196, h: 62 },
  sred: { x: 120, y: 238, w: 196, h: 62 },
  db: { x: 262, y: 340, w: 70, h: 78 },
  who: {
    x: 4,
    y: 336,
    s: 0.6,
    bubble: { x: 64, y: 346, w: 150, h: 60 },
    mouth: [36, 356],
  },
  badges: [
    [340, 228],
    [334, 96],
    [334, 112],
  ],
};

const BUBBLE: string[][] = [
  ["Zašto se", "Srednji", "dosađuje?"],
  ["Ne zna", "mu adresu!"],
  ["Dopisao sam.", "I… ništa?"],
];

/** The kit's marker-filled fuel bar (green → orange ≥ 70 % → red ≥ 90 %) with the CPU number beside it. */
function CpuBar({
  x,
  y,
  w,
  value,
  label,
}: {
  x: number;
  y: number;
  w: number;
  value: number;
  label: string;
}) {
  return (
    <g>
      <DBar x={x} y={y} w={w} h={9} value={value} />
      <text
        x={x + w + 6}
        y={y + 9}
        className="k-svg-mono"
        style={{ fontSize: 13, fill: "var(--ink)" }}
      >
        {label}
      </text>
    </g>
  );
}

function DnsFrame({ step }: { step: number }) {
  const reduce = !!useReducedMotion();
  const [ref, w] = useWidth<HTMLDivElement>();
  const g = w !== null && w < 700 ? NARROW : WIDE;
  const n = useMemo(() => dnsNumbers(), []);
  const cpuV = n.before.veliki;
  const cpuS = n.before.srednji;
  const pct = (v: number) => `${num(Math.round(v * 100))} %`;
  const inV: Pt = [g.velik.x - 3, g.velik.y + g.velik.h / 2];
  const inS: Pt = [g.sred.x - 3, g.sred.y + g.sred.h / 2];
  const color = stepColor(step);
  const b = BUBBLE[step];
  // every tray flies at the same speed (viewBox units per second), whatever the length of its route
  const speed = g.W / 6;
  const travel = (key: string, to: Pt, delay: number) => (
    <motion.g
      key={key}
      initial={
        reduce
          ? { x: to[0], y: to[1] }
          : { x: g.crowdOut[0], y: g.crowdOut[1], opacity: 0 }
      }
      animate={{ x: to[0], y: to[1], opacity: 1 }}
      transition={{
        duration: reduce
          ? 0
          : Math.hypot(to[0] - g.crowdOut[0], to[1] - g.crowdOut[1]) / speed,
        delay: reduce ? 0 : delay,
        ease: "linear",
      }}
    >
      <use href="#l03dns-tray" x={-17} y={-12} width={34} height={23} />
    </motion.g>
  );
  const mid = (a: Pt, c: Pt, f: number): Pt => [
    a[0] + (c[0] - a[0]) * f,
    a[1] + (c[1] - a[1]) * f,
  ];
  const bookLines = [
    { text: "klopa.example → 203.0.113.10", note: "Veliki" },
    ...(step >= 2
      ? [{ text: "klopa.example → 203.0.113.12", note: "Srednji" }]
      : []),
  ];
  return (
    // measure the full width; the narrow layout is capped inside, so it can switch back when the column grows
    <div ref={ref}>
      <div style={g.wide ? undefined : { maxWidth: 460, margin: "0 auto" }}>
        <svg
          viewBox={`0 0 ${g.W} ${g.H}`}
          role="img"
          aria-label={`Korak ${step + 1}: ${STEPS[step].title}. Veliki ${pct(cpuV)} CPU-a, Srednji ${pct(cpuS)}.`}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            overflow: "visible",
          }}
        >
          <TrayDefs id="l03dns" />
          <Crowd x={g.crowd.x} y={g.crowd.y} scale={g.crowd.s} />
          {/* asking the phone book */}
          <Rough
            shape={{
              k: "line",
              x1: g.crowdOut[0] - 30,
              y1: g.crowd.y + 6,
              x2: g.book.x - 4,
              y2: g.book.y + g.book.h / 2,
            }}
            seed={9201}
            stroke="var(--pen)"
            strokeWidth={1.4}
            dash="5 5"
          />
          {/* the phone book (DNS) */}
          <g>
            <Rough
              shape={{ k: "rect", ...g.book }}
              seed={9202}
              strokeWidth={1.7}
              fillColor="var(--paper)"
              fillStyle="solid"
            />
            <Rough
              shape={{
                k: "line",
                x1: g.book.x + 14,
                y1: g.book.y,
                x2: g.book.x + 14,
                y2: g.book.y + g.book.h,
              }}
              seed={9203}
              strokeWidth={1.2}
              stroke="var(--red)"
            />
            <text
              x={g.book.x + 22}
              y={g.book.y + 20}
              className="k-svg-hand"
              style={{ fontSize: 18, fill: "var(--pen)" }}
            >
              DNS · imenik
            </text>
            {bookLines.map((l, i) => (
              <motion.text
                key={l.text + i}
                x={g.book.x + 22}
                y={g.book.y + 40 + i * 18}
                className="k-svg-mono"
                style={{
                  fontSize: 13,
                  fill: i === 1 ? "var(--green)" : "var(--ink)",
                }}
                initial={{ opacity: i === 1 && !reduce ? 0 : 1 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.4 }}
              >
                {l.text}
              </motion.text>
            ))}
            {step === 1 && (
              <text
                x={g.book.x + 22}
                y={g.book.y + 60}
                className="k-svg-hand"
                style={{ fontSize: 18, fill: "var(--red)" }}
              >
                Srednjeg nema u imeniku
              </text>
            )}
          </g>
          {/* roads */}
          <Rough
            shape={{
              k: "line",
              x1: g.crowdOut[0],
              y1: g.crowdOut[1],
              x2: inV[0],
              y2: inV[1],
            }}
            seed={9210}
            stroke="var(--ink-3)"
            strokeWidth={1.5}
            roughness={0.7}
          />
          <Rough
            shape={{
              k: "line",
              x1: g.crowdOut[0],
              y1: g.crowdOut[1],
              x2: inS[0],
              y2: inS[1],
            }}
            seed={9211}
            stroke="var(--ink-4)"
            strokeWidth={1.5}
            roughness={0.7}
            dash="3 7"
          />
          {/* servers and the shared database */}
          <Srv
            x={g.velik.x}
            y={g.velik.y}
            w={g.velik.w}
            h={g.velik.h}
            name="Veliki"
            spec="4 vCPU · 8 GB"
            mood={cpuV > 0.6 ? "busy" : "calm"}
            seed={9220}
            nameSize={15}
          />
          <Srv
            x={g.sred.x}
            y={g.sred.y}
            w={g.sred.w}
            h={g.sred.h}
            name="Srednji"
            spec="2 vCPU · 4 GB"
            mood={cpuS > 0.6 ? "busy" : "calm"}
            seed={9225}
            nameSize={15}
          />
          <CpuBar
            x={g.velik.x + 8}
            y={g.velik.y + g.velik.h + 6}
            w={g.wide ? 120 : 110}
            value={cpuV}
            label={`CPU ${pct(cpuV)}`}
          />
          <CpuBar
            x={g.sred.x + 8}
            y={g.sred.y + g.sred.h + 6}
            w={g.wide ? 120 : 110}
            value={cpuS}
            label={`CPU ${pct(cpuS)}`}
          />
          {g.wide
            ? [g.velik, g.sred].map((s, i) => (
                <Rough
                  key={i}
                  shape={{
                    k: "line",
                    x1: s.x + s.w + 3,
                    y1: s.y + s.h / 2,
                    x2: g.db.x - 4,
                    y2: g.db.y + g.db.h / 2,
                  }}
                  seed={9230 + i}
                  stroke="var(--ink-3)"
                  strokeWidth={1.3}
                  roughness={0.7}
                />
              ))
            : [g.velik, g.sred].map((s, i) => (
                <Rough
                  key={i}
                  shape={{
                    k: "lin",
                    pts:
                      i === 0
                        ? [
                            [s.x + s.w + 3, s.y + s.h / 2],
                            [348, s.y + s.h / 2],
                            [348, g.db.y + g.db.h / 2],
                            [g.db.x + g.db.w + 4, g.db.y + g.db.h / 2],
                          ]
                        : [
                            [s.x + s.w + 3, s.y + s.h / 2],
                            [348, s.y + s.h / 2],
                          ],
                  }}
                  seed={9230 + i}
                  stroke="var(--ink-3)"
                  strokeWidth={1.3}
                  roughness={0.7}
                />
              ))}
          <Cylinder
            x={g.db.x}
            y={g.db.y}
            w={g.db.w}
            h={g.db.h}
            label="baza"
            seed={9235}
          />
          {/* trays: every one to Veliki – Srednji is not in DNS (step 3: resolvers still remember the old answer) */}
          <g key={`t${step}`}>
            {travel("a", mid(g.crowdOut, inV, 0.4), 0.2)}
            {travel("b", mid(g.crowdOut, inV, 0.75), 0.6)}
          </g>
          {/* who speaks */}
          <Davor
            x={g.who.x}
            y={g.who.y}
            scale={g.who.s}
            mood={step === 2 ? "worry" : "flat"}
          />
          <SpeechBubble
            x={g.who.bubble.x}
            y={g.who.bubble.y}
            w={g.who.bubble.w}
            h={g.who.bubble.h}
            tx={g.who.mouth[0]}
            ty={g.who.mouth[1]}
            lines={b}
            size={g.wide ? 18 : 19}
            seed={9240 + step}
          />
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

export function DnsStepper() {
  return (
    <Stepper
      title="Dodajmo drugi poslužitelj"
      steps={STEPS}
      caption={`Brojke iz simulatora prometa: 12 zahtjeva u sekundi, isti seed. Adrese su iz raspona rezerviranog za dokumentaciju.`}
    >
      {(step) => <DnsFrame step={step} />}
    </Stepper>
  );
}
