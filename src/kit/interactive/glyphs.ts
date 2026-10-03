import type { LucideIcon } from 'lucide-react'
import type { PenGlyphKind } from '../doodles/interactive-doodles'

/**
 * Buttons take a lucide icon (the public API), but in the notebook the common ones are re-drawn with the pen.
 * Icons that are not in this list keep their lucide shape.
 */
const BY_NAME: Record<string, PenGlyphKind> = {
  Zap: 'bolt',
  ZapIcon: 'bolt',
  Bolt: 'bolt',
  Play: 'play',
  PlayIcon: 'play',
  Pause: 'pause',
  RotateCcw: 'loop',
  RotateCw: 'loop',
  RefreshCcw: 'loop',
  RefreshCw: 'loop',
  Undo2: 'loop',
  Undo: 'loop',
  History: 'loop',
  Repeat: 'loop',
  Plus: 'plus',
  Minus: 'minus',
  Power: 'power',
  PowerOff: 'power',
  Snowflake: 'snow',
  Wrench: 'fix',
  Hammer: 'fix',
  Bandage: 'fix',
  Check: 'check',
  X: 'cross',
  StepForward: 'step',
  SkipForward: 'step',
  FastForward: 'skip',
  ChevronDown: 'chev',
  ArrowLeft: 'left',
  ChevronLeft: 'left',
  ArrowRight: 'right',
  ChevronRight: 'right',
  Hand: 'hand',
}

/** The pen glyph that replaces a lucide icon, or null when the icon has no drawn version. */
export function glyphFor(icon: LucideIcon | undefined): PenGlyphKind | null {
  if (!icon) return null
  const name = icon.displayName ?? ''
  return BY_NAME[name] ?? null
}
