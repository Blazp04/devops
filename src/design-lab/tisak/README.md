# Tisak — the course as a risograph magazine

**Concept.** *Kubernetes od nule* is a printed riso magazine. Every lecture is an *issue* ("Broj 04") paced like
one: a cover with a poster, a contents page, an opener spread, feature pages, a full-bleed centrefold for the
simulation, a comic strip, a tear-off slip, an exam sheet and a colophon. Everything is printed from three spot inks
(fluorescent pink, federal blue, sunflower) plus a black drum, and the inks *mean* things: pink = requests, errors and
the reader's pen, blue = work, yellow = capacity and routing. Where inks overlap they overprint (multiply on white
stock, screen on black stock), so "a request on a busy core" literally mixes into a third colour.

Live prototype: `/dizajn/tisak` · files: `index.tsx` (page, openers, contents, lecture head, story, centrefold,
colophon), `Hero.tsx` + `heroSim.ts` (three-act cover poster), `LbSim.tsx` + `lbModel.ts` + `lbGeo.ts` (centrepiece),
`Cluster.tsx`, `Steps.tsx` (comic strip), `Code.tsx` (listing + receipt), `Quiz.tsx` (exam sheet), `Figures.tsx`
(key-idea plates, menza plan, contents thumbnails), `Glyphs.tsx` (shared glyphs, `Numeral` plates, SVG ink defs),
`geo.ts` (geometry, fixed-frequency screen tiles).

## Palette — inks and stocks

| Token | White stock (`multiply`) | Black stock (`screen`) | Meaning |
|---|---|---|---|
| `--paper` | `#F1ECE1` uncoated | `#141317` black board | page stock |
| `--paper-2` | `#E8E1D2` | `#1D1B21` | fills inside diagrams |
| `--ink` | `#1D1B26` | `#F2EBDD` | black drum: text, keylines, rules |
| `--ink-2` | `#504B5A` (6.6:1) | `#BDB5A8` (8.9:1) | secondary text |
| `--pink` | `#FF48B0` | `#FF4FB2` | **requests**, errors, the reader's pen, Service |
| `--pink-text` | `#B0126C` (5.7:1) | `#FF7CC4` | pink as text, error stamps |
| `--blue` | `#2350C8` | `#3A63FF` (high chroma, not periwinkle) | **work**: CPU, servers, Pods v1, success |
| `--blue-text` | `#1D44AE` | `#93ADFF` | blue as text, YAML keys |
| `--yellow` | `#FFB511` | `#FFC22E` | **capacity & routing**: RAM, dispatcher, v2 |
| `--yellow-text` | `#7A4F00` | `#FFD25E` | yellow as text |
| `--flood` | `#2350C8` | `#2147C9` | a solid blue flood (centrefold, fact sheet); text on it `#F7F2E7` |
| yellow stock | `#FFB511` sheet, knock-outs `#F8F3E8` | same (the poster is a separate sheet; inks always multiply on it) | the cover poster |

Pink is never body text (2.6:1); small type on pink shapes is set bold in the black drum and kept off the speckle
filter. Dark mode is the same job on black board: identical shapes, inks screen instead of multiply, grain turns into
light specks, the pink screen on the title is printed at 40 % so blue stays blue.

## Type

| Role | Face | Notes |
|---|---|---|
| Display, numerals, body | **Fraunces Variable** (full axes) | headlines `opsz 144`, tracking −0.02em + word-spacing 0.06em (tighter only for one-word lines); `WONK 1` italics are the voice ("od nule", taglines, pull quotes, live narration). Body 19 px (17.5 px on phones). |
| UI, kickers, labels, buttons, diagram labels | **Space Grotesk Variable** | caps + 0.10–0.16em tracking for kickers and diagram labels |
| Code, metrics, specs, terminal | **Space Mono** 400/700 | metrics as big mono numerals, specs as `1 vCPU · 2 GB` |
| Reader's / teacher's notes | **Fraunces italic**, `opsz 24`, `SOFT 100`, `WONK 1`, in pen-pink | no script font; the roughjs strokes alone carry the hand-drawn quality |

Three families, all with latin-ext (č ć đ š ž verified in renders). Font names in running text use non-breaking spaces.

## Print devices (page chrome)

- **Numeral plates** (`Numeral` in `Glyphs.tsx`): every big number is a set of plates — `solid`, `outline` (keyline)
  or `screen`. Screens are real halftones: fixed dot pitch in CSS px (≈ 5.5 px, it never grows with the type), rotated
  15°/75°, with a **tonal ramp** (dots shrink towards one edge, optional easing). No two openers use the same recipe:
  §01 pink solid + blue 75° screen (right rail, pushed into the margin), §02 paper-white screen fading down inside the
  blue flood, §03 yellow screen bleeding off the top edge, §04 black + pink misregistered (inline), §05 yellow screen +
  blue keyline (left rail), §06 pink screen (right rail), lecture "04" yellow screen bleeding off the left page edge
  and fading under the title.
- **Title screen**: CSS text uses a mask of a seamless 14° screen tile (`screenTile()` in `geo.ts`, exposed as
  `--screen-50/30/14`), so even HTML type gets a fixed-frequency screen.
- **Department tab**: each section's top rule carries a thick bar in that section's ink (pink, blue, yellow, black).
- **Spreads, not cards**: the simulation is a full-bleed blue centrefold with a paper sheet on it (crop marks at the
  corners); myth/fact are two overprinted sheets of coloured stock; objectives are a perforated tear-off slip; the
  quiz is a ruled exam sheet (three questions, the first a solved example) with a pink double margin rule; the step
  explainer is a comic strip; code is a listing with a screened gutter and the reader's marginalia (circled
  `replicas: 3` → "tri Poda, vidi § 03"; the selector chip next to the Pod label); terminal output is a till receipt.
- **Contents states**: done issues in grey numerals with a pen tick, the current issue the only numeral in full ink
  (pink + misregistered blue screen) with the stamp, the next issue an outline numeral with a keyline thumbnail.
- **Pull quotes** hang in the left margin (Fraunces italic, pink), the key idea is a two-line typographic spread with
  ink highlighter bars in the colour of the concept (blue = cores, yellow = RAM).
- **Knock-out** (`.knock`): wherever type crosses a big screened numeral (lecture head title, subtitle and meta row;
  the centrefold heading and intro), the plates under the letters are left unprinted — a ~5 px halo in the stock colour
  (paper, or the blue flood). Text never sits on halftone dots, in either theme.
- **Deliberate bleed**: §03 follows the blue centrefold with no rule or tab; its yellow numeral rises into the bottom
  of the blue spread and overprints it (yellow × blue = green mix). Bleeds are always into a flood, never onto text.
- **Controls are flat ink.** Offsets (misregistration) belong to type and illustration. On hover a control's second
  plate slides out 2–4 px from under it; on press the plates register again (`(hover: hover)` only).
- **Grain** (SVG noise over the whole page) and the `#tk-ink` filter (speckled dropout + edge wobble) on static ink
  shapes only, never on small type.
- **Crop marks, registration marks, colour bar, Venn of the three inks** in poster, centrefold and colophon.

## Illustration grammar

| Entity | How it is drawn | Notes |
|---|---|---|
| User / student | half-disc torso + circle head, alternating pink/blue, a yellow **tray** (on yellow stock the tray is knocked out to paper) | rows/groups of 6–7 = "traffic source" |
| Request in flight | **pink dot** with a smaller (0.74r) blue second impression offset ~0.42r down-right — `ReqDot`. The pink plate knocks out the blue under it, so ≥ 60 % of the dot is unmixed pink in both themes | the identical glyph in hero, sim, cluster, steps, menza and every legend; constant speed, linear |
| Request being worked on | `ReqDot busy`: full-size blue impression **overprinting** the pink (mixes to violet-navy on white stock) riding the edge of the filling core bar | the only place the two inks mix: request × work |
| Waiting request (queue) | the same dot parked on a grey slot grid left of the server; slides slot to slot | queue = 3 × cores slots |
| Success / response | blue hollow **ring** expanding and fading at the end of a core | never a check-mark icon |
| Error | rubber **stamp**: double-ruled box, caps, rotated ±8°, stamp-pink (`503` queue full, `502` no answer, `SRUŠEN`, `PREOPTEREĆEN`, `NETOČNO`) | stamps = the *system's* verdict. At poster scale at most 2–3 big stamps, landing one after another (1.6× → 1× in 0.1 s); small sims may show one per failure |
| Timeout | (to use) the dot drawn hollow with a dashed outline fading into a 14 % pink screen + stamp `504` | |
| Server with CPU/RAM | stacked horizontal **bars, one per vCPU**; idle = blue screen, busy = solid blue filling left→right with the request riding the edge; **RAM = row of yellow squares, one square = 0.5 GB = one request held** (dashed when free) | name in Fraunces, spec in mono |
| Overload | pink **hatch** overprinted on the bars, offset like a second impression | heat = queue fill |
| Load balancer | the **dispatcher disc**: big yellow disc + pink 75° screen impression, rim text on a circular path, blue **needle** that snaps to the chosen target | requests pass *under* it; on yellow stock it is a knock-out disc. Never smaller than ~140 px on screen; below 620 px the rim text is dropped and the rule is set as a black mono chip (`KRUŽNO`) beside the disc |
| Health check | thin ink track filling pink while a failure is being detected, blue while a repair is confirmed; label always says sim vs real time | detection is never instant |
| Out of rotation | the route becomes a dashed pink line with an ✕; the server prints at 42 % | |
| Share of load | per server a blue bar (share of cores) with a thinner pink bar (share of traffic) overprinted through it; the overlap mixes, so the legend has three chips: pink, blue, and **preklop** (traffic inside capacity). Pure pink past the black tick = more traffic than power | the lecture's punchline chart |
| Queue (generic) | slot grid of grey dots; filled slots carry request dots | |
| Database | ink-outlined rounded square with a stacked-ellipse cylinder glyph, no spot ink | it is not traffic |
| Container | small rounded square in a spot ink | |
| Image layers | (to use) stacked offset slabs, one per ink, slightly misregistered — plates of a print job | |
| Pod | rounded square (r ≈ 0.19 × size). **Version = ink**: v1 blue, v2 yellow. **State = overprint**: Running solid; Pending dashed outline + hatch; CrashLoopBackOff pink copy offset over it + ✕ + restart count | label chip on the top-left; names are the short kubectl suffixes used in captions |
| Node | paper-filled rounded rect: Pods on top, a capacity strip at the bottom (CPU blocks = 0.5 vCPU requested, blue; RAM squares = 1 GB, yellow), name plate at the very bottom | wires never cross the name |
| Cluster / control plane | thick ink outline with a 40 % yellow screen; control plane = blue ring with pink core (API · scheduler · etcd · controller) and a dashed "čeka raspored" lane for Pending Pods | |
| Service | pink **half-disc door cut into the cluster frame** (flat side on the frame line, the keyline breaks for it) — an object *in* the cluster that receives traffic from outside; selector chip `app=klopa-api` inside the frame; one bus from the door, a drop per matching Pod; solid pink + moving request dots to ready Pods, dashed grey to not-ready ones | the menza entrance uses the same door; students + "promet izvana" stay outside the frame |
| Git commit | (to use) ink dot on a black line, message in mono; branches in different inks; merge = overprint | |
| Pipeline stage | (to use) a bar like a core: screened while queued, solid blue while running, stamp `PROŠLO` (blue) / `PALO` (pink) | |
| Secret | (to use) sealed envelope in ink with a yellow wax-seal disc; contents only as a solid black block | |
| Argo CD / GitOps loop | (to use) the dispatcher disc as a sync dial: Git (left) → disc → cluster (right); the needle sweeps once per sync; drift = a misregistered pink copy of a Pod that slides back into register | |
| Reader's / teacher's marks | **pen** (roughjs, always pink): circled answer, strike-through, ticks (slip, contents), circled line in a code listing, arrow + a Fraunces-italic note in the margin. Pen = a human, stamp = the system | margin notes are positioned in the notes column and may run past their row instead of stretching it |
| Not printed yet | **keyline proof**: the same drawing in one ink (blue line, no fills), a `probni otisak` tag; numerals as an outline | future comic frames, the next issue (05) in the contents and the teaser |
| Story / progress | act bars and segment bars: a thin rule per step, filling in the step's ink; done = black, current = filling, todo = grey rule | cover acts, cluster story |

## Motion rules

1. Things move only because data moves (dots) or state changes (layers slide, overprints shift). No idle loops,
   no parallax, no decorative spins; the only looping figures (key idea, menza) loop because they *show* a process.
2. Requests travel at **constant speed, linear** along their path; one network hop has a fixed sim duration.
3. New state = a new **printing layer** sliding in 20–40 px with a fade (`cubic-bezier(.22,.9,.25,1)`, 0.5–0.7 s).
   The current comic frame gets its pink plate slid into misregistration (7 px); controls slide their second plate on
   hover and register on press.
4. Verdicts **stamp** (scale 1.6–1.8 → 1 with overshoot, then hold). Pen marks **draw** (pathLength 0 → 1).
5. Needles snap — the LB decides instantly; detection never does (health-check bar, 2 s sim ≈ 30 s real).
6. Simulations run in a `requestAnimationFrame` loop with model state in a class (`lbModel.ts`, `heroSim.ts`), render
   plain SVG circles, and pause off-screen (IntersectionObserver).
7. **Stories are reader-driven.** Anything with captions (cluster story: 5 events) shows back / pause / next and a
   segmented progress bar; auto-advance is slow (8 s per event, the segment's CSS animation is the timer) and pauses
   on hover, on keyboard focus and off-screen. Below 1100 px the caption strip sits *above* the diagram and sticks
   to the top of the screen while the diagram scrolls under it, so a change and its caption are seen together.
8. Comic strip: only the current frame plays; every frame and caption is printed in full ink; frames not reached yet
   show their illustration as a one-ink keyline proof.
9. `prefers-reduced-motion`: the poster shows a meaningful static frame per act, the simulation starts paused
   (Pokreni), the cluster story never auto-advances, CSS loops stop, the strip shows end states; all content stays
   readable.

## Responsive notes

- Cover: poster on the first row, sized to the viewport height, so the story is above the fold at 1280×800; on
  phones the poster follows the title directly.
- Simulation on phones: 3-up metrics on top, a portrait stage (labels counter-sized to ≥ 11.5 px), and a compact
  control strip that sticks to the bottom of the screen while the stage is in view (slider, algorithm toggle, crash,
  repair, pause).
- Simulation portrait: the dispatcher disc is ~170 px wide (right of the students), the rule name is a chip, routes
  drop from the disc to a bus down the left edge.
- Cluster portrait: the Service door is cut into the top edge of the frame, the selector chip sits inside; the story
  strip is sticky above the diagram.
- Menza and comic strip have their own portrait geometries / scroll-snap strip; the receipt (thermal-paper white in
  both themes, rotated only −0.5°) drops RESTARTS/AGE below 560 px; YAML comments move to their own line; the code
  marginalia move away below 1100 px (the circled `replicas: 3` stays).
