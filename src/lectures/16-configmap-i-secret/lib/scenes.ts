/** Static data for the smaller scenes (one image / three environments, where the secret lives). */
import { assetsOf, createAccessPreset, evaluateAccess, setEncryption } from '../../../engines/access/index.ts'
import type { Provider } from '../../../engines/access/index.ts'

export const ENVS = [
  // DB_HOST is a Service name the Pod can reach (inside a Pod, localhost is the Pod itself – L09)
  { id: 'dev', title: 'razvoj (lokalni klaster)', host: 'postgres', short: 'postgres', lines: ['DB_HOST:', 'postgres', 'LOG_LEVEL: debug', 'VEGE_MENI: "da"'] },
  { id: 'staging', title: 'klopa-staging', host: 'postgres.klopa-staging', short: 'postgres.klopa-st…', lines: ['DB_HOST:', 'postgres.klopa-staging', 'LOG_LEVEL: info', 'VEGE_MENI: "da"'] },
  { id: 'prod', title: 'klopa (produkcija)', host: 'postgres.klopa', short: 'postgres.klopa', lines: ['DB_HOST:', 'postgres.klopa', 'LOG_LEVEL: warning', 'VEGE_MENI: "ne"'] },
] as const

export interface ProviderStep {
  provider: Provider
  /** engine's description of how etcd holds the Secret („nešifrirano (identity); base64 je samo prikaz u API-ju”) */
  protection: string
  etcdThief: boolean
  diskThief: boolean
}

/**
 * „Gdje tajna živi”: what the engine says about the Secret in etcd for each provider on the ladder
 * (identity → secretbox → KMS v2), so the explainer and the flagship never disagree.
 */
export function providerLadder(): ProviderStep[] {
  const providers: Provider[] = ['identity', 'secretbox', 'kms-v2']
  return providers.map((p) => {
    const s = createAccessPreset('l16')
    setEncryption(s, p)
    const etcd = assetsOf(s).find((a) => a.kind === 'etcd')
    const red = new Set(evaluateAccess(s).red)
    return { provider: p, protection: etcd?.protection ?? '', etcdThief: red.has('etcd-backup-thief'), diskThief: red.has('cp-disk-thief') }
  })
}
