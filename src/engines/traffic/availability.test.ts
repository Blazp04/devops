/** L03 „Arhitekt dostupnosti”: the seeded year vs the formulas. */
import {
  HOURS_PER_YEAR,
  badConfig,
  createYear,
  finishYear,
  formulaAvailability,
  hourLabel,
  hourlyFailureProbability,
  rackFailure,
  resolveYearConfig,
  runYear,
  stepYear,
  yearMtbf,
  yearReport,
} from './availability.ts'
import { assert, describe, near, test, within } from './testing.ts'

describe('availability year (L03)', () => {
  test('defaults: entry 99.99 % × 2 app servers at 99 % × DB 99.9 % → formula ≈99.88 %', () => {
    near(formulaAvailability(resolveYearConfig()), 0.9988, 0.00005)
    const r = runYear()
    near(r.formulaDowntimeH, 10.5, 0.1)
    near(r.survivorLoad, 1 / 0.7, 1e-9, '100/70 ≈ 143 %')
    assert.equal(r.nPlusOne, false)
    assert.equal(r.hours, HOURS_PER_YEAR)
  })
  test('hourly failure probability reproduces A exactly in the long run; MTBF = MTTR·A/(1−A)', () => {
    near(hourlyFailureProbability(0.99, 4), 0.01 / (0.01 + 3.96), 1e-12)
    assert.equal(hourlyFailureProbability(1, 4), 0)
    assert.equal(hourlyFailureProbability(0, 4), 1)
    near(yearMtbf(0.99), 396, 1e-9)
    // one component, many years: measured availability → A
    let down = 0
    const years = 60
    for (let seed = 1; seed <= years; seed++) {
      down += runYear({ seed, entry: 1, db: 0.99, app: { count: 1, availability: 1, capacityShare: 1 }, detectionMin: 0 }).downtimeH
    }
    near(1 - down / (years * HOURS_PER_YEAR), 0.99, 0.0015)
  })
  test('with independent failures, enough capacity and no detection time the year matches the formula (mean of 300 years)', () => {
    let down = 0
    const years = 300
    for (let seed = 1; seed <= years; seed++) down += runYear({ seed, app: { count: 2, availability: 0.99, capacityShare: 1 }, detectionMin: 0 }).downtimeH
    near(down / years, 10.5, 1.2, 'mean downtime h/yr')
  })
  test('N+1 matters: at 70 % of peak per server, lunches are lost and downtime exceeds the formula', () => {
    let tight = 0
    let roomy = 0
    let lunches = 0
    for (let seed = 1; seed <= 100; seed++) {
      const a = runYear({ seed })
      const b = runYear({ seed, app: { count: 2, availability: 0.99, capacityShare: 1 } })
      tight += a.downtimeH
      roomy += b.downtimeH
      lunches += a.lunchesLost
      assert.ok(a.downByCause.capacity >= 0)
    }
    assert.ok(tight > roomy + 5 * 100, `tight ${tight / 100} vs roomy ${roomy / 100} h/yr`)
    assert.ok(lunches / 100 > 3, 'several lost lunches per year')
  })
  test('shared rack: correlated failures add downtime; „Kvar ormara” takes both servers down', () => {
    const s = createYear({ sameRack: true, app: { count: 2, availability: 1, capacityShare: 1 }, entry: 1, db: 1, rackAvailability: 1 })
    rackFailure(s)
    finishYear(s)
    const r = yearReport(s)
    assert.equal(r.downByCause.rack, 4)
    near(r.downtimeH, 4, 1e-9)
    const separate = createYear({ sameRack: false, app: { count: 2, availability: 1, capacityShare: 1 }, entry: 1, db: 1 })
    rackFailure(separate)
    finishYear(separate)
    assert.equal(yearReport(separate).downtimeH, 0, 'servers in different racks: the survivor carries the load')
    near(formulaAvailability(resolveYearConfig({ sameRack: true })), formulaAvailability(resolveYearConfig()) * 0.999, 1e-12)
  })
  test('„Loša konfiguracija” takes every app server down for 1 h – redundancy does not help', () => {
    const s = createYear({ app: { count: 6, availability: 1, capacityShare: 1 }, entry: 1, db: 1, detectionMin: 0 })
    stepYear(s, 0.01)
    badConfig(s)
    finishYear(s)
    const r = yearReport(s)
    assert.equal(r.downByCause.config, 1)
    near(r.downtimeH, 1, 1e-9)
  })
  test('detection time adds downtime per app-server failure', () => {
    const a = runYear({ seed: 7, entry: 1, db: 1, app: { count: 3, availability: 0.98, capacityShare: 1 }, detectionMin: 0 })
    const b = runYear({ seed: 7, entry: 1, db: 1, app: { count: 3, availability: 0.98, capacityShare: 1 }, detectionMin: 30 })
    assert.ok(b.downByCause.detection > 0 && a.downByCause.detection === 0)
    near(b.downtimeH - a.downtimeH, b.downByCause.detection, 1e-6)
  })
  test('edge cases: no app servers → down all year; perfect parts → 0 downtime; garbage inputs are clamped', () => {
    near(runYear({ app: { count: 0, availability: 0.99, capacityShare: 1 } }).availability, 0, 1e-12)
    assert.equal(runYear({ entry: 1, db: 1, app: { count: 2, availability: 1, capacityShare: 1 } }).downtimeH, 0)
    const c = resolveYearConfig({ entry: NaN, db: 7, mttrH: -3, app: { count: NaN, availability: -1, capacityShare: 0 } })
    assert.equal(c.entry, 0.9999)
    assert.equal(c.db, 1)
    assert.equal(c.mttrH, 1)
    assert.equal(c.app.count, 2)
    assert.equal(c.app.availability, 0)
    assert.equal(c.app.capacityShare, 0.7)
  })
  test('the year renders in ~10 s of step() time, deterministically', () => {
    const s = createYear({ seed: 3 })
    for (let i = 0; i < 600; i++) stepYear(s, 1 / 60)
    within(s.hour, HOURS_PER_YEAR - 1, HOURS_PER_YEAR)
    stepYear(s, 1)
    assert.ok(s.done)
    stepYear(s, NaN)
    const again = createYear({ seed: 3 })
    finishYear(again)
    assert.equal(yearReport(again).downtimeH, yearReport(s).downtimeH)
    assert.ok(s.events.length <= 50)
    assert.equal(hourLabel(24 * 36 + 12), 'dan 37 · 12:00')
  })
})
