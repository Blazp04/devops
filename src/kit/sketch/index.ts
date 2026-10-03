/**
 * Sketch: the notebook's pen. Hand-drawn primitives built on roughjs with deterministic seeds and a shared path cache.
 * Styles: ./sketch.css (imported once from src/main.tsx).
 */
export { Rough, Boil, RoughBox, RoughButton, RoughAround, RoughRule, Arrow, Cross, Check, Scribble, Squiggle, CheckBox } from './Sketch'
export type { RoughProps, RoughBoxProps, RoughButtonProps } from './Sketch'
export { roughPaths, hashSeed, seedOf, PEN_DEFAULTS, INK, INK_2, INK_3, PEN, RED, GREEN, PAPER } from './roughGen'
export type { Pt, Shape, FillStyle, RoughOpts, RoughPath } from './roughGen'
export { useSize, useWidth, useWidthRef, useOnScreen, type Size } from './useSize'
