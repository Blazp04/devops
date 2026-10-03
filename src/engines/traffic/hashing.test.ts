/** hash mod N vs consistent hashing (sim-models §B "Key math for the hashing demo"). */
import { assignKeys, buildRing, deriveSeed, hash32, hashMod, keyShares, movedFraction, ringLookup } from './hashing.ts'
import { assert, describe, near, test, within } from './testing.ts'

const keys = Array.from({ length: 20_000 }, (_, i) => `user-${i}`)
const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}` }))

describe('hash mod N', () => {
  test('3 → 2 servers: 2/3 of keys move; 3 → 4: 3/4 move', () => {
    near(movedFraction(assignKeys(keys, nodes(3), 'mod'), assignKeys(keys, nodes(2), 'mod')), 2 / 3, 0.015)
    near(movedFraction(assignKeys(keys, nodes(3), 'mod'), assignKeys(keys, nodes(4), 'mod')), 3 / 4, 0.015)
  })
  test('edge cases: n = 0 → -1, no nodes → null assignments, empty key set → 0 moved', () => {
    assert.equal(hashMod('x', 0), -1)
    assert.equal(hashMod('x', NaN), -1)
    assert.equal(assignKeys(['a'], [], 'mod').get('a'), null)
    assert.equal(movedFraction(new Map(), new Map()), 0)
  })
})

describe('consistent hashing (ring with virtual nodes)', () => {
  test('3 → 2 servers: only the removed server’s keys move (≈1/3)', () => {
    const before = assignKeys(keys, nodes(3), 'ring')
    const after = assignKeys(keys, nodes(3).slice(0, 2), 'ring')
    for (const [k, v] of before) if (v !== 's3') assert.equal(after.get(k), v, `key ${k} moved although its server survived`)
    within(movedFraction(before, after), 0.25, 0.42, 'moved')
  })
  test('3 → 4 servers: ≈1/4 of keys move, all of them to the new server', () => {
    const before = assignKeys(keys, nodes(3), 'ring')
    const after = assignKeys(keys, nodes(4), 'ring')
    for (const [k, v] of after) if (before.get(k) !== v) assert.equal(v, 's4')
    within(movedFraction(before, after), 0.17, 0.33, 'moved')
  })
  test('virtual nodes even out the ring (σ of a share ≈ 0.027 at 100, ≈ 0.009 at 1000); weights 1:2:4 give ≈1/7, 2/7, 4/7', () => {
    const even = keyShares(assignKeys(keys, nodes(3), 'ring'))
    for (const sh of Object.values(even)) near(sh, 1 / 3, 0.08, '100 vnodes: within ±25 % of fair')
    const fine = keyShares(assignKeys(keys, nodes(3), 'ring', 1000))
    for (const sh of Object.values(fine)) near(sh, 1 / 3, 0.03, '1000 vnodes: within ±10 % of fair')
    const one = keyShares(assignKeys(keys, nodes(3), 'ring', 1))
    assert.ok(Math.max(...Object.values(one)) - Math.min(...Object.values(one)) > 0.1, '1 point per server is visibly uneven')
    const w = keyShares(assignKeys(keys, [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 4 }], 'ring'))
    near(w.a, 1 / 7, 0.04)
    near(w.b, 2 / 7, 0.05)
    near(w.c, 4 / 7, 0.05)
  })
  test('empty ring → null; lookups are deterministic', () => {
    assert.equal(ringLookup(buildRing([]), 'x'), null)
    const r = buildRing(nodes(3))
    assert.equal(ringLookup(r, 'user-7'), ringLookup(buildRing(nodes(3)), 'user-7'))
  })
})

describe('hash function', () => {
  test('uint32, deterministic, spreads; derived seeds differ', () => {
    const h = hash32('klopa')
    assert.equal(h, hash32('klopa'))
    assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32)
    assert.notEqual(hash32('user-1'), hash32('user-2'))
    assert.notEqual(deriveSeed(42, 1), deriveSeed(42, 2))
    assert.notEqual(deriveSeed(42, 1), 42)
  })
})
