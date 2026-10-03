/** Array-backed FIFO with O(1) amortised shift (queues can reach thousands of messages when λ > kμ). */
export class Fifo<T> {
  items: (T | undefined)[] = []
  head = 0

  get size(): number {
    return this.items.length - this.head
  }

  push(x: T): void {
    this.items.push(x)
  }

  /** Put an element at the head (requeue to the front). */
  unshift(x: T): void {
    if (this.head > 0) this.items[--this.head] = x
    else this.items.unshift(x)
  }

  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined
    const x = this.items[this.head]
    this.items[this.head] = undefined
    this.head++
    if (this.head >= 1024 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return x
  }

  peek(): T | undefined {
    return this.head < this.items.length ? this.items[this.head] : undefined
  }

  /** i-th element from the head (0 = head). */
  at(i: number): T | undefined {
    const j = this.head + i
    return i >= 0 && j < this.items.length ? this.items[j] : undefined
  }

  /** Copy of elements [start, end) counted from the head. */
  slice(start = 0, end = this.size): T[] {
    const out: T[] = []
    const a = this.head + Math.max(0, start)
    const b = this.head + Math.min(this.size, end)
    for (let i = a; i < b; i++) out.push(this.items[i] as T)
    return out
  }

  /** Insert at position i from the head (0 = head; clamped to [0, size]). O(n) except at the head. */
  insertAt(i: number, x: T): void {
    const k = Math.max(0, Math.min(this.size, Math.floor(i)))
    if (k === 0) this.unshift(x)
    else this.items.splice(this.head + k, 0, x)
  }

  /** Position (from the head) of the first element matching `pred`, or −1. */
  indexOf(pred: (x: T) => boolean): number {
    for (let i = this.head; i < this.items.length; i++) if (pred(this.items[i] as T)) return i - this.head
    return -1
  }

  /** Remove the element at position i from the head. */
  removeAt(i: number): T | undefined {
    if (i < 0 || i >= this.size) return undefined
    if (i === 0) return this.shift()
    return this.items.splice(this.head + i, 1)[0]
  }

  /** Remove the first element matching `pred` (O(n)). */
  removeFirst(pred: (x: T) => boolean): T | undefined {
    for (let i = this.head; i < this.items.length; i++) {
      const x = this.items[i] as T
      if (pred(x)) {
        this.items.splice(i, 1)
        return x
      }
    }
    return undefined
  }

  forEach(fn: (x: T, i: number) => void): void {
    for (let i = this.head; i < this.items.length; i++) fn(this.items[i] as T, i - this.head)
  }

  clear(): void {
    this.items = []
    this.head = 0
  }
}
