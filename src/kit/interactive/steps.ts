/** Colour of step i (0-based) in a story told step by step: blue pen → red → green → orange → violet → teal. */
const STEP_COLORS = ['var(--pen)', 'var(--red)', 'var(--green)', 'var(--orange)', 'var(--violet)', 'var(--teal)']

export function stepColor(i: number): string {
  return STEP_COLORS[((i % STEP_COLORS.length) + STEP_COLORS.length) % STEP_COLORS.length]
}
