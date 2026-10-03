import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from 'motion/react'

export interface SimulationOptions<S> {
  /** Create a fresh state. Called on mount and on reset(). */
  init: () => S
  /**
   * Advance the state by `dt` seconds of simulated time (mutate `state` in place).
   * The latest closure is always used, so it may read current props / slider values.
   * Return `'stop'` when a finite run has ended (a simulated year, a pipeline run): the loop pauses itself there.
   */
  step: (state: S, dt: number, time: number) => void | 'stop'
  /** Fixed simulation step in seconds (default 1/60). */
  fixedDt?: number
  /** How often React re-renders while running (default 30 fps). */
  fps?: number
  /** Start running automatically the first time the sim scrolls into view (default true; never under reduced motion). */
  autoStart?: boolean
  /** Initial speed multiplier (default 1). */
  speed?: number
}

export interface Simulation<S> {
  /** The live, mutable state. Read it during render; it is re-rendered at `fps` while running. */
  state: S
  /** Simulated seconds since start/reset */
  time: number
  running: boolean
  speed: number
  play: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  setSpeed: (s: number) => void
  /** Advance one fixed step while paused (for step-by-step teaching). */
  stepOnce: (seconds?: number) => void
  /** Apply an imperative change to the state (e.g. kill a server) and re-render immediately. */
  mutate: (fn: (state: S) => void) => void
  /**
   * Attach to the sim's root element (SimFrame does it with `sim`): the loop pauses while no part of it is in the
   * middle 80 % of the window, or the tab is hidden.
   */
  ref: RefObject<HTMLDivElement | null>
}

/**
 * Fixed-timestep simulation loop driven by requestAnimationFrame.
 * State lives in a ref (mutable model), React only re-renders at a capped frame rate.
 */
export function useSimulation<S>({ init, step, fixedDt = 1 / 60, fps = 30, autoStart = true, speed: initialSpeed = 1 }: SimulationOptions<S>): Simulation<S> {
  // A stable mutable holder: the model is mutated in place by the loop and read during render.
  const [model] = useState(() => new SimModel(init()))
  const stepRef = useRef(step)
  const initRef = useRef(init)
  useEffect(() => {
    stepRef.current = step
    initRef.current = init
  })

  const ref = useRef<HTMLDivElement>(null)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(initialSpeed)
  const [visible, setVisible] = useState(false)
  const [, setFrame] = useState(0)
  const autoStartedRef = useRef(false)

  const rerender = useCallback(() => setFrame((f) => (f + 1) % 1_000_000), [])

  // Visibility: pause when off-screen. "On screen" is measured against the viewport, not the sim's own height: the sim
  // counts as visible while any part of it is inside the middle 80 % of the window — so a frame taller than the
  // window (a flagship with long controls on a phone) keeps running while the reader is anywhere inside it.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0, rootMargin: '-10% 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Reduced motion: the sim starts paused (the reader presses "pokreni"), as the design bible requires.
  const reduce = useReducedMotion()
  useEffect(() => {
    if (autoStart && !reduce && visible && !autoStartedRef.current) {
      autoStartedRef.current = true
      setRunning(true)
    }
  }, [autoStart, visible, reduce])

  useEffect(() => {
    if (!running || !visible) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    let sinceRender = 0
    const frameMs = 1000 / fps
    const loop = (now: number) => {
      if (document.hidden) {
        last = now
        raf = requestAnimationFrame(loop)
        return
      }
      const realDt = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += realDt * speed
      let steps = 0
      while (acc >= fixedDt && steps < 2000) {
        const r = model.advance(stepRef.current, fixedDt)
        acc -= fixedDt
        steps++
        if (r === 'stop') {
          // a finite run ended: show the final state and pause (play() continues, reset() starts over)
          rerender()
          setRunning(false)
          return
        }
      }
      sinceRender += realDt * 1000
      if (sinceRender >= frameMs) {
        sinceRender = 0
        rerender()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, visible, speed, fixedDt, fps, rerender, model])

  const play = useCallback(() => setRunning(true), [])
  const pause = useCallback(() => setRunning(false), [])
  const toggle = useCallback(() => setRunning((r) => !r), [])
  const reset = useCallback(() => {
    model.replace(initRef.current())
    rerender()
  }, [rerender, model])
  const stepOnce = useCallback(
    (seconds = fixedDt) => {
      const n = Math.max(1, Math.round(seconds / fixedDt))
      for (let i = 0; i < n; i++) {
        if (model.advance(stepRef.current, fixedDt) === 'stop') break
      }
      rerender()
    },
    [fixedDt, rerender, model],
  )
  const mutate = useCallback(
    (fn: (s: S) => void) => {
      model.apply(fn)
      rerender()
    },
    [rerender, model],
  )

  return {
    state: model.state,
    time: model.time,
    running,
    speed,
    play,
    pause,
    toggle,
    reset,
    setSpeed,
    stepOnce,
    mutate,
    ref,
  }
}

/** Holds the mutable simulation model. Methods (not property writes) keep React's lint rules happy. */
class SimModel<S> {
  state: S
  time = 0
  constructor(state: S) {
    this.state = state
  }
  advance(step: (state: S, dt: number, time: number) => void | 'stop', dt: number): void | 'stop' {
    const r = step(this.state, dt, this.time)
    this.time += dt
    return r
  }
  replace(state: S) {
    this.state = state
    this.time = 0
  }
  apply(fn: (state: S) => void) {
    fn(this.state)
  }
}
