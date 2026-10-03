/**
 * The operator's hands: one card per app (drag it onto a server, or pick it and press a server button below).
 * Drag uses pointer events; the drop target is found with elementFromPoint → [data-server] on the stage.
 * Keyboard and screen readers use the same cards as toggle buttons (aria-pressed) plus three ordinary server buttons.
 */
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Button, RoughBox } from '../../../kit'
import type { AppView, Sim } from '../model'
import { AppBox } from './parts'
import styles from '../styles.module.css'

interface Props {
  s: Sim
  apps: AppView[]
  selected: string
  onSelect: (app: string) => void
  onPlace: (app: string, server: string) => void
  onRemove: (app: string) => void
  /** server under the pointer while dragging (the stage highlights it) */
  onHover: (server: string | null) => void
}

interface Drag {
  app: string
  x: number
  y: number
}

function serverAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)
  const g = el?.closest('[data-server]')
  return g ? g.getAttribute('data-server') : null
}

export function ContainerTray({ s, apps, selected, onSelect, onPlace, onRemove, onHover }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ app: string; x: number; y: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)

  const local = (e: RPointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  const down = (e: RPointerEvent<HTMLButtonElement>, app: string) => {
    if (e.button !== 0) return
    start.current = { app, x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const st = start.current
    if (!st) return
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return
    st.moved = true
    setDrag({ app: st.app, ...local(e) })
    onHover(serverAt(e.clientX, e.clientY))
  }
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    const st = start.current
    start.current = null
    if (!st || !st.moved) return
    swallowClick.current = true
    window.setTimeout(() => {
      swallowClick.current = false
    }, 0)
    const target = serverAt(e.clientX, e.clientY)
    setDrag(null)
    onHover(null)
    onSelect(st.app)
    if (target) onPlace(st.app, target)
  }
  const cancel = () => {
    start.current = null
    setDrag(null)
    onHover(null)
  }

  const sel = apps.find((a) => a.app.id === selected) ?? apps[0]

  return (
    <div ref={wrapRef} className={styles.tray}>
      <p className={styles.trayLead}>
        <span className={styles.trayHand}>vaše ruke →</span> povucite kontejner na poslužitelj ili ga odaberite pa pritisnite poslužitelj ispod.
      </p>
      <div className={styles.chips} role="group" aria-label="Koji kontejner pokrećete">
        {apps.map((a, idx) => {
          const surplus = a.total - a.desired
          return (
            <RoughBox key={a.app.id} className={styles.chipWrap} stroke={selected === a.app.id ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={selected === a.app.id ? 2 : 1.4} double={selected === a.app.id} seed={901 + idx * 7}>
              <button
                type="button"
                aria-pressed={selected === a.app.id}
                className={`${styles.chip}${selected === a.app.id ? ` ${styles.chipOn}` : ''}`}
                onPointerDown={(e) => down(e, a.app.id)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={cancel}
                onClick={() => {
                  if (swallowClick.current) {
                    swallowClick.current = false
                    return
                  }
                  onSelect(a.app.id)
                }}
              >
                <svg viewBox="0 0 50 32" width="42" height="27" aria-hidden="true">
                  <AppBox x={1} y={1} w={48} h={30} app={a.app.id} version={s.version[a.app.id]} seedKey={`chip-${a.app.id}`} />
                </svg>
                <span className={styles.chipText}>
                  <span className={styles.chipName}>{a.app.name}</span>
                  <span className={`mono ${styles.chipCount}`}>
                    radi {a.running} od {a.desired}
                  </span>
                  {a.missing > 0 ? (
                    <span className={styles.chipBad}>✗ nedostaje {a.missing}</span>
                  ) : a.running < a.desired ? (
                    <span className={styles.chipWarn}>! čeka {a.desired - a.running} (iscrtkano)</span>
                  ) : surplus > 0 ? (
                    <span className={styles.chipWarn}>! {a.outdated > 0 ? `stara verzija: ${a.outdated}` : `višak ${surplus}`}</span>
                  ) : (
                    <span className={styles.chipOk}>✓ dovoljno</span>
                  )}
                </span>
              </button>
              <button type="button" className={styles.minus} onClick={() => onRemove(a.app.id)} disabled={a.total === 0} aria-label={`Ugasi jednu kopiju: ${a.app.name}${a.outdated > 0 ? ' (prvo staru verziju)' : ''}`} title="Ugasi jednu kopiju (prvo staru verziju)">
                −1
              </button>
            </RoughBox>
          )
        })}
      </div>
      <div className={styles.targets} role="group" aria-label={`Pokreni ${sel.app.name} na poslužitelju`}>
        <span className={styles.targetsLabel}>Pokreni {sel.app.name} na:</span>
        {s.servers.map((sv) => (
          <Button key={sv.id} size="sm" variant="secondary" onClick={() => onPlace(sel.app.id, sv.id)} title={sv.up ? undefined : 'Ovaj poslužitelj ne radi'}>
            {sv.name}
            {sv.up ? '' : ' (ne radi)'}
          </Button>
        ))}
      </div>
      {drag && (
        <div className={styles.dragGhost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <svg viewBox="0 0 50 32" width="58" height="37">
            <AppBox x={1} y={1} w={48} h={30} app={drag.app} version={s.version[drag.app]} seedKey="drag" />
          </svg>
        </div>
      )}
    </div>
  )
}
