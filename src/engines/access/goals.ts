/**
 * E5 „Tko vidi?” – tested goal selectors for the L16 / L23 flagships, the worst-case rotation estimate
 * (sim and real time) and the side-by-side approach comparison („Ostale mogućnosti”). Pure: never mutates the state
 * it is given (compareApproaches builds its own throw-away states).
 */
import { achievedAt, createAccess, eyeSummary, setApproach, versionInGit } from './access.ts'
import { plaintextAssets } from './assets.ts'
import { APPROACHES, PRESETS, ROTATION_GOAL_REAL_S, TIMING, fmtDuration } from './constants.ts'
import { evaluateAccess, gitExposesValidValue } from './evaluate.ts'
import { effectiveConsume, findSecret } from './shared.ts'
import type { AccessConfigInput, AccessState, ActorId, Approach, AssetKind, RotationRecord } from './types.ts'

/* ---------- Worst-case rotation time ---------- */

export interface EstimatePart {
  /** Croatian: what the rotation waits for in this stage */
  what: string
  /** worst-case simulated seconds */
  sim: number
  /** worst-case real seconds (sim × the mechanism's compression, see TimingValue.ratio) */
  real: number
}

export interface RotationEstimate {
  /** stages on the critical path, in order (delivery, then propagation to the Pods) */
  parts: EstimatePart[]
  /** sum of the parts (manual actions counted as done at once); null when the rotation is blocked */
  simWorst: number | null
  realWorst: number | null
  /** Croatian: manual actions the rotation needs (empty = fully automatic) */
  needs: string[]
  /** Croatian reason the rotation cannot finish right now (store down, refreshInterval 0 without force-sync) */
  blocked: string | null
  /** Croatian manual actions that would make it faster (force-sync, hard refresh) – not required */
  shortcuts: string[]
  /** realWorst < ROTATION_GOAL_REAL_S (5 min) and nothing needs doing by hand */
  automaticUnder5Min: boolean
  /** Croatian badge: „najviše 28 s (sim) ≈ 4,5 min stvarno” */
  label: string
}

function part(what: string, sim: number, ratio: number): EstimatePart {
  return { what, sim, real: sim * ratio }
}

/**
 * Worst case for a rotation of the secret (default: focused) with the CURRENT configuration – delivery (kubectl,
 * Argo CD poll + jitter / webhook / manual Sync, unseal, ESO refreshInterval, CI build) followed by propagation
 * (kubelet sync, CSI rotation poll, a rollout of new Pods), in sim and real seconds. Use it to explain the
 * „< 5 min” goal before rotating; judge a finished rotation with rotationStatus().realElapsed.
 */
export function rotationEstimate(state: AccessState, secretId: string = state.config.focusSecretId): RotationEstimate {
  const s = findSecret(state, secretId)
  const cfg = state.config
  const T = cfg.timing
  const parts: EstimatePart[] = []
  const needs: string[] = []
  const shortcuts: string[] = []
  let blocked: string | null = null
  if (!s) return { parts, simWorst: null, realWorst: null, needs, blocked: 'nepoznata tajna', shortcuts, automaticUnder5Min: false, label: '' }

  // 1) delivery: from the new value to the carrier the Pods read
  const gitDelivered = ['manifest-env', 'configmap', 'git-secret', 'sops', 'sealed'].includes(s.approach)
  const argo = () => {
    if (cfg.delivery !== 'gitops') return
    if (!cfg.argo.autoSync) {
      needs.push('Sync u Argo CD-u (automatska sinkronizacija je isključena)')
      return
    }
    if (cfg.argo.webhook) parts.push(part('webhook → Argo CD', T.argoWebhook, TIMING.argoWebhook.ratio))
    else parts.push(part('Argo CD provjerava Git (interval + odmak)', T.argoPoll + T.argoJitter, TIMING.argoPoll.ratio))
  }
  if (s.approach === 'image') {
    parts.push(part('CI gradi novu sliku', T.imageBuild, TIMING.imageBuild.ratio))
    argo()
  } else if (gitDelivered) {
    argo()
    if (s.approach === 'sealed') parts.push(part('kontroler otpečati SealedSecret', T.unseal, TIMING.unseal.ratio))
  } else if (s.approach === 'eso') {
    if (!cfg.store.available) blocked = 'trezor je nedostupan'
    else if (T.esoRefresh <= 0) {
      needs.push('force-sync (refreshInterval: 0)')
    } else {
      parts.push(part(`ESO refreshInterval (${fmtDuration(T.esoRefresh)})`, T.esoRefresh, TIMING.esoRefresh.ratio))
      shortcuts.push('force-sync (ESO odmah osvježi Secret)')
    }
  } else if (s.approach === 'csi') {
    if (!cfg.store.available) blocked = 'trezor je nedostupan'
  } else if (s.approach === 'avp') {
    // argocd-vault-plugin does not watch the store: Argo CD regenerates the manifests only when its cache expires
    // (24 h) – or at once on a hard refresh
    if (!cfg.store.available) blocked = 'trezor je nedostupan'
    else {
      parts.push(part('istek predmemorije Argo CD-a (argocd-vault-plugin ne prati trezor)', T.argoCacheExpiry, TIMING.argoCacheExpiry.ratio))
      argo()
      shortcuts.push('hard refresh u Argo CD-u (manifest se odmah ponovno generira)')
    }
  }

  // 2) propagation: worst consumer Deployment
  let prop: EstimatePart | null = null
  const restart = 'kubectl rollout restart (novi Podovi)'
  for (const w of state.workloads) {
    if (!w.secretIds.includes(s.id) || w.replicas === 0) continue
    const mode = effectiveConsume(s.approach, w.consume)
    let p: EstimatePart | null = null
    let need: string | null = null
    if (s.approach === 'image' || s.approach === 'manifest-env') p = part(`uvođenje novih Podova (${w.name})`, w.replicas * T.podStart, TIMING.podStart.ratio)
    else if (s.approach === 'csi') {
      if (cfg.csi.rotation && mode === 'volume' && cfg.appRereadsFiles) p = part('CSI driver provjerava trezor', T.csiRotationPoll, TIMING.csiRotationPoll.ratio)
      else need = cfg.csi.rotation ? restart : `${restart} – rotacija u CSI driveru je isključena`
    } else if (mode === 'volume') {
      if (cfg.appRereadsFiles) p = part('kubelet osvježi montiranu datoteku', T.kubeletSync, TIMING.kubeletSync.ratio)
      else need = `${restart} – aplikacija ne čita datoteku ponovno`
    } else need = mode === 'subPath' ? `${restart} – subPath se nikad ne osvježava` : `${restart} – env se čita samo pri pokretanju`
    if (need !== null) {
      if (!needs.includes(need)) needs.push(need)
      p = part(`novi Podovi nakon restarta (${w.name})`, w.replicas * T.podStart, TIMING.podStart.ratio)
    }
    if (p && (!prop || p.real > prop.real)) prop = p
  }
  if (prop) parts.push(prop)

  const simWorst = blocked ? null : Math.round(parts.reduce((a, p) => a + p.sim, 0) * 10) / 10
  const realWorst = blocked ? null : Math.round(parts.reduce((a, p) => a + p.real, 0) * 10) / 10
  const automaticUnder5Min = realWorst !== null && needs.length === 0 && realWorst < ROTATION_GOAL_REAL_S
  const label =
    simWorst === null || realWorst === null
      ? `zastoj: ${blocked ?? ''}`
      : `najviše ${fmtDuration(simWorst)} (sim) ≈ ${fmtDuration(realWorst)} stvarno${needs.length ? ' + ručni korak' : ''}`
  return { parts, simWorst, realWorst, needs, blocked, shortcuts, automaticUnder5Min, label }
}

/* ---------- Goals ---------- */

function completed(state: AccessState, secretId: string): RotationRecord[] {
  return findSecret(state, secretId)?.rotations.filter((r) => r.completedAt !== null) ?? []
}

export interface GoalOptions {
  /** secret the goals judge (default: `config.goalSecretId` – L23: the SMS key; it does not follow setFocus) */
  secretId?: string
}

export interface L16Goals {
  /** „Zatvorite što više očiju”: only honest-limit eyes are red (Pod creator, compromised Pod) – live */
  closeEyes: boolean
  red: number
  honestLimitRed: number
  /** „Rotirajte lozinku bez ponovnog pokretanja Poda”: a rotation finished with Pods running and 0 restarts – latched */
  rotateWithoutRestart: boolean
  /**
   * „Objasnite zašto oko „smije stvarati Podove” ostaje crveno”: the Pod creator's mount attempt succeeded while only
   * honest limits were red – latched; pair it with a Predict for the „objasnite” part
   */
  podCreatorShown: boolean
}

/** L16 goals for the goal secret (default) – state goals live, event goals latched in `state.achieved`. */
export function l16Goals(state: AccessState, opts: GoalOptions = {}): L16Goals {
  const id = opts.secretId ?? state.config.goalSecretId
  const e = eyeSummary(state, id)
  return {
    closeEyes: e.red > 0 && e.red === e.honestLimit,
    red: e.red,
    honestLimitRed: e.honestLimit,
    rotateWithoutRestart: achievedAt(state, 'rotateWithoutRestart', id) !== null,
    podCreatorShown: achievedAt(state, 'podCreatorShown', id) !== null,
  }
}

export interface L23Goals {
  /** „Svi čitatelji Gita sivi”: Git exposes no valid value of the goal secret – live */
  gitGrey: boolean
  /** „Rotirajte SMS ključ u < 5 min bez lozinke u Gitu” */
  rotateFast: {
    /** latched when a rotation completed (with a consumer running) in ≤ 5 min real time with its new value out of Git */
    done: boolean
    /** real-time equivalent of the last completed rotation (s), null when none */
    realElapsed: number | null
    /** the last completed rotation's new value is readable from Git (now) */
    plaintextInGit: boolean
  }
  /**
   * „Ispravno reagirajte na procurjeli commit”: latched when every leak of the goal secret (the preset's initial one
   * included) was revoked and Git exposed no valid value
   */
  leakHandled: boolean
  /** leaks of the goal secret so far (0: nothing to react to yet – „najprije spremite običan Secret u Git”) */
  leaks: number
  /**
   * „Preživite nedostupan trezor”: latched when a consumer Pod of a store-backed secret (ESO / AVP) started during an
   * outage on a value the store had delivered before it – ESO keeps serving the last synced Secret, CSI blocks new Pods.
   * See storeOutageStatus() for a hint.
   */
  survivedStoreOutage: boolean
}

/** L23 goals for the goal secret (default) – state goals live, event goals latched in `state.achieved`. */
export function l23Goals(state: AccessState, opts: GoalOptions = {}): L23Goals {
  const id = opts.secretId ?? state.config.goalSecretId
  const done = completed(state, id)
  const last = done[done.length - 1]
  return {
    gitGrey: !gitExposesValidValue(state, id),
    rotateFast: {
      done: achievedAt(state, 'rotateFast', id) !== null,
      realElapsed: last ? Math.round(last.realElapsed * 10) / 10 : null,
      plaintextInGit: last ? versionInGit(state, id, last.toVersion) : false,
    },
    leakHandled: achievedAt(state, 'leakHandled', id) !== null,
    leaks: state.incidents.leaks.filter((l) => l.secretId === id).length,
    survivedStoreOutage: achievedAt(state, 'survivedStoreOutage') !== null,
  }
}

/* ---------- „Ostale mogućnosti”: approaches side by side ---------- */

export interface ApproachComparison {
  /** assets holding a still-valid value in readable form (plain / base64) */
  plaintext: AssetKind[]
  /** visible red eyes */
  red: ActorId[]
  /** visible red eyes that are honest limits */
  honestLimit: ActorId[]
}

/**
 * Where the plaintext lives and who reads it, for each approach – each in a fresh explorer-mode state built from
 * `base` (default: preset l23) without the former team member (whose memory would appear in every row).
 */
export function compareApproaches(
  approaches: readonly Approach[],
  base: AccessConfigInput = PRESETS.l23,
  secretId?: string,
): Partial<Record<Approach, ApproachComparison>> {
  const out: Partial<Record<Approach, ApproachComparison>> = {}
  for (const ap of approaches) {
    if (!(ap in APPROACHES)) continue
    const s = createAccess({ ...base, whatIf: true, exEmployeeKnowsInitial: false })
    setApproach(s, 'all', ap)
    const id = secretId ?? s.config.focusSecretId
    const visible = new Set(s.config.visibleActors)
    const verdicts = evaluateAccess(s, id).verdicts.filter((v) => v.reads && visible.has(v.actorId))
    out[ap] = {
      plaintext: plaintextAssets(s, id).map((a) => a.kind),
      red: verdicts.map((v) => v.actorId),
      honestLimit: verdicts.filter((v) => v.honestLimit).map((v) => v.actorId),
    }
  }
  return out
}
