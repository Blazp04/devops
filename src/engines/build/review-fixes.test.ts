/**
 * E4 „Tvornica” – regression tests for the post-lecture review: opt-in file ownership / USER check for writes in a
 * running container (writeInContainerAs). writeInContainer itself is unchanged. Run: node --test src/engines/build/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNow, createBuildLab, imagePathOwner, runContainer, writeInContainer, writeInContainerAs } from './index.ts'

test('writeInContainerAs: USER 10001 cannot write into root-owned /app; root (docker exec -u root) and /tmp can', () => {
  const s = createBuildLab({ preset: 'api-dobar', warm: true })
  buildNow(s)
  const img = s.image!
  assert.equal(img.config.user, '10001')
  assert.equal(img.dirOwners?.['/app'], 'root', 'WORKDIR /app was created before USER')
  assert.deepEqual(imagePathOwner(img, '/app/manage.py'), { owner: 'root', kind: 'file' }, 'COPY without --chown → root')
  const c = runContainer(s)!
  const denied = writeInContainerAs(s, c.id, '/app/zapis.log')
  assert.deepEqual(denied, { ok: false, error: 'sh: 1: cannot create /app/zapis.log: Permission denied', user: '10001' })
  assert.equal(c.writable.length, 0, 'a refused write leaves the writable layer alone')
  assert.equal(writeInContainerAs(s, c.id, '/app/manage.py').ok, false, 'editing a root-owned image file is refused too')
  assert.deepEqual(writeInContainerAs(s, c.id, '/tmp/zapis.log'), { ok: true, error: null, user: '10001' })
  assert.deepEqual(writeInContainerAs(s, c.id, '/app/zapis.log', 0.1, { user: 'root' }), { ok: true, error: null, user: 'root' })
  assert.deepEqual(
    c.writable.map((w) => [w.path, w.copyUp]),
    [
      ['/tmp/zapis.log', false],
      ['/app/zapis.log', false],
    ],
  )
  assert.equal(writeInContainerAs(s, 'c99').ok, false)
})

test('writeInContainerAs: a root image writes anywhere; writeInContainer never checks ownership', () => {
  const s = createBuildLab({ preset: 'api-los' })
  buildNow(s)
  assert.equal(s.image!.config.user, 'root')
  const c = runContainer(s)!
  assert.equal(writeInContainerAs(s, c.id, '/app/zapis.log').ok, true)
  const d = createBuildLab({ preset: 'api-dobar' })
  buildNow(d)
  const dc = runContainer(d)!
  assert.equal(writeInContainer(d, dc.id, '/app/zapis.log'), true, 'the unchecked call keeps its old behaviour')
})

test('dirOwners does not change the image digest', () => {
  const a = createBuildLab({ preset: 'api-dobar' })
  const b = createBuildLab({ preset: 'api-dobar' })
  buildNow(a)
  buildNow(b)
  assert.equal(a.image!.digest, b.image!.digest)
  assert.ok(!a.image!.manifestJson.includes('dirOwners') && !a.image!.configJson.includes('dirOwners'))
})
