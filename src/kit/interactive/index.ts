/**
 * Interactive pieces: code sheets (graph paper taped in), the terminal (Lana's laptop), the stepper (a flip-book
 * with an index card), the simulation frame (a graph-paper insert), drawn controls and live metrics in pencil.
 * Styles: ./interactive.css (imported once from src/main.tsx).
 */
export { CodeBlock, type CodeNote } from './CodeBlock'
export type { CodeLang } from './highlight'
export { Terminal, type TerminalLine } from './Terminal'
export { Stepper, type Step } from './Stepper'
export { SimFrame } from './SimFrame'
export { Button, Slider, Toggle, Segmented, Select, ControlGroup } from './Controls'
export { Stat, StatRow, Meter, Sparkline, LineChart, type ChartSeries } from './Stats'
export { toneColor, utilTone, type Tone } from './tone'
export { stepColor } from './steps'
/* doodles added by the interactive area (live in src/kit/doodles/interactive-doodles.tsx) */
export { PenGlyph, LaptopDeck, StepBadge, type PenGlyphKind } from '../doodles/interactive-doodles'
