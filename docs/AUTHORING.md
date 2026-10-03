# Pisanje predavanja — vodič za autore

This guide is for anyone (human or agent) writing a lecture. Lecture **content is Croatian**; this guide is in English so tooling and reviewers can follow it.

- Course spec: [`docs/CURRICULUM.md`](CURRICULUM.md) (human-readable) and [`docs/curriculum.json`](curriculum.json) (full spec per lecture: scenes, flagship sim model, key facts, misconceptions).
- Research behind the spec: [`docs/research/`](research/).
- Live component reference: run `npm run dev` and open **http://localhost:5173/kit** (source: `src/pages/KitPage.tsx`, which also contains a complete example simulation).

---

## 1. Where a lecture lives

```
src/lectures/<id>-<slug>/        e.g. src/lectures/03-load-balancer/
  index.tsx        default export: the lecture body (no props). REQUIRED.
  sims/            one file per interactive simulation / animation component (.tsx)
  model.ts         pure simulation logic (no React) — easy to reason about and test
  code/            real files shown in CodeBlocks, imported with ?raw (deployment.yaml, Dockerfile…)
  glossary.ts      OPTIONAL extra glossary terms (default export GlossaryEntry[])
```

- The folder name **must** be `<id>-<slug>` exactly as in `src/curriculum/data.ts`; the lecture is discovered automatically.
- The page around your lecture is generated for you: hero (number, title, subtitle, duration, prerequisites, **learning objectives**), reading-progress bar, table of contents (built from your `<Section>`s), "mark as complete" and prev/next navigation. **Do not repeat** title/objectives in the body.
- **Only touch files inside your lecture folder.** Shared files (`src/kit`, `src/curriculum`, `src/pages`, styles) are owned by the course; if you need something the kit lacks, build it locally in your folder and mention it in your report.

`index.tsx` skeleton:

```tsx
import { Section, IncidentCard, Callout, Stepper, CodeBlock, Quiz, Recap, CostNote } from '../../kit'
import { LoadBalancerSim } from './sims/LoadBalancerSim'
import deploymentYaml from './code/deployment.yaml?raw'

export default function Lecture() {
  return (
    <>
      <Section id="problem" kicker="Problem" title="Podne u menzi" lead="…"><IncidentCard … />…</Section>
      <Section id="ideja" kicker="Koncept" title="…">…</Section>
      <Section id="simulacija" kicker="Simulacija" title="…"><LoadBalancerSim /></Section>
      <Section id="kod" kicker="Kod" title="…"><CodeBlock title="deployment.yaml" code={deploymentYaml} /></Section>
      <Section id="zablude" kicker="Zablude" title="Mit ili istina?">…</Section>
      <Section id="sazetak" kicker="Sažetak" title="Što smo naučili">…<Recap … /><Quiz … /></Section>
      <Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili"><CostNote … /></Section>
    </>
  )
}
```

## 2. Shape of a lecture (template)

Target **30–35 minutes** of active study (lectures with a heavy flagship simulation up to 40), 6–9 `<Section>`s. Each section is a resumable chunk of ≤ 6 minutes.

Every lecture is held together by the course's **two story devices** (both in the kit, see §5):

- **`IncidentCard` opens the lecture** (first section). Klopa breaks: incident number, the time the pager went off, the symptom as one headline, 2–4 numbers from the pager screen, the person who got paged — and, in small print, the sim `preset` + `seed` that reproduce those numbers. Source: the lecture's `hook` in `docs/curriculum.json`. **The numbers must be reproducible in your flagship sim** with that preset and seed.
- **`CostNote` closes the lecture** (last section, after the quiz): „Cijena rješenja” — what the solution gave us (`gained`), what it cost or left unsolved (`paid`), and the next incident as a sticky note (`next`, from `bridgeToNext`) that links to the next lecture. Every solution has a price; the price is the next lecture's problem.

| # | Section | What it contains | Kit pieces |
|---|---------|------------------|------------|
| 1 | **Hook / incident** | The incident card, then a Klopa story beat that creates the need. One sharp question. | `IncidentCard`, `Section lead`, small `Figure` / animation |
| 2 | **Feel the pain** | Let the student try the "old" way and see it fail (productive failure). | small sim or `Stepper` |
| 3 | **Predict** | "Što će se dogoditi ako…?" before the main interactive. | `Predict` |
| 4 | **Concept** (1–3 sections) | One new idea per step, user-paced, labels ON the diagram. | `Stepper`, `Figure` + `Diagram`, `Term`, `Analogy`, `KeyIdea`, `MarginNote` |
| 5 | **Flagship simulation** | The main interactive with a goal ("Održite p95 ispod 300 ms s najviše tri poslužitelja."), a *break-it* control, live metrics, tasks that tick themselves and a log of what happened. | `SimFrame` + `useSimulation`, `Stat`, `LineChart`, `Goals`, `EventLog` |
| 6 | **Code** | Minimal, real, annotated config: "ovo što ste vidjeli u animaciji upravo je ova linija". | `CodeBlock notes`, `Terminal` (with a character's `note` on the line that matters), `Tabs` |
| 7 | **Misconceptions** | 2–4 myths from the spec. | `MythOrFact`, `Myth` |
| 8 | **Recap + self-check** | 3–5 "zapamtite" points; 4–6 quiz questions incl. one diagnosis question and one from an earlier lecture. Every answer explained. | `Recap`, `Quiz` |
| 9 | **Cost of the solution** | What we gained, what we paid, the next incident. | `CostNote` |

Skeleton of the first and last sections:

```tsx
<Section id="incident" kicker="priča" title="Podne u menzi" lead="…">
  <IncidentCard no={4} when="ponedjeljak, 12:03" title="U podne Klopa svakom trećem studentu vraća 502"
    who="davor" says="502! Opet podne!" preset="podne-kruzno" seed={42}
    metrics={[{ label: 'zahtjeva/s', value: '15' }, { label: 'p95', value: '4,8 s', tone: 'bad' }, { label: 'greške', value: '31 %', tone: 'bad' }]}>
    Tri poslužitelja, a narudžbe i dalje padaju: Mali je zagušen, a Veliki se dosađuje.
  </IncidentCard>
  <p>…</p>
</Section>
…
<Section id="cijena" kicker="cijena rješenja" title="Što smo dobili, a što platili">
  <CostNote
    gained={['Tri poslužitelja zajedno obrade oko 35 zahtjeva u sekundi.', 'Pad jednog poslužitelja više ne ruši Klopu.']}
    paid={['Load balancer je nova jedinstvena točka kvara.', 'Nadogradnja znači ručno ažurirati tri stroja.']}
    next="Utorak, 12:05: Lana je izdala novu verziju, a pola studenata i dalje vidi stari jelovnik." />
</Section>
```

Rules of thumb:
- **Problem before solution.** Never introduce a component before the student feels why it is needed. The incident card states the problem with numbers; the lecture earns the solution.
- **One threshold idea per lecture**, stated once in a `KeyIdea`.
- **Animations are user-paced** (Stepper with Dalje/Natrag). Motion only for things that actually move (requests, messages, Pods). No decorative motion.
- **Labels on the diagram**, not in a far-away legend. Use `Legend` only for colour keys, and give each item the same mark the drawing uses (`shape="tray" | "check" | "cross" | …`).
- **Code is secondary**: put it in `CodeBlock` (collapsed preview by default) after the concept is understood. Long or optional code: `mode="closed"`.
- Use `DeepDive` ("Za znatiželjne") for anything advanced so the main path stays simple.


## 3. Language and style (Croatian)

- Address students with plural **"vi"** (lowercase) for instructions and tasks ("Dodajte poslužitelj s 4 GB RAM-a i pošaljite nalet prometa."), and the inclusive **"mi"** for walk-throughs and animations ("Pošaljimo 100 zahtjeva i pogledajmo što se događa."). This matches Croatian university materials and avoids gendered verb forms. **Never use "ti".**
- **Buttons and controls** use a short singular imperative with no full stop, as Croatian software does: "Pošalji promet", "Dodaj poslužitelj", "Ugasi poslužitelj", "Kreni ispočetka".
- **Gender-neutral phrasing**: with "vi" the past tense is plural ("vidjeli ste"), which is fine. Avoid singular gendered forms ("vidio si", "spreman/spremna").
- **Standard Croatian, ijekavica**: točka, tisuća, sigurnost, uvjet, primjer, rješenje, vrijeme, mjesto, sljedeći. Avoid Serbian/Bosnian forms (tačka, hiljada, bezbednost, uslov, sledeći, vreme, bezbedan, podesiti → postaviti/konfigurirati).
- **Kubernetes object kinds stay English, capitalised**, declined with Croatian endings without apostrophe: Pod → Podovi, u Podu, Podova; Deployment → Deploymenta, u Deploymentu; Service → Servicea; Secret → Secreta; ConfigMap → ConfigMapa; ReplicaSet → ReplicaSeta; Namespace → Namespacea.
- Follow `docs/research/croatian-terminology.md` (glossary §1, declension §2.2, punctuation §2.4, Serbian/Bosnian forms to avoid §2.5, machine-translation smells §3.2). In short: *poslužitelj* in prose ("server" is fine in sim UI labels), *raspodijeljeni sustav*, *load balancer* (EN), *raspodjela opterećenja*, *kontejner*, *slika kontejnera* (image), *čvor* (node), *klaster*, *red poruka*, *željeno stanje*, *petlja usklađivanja*, *latencija*, *propusnost*, *dostupnost*. First use of an English term: **hrvatski termin (engl. *term*)**.
- Abbreviations decline with a hyphen: RAM-a, CPU-a, API-ja, YAML-a, Argo CD-a. Never decline code: "naredbom `kubectl apply`", "u datoteci `deployment.yaml`".
- Counters in sims need Croatian plural forms (1 zahtjev / 2 zahtjeva / 5 zahtjeva): use `Intl.PluralRules('hr')` or the kit helper `plural(n, ['zahtjev', 'zahtjeva', 'zahtjeva'])`.
- Headings in sentence case ("Kako radi load balancer"), never Title Case.
- **The course style guide in `docs/curriculum.json` → `styleGuide` is authoritative** (terminology, deploy family, worker/radnik/potrošač, slika/fotografija, provjera ispravnosti vs probes, code-font rule, avoided analogies). Read it in full before writing.
- Deploy family: *Deployment* = the Kubernetes object (always capitalised); *postavljanje (engl. deploy)* = getting a version running in an environment; *izdanje* = release; *uvođenje* = rollout; *isporuka* = software delivery in general.
- Use **„podatci”** (IHJJ) site-wide. Sim recap label: **„Što ste upravo vidjeli”**.
- Incident numbers on the lecture's incident card / hook must be reproducible in that lecture's sim with the stated preset and seed.
- On first use of a term in a lecture, wrap it in `<Term id="…">` (glossary tooltip). Check ids in `src/curriculum/data.ts` (`GLOSSARY`). Missing a term? Add it to your lecture's `glossary.ts`.
- Croatian typography: quotes „ovako”, decimal comma (0,6 s), space before % and units (50 %, 2 GB, 300 ms), en dash for ranges (2–4). Use `fmt.num / fmt.pct / fmt.ms / fmt.mb` from the kit for live numbers.
- Tone: friendly, concrete, short sentences. Prefer the Klopa story and real numbers over abstractions. No hype, no filler ("U današnjem svijetu…").

## 4. Correctness rules (non-negotiable)

- **Every factual claim must be true as of October 2026.** Use the `keyFacts` of your lecture in `docs/curriculum.json` and `docs/research/tech-facts.md`. If unsure, leave it out or put it in a `Callout kind="fact"` with the date context.
- Version numbers only inside code blocks or `Callout kind="fact"` (they age).
- Simulations must follow the `flagshipSimulation.model` rules from the spec. **A sim must never teach something false**, even if simplified. Simplifications must be "true but incomplete", and say so in a `DeepDive` if a student could over-generalise.
- Analogies always come with `breaksDown` (where the analogy stops being true).
- YAML / Dockerfile / commands must be valid and current: `apps/v1` Deployments, `docker compose` (v2, no hyphen), pinned image tags (never `:latest` in examples unless the point is to show why it is bad), `resources.requests` set, realistic names (klopa-api, klopa-worker…).
- Known traps (do NOT teach): "Kubernetes runs Docker" (it uses containerd/CRI-O; Docker-built images still work), "Secrets are encrypted" (base64 only by default), "Service load-balances round-robin per request" (kube-proxy picks a backend per connection, randomly in iptables mode), "use ingress-nginx" (community Ingress NGINX controller retired March 2026; teach Gateway API, mention Ingress API still exists), "Argo CD syncs instantly" (polls Git ~every 3 min by default unless webhooks), "RAM makes a server faster", "Kafka needs ZooKeeper" (removed in Kafka 4.0).

## 5. The kit (import from `'../../kit'`)

Everything below is exported from `src/kit/index.ts`. Live reference: **`/kit`** (components, source `src/pages/KitPage.tsx` + `KitInteractive.tsx`, including a complete example simulation) and **`/kit/crtezi`** (every doodle and character, source `src/pages/DoodlesPage.tsx`). When this list and the source disagree, the source's TSDoc wins — open the component.

### 5.1 Text & structure

- **`Section {id, title, kicker?, lead?, prop?}`** — one scene; registers itself in the kazalo and numbers itself. Heading = red Caveat kicker „N · *kicker*” + printed title + a drawn prop (96 × 72). `id` = ASCII kebab-case, unique in the lecture. `lead` = one sentence in Newsreader italic. **`prop`** picks the doodle next to the title; by default it is guessed from the kicker:
  `priča / problem / incident / uvod → clock` · `isprobajte / simulacija / pokvarite / izazov → bolt` · `kod / yaml / terminal / kubectl → boxes` · `provjera / kviz / sažetak / zablude / mit → question` · `pojmovnik → index` · `red poruka / queue → queue` · `docker / kontejner / slika → box` · `git / ci / pipeline → git` · `tajne / secret / sigurnost → lock` · `argo / gitops / sync → loop` · `kubernetes / pod / klaster → helm` · anything else (`koncept`, `korak`…) → `flip`. Override with `prop="helm"`, or `prop={false}` for none.
- **`Callout {kind, title?}`** — an aside; every kind is a different piece of paper: `info` blue sticky note · `tip` green note · `warn` taped index card · `danger` red-pencil box · `analogy` yellow note · `key` big ink box · `fact` dated clipping with a „listopad 2026.” stamp (use it for version numbers and dated facts).
- **`Analogy {title?, breaksDown, who?}`** — menza analogy on a yellow note with a character (`who`: `'mira'` default · `'lana' | 'davor' | 'petra' | 'iva'` · `false`). `breaksDown` is mandatory in practice: the red-pencil "gdje analogija ne vrijedi" note beside it.
- **`Myth {myth}`** + children (the fact) — crumpled pink note, each line struck through with one wavy red line, „NE!”, arrow to the fact.
- **`KeyIdea`** — the lecture's one threshold idea in a double ink box; wrap the key words in `<strong>` (they get a marker swipe).
- **`DeepDive {title, defaultOpen?}`** — "za znatiželjne": a folded graph-paper page, collapsed by default.
- **`Term {id}`** — glossary word: dotted underline, definition on a blue index card (hover / focus / tap; Enter pins it, Esc closes). Children override the shown text for declined forms: `<Term id="pod">Podovi</Term>`.
- **`MarginNote {tone?}`** — the author's handwritten note (Caveat, **≤ ~60 characters, 2 lines max**) in the right margin on wide pages, under the paragraph on narrow ones. Put it *before* the paragraph it comments on. `tone`: `'pen'` (default) · `'red'` · `'green'` · `'ink'`.
- **`Figure {caption?, wide?, framed?, reveal?}`** — a drawing in a pencil frame (`framed`, default true) that draws itself on when it scrolls in (`reveal`, default true); caption in Newsreader italic. `wide` breaks out of the reading column.
- **`Compare {left, right, wide?}`** — two pages side by side; a column is `{title, points[], visual?, tone?}` (`tone`: `blue | violet | teal | amber | rose | green`).
- **`Tabs {tabs: [{label, content}], wide?}`** — coloured index tabs (← → between tabs).
- **`Recap {points, title?}`** — „Zapamtite”: double blue-pen box, each point ticks itself.
- **`Badge {tone}`** — luggage-tag chip in text: `ok | warn | bad | neutral | blue | violet | teal | amber | rose | green`. Use it for statuses (`Running`) and compressed-time notes (`2 s (sim) · stvarno: 30 s`). Its mono text is 0,72 em but never under 12 px, and a long note wraps inside the tag (no overflow in a narrow controls column).
- **`Legend {items: [{color, label, shape?}]}`** — colour key with pencil swatches. `shape`: `dot` (default) · `square` (hatched) · `bar` (solid marker bar, e.g. outcome bars) · `line` · `dashed` · `tray` (a request) · `check` (✓ healthy) · `cross` (✗ failed). Always use the mark the drawing uses, so the key does not depend on colour.
- **Inline `<code>`** in lecture text (`.prose code`, or `.k-code-inline` elsewhere) is a typed label: 0,82 em of the text but **never under 12 px**, the size of the surrounding text inside `.mono` / `.k-mono` text, and it **wraps** (`overflow-wrap: anywhere`) — long FQDNs, kubectl messages and action names break instead of pushing a phone page sideways, so no local `white-space` overrides are needed. On sticky notes and cards its well follows the paper (dark ink on light paper on the chalkboard too). Screen-reader-only text: `className="visually-hidden"`.
- **`Kbd`** — a keycap. **`ScrollX {minWidth}`** — sideways-scrolling fallback for a wide drawing (focusable; prefer a real narrow layout).
- Checks: **`Predict {question, options, correct, explain, then?, after?, onReveal?}`** (circle a prediction, then reveal; `after` = evidence shown under the note only after the reveal — e.g. a small figure that runs both options on the same seed; `onReveal(right)` fires once at the reveal) · **`MythOrFact {items: [{statement, fact, explain}], title?}`** (notes that flip over to a MIT / ISTINA stamp; statements are quoted automatically — don't add „”) · **`Quiz {id?, title?, questions: [{q, options, correct, explain}]}`** (exam sheet; the explanation is a note from teta Mira when right, Davor when wrong; score is stored per lecture).
- Simulation companions: **`Goals {goals: [{text, done}], title?}`** — task card whose boxes tick when `done` becomes true (compute it from the sim state; ticking is announced to screen readers). **`EventLog {events: SimEvent[], max?, title?, formatTime?}`** — "Što se upravo dogodilo": pass `events` in **chronological order** (push new ones at the end, trim the front — never unshift); the log shows the last `max` with the newest on top. `SimEvent = {t, text, tone?, id?}`, `tone`: `ok` ✓ · `warn` ! · `bad` ✗ · `info` → · `neutral` ·. `formatTime(t)` writes the timestamp (default „12,3 s”; e.g. a story clock `t => '12:03:02'`, or minutes for a pipeline). Keep the last ~20 events in the model and give each an `id` (`s.eventId++`; rows are keyed by it). Only `warn`/`bad` events are read aloud (at most one per 2 s).
- **Story devices** (see §2):
  - **`IncidentCard {no, when, title, children?, metrics?, who?, says?, preset?, seed?}`** — the pager alert that opens the lecture. `no` = incident number (1, 2, 3 … across the course); `when` = "ponedjeljak, 12:03"; `title` = the symptom as one short headline; `children` = 1–3 sentences; `metrics` = 2–4 `IncidentMetric {label, value, tone?}` (`tone`: `bad` → red ✗ and circled in red pencil · `warn` → orange ! · `ok` → green ✓ · `neutral`); `who` = the paged character (`'davor'` default — his pager buzzes; `'lana' | 'petra' | 'iva' | 'mira'`); `says` = what they say (string or ≤ 3 short lines, Kalam bubble, ≤ ~16 characters per line); `preset` + `seed` = small print „reproducirajte u simulaciji: preset … · seed …”. Paper: a white ticket with a perforated edge, taped in; board: drawn in chalk, held by magnets.
  - **`CostNote {gained, paid, next?, nextTo?, nextLabel?, title?}`** — „Cijena rješenja”: a ledger page with „dobili smo” (green ✓) and „platili smo” (red −) columns (2–4 short points each), and `next` — the next incident's teaser on a pink sticky note with a link to the next page. The link defaults to the next lecture in the curriculum (`nextTo` / `nextLabel` override it).
- Character drawings for text blocks (own `<svg>`): `CastDoodle {who, mood?, label?}`, `CalloutGlyph {kind}`, `Paperclip`, `TickBox {checked, draw?, delay?}`, `PenCircle`; `CAST_NAME` gives the display names („Teta Mira”, „Davor”…).

### 5.2 Code & terminal

- **`CodeBlock {code, lang?, title?, caption?, mode?, previewLines?, highlight?, notes?, wide?}`** — code on a taped sheet of graph paper. `mode`: `preview` (default: first `previewLines` = 10 lines, then „Prikaži cijeli kod”) · `closed` (header only) · `open`. `highlight="4-6"` = permanent yellow marker. `notes: [{lines: "6" | "7-9" | "2,4", text}]` = blue-pen notes in the margin (beside the code when it fits, under it otherwise); hovering a note marks its lines, clicking / focusing pins it (and opens collapsed code). **Notes are handwriting: ≤ ~60 characters each.** `caption` is one sentence. Languages: yaml, dockerfile, bash, json, javascript, typescript, python, go, ini, toml, hcl, diff, nginx, sql, properties, log, text. Import real files with `?raw`.
- **`Terminal {lines, title?, caption?, animate?, typingMs?, wide?, who?, prompt?, ariaLabel?}`** — a session on Lana's laptop that types itself out (instant under reduced motion; one „preskoči / ponovi” button). **`who`** (`'lana'` default · `'davor' | 'petra' | 'iva' | 'mira'`) sets the default prompt (`davor@klopa:~$`) and the accessible name („Terminal na Davorovu laptopu”); **`prompt`** sets the session's prompt, also on the idle line after the last command (a command's own `prompt` still wins); `ariaLabel` overrides the name. The laptop picks its layout from its own width (narrow below 600 px, wide again above 624 px — no flicker near the threshold) and never pushes its container wider: in a narrow column (a sim's side panel) tables re-flow and lines wrap. Lines: `{cmd, prompt?}` · `{out, tone?}` (`normal | ok | warn | bad | muted`; status words like `Running`, `CrashLoopBackOff` are coloured automatically and tables re-flow on phones) · `{comment}`. **`{out, note, who?}`** sticks a sticky note under that output line with a pen arrow up to it — the one line that matters ("ovdje: CrashLoopBackOff, 4 restarta"); with `who` it is that character speaking (Kalam, „Davor: …”). At most one or two notes per session, ≤ ~70 characters.

### 5.3 Step-by-step, diagrams, Kubernetes shapes

- **`Stepper {steps: [{title, body?}], children: (step, {direction, total}) => …, title?, autoPlay?, playOnView?, wide?, aspect?, caption?}`** — `title` and `body` are text **or JSX** (`body: <>Commit <code>a1b2c3d</code> …</>` for code font). A flip-book: the drawing + an index card with „Korak N / M”, the step's circled number, Natrag / Dalje / Ponovi and progress dots. Reader-paced; `autoPlay` (ms per step, default 4200; 0 = no play button), `playOnView` (never under reduced motion). On phones, when the drawing is taller than ~400 px, a compact „← ② naslov →” bar sits right under it (no scrolling back and forth to the card); „Natrag” keeps keyboard focus on the first step. Keep the drawing a pure function of `step`. `stepColor(i)` gives the step's pen colour (blue → red → green) for ① ② ③ notes; `StepBadge {n, x, y, r?, color}` draws the circled number in SVG (`r` = size, default 13; inside a `Diagram` it grows up to 1,35 × towards a 17 px digit).
- **`Diagram {width, height, label, maxHeight?, interactive?, className?}`** — responsive SVG canvas (viewBox) with shared defs. `label` is the Croatian description (role="img"; becomes role="group" automatically when a piece inside is clickable). It measures its on-screen scale (px per unit) and passes it down, so kit lettering inside (`PodShape` tape / „z” / „↻ N”, `NodeFrame` spec and bars, `K8sIcon` kind label) grows when the drawing is shown smaller than 1:1 and stays ≥ 12 px (print) / 17 px (handwriting). In your own `<svg>` wrap the content in **`<DiagramScale value={renderedWidth / viewBoxWidth}>`** for the same effect; `useDiagramScale()` reads it and `minUnits(px, scale)` converts a minimum on-screen size into viewBox units for your own `<text>`. Inside your own `<svg>` use `<DiagramDefs id>` + `diagramIds(id)`; inside a Diagram `useDiagramIds()` returns `{tray, hatch, hatchR, hatchRed, hatchV1, hatchV2, arrow(tone)}` — e.g. `<use href={ids.tray} fill="var(--tray)" …/>` for a pooled request tray (**`fill` is required** — without it the tray is a black silhouette), `fill={`url(${ids.hatchV2})`}`, `markerEnd={`url(${ids.arrow('blue')})`}`.
- **`DNode {x, y (CENTRE), w?, h?, title?, subtitle?, icon?, tone?, status?, dashed?, onClick?, ariaLabel?, animate?, children?}`** — a pencil box with a doodle icon. `status`: `normal | active` (yellow marker halo) `| down` (red pencil, red hatching, ✗) `| dim` (faint dashed outline, lighter text). `dashed` = desired / placeholder. `icon` (doodles): `server, pod, container, box, user, users, laptop, database, queue, lb, cloud, git, registry, image, lock, secret, vm, cpu, disk, network, globe` (or a lucide icon). `onClick` makes it a keyboard button (Enter / Space, name = `ariaLabel` or the title).
- **`Edge {from, to, tone?, dashed?, flow?, curve?, arrow?, label?, width?, opacity?, draw?}`** — a pencil line with a hand-drawn arrowhead (`arrow`: `true | false | 'both'`); `flow` = marching dashes for traffic; `label` = handwritten note on the midpoint. `draw`: a solid line draws itself on when it scrolls in (`true`, default), right away (`'mount'`) or not at all (`false`). A line that turns solid after mounting (dashed → solid) draws on at once — no `key` tricks needed (this holds for every `Rough` with `draw`).
- **`Packet {path, duration?, delay?, tone?, r?, repeat?, onDone?}`** — **one request = the orange tray** travelling the polyline in straight lines at constant speed (linear). `tone`: default (`'orange'`) = the orange request tray (`'blue'`, `'amber'`, `'neutral'` draw the same tray) · `ok` = green tray with ✓ (an answer going back) · `bad` = red tray with ✗ (a failed request) · `idle` = grey. For many requests in a sim don't use one Packet each: draw `<use href={ids.tray}>` from the model, positioned with **`pointAt(path, t)`** (and `pathTimes(path)`).
- **`DGroup {x, y (TOP-LEFT), w, h, label?, tone?, dashed?}`** — dashed pencil frame (machine, node, namespace) with a handwritten label; `dashed={false}` = a hard boundary.
- **`DLabel {x, y, text, tone?, anchor?, size?, mono?, bold?}`** — a note in a drawing: Caveat (drawn 1,45 × `size`) or `mono` (Plex Mono, numbers / addresses). **`DBar {x, y, w, h?, value 0..1, tone?}`** — marker-filled fuel bar (auto green → orange ≥ 70 % → red ≥ 90 %).
- **Kubernetes** (identical in every lecture — never draw your own):
  - **`PodShape {x, y (CENTRE), size?, status?, label?, tone?, caption?, captionSize?, selected?, restarts?, onClick?, ariaLabel?}`** — the Pod is a **lunchbox**: `status` `running` (smiles, ✓) · `pending` (dashed, sleepy, „z”) · `creating` (pulses) · `terminating` (fades, struck out) · `crash` (CrashLoopBackOff: red, X eyes, „↻ N” with `restarts`) · `oom` (OOMKilled: red burst) · `notready` (empty port) · `completed` · **`imagepull`** (ErrImagePull / ImagePullBackOff: an empty lunchbox in orange pencil with its image — a little tray stack — crossed out in red; never show a missing image as `crash`). `label` = text on the version tape (`v1`, `v2`, `api`); `tone` = version tint: `blue` = v1 (hatch −41°), `green` = v2 (+41°), also `violet | rose` (+41°) and `teal | amber` (−41°). The „↻ N” badge sits on the lid's left when the tape leaves room, otherwise it hangs under the box's bottom-left corner (a long tape such as `1.5.0` never collides with it; a `caption` moves down below it). Tape lettering is ≥ 12 px and the „z” / „↻” ≥ 17 px on screen when the drawing's scale is known (inside `Diagram` / `DiagramScale`; capped so they never outgrow the box). `captionSize` = caption font in units (default 10,5 — give ≥ 12 px on screen). `selected` = blue dashed ring (picked by a Service). Wrap lists in `<AnimatePresence>`.
  - **`NodeFrame {x, y (TOP-LEFT), w, h, name, spec?, cpu?, mem?, status?, note?, highlight?, free?, children?}`** — a worker node: big pencil frame „čvor 1 (worker · 4 vCPU · 8 GB)”, CPU / RAM fuel bars (`{used, total}`), `free` = dashed „slobodno” boxes (`FreeSlot`), `status`: `ready | notready` (red, NotReady stamp) `| cordoned` (dashed, „cordon”) `| provisioning` (faint dashed frame with „čvor stiže…”, or your `note`, e.g. a countdown: a Cluster Autoscaler node on its way). Leave 30 units for the header and 24 for the bars. Inside `Diagram` / `DiagramScale` the spec (Caveat) stays ≥ 17 px on screen as far as the header still fits the frame, and the bar labels ≥ 12 px.
  - **`K8sIcon {kind, x, y (CENTRE), size?, caption?, captionSize?, dim?}`** — every other kind is a **hand-drawn menza doodle** (not the heptagon logo) with its kubectl short name under it: `pod, deploy, rs, svc, node, ns, secret, cm, pv, pvc, sc, ing, gw, route, hpa, job, cronjob, sts, ds, api, etcd, sched, cm-ctrl, kubelet, proxy, user, argo` (`K8S_KINDS`, `KIND_LABEL`). `K8sGlyph` = the doodle alone. `POD_STATUS[status].label` / `podStatusLabel()` give the kubectl status text.
- **`StoryMap {at, caption?, highlightNew?, tags?}`** — the Klopa architecture as it is at the end of lecture `at` ("01"…"24"); what that lecture added is marked NOVO. Use it once per lecture (usually in the incident or recap section). `tags` stamps every thing with the number of the lecture that introduced it (blue pen; for a course trailer or rewind, usually with `highlightNew={false}`). `caption` may be JSX (inline `<code>`); the drawing's accessible name then uses the map's own caption. Its lettering grows with the container (`mapFont`), so handwriting is ≥ 17 px and print ≥ 12 px at every width; the DNS answers `203.0.113.10` (RFC 5737, as in L01); L13 shows four `api` replicas with 1.4.0 as v2 (green tape); L17 shows the simulation's three nodes (2 vCPU · 4 GiB, 4 vCPU · 16 GiB, 2 vCPU · 8 GiB), L18 the autoscaled group (2 vCPU · 8 GiB); L19's Pod is `db-0`. Data and captions: `src/kit/story/story-map.ts`.

### 5.4 Simulations

- **`useSimulation({init, step, fixedDt?, fps?, autoStart?, speed?})`** → `sim` with `state` (the mutable model, re-rendered at `fps` = 30), `time`, `running`, `speed`, `play / pause / toggle / reset`, `setSpeed`, `stepOnce(seconds?)`, `mutate(fn)` and `ref`.
  - `step(state, dt, time)` mutates `state` in place (`dt` = simulated seconds); it always sees the latest props / slider values. Return `'stop'` when a finite run has ended (a simulated year, one pipeline run): the loop pauses itself on that state (`play` continues, `reset` starts over).
  - **User actions go through `mutate`** (kill a server, send a burst, **apply a slider change right away** — also while paused — and log it to the EventLog). Don't wait for the next `step` to apply a control.
  - Auto-starts the first time it scrolls into view (never under reduced motion); pauses off-screen and in hidden tabs. "On screen" = any part of the element (SimFrame's root) inside the middle 80 % of the window, so a frame taller than the window keeps running while the reader is anywhere inside it (no 1 px sticky probes needed).
- **`SimFrame {title, subtitle?, sim?, controls?, stats?, hint?, toolbar?, minHeight?, showTime?, speeds?, stageAlign?, stepSeconds?, onStep?, stepTitle?, children}`** — `stageAlign="start"` keeps the drawing under the toolbar when the controls column is taller (default `'center'`); the „korak” button advances `stepSeconds` (default 0,25) while paused, or calls `onStep` instead (e.g. „next event” in a discrete sim; name it with `stepTitle`). The graph-paper insert: handwritten title, run / pause / reset / speed / step toolbar, `hint` (the task: a short Caveat lead „probajte →” + your sentence in Newsreader italic), the stage, the controls panel (beside the stage when the sheet is ≥ 860 px, below otherwise), and `stats` under a dashed line. Put `Goals` + `EventLog` in `stats` (after the charts) in a two-column grid. `SimFrame` is `k-wide`: make it a direct child of the Section body so it can break out of the reading column; to measure the stage, put `useWidth` inside `children`.
- Controls: **`Button {variant?, icon?, size?, disabled?, ariaDisabled?, active?, title?, ariaLabel?}`** (`primary` ink · `secondary` pencil · `ghost` · `danger` red sticker with a ⚡ — break-it actions („Sruši poslužitelj”) · `success` green — repair actions; `active` hatches it and makes it a toggle button). **`ariaDisabled`** = temporarily unavailable but still focusable (looks disabled, ignores clicks): use it whenever a button can lose its use *while it has focus* — `−1` at 0, „Natrag” on the first step, a control locked while a sim runs — native `disabled` would drop keyboard focus to `<body>`. `ariaLabel` names buttons whose visible text repeats (several „Vrati”). · **`Slider {label, value, min, max, step?, onChange, format?, hint?, disabled?}`** · **`Toggle {label, checked, onChange, hint?}`** (hints are Newsreader 17 px; a long slider value wraps under the label instead of overflowing) · **`Segmented {label?, value, options: [{value, label, title?, disabled?}], onChange, size?, disabled?}`** (← → keys skip `disabled` options; a disabled option is faded and struck through; `disabled` on the group keeps it focusable but locked) · **`Select {label, value, options, onChange}`** · **`ControlGroup {title?, collapsible?, defaultOpen?}`** (`collapsible` = „Napredno”).
- Metrics: **`Stat {label, value, unit?, tone?, sub?, spark?}`** in a **`StatRow`** · **`Meter {value 0..1, label?, valueLabel?, tone?, thresholds?}`** · **`Sparkline {values, color?, max?}`** · **`LineChart {series: [{label, values, color, area?, dashed?}], window?, threshold?: {value, label, color?}, marker?: {at, label?, color?}, yMax?, yLabel?, xLabel?, formatY?, height?}`** — series differ by **pattern** as well as colour by default (1st solid, 2nd dashed, 3rd dotted); NaN = "n/a" gap. `marker` = a dashed vertical pencil line at sample index `at` (same x positions as the values, so it follows `window`) with an optional handwritten label — a scrubbed „Trenutak”, the moment a fault starts — instead of overlaying your own using the chart's internal padding. `toneColor`, `utilTone(v)` map values to tones.
- Headless tests of lecture adapters: import sim math from `'../../kit/sim/math'` (plain `.ts`, runs under `node --test`), not from the `'../../kit'` barrel (it pulls in `.tsx`).
- Utilities: `createRng(seed)` (`next, range, int, exp(rate), chance, pick`), `Series` (rolling window), `percentile`, `mean`, `clamp`, `lerp`, `fmt.num | pct | ms | mb` (Croatian decimals and units; `fmt.ms(v, {digits: 1})` fixes the decimals of the seconds form, „3,0 s” next to „2,8 s”), `plural(n, ['zahtjev', 'zahtjeva', 'zahtjeva'])`.

Simulation design rules
- Put the model in `model.ts` as plain TypeScript (types + `createState(params)` + `step(state, dt, params)`), the UI in `sims/*.tsx`.
- Use `createRng(seed)` for randomness → reproducible runs (`reset` gives the same run). Offer the incident's **preset** (a named set of slider values) and use its **seed**, so the `IncidentCard` numbers can be reproduced.
- Default parameters must show the interesting behaviour within ~10 s at 1× speed.
- Always provide: a **goal** in `hint` (and as `Goals`), a **break-it** action (kill server, burst traffic, push bad version…), **reset**, live metrics with units, and an `EventLog` of what happened.
- Cap entity counts (e.g. ≤ 200 animated trays) — drop or aggregate beyond that. Many moving requests = one pooled layer of `<use href={ids.tray}>` positioned with `pointAt` each frame, **not** one Motion component per request.
- **Compressed time must be labelled.** If you shorten a real default for the classroom (e.g. a 30 s health-check interval shown as 2 s), show it: `2 s (sim) · stvarno: 30 s`. Never present a compressed value as the real default.
- Percentiles: nearest-rank over a sliding window of **successful** requests only; show "n/a" when n < 20; show errors as a separate metric (split by type where relevant: 502/503/504). Never show only averages.
- Validated reference models (with numbers) for the load-balancer, queue, scheduler, HPA/cluster-autoscaler and rolling-update sims are in `docs/research/sim-models.md`, with headless prototypes in `docs/research/proto/`. Follow them.
- Latency-bearing movement (requests travelling) uses **linear** easing at constant speed; layout/UI changes use springs.

### 5.5 The pen (sketch primitives, `src/kit/sketch`)

All drawing goes through one roughjs "pen": roughness ≈ 1.1, pen 1.2–2 px, hatching −41°, **fixed seeds** (same seed = same wobble; never `Math.random()`).
- Inside an `<svg>`: **`Rough {shape, seed?, stroke?, fillColor?, fillStyle?, hachureAngle?, hachureGap?, fillWeight?, strokeWidth?, roughness?, bowing?, multi?, dash?, draw?, delay?, duration?}`**. Shapes: `{k:'rect', x, y, w, h}` · `{k:'ellipse', cx, cy, w, h}` · `{k:'line', x1, y1, x2, y2}` · `{k:'lin', pts}` (polyline) · `{k:'curve', pts}` (smooth) · `{k:'poly', pts}` (closed) · `{k:'arc', cx, cy, w, h, start, stop}` · `{k:'path', d}`. `fillColor` turns the fill on (`fillStyle`: `hachure` default, `solid`, `zigzag`, `cross-hatch`, `dots`…). `dash` = dashed pencil (desired state, routes). `draw` = draws itself on once (`true` when scrolled into view, `'mount'` right away; skipped under reduced motion; if `draw` only turns on after mounting — a dashed line becoming solid — it draws on right away). `multi` = pen goes over it twice. Solid strokes skip a little on the chalkboard automatically.
- **`Arrow {pts, stroke?, strokeWidth?, seed?, head?, both?, dash?, draw?, delay?}`** (`both` = a head at the start too) · **`Check {x, y, size?, stroke?, draw?}`** (green ✓) · **`Cross {x, y, size?, stroke?}`** (red ✗) · **`Scribble {x, y, w, h, turns?}`** (crossing out) · **`Boil {slow?}`** — line boil (three takes, ~4 fps, settles after ~5 s) **only around characters and key drawings, never text or simulations**.
- HTML: **`RoughBox {as?, stroke?, fillColor?, double?, dash?, draw?, pad?, seed?, ariaLabel?}`** (pen box around content; `as="span"` = an inline-block box, e.g. inside a `<button>`) · **`RoughButton {onClick, stroke?, ariaPressed?…}`** · **`RoughAround {stroke?, padX?, padY?, draw?}`** (red-pencil ellipse around words — measured, never cuts letters) · **`RoughRule {double?}`** · **`Squiggle`** · **`CheckBox {checked}`**.
- Hooks: **`useWidth()`** → `[ref, width]` — pick a layout by the **container** width (it observes the element present at mount); **`useWidthRef()`** → `[callbackRef, width]` follows an element React re-creates (inside a Stepper page, a keyed subtree, one layout only); `useSize()`, `useOnScreen()`, `useNarrow(px)`, `useElementWidth(ref)`. Helpers: `hashSeed(string)`, `roughPaths()` (cached generator), `PEN_DEFAULTS`.

### 5.6 Doodles: the cast and the menza (`src/kit/doodles`, all on `/kit/crtezi`)

SVG components (place them inside an `<svg>` / `Diagram`; local box noted):
- **The cast** (`CharacterProps {x, y, scale, mood, flip, holding, seed}`, box 80 × 120, head centre 40, 28; `mood`: `smile | worry | open | flat | grin`; `holding`: `phone | laptop | mug | ladle | tray | pager | clipboard | note | none`). Silhouettes read apart even when tiny:
  - **`Lana`** — backend developer (ponytail, glasses, laptop `</>`): code, deploys, „replicas: 3”.
  - **`Davor {buzz}`** — ops / on-call (hood up, pager): incidents, alerts; `buzz` only while errors arrive. He is the default `IncidentCard` person.
  - **`Petra`** — product (blazer): users, deadlines, "what do students see?".
  - **`Iva`** — the new teammate (tee + backpack): asks the questions the student would ask.
  - **`Mira`** — teta Mira, the menza cook (wide, apron, chef's hat, ladle): analogies, right answers.
  - `Person {hair, build, shirt, …}` for anyone else; **`Student {variant, tap}`**, **`StudentQueue {x, y, count, scale, tap}`** (traffic = the queue in front of the menza; length grows with load, feet tap when it is long), **`Crowd {label}`**, `PeekDavor` (margin gag), `STUDENTS` (looks).
  - **`Redar {angle, sweat, arm, slowArm, tag?}`** — the **load balancer**: a person in a hi-vis vest with an „LB” name tag at the menza door; the arm points where the last tray went (`angle`, radians), 0–3 sweat drops = how full the queues are. `tag={false}` drops the name tag (when he is drawn at scale < 0,7, label him outside instead).
- **Menza things**: **`Tray`** / **`TrayDefs {id}`** (= a request; `<use href="#id-tray">`) · **`ServerFace {mood: calm | busy | panic | dead, r}`** · **`ServerCard {x, y, w, h, mood, label, down}`** (server = card with a face; `down` = SRUŠEN stamp) · **`Brain {busy 0..1}`** (one CPU core) · **`Plate {full}`** (one RAM slot) · **`Lunchbox {version, state, name}`** (= Pod in story drawings) · **`ServiceTag`** (= Service: a luggage tag) · **`Envelope {open, dots}`** (= Secret; content as ••••) · **`Laptop {sticker, screen}`** · **`Cylinder {label, labelSize?}`** (database / etcd; label 13 units by default) · **`Helm`** · **`SvgStamp {text, tone}`** · **`SpeechBubble {x, y, w, h, tx, ty, lines, size, tone}`** (Kalam; 1–3 short lines, one `<text>` with a line step of 1,22 em so the lines' boxes never overlap; the ellipse grows to fit; tail ≤ 18 units, next to the head, never over another drawing) · `CoffeeRing`, `ClockIcon`.
- **Diagram doodles** (box props `x, y, w, h` unless noted): `FoodBox` (container), `MiniLunchbox`, `TrayStack {labels}` (image layers), `Shelf` (registry), `CommitString {n, branch, hashes, hashSize?}` (git; hash labels 11 units by default), `RecipeCard {lines, title, titleSize?}` (Deployment / manifest; like `FolderTab` it stays yellow paper on the chalkboard, so anything you draw on it uses `var(--note-ink)`, never the default chalk `--ink`), `Clipboard {text, checks}` (health check), `FolderTab` (namespace), `MenzaGate {label}` (Ingress / Gateway), `Elastic` (HPA), `KitchenTimer {cron}` (Job / CronJob), `Fridge` (volume), `Drawer`, `LoopArrows {check}` and `LoopMagnifier` (GitOps / reconcile loop), `Magnifier` (scheduler), `Building {free}` (node), `Vault`, `Brace`, `Phone`, `BoxedComputer` (VM), `Disk`, `Cloud`, `Globe`, `Network`, `Signpost` (routing), `CounterWindow`, `Burst` (crash), `MiniPerson`, `MiniFace`, `QueueSlots {slots, filled}`, `MiniLaptop`, `MiniServer`.
- **Small doodles** (64 × 48): **`Doodle {kind, x, y, scale}`** in SVG, **`DoodleIcon {kind, label?}`** as its own `<svg>` (the `dns` phone book reads klopa → `203.0.113.10`); `kind` (`DOODLE_KINDS`): `lb, hc, p95, err, pod, svc, node, crash, sched, server, clock, scale, spof, queue, box, layers, registry, loop, helm, secret, config, git, pipeline, db, dns, eye, tag, flag, gauge` — the glossary's pictures; use the same one next to a term.
- **Section props** (96 × 72): `SectionProp {kind}` / `PropClock, PropBolt, PropHelm, PropFlip, PropBoxes, PropQuestion, PropIndex, PropQueue, PropBox, PropGit, PropLock, PropLoop` (`PROP_KINDS`).
- **Paper** (HTML): **`Mark {c}`** (marker swipe behind words: `yellow | pink | green | blue | orange`) · **`StickyNote {c, tape?, rotate?, as?}`** (`c`: `yellow | pink | green | blue | orange | lilac`; always dark `--note-ink` text; magnets on the board) · **`Tape {c: red | blue | green}`** · **`Stamp {tone: green | red | pen | ink, rotate}`** · **`MarginDoodle {kind: coffee | peek | bang | stars}`**.
- Interaction glyphs: `PenGlyph {kind, size}` (`bolt, play, pause, loop, plus, minus, power, snow, fix, clipboard, check, cross, step, skip, chev, left, right, hand`), `LaptopDeck`, `StepBadge`.

**Which drawing for which idea** — use the grammar, never a new metaphor: request = tray · traffic = student queue · load balancer = redar · server = card with a face (CPU = brains, RAM = plates) · Pod = lunchbox · Service = luggage tag · node = big pencil frame / building · container = food box · image = stacked trays · registry = shelf · Secret = sealed envelope · database / etcd = cylinder · health check = clipboard ✓/✗ · scheduler = magnifier over an empty slot · GitOps = blue loop arrows · pipeline = drawers linked by arrows · cluster = double blue pen line + helm.

## 6. Visual rules — "Bilježnica"

The course is **one student's illustrated notebook**: pencil drawings, markers, sticky notes, things taped in, notes in the margin. Every distributed-systems idea becomes something from the Klopa / menza story. Light theme = warm **paper** on a kraft desk; dark theme = a **chalkboard** on the wall (slate, chalk, wooden frame, magnets instead of tape) — a different *material*, not inverted colours.

- **Design bible:** [`src/design-lab/biljeznica/README.md`](../src/design-lab/biljeznica/README.md) (palette, type, the full illustration grammar, motion rules). Live prototype: `/dizajn/biljeznica`. Live references: **`/kit`** and **`/kit/crtezi`**.
- **Use the kit's pen and doodles, don't invent new ones** (§5.5–5.6). One pen everywhere: roughjs, 1.2–2 px, roughness ≈ 1.1, hatching at −41°, **fixed seeds** (never `Math.random()` in drawings). If the grammar lacks a thing, compose it from existing doodles in your lecture folder and report it.

### 6.1 Colour = the pencil case

Tokens only, never raw hex; everything must work on paper *and* on the chalkboard (the tokens switch).

| Meaning | Token | Notes |
|---|---|---|
| text, drawing lines (graphite / chalk) | `--ink`, `--ink-2`, `--ink-3` | `--ink-4` is faint: decoration only, never text. Old names `--text`, `--text-2`, `--muted`, `--faint` still work |
| **links, interaction, selected, health checks** (blue ballpoint) | `--pen` | = `--accent`, `--blue`. Health-check probes, "kuc-kuc", the route a request takes in an explainer |
| **errors, myths, corrections, ✗, kickers** (red pencil) | `--red` | = `--bad`. Failed requests, a crashed server, a myth struck through, the section kicker |
| **success, ✓, Running, healthy** | `--green` | = `--ok` |
| warning, OutOfSync, "almost full" | `--orange` | = `--warn` |
| **a request in flight = the orange tray** | `--tray` (fill), `--tray-ink` (lines, dots, labels about requests) | = `--request`. Nothing else is orange-tray coloured |
| **emphasis** (what to remember) | `Mark` (`--hl-yellow/pink/green/blue/orange`); inside drawings hatch with `--hl-*-ink` | markers, never coloured text for emphasis |
| surfaces | `--paper`, `--paper-2`, `--paper-3`; sticky notes `--note-*` with dark `--note-ink` text | = `--surface`, `--surface-2/3` |
| module colour | `data-module="m1…m6"` → `--module-tab`, `--module-accent` | set by the lecture page |

- **App versions:** v1 = **blue tape**, hatching −41°; v2 = **green tape**, hatching +41° (they differ without colour too); broken = **red** outline + red hatching + ✗. In `PodShape`: `tone="blue"` / `tone="green"`; in your own SVG: `useDiagramIds().hatchV1 / hatchV2 / hatchRed`.
- **Desired vs actual:** desired state = dashed pencil, actual = solid.
- **Never colour alone** (WCAG 1.4.1): pair every colour with a shape or word — ✗ / ✓ / ! marks, dashed vs solid, a stamp (`SRUŠEN`), the face on a server, a label. The kit does this for you (`Packet tone="bad"` carries ✗, `LineChart` series differ by dash pattern, `EventLog` prefixes ✓ ! ✗, `IncidentCard` metrics get ✗ / ! / ✓, `Legend` takes `shape`). Links in running text are underlined.
- **Contrast:** `--ink`/`--ink-2` ≥ 7:1, `--ink-3` and the coloured pencils ≥ 4,5–5:1 on paper and on the (smeared) board. Don't lower it with `opacity` on text: fade drawings, not lettering (`DNode status="dim"` and `PodShape` do this right).

### 6.2 Type voices

| Voice | Font (token) | Use for | Rules |
|---|---|---|---|
| printed headings, UI, names in drawings | **Bricolage Grotesque** (`--f-display`, `--f-ui`) | section titles, buttons, tab labels, server names in drawings | 600–800, `font-stretch` 78–90 % for headings |
| lecture text | **Newsreader** (`--f-body`) | paragraphs, lists, captions (italic), hints, explanations | ≥ 17 px (captions 16–16,5 px italic); lines ≤ ~66 characters (the kit caps `<p>`) |
| the author's handwriting | **Caveat** (`--f-hand`, `.k-svg-hand`, `DLabel`) | **short** margin notes, kickers, labels in drawings, „probajte →” | ≥ 17 px on screen, **max 2 lines / ~60 characters**; never sentences of instructions (those are Newsreader) |
| what **characters say** | **Kalam** (`--f-print`, `.k-svg-print`, `SpeechBubble`) | speech bubbles, „Davor: …” notes on the terminal, story beats | ≥ 18 px, 1–3 short lines; Caveat and Kalam never swap roles |
| code, terminal, metrics, specs | **IBM Plex Mono** (`--f-mono`, `.mono`, `.k-svg-mono`) | code, kubectl output, numbers in stats, `2 vCPU · 4 GB` | ≥ 12 px |

All fonts have latin-ext (č ć đ š ž). Croatian typography: „navodnici”, decimal comma, space before units.

### 6.3 Drawing grammar (short form; the full table is in the bible)

- **Section heads:** red handwritten kicker „N · oznaka” above the printed title, plus one prop doodle (chosen from the kicker, or `prop`).
- **Characters** speak only in short story beats; one bubble = 1–3 short lines, placed next to the head in empty space.
- **Labels on the drawing**, next to what they name, with a short pen arrow if needed; numbered story notes ① ② ③ in the step's colour (`stepColor`) sit next to what changes in that step.
- **Analogy and real term side by side** on first use („redar = load balancer”, „kutija za ručak = Pod”).
- **Numbers in drawings** are printed (Plex Mono), names are printed (Bricolage), notes are handwritten (Caveat).

### 6.4 Motion

1. Things move **only when data or state changes** (a tray flies because a request travels; a face changes because load changes). No decorative loops; anything that repeats on its own must stop within ~5 s or have a pause control (WCAG 2.2.2).
2. **Requests travel in straight lines at constant speed (linear)**; the same speed on every route. Layout / UI changes use springs.
3. Outlines draw themselves on **once** (`draw`, 0,4–0,9 s) when they scroll in; markers swipe left → right.
4. **`Boil`** only on characters and key drawings, never on text or simulations; it settles after ~5 s.
5. Step-by-step: draw the route first, then send the tray along it; earlier steps stay as faint pencil.
6. Errors are loud (✗ stays ~0,9 s, the tray falls), successes quiet (✓ pops briefly).
7. **Reduced motion** (`prefers-reduced-motion`) — the kit handles it, and so must your own Motion code (`useReducedMotion()`): no boil, no flying, no draw-on; sims start paused; steppers don't autoplay; drawings show their final state.

### 6.5 Responsive

- Pick SVG layouts by **container** width (`useWidth`), never by window width. Give important drawings a wide and a narrow layout (and a medium one when the wide one would shrink); a narrow layout never grows past ~460 px (`maxWidth: 460`, centred).
- **Effective lettering ≥ 12 px on screen** (Caveat ≥ 17, Kalam ≥ 18) at the *smallest* width that uses each layout: choose the wide layout only when the container is at least `viewBoxWidth × 12 / smallest font size in viewBox units`. Check with `node scripts/legibility.mjs` (§8).
- Check **390, 768 and 1440 px**, in both themes. No horizontal page scroll; a wide drawing that cannot reflow goes in `ScrollX` (focusable) as a last resort.

### 6.6 Chalkboard (dark) layering

- Everything **drawn in chalk** (drawings, frames, the exam sheet, the incident ticket, the cost ledger, sim sheets) sits **under** the chalk-dust layer and has no paper fill.
- Everything **pinned to the board** (sticky notes, index cards, the code sheet, the laptop screen, the step card) sits **above** it, stays clean and is held by a magnet instead of tape — use `StickyNote`, `.k-note`, `.k-card` or the `k-pinned` class.
- Sticky notes keep light paper with their own darker pens on the board; never put board-coloured text (`--ink` chalk) on a note — inside `.k-note` / `.k-card` the tokens are remapped for you: the inks, every coloured pencil (`--pen --red --green --orange --violet --teal --amber --rose --cyan`, ≥ 4,5:1 on every note colour, darker on the board) and the wells (`--paper-2/3`, e.g. under inline code).

### 6.7 Accessibility

- Every drawing: `Diagram label` (or `role="img"` + Croatian `aria-label`) describing what it shows; decoration `aria-hidden`.
- Every control has visible text or an `aria-label`; clickable SVG pieces use `DNode` / `PodShape` `onClick` (keyboard buttons) — don't put `onClick` on a bare `<g>`.
- Don't move focus to `<body>`: when a control disappears, keep one control and swap its label (the kit's Terminal, Quiz, Predict and MythOrFact already do); when a button becomes unavailable while focused, use `Button ariaDisabled` (or `Segmented` `disabled`), never native `disabled` (the Stepper's „Natrag” does this).
- Respect reduced motion; never rely on colour alone; keep text contrast (no `opacity` on lettering).
- **Local styles:** `styles.module.css` in your folder (CSS Modules) or inline `style`. No global CSS.

## 7. React / lint rules (the build fails otherwise)

This project uses React 19 with the strict `eslint-plugin-react-hooks` v7 rules:
- **No synchronous `setState` inside `useEffect`** (derive the value during render instead, or set state in event handlers / timers / subscriptions).
- **No reading or writing `ref.current` during render.**
- **No creating components during render** (no `const C = cond ? A : B` from functions returning components; define components at module level).
- **Do not mutate props, state, or values returned by hooks** during render. Mutating the sim state inside `step` / `mutate` callbacks is fine.
- `.tsx` files may export **only components** (react-refresh rule). Put constants, types and helpers in `.ts` files.
- No `any`; TypeScript strict-ish settings (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` → use `import type` for types).
- No new npm dependencies.

## 8. Verify before you finish

```bash
npm run -s typecheck 2>&1 | grep 'src/lectures/<folder>'   # must print nothing (ignore other folders)
npx eslint src/lectures/<folder>                            # must print nothing
node scripts/legibility.mjs /predavanje/<slug> --width 390                 # text sizes in drawings + console errors
node scripts/legibility.mjs /predavanje/<slug> --width 768 --theme dark
node scripts/shot.mjs /predavanje/<slug> --section <section-id> --out /tmp/<slug>-<id>.png                    # one section
node scripts/shot.mjs /predavanje/<slug> --section <sim-section-id> --click "Nalet prometa" --wait 4000 --out /tmp/<slug>-sim.png
node scripts/shot.mjs /predavanje/<slug> --section <section-id> --theme dark --width 390 --height 844 --out /tmp/<slug>-<id>-390.png
```

`--click` finds a button by its accessible name, then a radio / switch / tab (Segmented options, the sim's speed picker: `--click "8 puta"`), then anything with that label or text; `--scale 0.5` halves the PNG. Element shots hide the sticky kazalo and the reading-progress pencil, and fall back to a clipped page shot when an element never settles.

The dev server must be running on http://localhost:5173 (it usually is; otherwise `npm run dev -- --port 5173 &`). `shot.mjs` and `legibility.mjs` print browser console errors — there must be **none**. `legibility.mjs` lists every text under 12 px on screen (Caveat under 17, Kalam under 18, reading text under 17, handwriting over 110 characters) with its size and where it is; fix them by choosing a narrower layout or bigger lettering.

**Screenshot budget:** Read only viewport or single-section screenshots (`--section <id>`, or the default viewport shot) — **at most ~20 per agent; never Read full-page captures of a whole lecture** (`--full`, `--sections` folders of a whole lecture): they are huge, get downscaled until nothing is readable, and stall the agent. Prefer DOM / script checks (text sizes, overflow, console errors, element states after clicks) over looking at images; look at a picture when you need to judge the drawing itself (overlapping labels, clipped text, empty stages, sims that do not move, a broken dark theme) — then fix what you see.
