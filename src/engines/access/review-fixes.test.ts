/**
 * E5 „Tko vidi?” – regression tests for the post-lecture review: attemptsRemainingS / settleAttempts resolve the
 * attempts in flight (L16 PutTajne used to compute hops.length × hopDur − elapsed itself).
 * Run: node --test src/engines/access/*.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { attempt, attemptsRemainingS, createAccess, settleAttempts, step } from './index.ts'

describe('settleAttempts', () => {
  it('nothing in flight → 0, the clock does not move', () => {
    const s = createAccess({ seed: 42 })
    assert.equal(attemptsRemainingS(s), 0)
    const t = s.t
    assert.equal(settleAttempts(s), 0)
    assert.equal(s.t, t)
  })
  it('resolves every attempt in flight, the same as stepping for that long', () => {
    const a = createAccess({ seed: 42 })
    const b = createAccess({ seed: 42 })
    for (const s of [a, b]) {
      assert.ok(attempt(s, 'git-reader', 'db'))
      step(s, 0.3)
      assert.ok(attempt(s, 'developer', 'db'))
    }
    const left = attemptsRemainingS(a)
    const tok = a.attempts[0]
    assert.ok(Math.abs(left - Math.max(...a.attempts.map((x) => x.hops.length * x.hopDur - (a.t - x.startedAt)))) < 1e-9)
    assert.ok(left > 0 && tok.doneAt === null)
    const advanced = settleAttempts(a)
    assert.ok(advanced >= left && advanced <= left + 0.2 + 1e-9, `advanced ${advanced} for ${left}`)
    assert.ok(a.attempts.every((x) => x.doneAt !== null), 'every token has arrived')
    assert.equal(attemptsRemainingS(a), 0)
    step(b, advanced)
    assert.equal(JSON.stringify(a.attemptLog), JSON.stringify(b.attemptLog))
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events))
  })
})
