/** „Uređivač config repozitorija”: which fields of which file the flagship lets students change (JSON pointers of E6). */
import * as G from '../../../engines/gitops/index.ts'
import { API_REPO, CPU_LIMIT } from './model.ts'

export type FieldKind = 'text' | 'number' | 'select' | 'restart'

export interface EditableField {
  ptr: string
  /** YAML path as students read it */
  label: string
  kind: FieldKind
  options?: string[]
}

export const EDITABLE: Record<string, EditableField[]> = {
  [G.FILES.deployment]: [
    { ptr: G.PATHS.image, label: 'containers[0].image', kind: 'select', options: [`${API_REPO}:2.0.2`, `${API_REPO}:2.0.1`, `${API_REPO}:2.0.3`] },
    { ptr: G.PATHS.livenessPath, label: 'livenessProbe.httpGet.path', kind: 'select', options: ['/healthz', '/ready', '/ready-db'] },
    { ptr: G.PATHS.livenessPeriod, label: 'livenessProbe.periodSeconds', kind: 'number' },
    { ptr: G.PATHS.readinessPath, label: 'readinessProbe.httpGet.path', kind: 'select', options: ['/ready', '/healthz', '/ready-db'] },
    { ptr: G.PATHS.envSecretKey(1), label: 'env[SMS_API_KLJUC].secretKeyRef.key', kind: 'text' },
    { ptr: G.PATHS.cpuRequest, label: 'resources.requests.cpu', kind: 'text' },
    { ptr: CPU_LIMIT, label: 'resources.limits.cpu', kind: 'text' },
    { ptr: G.PATHS.restartedAt, label: 'annotations: restartedAt', kind: 'restart' },
  ],
  [G.FILES.service]: [{ ptr: G.PATHS.serviceSelector, label: 'spec.selector.app', kind: 'text' }],
  [G.FILES.hpa]: [
    { ptr: G.PATHS.hpaMin, label: 'spec.minReplicas', kind: 'number' },
    { ptr: G.PATHS.hpaMax, label: 'spec.maxReplicas', kind: 'number' },
  ],
  [G.FILES.httpRoute]: [
    { ptr: G.PATHS.routePath(0), label: 'rules[0].matches[0].path.value', kind: 'text' },
    { ptr: G.PATHS.routeBackend(0), label: 'rules[0].backendRefs[0].name', kind: 'text' },
  ],
  [G.FILES.workerDeployment]: [
    { ptr: G.PATHS.replicas, label: 'spec.replicas', kind: 'number' },
    { ptr: G.PATHS.memoryLimit, label: 'resources.limits.memory', kind: 'text' },
  ],
}

/** Short names for the file list. */
export const FILE_LABEL: Record<string, string> = {
  [G.FILES.deployment]: 'klopa-api/deployment.yaml',
  [G.FILES.service]: 'klopa-api/service.yaml',
  [G.FILES.hpa]: 'klopa-api/hpa.yaml',
  [G.FILES.httpRoute]: 'gateway/httproute.yaml',
  [G.FILES.workerDeployment]: 'klopa-worker/deployment.yaml',
}

export const EDITABLE_FILES = Object.keys(EDITABLE)

/** Current value of a field in Git HEAD (string form, '' when absent). */
export function headValue(git: G.GitOpsState, path: string, ptr: string): string {
  const c = G.findCommit(git.repo, git.repo.head)
  const v = c?.files[path]?.fields[ptr]
  return v === undefined || v === null ? '' : String(v)
}

/** Turn the draft into a `set` patch: only changed fields; '' removes a field; numbers stay numbers. */
export function draftToSet(git: G.GitOpsState, path: string, draft: Record<string, string>): Record<string, G.FieldValue | null> {
  const set: Record<string, G.FieldValue | null> = {}
  for (const f of EDITABLE[path] ?? []) {
    if (!(f.ptr in draft)) continue
    const now = headValue(git, path, f.ptr)
    const v = draft[f.ptr].trim()
    if (v === now) continue
    if (v === '') set[f.ptr] = null
    else if (f.kind === 'number') {
      const n = Number(v.replace(',', '.'))
      set[f.ptr] = Number.isFinite(n) ? n : v
    } else set[f.ptr] = v
  }
  return set
}

/** YAML of a file at HEAD (E6's kubectl-style renderer). */
export function fileYaml(git: G.GitOpsState, path: string): string {
  const c = G.findCommit(git.repo, git.repo.head)
  const m = c?.files[path]
  return m ? G.manifestToYaml(m) : ''
}
