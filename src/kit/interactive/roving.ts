import type { KeyboardEvent } from 'react'

/**
 * Keyboard for a radio group drawn as buttons (Segmented, the sim speed picker): one tab stop (the checked option has
 * tabIndex 0, the rest −1) and ←/→/↑/↓/Home/End move the choice and the focus, as in a native radio group.
 * Put it on the element with role="radiogroup"; the options must have role="radio". `isDisabled` options are skipped.
 */
export function onRadioKeys<T>(e: KeyboardEvent<HTMLElement>, values: readonly T[], current: T, onChange: (v: T) => void, isDisabled?: (v: T) => boolean) {
  const n = values.length
  if (n === 0) return
  const i = Math.max(0, values.indexOf(current))
  const ok = (k: number) => !isDisabled?.(values[k])
  // the next enabled option in a direction (disabled options are skipped, as in a native radio group)
  const walk = (from: number, dir: 1 | -1) => {
    for (let s = 1; s <= n; s++) {
      const k = (((from + dir * s) % n) + n) % n
      if (ok(k)) return k
    }
    return i
  }
  let next: number
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = walk(i, 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = walk(i, -1)
      break
    case 'Home':
      next = ok(0) ? 0 : walk(0, 1)
      break
    case 'End':
      next = ok(n - 1) ? n - 1 : walk(n - 1, -1)
      break
    default:
      return
  }
  e.preventDefault()
  e.stopPropagation()
  if (next !== i) onChange(values[next])
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
}
