import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReqDot, Student } from "./Glyphs";
import { hr, polyD, polyLength, type Pt } from "./geo";
import { useInView, useWidth } from "./hooks";
import c from "./cluster.module.css";

type Phase = "Running" | "Pending" | "CrashLoopBackOff";

interface PodSpec {
  id: string;
  /** the random suffix kubectl prints — the drawing and the captions use the same short name */
  name: string;
  v: 1 | 2;
  app: "klopa-api" | "baza";
  at: { node: 0 | 1; slot: number } | "lane";
  phase: Phase;
  restarts: number;
}

/** Resource requests (match deployment.yaml: 500m / 1Gi per API Pod). */
const REQ = {
  "klopa-api": { cpu: 0.5, ram: 1 },
  baza: { cpu: 1, ram: 2 },
} as const;

const BASE: PodSpec[] = [
  {
    id: "a",
    name: "2xkqp",
    v: 1,
    app: "klopa-api",
    at: { node: 0, slot: 0 },
    phase: "Running",
    restarts: 0,
  },
  {
    id: "b",
    name: "h8m2n",
    v: 1,
    app: "klopa-api",
    at: { node: 0, slot: 1 },
    phase: "Running",
    restarts: 0,
  },
  {
    id: "c",
    name: "tz5wv",
    v: 1,
    app: "klopa-api",
    at: { node: 1, slot: 0 },
    phase: "CrashLoopBackOff",
    restarts: 3,
  },
  {
    id: "db",
    name: "baza-0",
    v: 1,
    app: "baza",
    at: { node: 1, slot: 1 },
    phase: "Running",
    restarts: 0,
  },
  {
    id: "d",
    name: "q7r4d",
    v: 2,
    app: "klopa-api",
    at: "lane",
    phase: "Pending",
    restarts: 0,
  },
];

function frame(over: Record<string, Partial<PodSpec>>): PodSpec[] {
  return BASE.map((p) => ({ ...p, ...over[p.id] }));
}

const FRAMES: readonly { pods: PodSpec[]; title: string; caption: string }[] = [
  {
    pods: frame({}),
    title: "CrashLoopBackOff",
    caption:
      "Pod tz5wv stalno pada. Ima oznaku app=klopa-api, ali nije spreman, pa mu Service ne šalje promet. Novi Pod q7r4d (v2) čeka raspored.",
  },
  {
    pods: frame({ d: { at: { node: 0, slot: 2 } } }),
    title: "Raspoređivanje",
    caption:
      "Scheduler smješta q7r4d na čvor 1, jer ondje ima dovoljno slobodnog CPU-a i RAM-a. Pod je još Pending: kontejner se tek pokreće.",
  },
  {
    pods: frame({ d: { at: { node: 0, slot: 2 }, phase: "Running" } }),
    title: "Spreman",
    caption:
      "q7r4d (v2) je spreman. Service ga odmah dodaje među krajnje točke i šalje mu promet, zajedno s Podovima v1.",
  },
  {
    pods: frame({
      d: { at: { node: 0, slot: 2 }, phase: "Running" },
      c: { phase: "Running", restarts: 4 },
    }),
    title: "Ponovno pokretanje",
    caption:
      "kubelet je ponovno pokrenuo tz5wv. Ovaj put radi, pa opet prima promet.",
  },
  {
    pods: frame({
      d: { at: { node: 0, slot: 2 }, phase: "Running" },
      c: { phase: "CrashLoopBackOff", restarts: 5 },
    }),
    title: "Opet pada",
    caption:
      "…ali samo nakratko. Svaki novi pad produljuje čekanje do sljedećeg pokušaja. Baza ima oznaku app=baza, pa je Service nikad ne bira.",
  },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  w: number;
  h: number;
  narrow: boolean;
  /** the cluster frame, drawn with a gap where the Service door is cut into it */
  frameD: string;
  cluster: Box;
  door: string;
  doorText: { x: number; y: number; anchor: "start" | "middle" };
  label: Pt;
  selector: { label: Pt; chip: Pt };
  outside: {
    students: Pt[];
    studentScale: number;
    line: string;
    label: Pt;
    anchor: "start" | "middle";
  };
  cp: Box;
  cpRing: Pt;
  lane: Box;
  nodes: Box[];
  pod: number;
  podPos: (at: PodSpec["at"]) => Pt;
  route: (p: Pt) => Pt[];
  busPath: string;
}

const R = 30; // cluster frame corner radius

function layout(narrow: boolean): Layout {
  if (!narrow) {
    const FX = 150; // the frame's left edge: the Service door is cut into it
    const Y0 = 16;
    const X1 = 1024;
    const Y1 = 600;
    const DY = 212; // door centre = the bus line
    const r = 96;
    const nodes = [
      { x: 310, y: 238, w: 326, h: 330 },
      { x: 662, y: 238, w: 342, h: 330 },
    ];
    const pod = 84;
    const lane = { x: 750, y: 46, w: 240, h: 138 };
    const xs = [
      [18, 124, 226],
      [48, 210],
    ];
    const podPos = (at: PodSpec["at"]): Pt =>
      at === "lane"
        ? { x: lane.x + 140, y: lane.y + 10 }
        : {
            x: nodes[at.node].x + xs[at.node][at.slot],
            y: nodes[at.node].y + 40,
          };
    return {
      w: 1040,
      h: 616,
      narrow,
      frameD: `M${FX} ${DY - r}V${Y0 + R}A${R} ${R} 0 0 1 ${FX + R} ${Y0}H${X1 - R}A${R} ${R} 0 0 1 ${X1} ${Y0 + R}V${Y1 - R}A${R} ${R} 0 0 1 ${X1 - R} ${Y1}H${FX + R}A${R} ${R} 0 0 1 ${FX} ${Y1 - R}V${DY + r}`,
      cluster: { x: FX, y: Y0, w: X1 - FX, h: Y1 - Y0 },
      door: `M${FX} ${DY - r}A${r} ${r} 0 0 1 ${FX} ${DY + r}Z`,
      doorText: { x: FX + 10, y: DY - 2, anchor: "start" },
      label: { x: FX + 22, y: Y0 + 38 },
      selector: {
        label: { x: FX + 14, y: DY + r + 36 },
        chip: { x: FX + 14, y: DY + r + 50 },
      },
      outside: {
        students: [
          { x: 34, y: 186 },
          { x: 74, y: 176 },
          { x: 114, y: 186 },
        ],
        studentScale: 0.78,
        line: `M10 ${DY}H${FX - 4}`,
        label: { x: 12, y: DY + 34 },
        anchor: "start",
      },
      cp: { x: 310, y: 36, w: 694, h: 156 },
      cpRing: { x: 358, y: 108 },
      lane,
      nodes,
      pod,
      podPos,
      route: (p) => [
        { x: 12, y: DY },
        { x: p.x + pod / 2, y: DY },
        { x: p.x + pod / 2, y: p.y },
      ],
      busPath: `M${FX + r} ${DY}H${nodes[1].x + xs[1][0] + pod / 2}`,
    };
  }
  const CX = 180;
  const FY = 120; // the frame's top edge: the Service door is cut into it
  const X0 = 6;
  const X1 = 354;
  const Y1 = 1132;
  const r = 70;
  const nodes = [
    { x: 22, y: 512, w: 316, h: 292 },
    { x: 22, y: 826, w: 316, h: 292 },
  ];
  const pod = 72;
  const lane = { x: 34, y: 350, w: 292, h: 126 };
  const xs = [
    [14, 122, 228],
    [36, 196],
  ];
  const podPos = (at: PodSpec["at"]): Pt =>
    at === "lane"
      ? { x: lane.x + 196, y: lane.y + 12 }
      : {
          x: nodes[at.node].x + xs[at.node][at.slot],
          y: nodes[at.node].y + 40,
        };
  const busY = (node: number) => nodes[node].y - 12;
  const TRUNK = 236;
  return {
    w: 360,
    h: 1146,
    narrow,
    frameD: `M${CX + r} ${FY}H${X1 - R}A${R} ${R} 0 0 1 ${X1} ${FY + R}V${Y1 - R}A${R} ${R} 0 0 1 ${X1 - R} ${Y1}H${X0 + R}A${R} ${R} 0 0 1 ${X0} ${Y1 - R}V${FY + R}A${R} ${R} 0 0 1 ${X0 + R} ${FY}H${CX - r}`,
    cluster: { x: X0, y: FY, w: X1 - X0, h: Y1 - FY },
    door: `M${CX - r} ${FY}A${r} ${r} 0 0 0 ${CX + r} ${FY}Z`,
    doorText: { x: CX, y: FY + 30, anchor: "middle" },
    label: { x: 22, y: FY + 28 },
    selector: { label: { x: 22, y: 218 }, chip: { x: 196, y: 205 } },
    outside: {
      students: [
        { x: 132, y: 58 },
        { x: 180, y: 50 },
        { x: 228, y: 58 },
      ],
      studentScale: 0.82,
      line: `M${CX} 66V${FY - 4}`,
      label: { x: CX + 16, y: 96 },
      anchor: "start",
    },
    cp: { x: 22, y: 252, w: 316, h: 236 },
    cpRing: { x: 64, y: 296 },
    lane,
    nodes,
    pod,
    podPos,
    route: (p) => {
      const node = p.y > nodes[1].y ? 1 : 0;
      return [
        { x: CX, y: 66 },
        { x: CX, y: TRUNK },
        { x: 14, y: TRUNK },
        { x: 14, y: busY(node) },
        { x: p.x + pod / 2, y: busY(node) },
        { x: p.x + pod / 2, y: p.y },
      ];
    },
    busPath: `M${CX} ${FY + r}V${TRUNK}H14V${busY(1)}H${nodes[1].x + xs[1][0] + pod / 2}M14 ${busY(0)}H${nodes[0].x + xs[0][2] + pod / 2}`,
  };
}

function PodGlyph({ p, size }: { p: PodSpec; size: number }) {
  const s = size;
  const isDb = p.app === "baza";
  const ink = p.v === 2 ? c.v2 : c.v1;
  const pending = p.phase === "Pending";
  const crash = p.phase === "CrashLoopBackOff";
  const rx = s * 0.19;
  return (
    <g>
      {isDb ? (
        <>
          <rect width={s} height={s} rx={rx} className={c.dbBody} />
          <g
            transform={`translate(${s / 2 - 16} ${s / 2 - 20})`}
            className={c.dbGlyph}
          >
            <ellipse cx="16" cy="6" rx="16" ry="6" />
            <path d="M0 6v26c0 3.3 7.2 6 16 6s16-2.7 16-6V6M0 19c0 3.3 7.2 6 16 6s16-2.7 16-6" />
          </g>
        </>
      ) : pending ? (
        <>
          <rect
            width={s}
            height={s}
            rx={rx}
            fill={p.v === 2 ? "url(#tk-hatch-yellow)" : "url(#tk-hatch-blue)"}
            opacity="0.7"
          />
          <rect
            width={s}
            height={s}
            rx={rx}
            className={`${c.pendingEdge} ${ink}`}
          />
        </>
      ) : (
        <rect
          width={s}
          height={s}
          rx={rx}
          className={`${c.podFill} ${ink} ${c.over}`}
          filter="url(#tk-ink)"
        />
      )}
      {crash && (
        <motion.g
          initial={{ opacity: 0, x: 12, y: 9 }}
          animate={{ opacity: 1, x: 6, y: 5 }}
          transition={{ duration: 0.45 }}
        >
          <rect
            width={s}
            height={s}
            rx={rx}
            className={`${c.crashOver} ${c.over}`}
          />
        </motion.g>
      )}
      {!isDb && (
        <text
          x={s / 2}
          y={s / 2 + s * 0.13}
          textAnchor="middle"
          className={`${c.ver} ${pending ? c.verPending : p.v === 2 ? c.verOnYellow : c.verOnBlue}`}
          style={{ fontSize: s * 0.36 }}
        >
          v{p.v}
        </text>
      )}
      {crash && (
        <path d={`M${s - 24} 10l14 14m0 -14l-14 14`} className={c.crashX} />
      )}
      {/* label chip: matches the Service's selector chip */}
      <path
        d="M-6 10h22l6 7-6 7h-22z"
        className={isDb ? c.chipOther : c.chip}
      />
      <text x={s / 2} y={s + 21} textAnchor="middle" className={c.podName}>
        {p.name}
      </text>
      <text
        x={s / 2}
        y={s + 39}
        textAnchor="middle"
        className={crash ? c.phaseBad : pending ? c.phasePending : c.phase}
      >
        {p.phase}
      </text>
      {p.restarts > 0 && (
        <text x={s / 2} y={s + 56} textAnchor="middle" className={c.restarts}>
          restarti: {p.restarts}
        </text>
      )}
    </g>
  );
}

function usage(pods: PodSpec[], node: 0 | 1) {
  return pods
    .filter((p) => p.at !== "lane" && p.at.node === node)
    .reduce(
      (a, p) => ({ cpu: a.cpu + REQ[p.app].cpu, ram: a.ram + REQ[p.app].ram }),
      { cpu: 0, ram: 0 },
    );
}

export function ClusterView() {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, "0px");
  const width = useWidth(boxRef, () =>
    typeof window === "undefined" ? 1200 : window.innerWidth,
  );
  const L = useMemo(() => layout(width < 620), [width]);

  // The story is reader-driven: it advances by itself only while playing, on screen, and not being read
  // with the pointer or keyboard; the progress segment's own CSS animation is the timer.
  const auto = !reduced && !userPaused;
  const running = auto && inView && !hover && !focus;
  const N = FRAMES.length;
  const go = (n: number) => setStep(((n % N) + N) % N);

  const f = FRAMES[step];
  const ready = (p: PodSpec) => p.app === "klopa-api" && p.phase === "Running";
  const matching = f.pods.filter(
    (p) => p.app === "klopa-api" && p.at !== "lane",
  );
  const cpY = L.cpRing.y;

  return (
    <div
      className={c.wrap}
      ref={wrapRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      <div className={c.stage}>
        <div className={c.canvas} ref={boxRef}>
          <svg
            viewBox={`0 0 ${L.w} ${L.h}`}
            role="img"
            aria-label={`Klaster s dva čvora i Serviceom klopa-api. ${f.title}: ${f.caption}`}
          >
            {/* outside the cluster: students, traffic coming in */}
            <g filter="url(#tk-ink)">
              {L.outside.students.map((p, i) => (
                <Student
                  key={i}
                  x={p.x}
                  y={p.y}
                  ink={i % 2 ? "blue" : "pink"}
                  s={L.outside.studentScale}
                />
              ))}
            </g>
            <path d={L.outside.line} className={c.inbound} />
            <text
              x={L.outside.label.x}
              y={L.outside.label.y}
              textAnchor={L.outside.anchor}
              className={c.capsSmall}
            >
              promet izvana
            </text>

            {/* cluster frame: a halftone yellow field, its keyline cut open where the Service door is */}
            <rect
              x={L.cluster.x}
              y={L.cluster.y}
              width={L.cluster.w}
              height={L.cluster.h}
              rx={R}
              fill="url(#tk-ht-yellow)"
              opacity="0.4"
            />
            <path d={L.frameD} className={c.clusterEdge} />
            <text x={L.label.x} y={L.label.y} className={c.capsSmall}>
              klaster
            </text>

            {/* control plane band */}
            <rect
              x={L.cp.x}
              y={L.cp.y}
              width={L.cp.w}
              height={L.cp.h}
              rx="16"
              className={c.cp}
            />
            <g filter="url(#tk-ink)">
              <circle cx={L.cpRing.x} cy={cpY} r="34" className={c.fBlue} />
              <circle cx={L.cpRing.x} cy={cpY} r="21" className={c.fPaper} />
              <circle cx={L.cpRing.x} cy={cpY} r="7" className={c.fPink} />
            </g>
            <text x={L.cpRing.x + 50} y={cpY - 6} className={c.nodeName}>
              control plane
            </text>
            <text x={L.cpRing.x + 50} y={cpY + 16} className={c.mono}>
              API · scheduler
            </text>
            <text x={L.cpRing.x + 50} y={cpY + 34} className={c.mono}>
              etcd · controller
            </text>
            <rect
              x={L.lane.x}
              y={L.lane.y}
              width={L.lane.w}
              height={L.lane.h}
              rx="12"
              className={c.lane}
            />
            <text x={L.lane.x + 14} y={L.lane.y + 24} className={c.capsSmall}>
              čeka raspored
            </text>

            {/* nodes: Pods on top, the nameplate and capacity strips at the bottom (nothing for the wires to cross) */}
            {L.nodes.map((n, i) => {
              const u = usage(f.pods, i as 0 | 1);
              const base = n.y + n.h;
              return (
                <g key={i}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx="18"
                    className={c.node}
                  />
                  <line
                    x1={n.x + 16}
                    y1={base - 108}
                    x2={n.x + n.w - 16}
                    y2={base - 108}
                    className={c.hair}
                  />
                  <text x={n.x + 18} y={base - 82} className={c.capLabel}>
                    CPU
                  </text>
                  {Array.from({ length: 8 }, (_, k) => (
                    <rect
                      key={k}
                      x={n.x + 60 + k * 19}
                      y={base - 95}
                      width="15"
                      height="15"
                      className={
                        k < u.cpu * 2 ? `${c.cpuUsed} ${c.over}` : c.slotFree
                      }
                    />
                  ))}
                  <text
                    x={n.x + n.w - 18}
                    y={base - 82}
                    textAnchor="end"
                    className={c.monoSmall}
                  >
                    {hr(u.cpu, u.cpu % 1 ? 1 : 0)}/4 vCPU
                  </text>
                  <text x={n.x + 18} y={base - 56} className={c.capLabel}>
                    RAM
                  </text>
                  {Array.from({ length: 8 }, (_, k) => (
                    <rect
                      key={k}
                      x={n.x + 60 + k * 19}
                      y={base - 69}
                      width="15"
                      height="15"
                      className={
                        k < u.ram ? `${c.ramUsed} ${c.over}` : c.slotFree
                      }
                    />
                  ))}
                  <text
                    x={n.x + n.w - 18}
                    y={base - 56}
                    textAnchor="end"
                    className={c.monoSmall}
                  >
                    {u.ram}/8 GB
                  </text>
                  <text x={n.x + 18} y={base - 18} className={c.nodeName}>
                    čvor {i + 1}
                  </text>
                  <text
                    x={n.x + n.w - 18}
                    y={base - 19}
                    textAnchor="end"
                    className={c.mono}
                  >
                    4 vCPU · 8 GB
                  </text>
                </g>
              );
            })}

            {/* Service → Pods: one bus from the door, a drop to every matching Pod;
              only ready Pods get a solid wire and traffic */}
            <path d={L.busPath} className={c.bus} />
            {matching.map((p) => {
              const pos = L.podPos(p.at);
              const drop = L.route(pos).slice(-2);
              return (
                <path
                  key={`r${p.id}`}
                  d={polyD(drop)}
                  className={ready(p) ? c.wire : c.wireIdle}
                />
              );
            })}
            {!reduced &&
              matching.filter(ready).map((p) => {
                const r = L.route(L.podPos(p.at));
                const dur = polyLength(r) / 190;
                return [0, 0.5].map((off) => (
                  <g key={`${p.id}-${off}-${step}`}>
                    <animateMotion
                      dur={`${dur}s`}
                      begin={`${-off * dur}s`}
                      repeatCount="indefinite"
                      path={polyD(r)}
                    />
                    <ReqDot x={0} y={0} r={6.5} />
                  </g>
                ));
              })}

            {/* pods */}
            {f.pods.map((p) => {
              const pos = L.podPos(p.at);
              return (
                <motion.g
                  key={p.id}
                  initial={false}
                  animate={{ x: pos.x, y: pos.y }}
                  transition={{
                    duration: reduced ? 0 : 0.9,
                    ease: [0.22, 0.9, 0.25, 1],
                  }}
                >
                  <PodGlyph p={p} size={L.pod} />
                </motion.g>
              );
            })}

            {/* the Service: a pink half-disc door cut into the cluster's own frame — an object IN the cluster
              that receives traffic from outside (requests pass under it, like under the dispatcher disc) */}
            <path d={L.door} className={c.fPink} />
            <text
              x={L.doorText.x}
              y={L.doorText.y}
              textAnchor={L.doorText.anchor}
              className={c.svcName}
            >
              Service
            </text>
            <text
              x={L.doorText.x}
              y={L.doorText.y + 21}
              textAnchor={L.doorText.anchor}
              className={c.svcSub}
            >
              klopa-api
            </text>
            <text
              x={L.selector.label.x}
              y={L.selector.label.y}
              className={c.capsSmall}
            >
              selektor
            </text>
            <g
              transform={`translate(${L.selector.chip.x} ${L.selector.chip.y})`}
            >
              <path d="M0 0h22l6 7-6 7h-22z" className={c.chip} />
              <text x="34" y="12" className={c.monoSmall}>
                app=klopa-api
              </text>
            </g>
          </svg>
        </div>

        <div className={c.story}>
          <div className={c.storyTop}>
            <p className={c.stepNo} aria-live="polite">
              {String(step + 1).padStart(2, "0")}
              <span>/ {String(N).padStart(2, "0")}</span>
            </p>
            <div className={c.ctl}>
              <button
                type="button"
                className={c.btn}
                onClick={() => go(step - 1)}
                aria-label="Prethodni događaj"
              >
                <svg
                  width="18"
                  height="12"
                  viewBox="0 0 18 12"
                  aria-hidden="true"
                >
                  <path d="M17 6H2M7 1L2 6l5 5" />
                </svg>
              </button>
              {!reduced && (
                <button
                  type="button"
                  className={c.btn}
                  onClick={() => setUserPaused((v) => !v)}
                  aria-pressed={userPaused}
                  aria-label={userPaused ? "Nastavi priču" : "Zaustavi priču"}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                  >
                    {userPaused ? (
                      <path d="M1 0.5l10 5.5-10 5.5z" className={c.solid} />
                    ) : (
                      <path
                        d="M1.5 0.5h3v11h-3zM7.5 0.5h3v11h-3z"
                        className={c.solid}
                      />
                    )}
                  </svg>
                </button>
              )}
              <button
                type="button"
                className={`${c.btn} ${c.btnMain}`}
                onClick={() => go(step + 1)}
              >
                Dalje
                <svg
                  width="18"
                  height="12"
                  viewBox="0 0 18 12"
                  aria-hidden="true"
                >
                  <path d="M1 6h15M11 1l5 5-5 5" />
                </svg>
              </button>
            </div>
          </div>
          <ol className={c.segs} aria-label="Događaji u klasteru">
            {FRAMES.map((fr, i) => (
              <li key={fr.title}>
                <button
                  type="button"
                  className={c.seg}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`${i + 1}. ${fr.title}`}
                >
                  <span
                    key={i === step ? `now-${step}` : `seg-${i}`}
                    className={c.segFill}
                    data-state={i < step ? "done" : i === step ? "now" : "todo"}
                    data-auto={auto ? "on" : "off"}
                    style={{
                      animationPlayState: running ? "running" : "paused",
                    }}
                    onAnimationEnd={i === step ? () => go(step + 1) : undefined}
                  />
                </button>
              </li>
            ))}
          </ol>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className={c.captionBox}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3 }}
            >
              <p className={c.capTitle}>{f.title}</p>
              <p className={c.caption}>{f.caption}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <ul className={c.key}>
        <li>
          <span className={`${c.sw} ${c.swV1}`} /> Pod, verzija v1
        </li>
        <li>
          <span className={`${c.sw} ${c.swV2}`} /> Pod, verzija v2
        </li>
        <li>
          <span className={`${c.sw} ${c.swPending}`} /> Pending: još nije
          spreman
        </li>
        <li>
          <span className={`${c.sw} ${c.swCrash}`} /> CrashLoopBackOff: pada i
          ponovno se pokreće
        </li>
        <li>
          <span className={c.swDoor} /> Service: objekt u klasteru, prima promet
          izvana
        </li>
        <li>
          <span className={c.swWire} /> promet samo spremnim Podovima
        </li>
        <li>
          <span className={c.swIdle} /> odgovara selektoru, ali nije spreman
        </li>
        <li>
          <span className={`${c.swCell} ${c.swCpu}`} /> 0,5 vCPU zatraženo ·{" "}
          <span className={`${c.swCell} ${c.swRam}`} /> 1 GB
        </li>
      </ul>
    </div>
  );
}
