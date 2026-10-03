/** Motion variants: linework draws itself in (stroke-dashoffset via pathLength), labels fade in after. */
export const drawVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  shown: (i: number = 0) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { delay: i * 0.07, duration: 0.9, ease: 'linear' as const }, opacity: { delay: i * 0.07, duration: 0.01 } },
  }),
  gone: { opacity: 0, transition: { duration: 0.45 } },
}

export const fadeVariants = {
  hidden: { opacity: 0 },
  shown: (i: number = 0) => ({ opacity: 1, transition: { delay: 0.35 + i * 0.07, duration: 0.4 } }),
  gone: { opacity: 0, transition: { duration: 0.3 } },
}

