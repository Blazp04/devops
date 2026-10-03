import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PenMark } from "./Glyphs";
import k from "./code.module.css";

const YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: klopa-api
spec:
  replicas: 3            # tri jednake kopije
  selector:
    matchLabels:
      app: klopa-api
  template:
    metadata:
      labels:
        app: klopa-api   # ovu oznaku traži Service
    spec:
      containers:
        - name: klopa-api
          image: registry.klopa.example/klopa-api:1.4.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 500m
              memory: 1Gi`;

/** The preview keeps everything up to the Pod template's label (line 13) — the line the Service in § 03 selects on. */
const PREVIEW_LINES = 13;
/** line (0-based) the reader circled */
const CIRCLED = 5;

/** A tiny YAML highlighter — keys in blue ink, values in pink, numbers/quantities in ochre, comments set italic. */
function highlight(line: string, circled = false): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = line;
  let comment = "";
  let gap = "";
  const hash = rest.search(/\s+#\s/);
  if (hash >= 0) {
    const tail = rest.slice(hash);
    const lead = tail.length - tail.trimStart().length;
    gap = tail.slice(0, lead);
    comment = tail.slice(lead);
    rest = rest.slice(0, hash);
  }
  const m = rest.match(/^(\s*)(- )?([\w.-]+)(:)(\s*)(.*)$/);
  if (m) {
    const [, indent, dash, key, colon, sp, value] = m;
    out.push(indent);
    const tokens: ReactNode[] = [];
    if (dash)
      tokens.push(
        <span key="d" className={k.punct}>
          {dash}
        </span>,
      );
    tokens.push(
      <span key="k" className={k.key}>
        {key}
      </span>,
    );
    tokens.push(
      <span key="c" className={k.punct}>
        {colon}
      </span>,
    );
    tokens.push(sp);
    if (value) {
      const cls =
        /^\d+(\.\d+)?$/.test(value) || /^\d+(m|Mi|Gi)$/.test(value)
          ? k.num
          : k.str;
      tokens.push(
        <span key="v" className={cls}>
          {value}
        </span>,
      );
    }
    if (circled)
      out.push(
        <span key="mark" className={k.marked}>
          {tokens}
          <PenMark
            kind="circle"
            w={136}
            h={40}
            seed={17}
            className={k.markPen}
          />
        </span>,
      );
    else out.push(...tokens);
  } else {
    out.push(rest);
  }
  if (comment) {
    out.push(
      <span key="g" className={k.gap}>
        {gap}
      </span>,
    );
    out.push(
      <span key="h" className={k.comment}>
        {comment}
      </span>,
    );
  }
  return out;
}

export function CodeBlock() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const lines = YAML.split("\n");
  const shown = open ? lines : lines.slice(0, PREVIEW_LINES);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(YAML);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={k.spread}>
      <figure className={k.sheet}>
        <figcaption className={k.head}>
          <span className={k.tab}>
            <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
              <path d="M1 1h9l5 5v11H1z M10 1v5h5" />
            </svg>
            deployment.yaml
          </span>
          <span className={k.lang}>YAML · {lines.length} redaka</span>
          <button
            type="button"
            className={k.copy}
            onClick={copy}
            aria-live="polite"
          >
            {copied ? "Kopirano" : "Kopiraj"}
          </button>
        </figcaption>
        <div className={`${k.body} ${open ? k.bodyOpen : ""}`} id={id}>
          <pre className={k.pre}>
            <code>
              {shown.map((ln, i) => (
                <span key={i} className={k.line}>
                  <span className={k.no} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={k.src}
                    style={{
                      ["--indent" as string]: `${ln.length - ln.trimStart().length}ch`,
                    }}
                  >
                    {highlight(ln, i === CIRCLED)}
                  </span>
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
          {copied && (
            <span className={k.stamp} aria-hidden="true">
              Kopirano
            </span>
          )}
        </div>
        <button
          type="button"
          className={k.more}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{open ? "Sakrij dio koda" : "Prikaži cijeli kod"}</span>
          <span className={k.moreCount}>
            {open ? "" : `+${lines.length - PREVIEW_LINES} redaka`}
          </span>
        </button>
      </figure>
      {/* the reader's marginalia, level with the lines they talk about */}
      <aside className={k.notes} aria-label="Bilješke uz kod">
        <div className={k.mnote} style={{ "--line": CIRCLED } as CSSProperties}>
          <PenMark kind="arrow" w={58} h={34} seed={23} className={k.mArrow} />
          <p>
            tri Poda, <em>vidi § 03</em>
          </p>
        </div>
        <div className={k.mnote} style={{ "--line": 12 } as CSSProperties}>
          <PenMark kind="arrow" w={58} h={34} seed={29} className={k.mArrow} />
          <p>
            <svg
              className={k.chip}
              width="30"
              height="16"
              viewBox="0 0 30 16"
              aria-hidden="true"
            >
              <path d="M0 1h22l7 7-7 7H0z" />
            </svg>
            ovu oznaku Service traži selektorom, <em>vidi § 03</em>
          </p>
        </div>
      </aside>
    </div>
  );
}

const PODS = [
  {
    name: "klopa-api-7d9c6b5f4-2xkqp",
    ready: "1/1",
    status: "Running",
    restarts: "0",
    age: "12m",
  },
  {
    name: "klopa-api-7d9c6b5f4-h8m2n",
    ready: "1/1",
    status: "Running",
    restarts: "0",
    age: "12m",
  },
  {
    name: "klopa-api-7d9c6b5f4-tz5wv",
    ready: "0/1",
    status: "CrashLoopBackOff",
    restarts: "4 (32s ago)",
    age: "12m",
  },
];

export function Terminal() {
  return (
    <figure className={k.receipt}>
      <figcaption className={k.receiptHead}>
        <span>terminal</span>
        <span>klaster: menza-prod</span>
      </figcaption>
      <div
        className={k.receiptBody}
        tabIndex={0}
        aria-label="Ispis naredbe kubectl get pods"
      >
        <pre className={k.term}>
          <span className={k.cmd}>
            <span className={k.prompt}>$</span> kubectl get pods -l
            app=klopa-api
          </span>
          {"\n"}
          <span className={k.th}>
            <span className={k.full}>{"NAME".padEnd(27)}</span>
            <span className={k.short}>{"NAME".padEnd(19)}</span>
            {"READY".padEnd(7)}
            {"STATUS".padEnd(18)}
            <span className={k.opt}>
              {"RESTARTS".padEnd(13)}
              AGE
            </span>
          </span>
          {"\n"}
          {PODS.map((p) => (
            <span key={p.name}>
              <span className={k.full}>{p.name.padEnd(27)}</span>
              <span className={k.short}>
                {`klopa-api-…-${p.name.slice(-5)}`.padEnd(19)}
              </span>
              {p.ready.padEnd(7)}
              <span className={p.status === "Running" ? k.ok : k.bad}>
                {p.status}
              </span>
              {" ".repeat(18 - p.status.length)}
              <span className={k.opt}>
                {p.restarts.padEnd(13)}
                {p.age}
              </span>
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
      <p className={k.receiptNote}>
        Dva Poda rade, a tz5wv se ruši i ponovno pokreće. Service promet šalje
        samo Podovima s <code>READY 1/1</code>.
      </p>
    </figure>
  );
}
