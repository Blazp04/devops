/**
 * Visibility anchor for a tall SimFrame. useSimulation pauses when less than 15 % of the observed element is on
 * screen; a flagship that is ~3000 px tall on a phone would pause while the reader is at its toolbar or its stats.
 * So the sim's ref goes on a 1 px sticky line inside a wrapper around the whole frame instead of the frame itself:
 * the line stays on screen whenever any part of the frame is, and the sim still pauses when the frame is off-screen.
 * (Reported to the kit: observe the stage, or use a lower threshold for tall frames.)
 */
import type { ReactNode, RefObject } from 'react'
import styles from '../styles.module.css'

export function TallSim({ simRef, children }: { simRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div className={`k-wide ${styles.tallSim}`}>
      <div ref={simRef} className={styles.simAnchor} aria-hidden="true" />
      {children}
    </div>
  )
}
