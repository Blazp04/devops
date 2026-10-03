/**
 * E5 „Tko vidi?” – the asset side of the threat model: where copies of a secret's value (or its ciphertext,
 * or a reference to it) live right now, how each copy is protected, and which actors read a still-valid value
 * through it. Pure: built on the state and on evaluate.ts. Used for „Gdje tajna živi” (L16) and the
 * „where the plaintext lives” grid / pipeline highlighting (L23).
 */
import { APPROACHES, PROVIDERS } from './constants.ts'
import { evaluateAccess, plainReason, verdictOf } from './evaluate.ts'
import { findSecret, isUsable, runningConsumers, uniqSorted } from './shared.ts'
import type { AccessState, Asset, AssetForm, AssetKind, GitCommit, GitForm, GraphNodeId, StoreKind } from './types.ts'

/** Graph node of each asset kind (for highlighting the pipeline diagram). */
export const ASSET_NODE: Record<AssetKind, GraphNodeId> = {
  'laptop-file': 'laptop',
  memory: 'memory',
  'git-plain': 'git',
  'git-base64': 'git',
  'git-sealed': 'git',
  'git-sops': 'git',
  'git-reference': 'git',
  'ci-log': 'ci-log',
  image: 'registry',
  redis: 'redis',
  store: 'store',
  'sealed-object': 'etcd',
  etcd: 'etcd',
  'pod-env': 'pod',
  'pod-file': 'pod',
  log: 'logs',
}

/** Left-to-right pipeline order (laptop → Git → CI → registry → Argo CD → store/API/etcd → Pod → logs). */
export const ASSET_ORDER: readonly AssetKind[] = Object.keys(ASSET_NODE) as AssetKind[]

const STORE_NAME: Record<StoreKind, string> = { openbao: 'OpenBao', vault: 'Vault', cloud: 'upravitelj tajni u oblaku' }

function files(cs: GitCommit[]): string {
  return [...new Set(cs.map((c) => c.file))].join(', ')
}

/**
 * Every place that holds the secret right now, in pipeline order. `form` tells how it is stored there:
 * `plain` (readable as is – including etcd with `identity`, where base64 is only the API representation),
 * `base64` (readable with `base64 -d`), `encrypted`, or `reference` (no value at all).
 * Unknown secret → [].
 */
export function assetsOf(state: AccessState, secretId: string = state.config.focusSecretId): Asset[] {
  const s = findSecret(state, secretId)
  if (!s) return []
  const map = new Map<AssetKind, Asset>()
  const put = (kind: AssetKind, label: string, form: AssetForm, versions: (number | null | undefined)[], protection: string | null) => {
    const vs = uniqSorted(versions)
    map.set(kind, { id: kind, kind, node: ASSET_NODE[kind], label, form, versions: vs, valid: vs.some((v) => isUsable(s, v)), protection, readers: [], visibleReaders: [] })
  }

  // laptop and memory
  const laptop = state.laptopFiles.filter((f) => f.secretId === s.id)
  if (laptop.length)
    put(
      'laptop-file',
      'lokalni secret.yaml (stringData) na laptopu',
      'plain',
      laptop.map((f) => f.version),
      state.config.laptop.diskEncrypted ? 'šifrirani disk laptopa' : 'nema zaštite: disk laptopa nije šifriran',
    )
  const known = state.exEmployeeKnows.filter((k) => k.secretId === s.id)
  if (known.length) put('memory', 'sjećanje bivšeg člana tima', 'plain', known.map((k) => k.version), 'zatvara ga samo rotacija')

  // Git history (clones keep everything, so removed commits count too)
  const commits = state.commits.filter((c) => c.secretId === s.id)
  const of = (forms: GitForm[]) => commits.filter((c) => forms.includes(c.form))
  const removedNote = (cs: GitCommit[]) => (cs.some((c) => c.removedFromBranch) ? '; commit je uklonjen iz grane, ali ostaje u svakom klonu' : '')
  const plain = of(['dockerfile-env', 'manifest-env', 'configmap'])
  if (plain.length) put('git-plain', `${files(plain)} u povijesti Gita`, 'plain', plain.map((c) => c.version), `nema zaštite: vrijednost je običan tekst${removedNote(plain)}`)
  const b64 = of(['base64'])
  if (b64.length)
    put('git-base64', `${files(b64)} u povijesti Gita (base64)`, 'base64', b64.map((c) => c.version), `nema zaštite: base64 je kodiranje, ne šifriranje${removedNote(b64)}`)
  const sealed = of(['sealed'])
  if (sealed.length) {
    const leaked = new Set(state.leakedKeyIds)
    const anyLeaked = sealed.some((c) => c.keyId !== null && leaked.has(c.keyId))
    put(
      'git-sealed',
      `${files(sealed)} u Gitu (SealedSecret)`,
      'encrypted',
      sealed.map((c) => c.version),
      anyLeaked
        ? 'privatni ključ kontrolera je procurio – šifrat se može otpečatiti'
        : 'šifrirano javnim ključem kontrolera; privatni ključ je samo u klasteru (Secret u kube-system – zaštićen kao i ostali Secreti u bazi etcd)',
    )
  }
  const sops = of(['sops'])
  if (sops.length) put('git-sops', `${files(sops)} u Gitu (SOPS)`, 'encrypted', sops.map((c) => c.version), 'šifrirane vrijednosti (age); ključ nije u repozitoriju')
  const refs = of(['reference'])
  if (refs.length) put('git-reference', `${files(refs)} u Gitu (referenca)`, 'reference', [], 'u Gitu je samo adresa vrijednosti u trezoru')

  // CI log, image, Argo CD cache, store
  const ci = state.ciLogs.filter((l) => l.secretId === s.id)
  if (ci.length) put('ci-log', 'CI log', 'plain', ci.map((l) => l.version), 'nema zaštite')
  const imgs = state.images.filter((i) => i.secretId === s.id)
  if (imgs.length) put('image', `slika u registru (ENV ${s.key})`, 'plain', imgs.map((i) => i.version), 'nema zaštite: ENV se vidi u konfiguraciji i slojevima slike')
  const redis = verdictOf(state, 'argocd-redis', s.id)
  const redisVs = [...redis.paths, ...redis.stalePaths].flatMap((p) => p.versions)
  if (redisVs.length) put('redis', 'generirani manifesti u Redisu (Argo CD)', 'plain', redisVs, 'nešifrirano u predmemoriji Argo CD-a')
  if (APPROACHES[s.approach].usesStore && s.storeVersion !== null)
    put(
      'store',
      `${STORE_NAME[state.config.store.kind]} (vanjski trezor)`,
      'encrypted',
      [s.storeVersion],
      state.config.store.available ? 'trezor: pristup samo uz identitet radnog opterećenja i pravila trezora' : 'trezor je trenutačno nedostupan',
    )

  // cluster: SealedSecret object and the carrier in etcd
  if (s.sealedObj)
    put(
      'sealed-object',
      `SealedSecret ${s.name} u klasteru`,
      'encrypted',
      [s.sealedObj.version],
      state.leakedKeyIds.includes(s.sealedObj.keyId)
        ? 'šifrat zapečaćen ključem koji je procurio; kontroler iz njega stvara običan Secret'
        : 'šifrat; kontroler iz njega stvara običan Secret',
    )
  const obj = s.obj
  if (obj.exists && obj.kind !== null && obj.version !== null) {
    const info = PROVIDERS[obj.storedProvider]
    const what = obj.kind === 'Deployment' ? 'Deployment (env u specifikaciji Poda)' : `${obj.kind} ${s.name}`
    let protection: string
    if (obj.storedProvider === 'identity') {
      const why = plainReason(state, obj.kind)
      protection =
        why === 'not-rewritten'
          ? 'zapisano prije uključivanja šifriranja – nešifrirano dok se ponovno ne zapiše'
          : why === 'out-of-scope'
            ? 'nešifrirano: ta vrsta objekta nije na popisu za šifriranje u mirovanju'
            : obj.kind === 'Secret'
              ? 'nešifrirano (identity); base64 je samo prikaz u API-ju'
              : 'nešifrirano (identity)'
    } else if (info.keyLocation === 'control-plane-file') protection = `šifrirano (${info.label}); ključ je u datoteci na upravljačkoj ravnini`
    else protection = 'šifrirano (KMS v2); ključ (KEK) je u vanjskom KMS-u'
    put('etcd', `${what} u bazi etcd`, obj.storedProvider === 'identity' ? 'plain' : 'encrypted', [obj.version], protection)
  }

  // running Pods and logs
  const running = runningConsumers(state, s.id)
  const envVs = running.map((p) => p.env[s.id])
  if (envVs.some((v) => v !== null && v !== undefined))
    put('pod-env', `varijabla okruženja ${s.key} u Podovima`, 'plain', envVs, 'vidljiva svim procesima u kontejneru; može završiti u logovima i ispisima memorije')
  const fileVs = running.map((p) => p.file[s.id])
  if (fileVs.some((v) => v !== null && v !== undefined)) {
    // Secret volumes (and the CSI secrets-store) are tmpfs (emptyDir medium Memory); ConfigMap volumes are a plain
    // emptyDir on the node's disk (kubelet pkg/volume/configmap vs pkg/volume/secret)
    const carrier = s.approach === 'csi' ? 'csi' : APPROACHES[s.approach].objKind === 'ConfigMap' ? 'configmap' : 'secret'
    put(
      'pod-file',
      carrier === 'csi' ? 'tmpfs u Podu (CSI driver)' : carrier === 'configmap' ? 'montirana datoteka u Podu (ConfigMap)' : 'montirana datoteka u Podu (Secret)',
      'plain',
      fileVs,
      carrier === 'configmap'
        ? 'datoteka na disku čvora (/var/lib/kubelet) – nije tmpfs; čita je kontejner koji je montira'
        : carrier === 'csi'
          ? 'tmpfs (CSI driver) na čvoru – ne zapisuje se na disk; čita je kontejner koji je montira'
          : 'tmpfs (RAM) na čvoru – ne zapisuje se na disk; čita je kontejner koji je montira',
    )
  }
  const logs = [...state.podLogs, ...state.centralLogs].filter((l) => l.secretId === s.id)
  if (logs.length) put('log', 'logovi (kubectl logs i sustav za logove)', 'plain', logs.map((l) => l.version), 'nema zaštite')

  // who reads a valid value through which asset (a copy that holds only revoked values has no readers)
  const visible = new Set(state.config.visibleActors)
  for (const v of evaluateAccess(state, s.id).verdicts) {
    if (!v.reads) continue
    for (const p of v.paths) {
      for (const k of p.assets) {
        const a = map.get(k)
        if (a && a.valid && !a.readers.includes(v.actorId)) {
          a.readers.push(v.actorId)
          if (visible.has(v.actorId)) a.visibleReaders.push(v.actorId)
        }
      }
    }
  }
  return ASSET_ORDER.filter((k) => map.has(k)).map((k) => map.get(k) as Asset)
}

/** Assets that hold a still-valid value in readable form (plain or base64) – „where the plaintext lives”. */
export function plaintextAssets(state: AccessState, secretId: string = state.config.focusSecretId): Asset[] {
  return assetsOf(state, secretId).filter((a) => a.valid && (a.form === 'plain' || a.form === 'base64'))
}
