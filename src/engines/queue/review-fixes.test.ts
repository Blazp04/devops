/// <reference types="node" />
/**
 * E2 „Red” – regression tests for the post-lecture review: the crash point between the kitchen commit and the SMS
 * call, fanout wording and version-free event text. Run: node --test src/engines/queue/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crashConsumer, createQueueSim, fanoutScript, publishBatch, runFor, runPreset, type QueueConfigPatch, type QueueState } from './index.ts'

const quiet = (cfg: QueueConfigPatch = {}) => createQueueSim({ seed: 42, rate: 0, serviceDist: 'fixed', ...cfg })
const hasEvent = (s: QueueState, re: RegExp) => s.events.some((e) => re.test(e.text))

test("crashConsumer(…, 'after-commit'): cooked, no SMS attempt, redelivered", () => {
  const cell = (when: 'after-effect' | 'after-commit', cfg: QueueConfigPatch = {}) => {
    const s = quiet({ consumers: 1, ...cfg })
    publishBatch(s, 1)
    const r = crashConsumer(s, undefined, when)
    assert.ok(r && r.armed && r.when === when)
    runFor(s, 10)
    return { s, cooked: s.cooked.get(1) ?? 0, smsSent: s.totals.smsSent, smsLost: s.totals.smsLost, completed: s.totals.completed, crashes: s.totals.crashes }
  }
  // after the SMS attempt (existing behaviour): cooked twice, SMS twice
  const after = cell('after-effect')
  assert.deepEqual([after.cooked, after.smsSent, after.completed, after.crashes], [2, 2, 1, 1])
  // between commit and SMS: cooked twice, but the first SMS never went – one SMS in total
  const between = cell('after-commit')
  assert.deepEqual([between.cooked, between.smsSent, between.smsLost, between.completed, between.crashes], [2, 1, 0, 1, 1])
  assert.ok(hasEvent(between.s, /pada nakon sljedećeg kuhanja, prije SMS-a, prije potvrde/))
  assert.ok(hasEvent(between.s, /pao nakon kuhanja, prije SMS-a i potvrde/))
  // idempotent kitchen + „record then send”: the SMS was recorded in the commit, the retry skips it → lost
  const recorded = cell('after-commit', { idempotent: true, smsGuard: 'record-first' })
  assert.deepEqual([recorded.cooked, recorded.smsSent, recorded.smsLost, recorded.completed], [1, 0, 1, 1])
  // the same guard with the old crash point loses nothing (the SMS went before the crash)
  const recordedAfter = cell('after-effect', { idempotent: true, smsGuard: 'record-first' })
  assert.deepEqual([recordedAfter.cooked, recordedAfter.smsSent, recordedAfter.smsLost], [1, 1, 0])
})

test("'after-commit' arming is cleared by the crash; the next job runs normally", () => {
  const s = quiet({ consumers: 1 })
  publishBatch(s, 1)
  crashConsumer(s, undefined, 'after-commit')
  runFor(s, 10)
  assert.equal(s.consumers[0].crashArmed, false)
  assert.equal('crashArmedPoint' in s.consumers[0], false)
  publishBatch(s, 1)
  runFor(s, 10)
  assert.equal(s.totals.crashes, 1)
  assert.equal(s.totals.completed, 2)
})

test('fanoutScript: the first fan-out sentence starts with a capital letter', () => {
  const f = fanoutScript({ mode: 'fanout', messages: 2 })
  const body = f[0].body
  const second = body.split('. ')[1]
  assert.ok(/^[A-ZČĆŽŠĐ]/.test(second), body)
  assert.ok(body.includes('kuhinja, sms, analitika'))
})

test('nack-loop event text carries no broker version', () => {
  const p = runPreset('l06-rabbit-nack-loop')
  const loop = p.events.filter((e) => e.text.includes('basic.nack se ne broji'))
  assert.ok(loop.length > 0)
  assert.ok(loop.every((e) => e.text.startsWith('RabbitMQ: ') && !/4\.3/.test(e.text)))
})
