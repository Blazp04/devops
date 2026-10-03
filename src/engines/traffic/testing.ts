/**
 * Test helpers: node:test and node:assert/strict, typed locally.
 * The app tsconfig deliberately has no Node types (adding them globally would change DOM typings such as
 * setTimeout for the whole site), so the modules are loaded with a computed specifier and given minimal types.
 * Only *.test.ts files import this module; the site bundle never does.
 */
type TestBody = () => void | Promise<void>

interface NodeTestModule {
  test: (name: string, fn: TestBody) => unknown
  describe: (name: string, fn: () => void) => unknown
}

export interface Assert {
  ok(value: unknown, message?: string): void
  equal(actual: unknown, expected: unknown, message?: string): void
  notEqual(actual: unknown, expected: unknown, message?: string): void
  deepEqual(actual: unknown, expected: unknown, message?: string): void
  notDeepEqual(actual: unknown, expected: unknown, message?: string): void
  throws(fn: () => unknown, message?: string): void
}

const nodeTest = (await import('node:' + 'test')) as unknown as NodeTestModule
const nodeAssert = (await import('node:' + 'assert/strict')) as unknown as { default: Assert }

export const test = nodeTest.test
export const describe = nodeTest.describe
export const assert = nodeAssert.default

/** |actual − expected| ≤ tol, with a readable message. */
export function near(actual: number, expected: number, tol: number, what = 'value') {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol, `${what}: expected ${expected} ± ${tol}, got ${actual}`)
}

/** lo ≤ actual ≤ hi */
export function within(actual: number, lo: number, hi: number, what = 'value') {
  assert.ok(Number.isFinite(actual) && actual >= lo && actual <= hi, `${what}: expected in [${lo}, ${hi}], got ${actual}`)
}
