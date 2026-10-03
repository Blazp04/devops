import { Rough } from '../sketch/Sketch'
import { useSize } from '../sketch/useSize'
import type { FillStyle } from '../sketch/roughGen'

export interface OutlineProps {
  seed: number
  /** pen colour (default currentColor) */
  stroke?: string
  strokeWidth?: number
  /** fill behind the content (solid by default) */
  fill?: string
  fillStyle?: FillStyle
  hachureGap?: number
  hachureAngle?: number
  /** a solid offset "shadow" drawn 3 px down-right in the pen colour (sticker buttons) */
  shadow?: boolean
  /** pen goes over the outline twice */
  double?: boolean
  dash?: string
  roughness?: number
  /** inset of the outline from the element edge */
  inset?: number
  className?: string
}

/**
 * A pen-drawn rectangle that fills its positioned parent (`position: relative` + `isolation: isolate`).
 * Measures the parent box and redraws (same seed) when it resizes, so the outline never stretches.
 * Used for drawn buttons, stat boxes, the code sheet and the step card.
 */
export function Outline({
  seed,
  stroke = 'currentColor',
  strokeWidth = 1.7,
  fill,
  fillStyle,
  hachureGap,
  hachureAngle,
  shadow,
  double,
  dash,
  roughness = 1.15,
  inset = 2,
  className,
}: OutlineProps) {
  const [ref, size] = useSize<HTMLSpanElement>()
  const ok = size && size.w > inset * 2 + 4 && size.h > inset * 2 + 4
  const w = ok ? size.w - inset * 2 - (shadow ? 3 : 0) : 0
  const h = ok ? size.h - inset * 2 - (shadow ? 3 : 0) : 0
  return (
    <span ref={ref} className={`k-outline${className ? ` ${className}` : ''}`} aria-hidden="true">
      {ok && (
        <>
          {shadow && (
            <svg className="k-outline__shadow" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
              <Rough shape={{ k: 'rect', x: inset + 3, y: inset + 3, w, h }} seed={seed + 1} stroke={stroke} strokeWidth={strokeWidth} roughness={roughness * 0.8} fillColor={stroke} fillStyle="solid" />
            </svg>
          )}
          <svg className="k-outline__face" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
            <Rough
              shape={{ k: 'rect', x: inset, y: inset, w, h }}
              seed={seed}
              stroke={stroke}
              strokeWidth={strokeWidth}
              roughness={roughness}
              fillColor={fill}
              fillStyle={fill ? (fillStyle ?? 'solid') : undefined}
              hachureGap={hachureGap}
              hachureAngle={hachureAngle}
              multi={double}
              dash={dash}
            />
          </svg>
        </>
      )}
    </span>
  )
}
