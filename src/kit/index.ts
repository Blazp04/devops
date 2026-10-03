/**
 * Lecture authoring kit — the single public entry. Lectures import everything from here:
 *   import { Section, Callout, CodeBlock, Stepper, SimFrame, useSimulation, Diagram, DNode, Lana, Mark } from '../../kit'
 * Areas (each with its own barrel and CSS file, imported once from src/main.tsx):
 *   text/         Section, callouts, Term, layout pieces, Quiz, Predict, Goals/EventLog      (text/text.css)
 *   interactive/  CodeBlock, Terminal, Stepper, SimFrame, controls, stats                  (interactive/interactive.css)
 *   diagram/      Diagram, DNode, Edge, Packet, DGroup, K8s shapes                         (diagram/diagram.css)
 *   sketch/       the pen: Rough, Boil, RoughBox, RoughButton, RoughAround, Arrow, Cross…   (sketch/sketch.css)
 *   doodles/      characters, menza things, paper, section props, small doodles            (doodles/doodles.css)
 * Design rules: docs/AUTHORING.md §6 and src/design-lab/biljeznica/README.md. Live reference: /kit and /kit/crtezi.
 */
export * from './text'
export * from './interactive'
export * from './diagram'
export * from './sketch'
export * from './doodles'
export { useElementWidth, useNarrow } from './hooks'
export { useSimulation, type Simulation, type SimulationOptions } from './sim/useSimulation'
export { createRng, Series, percentile, mean, clamp, lerp, fmt, plural, type Rng } from './sim/math'
export { StoryMap } from './story/StoryMap'
