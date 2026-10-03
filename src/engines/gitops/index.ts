/**
 * E6 „Git ↔ klaster” – Argo CD / GitOps engine (pure TypeScript, no React/DOM).
 * Lectures 22, 23, 24. See README.md for the model, the simplifications and the validated numbers.
 */
export type * from './types.ts'
export {
  DT,
  TIMINGS,
  POD_TIMINGS,
  PATHS,
  KLOPA,
  FILES,
  TRUSTED_KEYS,
  DEFAULT_CONFIG,
  SYNC_RETRY_DEFAULTS,
  AUTO_SYNC_DEFAULT_RETRY_LIMIT,
  HEALTH_ORDER,
  CRASH_BACKOFF,
  RETRY_PRESETS,
  RETRY_LABELS,
  REAL_FACTOR,
  API_VERSIONS,
  POD_QUOTA,
} from './constants.ts'
export type { TimingValue, RetryPresetId } from './constants.ts'
export {
  PRESETS,
  DEFAULT_POLICY,
  DEFAULT_IMAGES,
  KLOPA_SERVICE_IMAGES,
  SMS,
  resolveConfig,
  workloadManifest,
  deploymentManifest,
  serviceManifest,
  hpaManifest,
  httpRouteManifest,
  gatewayManifest,
  plainSecretManifest,
  sealedSecretManifest,
  externalSecretManifest,
  imageRef,
  DB_SECRET,
  dbExternalSecretManifest,
} from './config.ts'
export type { GitOpsConfig, SecretsApproach, MigrationMode, ImageSpec } from './config.ts'
export { createGitOps, step, advance, addImage, sealValue, sopsEncrypt } from './engine.ts'
export * from './actions.ts'
export * from './selectors.ts'
export { selfHealDelay, isIgnored, renderTarget } from './argocd.ts'
export type { Rendered } from './argocd.ts'
export {
  deploymentHealth,
  objectHealth,
  hpaHealth,
  imageInfo,
  hasHealthCheck,
  validateManifest,
  setExternalWorkload,
  setExternalWorkloadStatus,
  reportExternalSpec,
  reportExternalChange,
  drainLiveChanges,
  setHpaDesired,
  deploymentSpec,
  externalPods,
  controllerStatusOf,
} from './cluster.ts'
export { fenceposts, parseImage, templateHash, fieldLabel, dottedPath, humanDuration, plural } from './util.ts'
export { headCommit, findCommit, checkSourceIntegrity, filesAt } from './git.ts'
