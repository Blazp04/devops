import type { ReactNode, RefObject } from 'react'
import { RoughAround } from '../sketch/Sketch'
import { useWidth } from '../sketch/useSize'
import { Tape } from '../doodles/Paper'
import { PenGlyph, type PenGlyphKind } from '../doodles/interactive-doodles'
import { fmt } from '../sim/math'
import { Outline } from './Outline'
import { onRadioKeys } from './roving'

interface SimControls {
  running: boolean
  speed: number
  toggle: () => void
  reset: () => void
  setSpeed: (s: number) => void
  stepOnce?: (seconds?: number) => void
  ref?: RefObject<HTMLDivElement | null>
  time?: number
}

interface SimFrameProps {
  title: ReactNode
  subtitle?: ReactNode
  /** A Simulation from useSimulation(): adds play/pause/reset/speed buttons and pause-when-offscreen. */
  sim?: SimControls
  /** Side panel with sliders/toggles/buttons. Shown right of the stage on wide screens, below on narrow. */
  controls?: ReactNode
  /** Metrics row under the stage (Stat tiles, charts). */
  stats?: ReactNode
  /** Instruction for the student, e.g. "Pošalji nalet prometa pa ugasi server B." */
  hint?: ReactNode
  /** Extra toolbar items (right side). */
  toolbar?: ReactNode
  children: ReactNode
  /** Stage min height in px (keeps layout stable). */
  minHeight?: number
  /** Show simulated time in the toolbar. */
  showTime?: boolean
  speeds?: number[]
  /**
   * Where the stage sits when the controls column is taller than the drawing: `'center'` (default, vertically
   * centred) or `'start'` (top-aligned under the toolbar, so a tall controls column leaves the paper blank below the
   * drawing instead of around it).
   */
  stageAlign?: 'center' | 'start'
  /** Seconds the „korak” button advances while paused (default 0,25). */
  stepSeconds?: number
  /** Replaces the „korak” button's action (e.g. „next event” in a discrete sim); `stepTitle` names it. */
  onStep?: () => void
  stepTitle?: string
}

function speedLabel(s: number): string {
  if (s === 0.5) return '½×'
  if (s === 0.25) return '¼×'
  return `${fmt.num(s, s % 1 ? 1 : 0)}×`
}

/** A small drawn toolbar button (pen outline, pen glyph, a word). */
function ToolButton({ glyph, label, onClick, primary, seed, title }: { glyph: PenGlyphKind; label: string; onClick: () => void; primary?: boolean; seed: number; title?: string }) {
  return (
    <button type="button" className={`k-sim__tool${primary ? ' is-primary' : ''}`} onClick={onClick} title={title ?? label}>
      <Outline seed={seed} stroke={primary ? 'var(--ink)' : 'var(--ink-2)'} strokeWidth={1.6} fill={primary ? 'var(--ink)' : 'var(--paper)'} />
      <span className="k-sim__toollabel">
        <PenGlyph kind={glyph} size={15} />
        {label}
      </span>
    </button>
  )
}

/** Simulation speed as handwritten options; the chosen one is circled in red. */
function SpeedPicker({ speeds, value, onChange }: { speeds: number[]; value: number; onChange: (s: number) => void }) {
  return (
    <span className="k-sim__speed" role="radiogroup" aria-label="Brzina simulacije" onKeyDown={(e) => onRadioKeys(e, speeds, value, onChange)}>
      <span className="k-sim__speedlabel" aria-hidden="true">
        brzina
      </span>
      {speeds.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!speeds.includes(value) && s === speeds[0]) ? 0 : -1}
            className={`k-sim__speedopt${on ? ' is-active' : ''}`}
            onClick={() => onChange(s)}
            aria-label={s === 1 ? '1 put' : `${fmt.num(s, s % 1 ? 1 : 0)} puta`}
          >
            {on ? (
              <RoughAround key={s} seed={4700 + Math.round(s * 10)} padX={7} padY={3} strokeWidth={1.8}>
                {speedLabel(s)}
              </RoughAround>
            ) : (
              speedLabel(s)
            )}
          </button>
        )
      })}
    </span>
  )
}

/**
 * Frame for an interactive simulation: a sheet of graph paper taped into the notebook. Handwritten title,
 * run / pause / reset / speed as drawn buttons, the hint as a margin note, the stage, a side panel of controls
 * (beside the stage when the sheet is ≥ 900 px wide, below it otherwise) and the metrics under a dashed pencil line.
 * On the chalkboard the sheet is drawn in chalk (under the chalk dust).
 */
export function SimFrame({ title, subtitle, sim, controls, stats, hint, toolbar, children, minHeight = 320, showTime, speeds = [0.5, 1, 2, 4], stageAlign = 'center', stepSeconds = 0.25, onStep, stepTitle }: SimFrameProps) {
  const [mainRef, mainW] = useWidth<HTMLDivElement>()
  const wide = mainW === null || mainW >= 860
  return (
    <div ref={sim?.ref} className="k-sim k-wide" data-layout={wide ? 'wide' : 'narrow'}>
      <Tape c="red" className="k-sim__tape" style={{ top: -12, left: 38, transform: 'rotate(-5deg)' }} />
      <Tape c="blue" className="k-sim__tape" style={{ top: -11, right: 44, transform: 'rotate(4deg)' }} />
      <div className="k-sim__head">
        <div className="k-sim__titles">
          <div className="k-sim__title">
            <span className="k-sim__kicker">simulacija · </span>
            {title}
          </div>
          {subtitle && <p className="k-sim__subtitle">{subtitle}</p>}
        </div>
        {(toolbar || sim) && (
          <div className="k-sim__toolbar">
            {toolbar}
            {sim && (
              <>
                {showTime && sim.time !== undefined && <span className="k-sim__time mono">t = {fmt.num(sim.time, 1)} s</span>}
                <SpeedPicker speeds={speeds} value={sim.speed} onChange={sim.setSpeed} />
                {(onStep || sim.stepOnce) && !sim.running && (
                  <ToolButton glyph="step" label="korak" title={stepTitle ?? `Korak naprijed (${stepSeconds.toLocaleString('hr-HR', { maximumFractionDigits: 2 })} s)`} onClick={() => (onStep ? onStep() : sim.stepOnce?.(stepSeconds))} seed={4711} />
                )}
                <ToolButton glyph="loop" label="ispočetka" title="Resetiraj" onClick={sim.reset} seed={4712} />
                <ToolButton glyph={sim.running ? 'pause' : 'play'} label={sim.running ? 'pauza' : 'pokreni'} onClick={sim.toggle} primary seed={4713} />
              </>
            )}
          </div>
        )}
      </div>
      {hint && (
        <p className="k-sim__hint">
          <span className="k-sim__hintlabel">probajte →</span> <span className="k-sim__hinttext">{hint}</span>
        </p>
      )}
      <div ref={mainRef} className={`k-sim__main${controls ? ' has-controls' : ''}`}>
        <div className="k-sim__stage" data-align={stageAlign === 'start' ? 'start' : undefined} style={wide ? { minHeight } : undefined}>
          {children}
        </div>
        {controls && <div className="k-sim__controls">{controls}</div>}
      </div>
      {stats && <div className="k-sim__stats">{stats}</div>}
    </div>
  )
}
