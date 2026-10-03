import { useId, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Rough, RoughAround } from '../sketch/Sketch'
import { hashSeed } from '../sketch/roughGen'
import { PenGlyph } from '../doodles/interactive-doodles'
import { Outline } from './Outline'
import { glyphFor } from './glyphs'
import { onRadioKeys } from './roving'

/* =====================================================================
   Controls, drawn with the notebook's pen: sticker buttons with a pen
   outline, the "Promet" ruler slider with a tray for a thumb, a drawn
   switch, handwritten options with the chosen one circled in red.
   ===================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

interface ButtonProps {
  children?: ReactNode
  onClick?: () => void
  variant?: Variant
  icon?: LucideIcon
  /** Native disabled: out of the tab order. If the button can lose its use while it has focus, use `ariaDisabled`. */
  disabled?: boolean
  /**
   * Temporarily unavailable but still focusable (aria-disabled): looks disabled, ignores clicks, and keyboard focus
   * stays on it — use it for limit-reached counters (−1 at 0), „Natrag” on the first step, controls paused by a sim.
   */
  ariaDisabled?: boolean
  size?: 'sm' | 'md'
  title?: string
  /** Accessible name when the visible text is not enough (e.g. several „Vrati” buttons: „Vrati traku 2”). */
  ariaLabel?: string
  active?: boolean
}

const PEN: Record<Variant, { stroke: string; fill?: string; shadow?: boolean }> = {
  primary: { stroke: 'var(--ink)', fill: 'var(--ink)' },
  secondary: { stroke: 'currentColor', fill: 'var(--paper)' },
  ghost: { stroke: 'transparent' },
  danger: { stroke: 'var(--red)', fill: 'var(--paper)', shadow: true },
  success: { stroke: 'var(--green)', fill: 'var(--paper)', shadow: true },
}

/** The icon of a button: the pen-drawn glyph when there is one, otherwise the lucide icon. */
function ButtonIcon({ icon: Icon, variant, size }: { icon?: LucideIcon; variant: Variant; size: 'sm' | 'md' }) {
  const px = size === 'sm' ? 15 : 17
  const kind = glyphFor(Icon) ?? (variant === 'danger' && !Icon ? 'bolt' : null)
  if (kind) return <PenGlyph kind={kind} size={px} className="k-btn__icon" />
  if (Icon) return <Icon size={px} strokeWidth={2.1} className="k-btn__icon" aria-hidden="true" />
  return null
}

/**
 * A drawn button. primary = ink-filled; secondary = pencil outline; ghost = pen text only;
 * danger = red pencil sticker with a lightning bolt (break-it actions); success = green sticker (repair actions).
 * `active` hatches the button with a marker (a mode that is on, e.g. a burst in progress) and makes it a toggle button
 * for screen readers (aria-pressed). Leave it undefined on plain action buttons.
 */
export function Button({ children, onClick, variant = 'secondary', icon, disabled, ariaDisabled, size = 'md', title, ariaLabel, active }: ButtonProps) {
  const pen = PEN[variant]
  const seed = hashSeed(`btn|${variant}|${typeof children === 'string' ? children : ''}`)
  const drawn = variant !== 'ghost'
  const inert = disabled || ariaDisabled
  return (
    <button
      type="button"
      className={`k-btn k-btn--${variant} k-btn--${size}${drawn ? ' k-btn--drawn' : ''}${active ? ' is-active' : ''}`}
      onClick={ariaDisabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={ariaDisabled && !disabled ? true : undefined}
      aria-label={ariaLabel}
      title={title}
      aria-pressed={active === undefined ? undefined : active}
    >
      {drawn && (
        <Outline
          seed={seed}
          stroke={pen.stroke}
          strokeWidth={variant === 'primary' ? 1.6 : 1.8}
          fill={active ? 'color-mix(in srgb, var(--hl-orange-ink) 30%, var(--paper))' : pen.fill}
          shadow={pen.shadow && !inert}
        />
      )}
      <span className="k-btn__label">
        <ButtonIcon icon={icon} variant={variant} size={size} />
        {children !== undefined && children !== null && children !== false && <span>{children}</span>}
      </span>
    </button>
  )
}

interface SliderProps {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** Formats the displayed value, e.g. v => `${v} req/s` */
  format?: (v: number) => ReactNode
  hint?: ReactNode
  disabled?: boolean
}

/**
 * The "Promet" slider from the notebook: a pencil ruler with tick marks, swiped with an orange marker up to the
 * value, and a little tray for a thumb. The value is written by hand next to it.
 */
export function Slider({ label, value, min, max, step = 1, onChange, format, hint, disabled }: SliderProps) {
  const id = useId()
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const shown = format ? format(value) : value
  return (
    <div className={`k-slider${disabled ? ' is-disabled' : ''}`}>
      <div className="k-slider__top">
        <label htmlFor={id} className="k-control__label">
          {label}
        </label>
        <output htmlFor={id} className="k-slider__value">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
        aria-valuetext={typeof shown === 'string' || typeof shown === 'number' ? String(shown) : undefined}
      />
      {hint && <div className="k-control__hint">{hint}</div>}
    </div>
  )
}

interface ToggleProps {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  hint?: ReactNode
  disabled?: boolean
}

/** A drawn switch: a pencil oval with a paper knob; when on, the oval is hatched with the blue pen. */
export function Toggle({ label, checked, onChange, hint, disabled }: ToggleProps) {
  const id = useId()
  const seed = hashSeed(`toggle|${typeof label === 'string' ? label : id}`)
  return (
    <div className={`k-toggle${disabled ? ' is-disabled' : ''}${checked ? ' is-on' : ''}`}>
      <button id={id} type="button" role="switch" aria-checked={checked} className={`k-toggle__switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)} disabled={disabled}>
        <ToggleDrawing checked={checked} seed={seed} />
      </button>
      <label htmlFor={id} className="k-control__label">
        {label}
        {hint && <span className="k-control__hint">{hint}</span>}
      </label>
    </div>
  )
}

function ToggleDrawing({ checked, seed }: { checked: boolean; seed: number }) {
  return (
    <svg viewBox="0 0 48 28" width="48" height="28" aria-hidden="true">
      <Rough
        shape={{ k: 'ellipse', cx: 24, cy: 14, w: 44, h: 24 }}
        seed={seed}
        stroke={checked ? 'var(--pen)' : 'var(--ink-2)'}
        strokeWidth={1.6}
        roughness={0.9}
        fillColor={checked ? 'var(--pen)' : undefined}
        hachureGap={3}
        fillWeight={1.1}
      />
      {/* the knob slides when the state changes (a move driven by state) */}
      <g className="k-toggle__knob" style={{ transform: `translateX(${checked ? 20 : 0}px)` }}>
        <Rough shape={{ k: 'ellipse', cx: 14, cy: 14, w: 15, h: 15 }} seed={seed + 3} stroke="var(--ink)" strokeWidth={1.6} roughness={0.8} fillColor="var(--paper)" fillStyle="solid" />
      </g>
    </svg>
  )
}

interface SegmentedProps<T extends string | number> {
  label?: ReactNode
  value: T
  /** `disabled` options stay visible (faded) but cannot be chosen; arrow keys skip them */
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  /** The whole group is temporarily unavailable (still focusable, aria-disabled; the choice cannot change). */
  disabled?: boolean
}

/** Handwritten options; the chosen one is circled with the red pen (like "Kružno" in the notebook). */
export function Segmented<T extends string | number>({ label, value, options, onChange, size = 'md', disabled }: SegmentedProps<T>) {
  const labelId = useId()
  const off = (v: T) => !!disabled || !!options.find((o) => o.value === v)?.disabled
  const pick = (v: T) => {
    if (!off(v)) onChange(v)
  }
  return (
    <div className={`k-seg-wrap${disabled ? ' is-disabled' : ''}`}>
      {label && (
        <div className="k-control__label" id={labelId}>
          {label}
        </div>
      )}
      <div
        className={`k-seg k-seg--${size}`}
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return
          onRadioKeys(
            e,
            options.map((o) => o.value),
            value,
            onChange,
            off,
          )
        }}
      >
        {options.map((o, idx) => {
          const on = o.value === value
          const firstFree = options.findIndex((x) => !x.disabled)
          const stop = on || (idx === Math.max(0, firstFree) && !options.some((x) => x.value === value))
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={o.disabled || undefined}
              tabIndex={stop ? 0 : -1}
              title={o.title}
              className={`k-seg__opt${on ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
              onClick={() => pick(o.value)}
            >
              {on ? (
                <RoughAround key={String(o.value)} seed={hashSeed(`seg|${String(o.value)}`)} padX={size === 'sm' ? 9 : 13} padY={size === 'sm' ? 4 : 6} strokeWidth={2}>
                  <span className="k-seg__label">{o.label}</span>
                </RoughAround>
              ) : (
                <span className="k-seg__label">{o.label}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SelectProps<T extends string> {
  label: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

/** A native select written on a pencil line, with a drawn chevron. */
export function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId()
  return (
    <div className="k-select">
      <label htmlFor={id} className="k-control__label">
        {label}
      </label>
      <span className="k-select__field">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <PenGlyph kind="chev" size={16} className="k-select__chev" />
      </span>
    </div>
  )
}

/** Titled group of controls inside a SimFrame side panel. `collapsible` hides it behind its title (e.g. "Napredno"). */
export function ControlGroup({ title, children, collapsible, defaultOpen = false }: { title?: ReactNode; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  if (collapsible) {
    return (
      <div className={`k-cgroup is-collapsible${open ? ' is-open' : ''}`}>
        <button type="button" className="k-cgroup__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={bodyId}>
          <span className="k-cgroup__title">{title ?? 'Napredno'}</span>
          <PenGlyph kind="chev" size={16} className="k-cgroup__chev" />
        </button>
        {open && (
          <div className="k-cgroup__body" id={bodyId}>
            {children}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="k-cgroup">
      {title && <div className="k-cgroup__title">{title}</div>}
      <div className="k-cgroup__body">{children}</div>
    </div>
  )
}
