/**
 * E6 – regression tests for the post-lecture review: PRESETS.l24FullDetailed (ConfigMap, ExternalSecret klopa-db,
 * POSTGRES_PASSWORD + volumeMount on the StatefulSet) is additive; l24Full is unchanged.
 * Run: node --test src/engines/gitops/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DB_SECRET, FILES, PRESETS, SMS, advance, appView, createGitOps, manifestToYaml, repoFiles } from './index.ts'

test('l24Full is unchanged: no promo ConfigMap, no klopa-db ExternalSecret, no extra store keys', () => {
  const s = createGitOps(PRESETS.l24Full)
  const paths = repoFiles(s).map((f) => f.path)
  assert.ok(!paths.includes(FILES.promo) && !paths.includes(FILES.dbExternalSecret))
  assert.deepEqual(Object.keys(s.secrets.store.values), [SMS.remoteKey])
  assert.ok(!Object.keys(PRESETS.l24Full.extraFiles[FILES.dbStatefulSet].fields).some((k) => k.includes('/env/') || k.includes('volumeMounts')))
})

test('l24FullDetailed: the lecture YAML – ConfigMap, ExternalSecret klopa-db, POSTGRES_PASSWORD and the data mount; Synced + Healthy', () => {
  const s = createGitOps(PRESETS.l24FullDetailed)
  const paths = repoFiles(s).map((f) => f.path)
  for (const p of [FILES.promo, FILES.dbExternalSecret, FILES.dbStatefulSet]) assert.ok(paths.includes(p), p)
  assert.equal(s.secrets.store.values[DB_SECRET.remoteKey], DB_SECRET.initialValue)
  assert.equal(s.secrets.store.values[SMS.remoteKey], SMS.initialValue)
  const yaml = manifestToYaml(PRESETS.l24FullDetailed.extraFiles[FILES.dbStatefulSet])
  assert.match(yaml, /- name: POSTGRES_PASSWORD\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: klopa-db\n\s+key: password/)
  assert.match(yaml, /volumeMounts:\n\s+- name: podatci\n\s+mountPath: \/var\/lib\/postgresql/)
  advance(s, 60)
  const v = appView(s)
  assert.equal(v.sync, 'Synced')
  assert.equal(v.health, 'Healthy')
  assert.ok(s.cluster.objects['ExternalSecret/klopa-db'])
})

test('storeValues: extra string keys only; the SMS key always comes from SMS', () => {
  const s = createGitOps({ storeValues: { 'a/b': 'x', [SMS.remoteKey]: 'nope', bad: 3 as unknown as string } })
  assert.deepEqual(s.secrets.store.values, { 'a/b': 'x', [SMS.remoteKey]: SMS.initialValue })
  assert.deepEqual(s.secrets.store.versions, { 'a/b': 1, [SMS.remoteKey]: 1 })
})
