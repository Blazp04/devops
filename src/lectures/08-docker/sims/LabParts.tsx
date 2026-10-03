import type { KeyboardEvent, PointerEvent } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { Check, ClockIcon, Cross, Envelope, Meter, MiniServer, PenGlyph, plural, Rough, RoughBox, Shelf, StickyNote, useWidth } from '../../../kit'
import { fmtMB, fmtSeconds, shortDigest, type BuildLabState, type Instruction, type Layer } from '../../../engines/build/index.ts'
import type { CardStatus, ChipKind, StackRow, StackView } from '../labView'
import { fmtSize, tagRows } from '../labView'
import styles from '../styles.module.css'

/* =====================================================================
   Pieces of the build lab: Dockerfile cards (drag / arrow keys), the image
   as a stack of trays, the layer inspector and the registry strip.
   ===================================================================== */

const CHIP_TEXT: Record<ChipKind, (s: { duration: number; elapsed: number }) => string> = {
  cached: () => '✓ CACHED',
  new: ({ duration }) => `↻ ${fmtSeconds(duration)}`,
  running: ({ elapsed, duration }) => `▶ ${fmtSeconds(elapsed)} / ${fmtSeconds(duration)}`,
  pulling: ({ elapsed, duration }) => `↓ ${fmtSeconds(elapsed)} / ${fmtSeconds(duration)}`,
  waiting: () => 'čeka',
  failed: () => '✗ greška',
  skipped: () => 'preskočeno',
  setting: () => 'postavka',
  idle: () => '',
}

const CHIP_SR: Record<ChipKind, string> = {
  cached: 'iz predmemorije',
  new: 'ponovno izgrađen',
  running: 'gradi se',
  pulling: 'povlači se bazna slika',
  waiting: 'čeka',
  failed: 'greška',
  skipped: 'preskočeno',
  setting: 'samo postavka, bez sloja',
  idle: '',
}

function Grip() {
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
      {[3, 9].map((x) => [3, 9, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="currentColor" />))}
    </svg>
  )
}

/** One Dockerfile line: a strip of paper with a grip (drag, or ↑ ↓ on the keyboard), its status chip and a remove button. */
export function CardItem({ card, index, total, status, stageBreak, onMove, onRemove }: { card: Instruction; index: number; total: number; status: CardStatus; stageBreak: boolean; onMove: (to: number) => void; onRemove: () => void }) {
  const controls = useDragControls()
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      onMove(index - 1)
    } else if (e.key === 'ArrowDown' && index < total - 1) {
      e.preventDefault()
      onMove(index + 1)
    }
  }
  const startDrag = (e: PointerEvent<HTMLButtonElement>) => controls.start(e)
  const chip = CHIP_TEXT[status.kind]({ duration: status.duration, elapsed: status.elapsed })
  return (
    <Reorder.Item value={card.id} dragListener={false} dragControls={controls} className={styles.cardItem} as="li">
      {stageBreak && <div className={styles.stageBreak}>nova faza ↓</div>}
      <RoughBox className={styles.card} fillColor="var(--paper)" fillStyle="solid" seed={4100 + index * 7} strokeWidth={1.4} roughness={1.1} stroke={status.kind === 'failed' ? 'var(--red)' : 'var(--ink-2)'}>
        <button type="button" className={styles.grip} onPointerDown={startDrag} onKeyDown={onKey} aria-label={`Redak ${index + 1}: ${card.text}. Pomaknite ga strelicama gore i dolje.`} title="Povucite ili pomaknite strelicama ↑ ↓">
          <Grip />
        </button>
        <span className={styles.lineNo} aria-hidden="true">
          {index + 1}
        </span>
        <span className={styles.instr} data-kind={status.kind}>
          {card.text}
        </span>
        <span className={styles.chip} data-kind={status.kind}>
          {(status.kind === 'running' || status.kind === 'pulling') && <span className={styles.chipFill} style={{ width: `${Math.round(status.progress * 100)}%` }} />}
          <span className={styles.chipText} aria-hidden="true">
            {chip}
          </span>
          <span className={styles.visuallyHidden}>{CHIP_SR[status.kind]}</span>
        </span>
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Makni redak ${card.text} u ladicu`} title="Makni u ladicu">
          <PenGlyph kind="minus" size={16} />
        </button>
        {status.reason && (
          <span className={styles.reason} data-first={status.reason.first}>
            {status.reason.text}
          </span>
        )}
      </RoughBox>
    </Reorder.Item>
  )
}

/** The cards that are not in the Dockerfile (the „ladica”); a click puts one back in a sensible place. */
export function CardTray({ cards, onAdd }: { cards: Instruction[]; onAdd: (id: string) => void }) {
  if (cards.length === 0) return null
  return (
    <div className={styles.tray}>
      <p className={styles.trayTitle}>ladica: kartice izvan Dockerfilea</p>
      <ul className={styles.trayList}>
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className={styles.trayCard} onClick={() => onAdd(c.id)} aria-label={`Dodaj u Dockerfile: ${c.text}`}>
              <span className={styles.trayPlus} aria-hidden="true">
                +
              </span>
              {c.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The build stopwatch (sim seconds, labelled illustrative). */
export function Stopwatch({ elapsed, total, running }: { elapsed: number | null; total: number | null; running: boolean }) {
  return (
    <div className={styles.watch}>
      <ClockIcon className={styles.watchIcon} seed={81} />
      <span className={styles.watchTime} aria-live="off">
        {elapsed === null ? '—' : fmtSeconds(elapsed)}
        {running && total !== null ? ` / ${fmtSeconds(total)}` : ''}
      </span>
      <span className={styles.watchNote}>{running ? 'gradi se…' : elapsed === null ? 'još nije građeno' : 'zadnja izgradnja · ilustrativno'}</span>
    </div>
  )
}

const TRAY_FILL: Partial<Record<ChipKind, { color: string; angle: number }>> = {
  cached: { color: 'var(--hl-blue-ink)', angle: -41 },
  new: { color: 'var(--hl-green-ink)', angle: 41 },
  failed: { color: 'var(--red)', angle: -41 },
}

function trayHeight(sizeMB: number, base: boolean): number {
  return Math.round(34 + 8 * Math.log10(1 + sizeMB) + (base ? 6 : 0))
}

/** One layer = one tray: blue hatching (−41°) = from the cache, green (+41°) = built just now, orange marker under-stroke = building. */
function TrayRow({ row, w, selected, onPick, seed }: { row: StackRow; w: number | null; selected: boolean; onPick: (() => void) | null; seed: number }) {
  const h = trayHeight(row.sizeMB, row.base)
  const fill = TRAY_FILL[row.state]
  const waiting = row.state === 'waiting'
  const label = `${row.label}, ${fmtSize(row.sizeMB)}${row.digest ? `, ${shortDigest(row.digest, 6)}` : ''}, ${CHIP_SR[row.state] || 'gotov'}`
  return (
    <li>
      <button
        type="button"
        className={`${styles.layerBtn}${selected ? ` ${styles.layerSel}` : ''}`}
        style={{ minHeight: h }}
        onClick={onPick ?? undefined}
        aria-disabled={onPick ? undefined : true}
        aria-pressed={onPick ? selected : undefined}
        aria-label={onPick ? `Otvori sloj: ${label}` : label}
      >
        {w !== null && w > 40 && (
          <svg className={styles.layerSvg} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {(row.state === 'running' || row.state === 'pulling') && <rect x={10} y={h - 7} width={Math.max(0, (w - 20) * row.progress)} height={4} rx={2} style={{ fill: 'var(--hl-orange-ink)' }} />}
            <Rough
              shape={{
                k: 'poly',
                pts: [
                  [2, 3],
                  [w - 2, 3],
                  [w - 9, h - 2],
                  [9, h - 2],
                ],
              }}
              seed={seed}
              stroke={row.state === 'failed' ? 'var(--red)' : waiting ? 'var(--ink-3)' : 'var(--ink)'}
              strokeWidth={row.base ? 1.9 : 1.5}
              fillColor={fill?.color ?? (row.state === 'idle' ? 'var(--paper-2)' : undefined)}
              fillStyle={fill ? 'hachure' : 'solid'}
              hachureAngle={fill?.angle}
              hachureGap={7}
              fillWeight={0.9}
              dash={waiting ? '6 5' : undefined}
              multi={row.base}
            />
            {row.state === 'failed' && <Cross x={w - 22} y={h / 2} size={6} seed={seed + 3} />}
          </svg>
        )}
        <span className={styles.layerText} style={{ minHeight: h }}>
          <span className={styles.layerLabel}>
            {row.label}
            {row.digest && <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}> · {shortDigest(row.digest, 6).replace('sha256:', '')}</span>}
          </span>
          <span className={styles.layerSize}>{fmtSize(row.sizeMB)}</span>
        </span>
      </button>
    </li>
  )
}

/** The final image as trays stacked bottom-up (the first Dockerfile line is the bottom tray). */
export function LayerStack({ view, selected, onPick }: { view: StackView; selected: string | null; onPick: (row: StackRow) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  return (
    <div ref={ref}>
      {view.settings.length > 0 && (
        <div className={styles.settingsSheet}>
          <span>postavke (bez sloja):</span>
          {view.settings.join(' · ')}
        </div>
      )}
      {view.rows.length === 0 ? (
        <p className={styles.stackEmpty}>Još nema slike – pritisnite „Izgradi”.</p>
      ) : (
        <ol className={styles.stack} aria-label="Slojevi slike, odozdo (bazna slika) prema gore">
          {view.rows.map((row, i) => (
            <TrayRow key={row.key} row={row} w={w} seed={5300 + i * 13} selected={selected === row.key} onPick={view.inspectable && row.layerIdx.length > 0 ? () => onPick(row) : null} />
          ))}
        </ol>
      )}
      {view.otherStageSteps > 0 && <p className={styles.stackNote}>+ faza „build”: {plural(view.otherStageSteps, ['korak koji ne ulazi', 'koraka koja ne ulaze', 'koraka koji ne ulaze'])} u ovu sliku</p>}
    </div>
  )
}

function EnvelopeIcon() {
  return (
    <svg className={styles.envSvg} viewBox="0 0 64 46" aria-hidden="true">
      <Envelope x={4} y={14} w={54} h={30} open dots seed={1803} />
    </svg>
  )
}

/** „sloj 6” / „slojevi 1–4”: layers numbered from the bottom (the first base layer is 1), like the incident card. */
function layerNumbers(idx: number[]): string {
  if (idx.length === 0) return 'sloj'
  const lo = Math.min(...idx) + 1
  const hi = Math.max(...idx) + 1
  return lo === hi ? `sloj ${lo}` : `slojevi ${lo}–${hi}`
}

/** What one layer adds and hides (whiteouts): the place where a deleted `.env` is still readable. */
export function LayerInspector({ row, layers }: { row: StackRow; layers: Layer[] }) {
  const files = layers.flatMap((l) => l.added.map((f) => ({ ...f, layer: l })))
  const removed = layers.flatMap((l) => l.removed)
  const secret = files.some((f) => f.secret)
  return (
    <div className={styles.inspector} role="region" aria-label={`Sadržaj sloja ${row.label}`}>
      <p className={styles.inspTitle}>
        {layerNumbers(row.layerIdx)}: {row.label} · {fmtSize(row.sizeMB)}
      </p>
      {row.base ? (
        <ul className={styles.inspList}>
          {layers.map((l) => (
            <li key={l.digest}>
              {l.createdBy} · {fmtMB(l.sizeMB)}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.inspList}>
          {files.map((f) => (
            <li key={`${f.layer.digest}-${f.path}`} data-secret={f.secret ? true : undefined}>
              {f.secret && <EnvelopeIcon />}+ {f.at} {f.sizeMB >= 0.1 ? `(${fmtMB(f.sizeMB)})` : ''}
              {f.secret ? ` – ${f.secret.name}=${f.secret.value.slice(0, 6)}••••••` : ''}
            </li>
          ))}
          {removed.map((p) => (
            <li key={`rm-${p}`} data-whiteout="true">
              − {p} (oznaka brisanja: skriva datoteku iz sloja ispod)
            </li>
          ))}
          {files.length === 0 && removed.length === 0 && <li>(prazan sloj)</li>}
        </ul>
      )}
      {secret && <p className={styles.inspHint}>Ključ je u slici. Tko god može povući sliku, može ga pročitati.</p>}
    </div>
  )
}

function MiniMark({ ok }: { ok: boolean }) {
  return (
    <svg className={styles.markSvg} viewBox="0 0 24 24" aria-hidden="true">
      {ok ? <Check x={12} y={13} size={7} seed={91} /> : <Cross x={12} y={12} size={6} seed={93} />}
    </svg>
  )
}

interface PushInfo {
  status: 'running' | 'done'
  elapsed: number
  total: number
  uploaded: number
  existed: number
}
interface PullInfo {
  serverId: string
  status: 'running' | 'done'
  elapsed: number
  total: number
}

/** Registry shelf with its tags (sticky notes) and the two servers that pulled `latest`. */
export function RegistryStrip({ s, push, pulls }: { s: BuildLabState; push: PushInfo | null; pulls: PullInfo[] }) {
  const tags = tagRows(s)
  const running = s.servers.filter((h) => h.running)
  const same = running.length < 2 || running.every((h) => h.running?.digest === running[0].running?.digest)
  return (
    <div className={styles.registry}>
      <div className={styles.regBox}>
        <svg className={styles.regSvg} viewBox="0 0 64 50" aria-hidden="true">
          <Shelf x={4} y={6} w={56} h={40} seed={5411} />
        </svg>
        <div>
          <div className={styles.regName}>registar</div>
          <div className={styles.regMeta}>
            {s.registry.host}/<wbr />
            {s.project.repo}
          </div>
        </div>
        {tags.length === 0 ? (
          <p className={styles.regMeta} style={{ gridColumn: '1 / -1', margin: 0 }}>
            prazno – još ništa nije poslano
          </p>
        ) : (
          <ul className={styles.tags} aria-label="Tagovi u registru">
            {tags.map((t, i) => (
              <StickyNote key={t.tag} as="li" c={t.tag === 'latest' ? 'yellow' : 'blue'} rotate={i % 2 ? 1.2 : -1.4} className={styles.tagNote}>
                <b>{t.tag}</b> → {t.short}
              </StickyNote>
            ))}
          </ul>
        )}
        {push && push.status === 'running' && (
          <div className={styles.meterWrap}>
            <Meter value={push.total > 0 ? push.elapsed / push.total : 1} label="docker push" valueLabel={`${push.existed} već postoji · ${push.uploaded} se šalje`} tone="blue" />
          </div>
        )}
      </div>
      {s.servers.map((h, i) => {
        const pull = pulls.find((p) => p.serverId === h.id && p.status === 'running')
        const ref = h.running ? h.running.ref.split('/').pop() : null
        return (
          <div className={styles.regBox} key={h.id}>
            <svg className={styles.regSvg} viewBox="0 0 64 50" aria-hidden="true">
              <MiniServer x={8} y={4} w={48} h={42} mood="calm" seed={8311 + i * 5} />
            </svg>
            <div>
              <div className={styles.regName}>{h.name}</div>
              <div className={styles.regMeta}>{h.running ? `pokreće ${ref}` : 'ne pokreće ništa'}</div>
              {h.running && <div className={styles.regMeta}>{shortDigest(h.running.digest, 12)}</div>}
            </div>
            {pull && (
              <div className={styles.meterWrap}>
                <Meter value={pull.total > 0 ? pull.elapsed / pull.total : 1} label="docker pull" valueLabel={`${fmtSeconds(pull.elapsed)} / ${fmtSeconds(pull.total)}`} tone="blue" />
              </div>
            )}
          </div>
        )
      })}
      {running.length === 2 && (
        <div className={styles.verdict} data-ok={same}>
          <MiniMark ok={same} />
          {same ? 'oba poslužitelja pokreću isti digest' : 'isti „latest”, dvije slike – različit kod'}
        </div>
      )}
    </div>
  )
}
