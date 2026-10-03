/** Read-only helpers for the L11 lab UI (no React): the numbered chain, the picked Pod, the console lines. */
import { API_REFUSED, ETCD_TIMEOUT, type Actor, type ClusterState, type Pod } from '../../../engines/cluster'
import type { TerminalLine } from '../../../kit'
import { isPullError, type Hop, type Lab } from '../model'

export function actorLabel(a: Actor): string {
  if (a === 'kubectl') return 'kubectl'
  if (a === 'apiserver') return 'API poslužitelj'
  if (a === 'etcd') return 'etcd'
  if (a === 'scheduler') return 'raspoređivač'
  if (a === 'controller-manager') return 'controller-manager'
  if (a.startsWith('kubelet:')) return `kubelet (${a.slice(8)})`
  if (a.startsWith('runtime:')) return `containerd (${a.slice(8)})`
  return a
}

export interface ChainRow {
  step: number
  /** null = not reached yet */
  from: string | null
  to: string | null
  text: string
  count: number
  skipped?: boolean
  /** a step that is stuck: warn = waiting (Pending, a component off), bad = failed (image pull) */
  tone?: 'warn' | 'bad'
}

export interface Chain {
  command: string
  reply: string | null
  rows: ChainRow[]
  /** hops of the same moments that belong to other Pods (not caused by this command) */
  others: string | null
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥']

/** klopa-api-4sbg5 → …4sbg5 (a controller's random suffix); names without one stay whole (ivina-proba-node-2). */
export function shortPod(name: string): string {
  const m = /-([a-z0-9]{5})$/.exec(name)
  return name.length > 14 && m ? `…${m[1]}` : name
}

/**
 * The six numbered steps that followed the latest kubectl write. Steps 3–6 keep only the Pods this command is about:
 * the Pod it applied, or the Pods a controller created for it in step 3. Everything else that happened meanwhile
 * (another Pod taking a freed slot, Iva's probes starting) is listed apart, so the card never tells a false story.
 */
export function chainOf(lab: Lab): Chain | null {
  const s = lab.tl.state
  const hops = lab.hops
  let i = -1
  for (let k = hops.length - 1; k >= 0; k--)
    if (hops[k].step === 1 && hops[k].from === 'kubectl') {
      i = k
      break
    }
  if (i < 0) return null
  const cmd = hops[i]
  const after = hops.slice(i).filter((h) => h.t0 <= s.t + 1e-9)
  const reply = after.find((h) => h.from === 'apiserver' && h.to === 'kubectl') ?? null
  const unchanged = !!reply && reply.label.includes('unchanged')
  const barePod = !!reply && reply.label.startsWith('pod/') && reply.label.includes('created')
  const log = s.kubectlLog.findLast((e) => e.cmd === `kubectl ${cmd.label}` && Math.abs(e.t - cmd.t0) < 1e-6) ?? s.kubectlLog.findLast((e) => e.cmd === `kubectl ${cmd.label}`)
  const applied = barePod && log ? log.out.map((l) => /^pod\/(\S+) created/.exec(l)?.[1]).filter((n): n is string => !!n) : []
  const deleted = /^delete pod (\S+)/.exec(cmd.label)?.[1] ?? null
  const deletedBare = !!deleted && !s.replicaSets.some((r) => deleted.startsWith(`${r.name}-`))
  const mine = new Set<string>([...applied, ...after.filter((h) => h.step === 3 && h.pod).map((h) => h.pod as string)])
  const minePods = s.pods.filter((p) => mine.has(p.name) && !p.deletion)
  const elapsed = s.t - cmd.t0

  const rows: ChainRow[] = []
  for (let step = 1; step <= 6; step++) {
    const hs = unchanged && step > 2 ? [] : after.filter((h) => h.step === step && (step < 4 || (!!h.pod && mine.has(h.pod))))
    if (hs.length) {
      rows.push({ step, from: uniq(hs.map((h) => actorLabel(h.from))).join(', '), to: uniq(hs.map((h) => actorLabel(h.to))).join(', '), text: hopText(step, hs), count: hs.length })
      continue
    }
    let text = '…'
    let tone: ChainRow['tone']
    let skipped = false
    if (unchanged && step > 2) text = 'ništa se nije promijenilo – nitko nema što raditi'
    else if (step === 3 && barePod && (after.some((h) => h.step > step) || elapsed > 1)) {
      skipped = true
      text = 'preskočeno: goli Pod nema vlasnika, nijedan kontroler ga ne stvara'
    } else if (step === 3 && deletedBare && elapsed > 1) {
      text = 'nitko: obrisani goli Pod nema vlasnika, pa ga nitko ne vraća'
    } else if (step >= 4 && deletedBare && elapsed > 1) text = 'nema novog Poda'
    else if (step === 3 && !s.components.controllerManager && !barePod) {
      text = 'čeka: controller-manager ne radi'
      tone = 'warn'
    } else if (step === 3 && / # image:/.test(cmd.label) && elapsed > 1.5) text = 'ništa: Podova je dovoljno, a postojeći Pod ne mijenja sliku'
    else if (step === 4) {
      const waiting = minePods.filter((p) => p.nodeName === null)
      if (waiting.length && !s.components.scheduler) {
        text = `čeka: raspoređivač ne radi (${names(waiting)} Pending)`
        tone = 'warn'
      } else if (waiting.some((p) => p.scheduled.status === false)) {
        text = `čeka: nema čvora s mjestom (${names(waiting)} Pending)`
        tone = 'warn'
      }
    } else if (step === 5) {
      const stuck = minePods.filter((p) => p.nodeName !== null && p.kubelet.startTime === null && s.nodes.some((n) => n.name === p.nodeName && (!n.kubeletUp || n.machine !== 'running')))
      if (stuck.length) {
        text = `čeka: kubelet na ${stuck[0].nodeName} ne radi`
        tone = 'warn'
      }
    } else if (step === 6) {
      const broken = minePods.filter(isPullError)
      if (broken.length) {
        text = `slika se ne može povući: ${names(broken)} u ImagePullBackOff`
        tone = 'bad'
      }
    }
    rows.push({ step, from: null, to: null, text, count: 0, skipped, tone })
  }

  // the same moments, other Pods
  const other = new Map<string, Set<number>>()
  for (const h of after) {
    if (h.step < 4 || h.step > 6 || (h.pod && mine.has(h.pod)) || !h.pod) continue
    const set = other.get(h.pod) ?? new Set<number>()
    set.add(h.step)
    other.set(h.pod, set)
  }
  const others = other.size
    ? [...other.entries()]
        .slice(0, 4)
        .map(([pod, steps]) => `${shortPod(pod)} ${[...steps].sort().map((n) => CIRCLED[n - 1]).join('')}`)
        .join(' · ') + (other.size > 4 ? ` · i još ${other.size - 4}` : '')
    : null
  return { command: cmd.label, reply: reply ? reply.label : null, rows, others }
}

function names(pods: Pod[]): string {
  return pods.map((p) => shortPod(p.name)).join(', ')
}

function hopText(step: number, hs: Hop[]): string {
  const ps = uniq(hs.map((h) => (h.pod ? shortPod(h.pod) : '')).filter(Boolean))
  if (step === 3) {
    const created = hs.filter((h) => h.label === 'stvori Pod')
    const parts: string[] = []
    if (created.length) parts.push(`stvori Pod ${uniq(created.map((h) => (h.pod ? shortPod(h.pod) : '?'))).join(', ')}`)
    const rest = uniq(hs.filter((h) => h.label !== 'stvori Pod').map((h) => h.label))
    return [...parts, ...rest].join(' · ')
  }
  if (step === 4) return `veži ${hs.map((h) => `${h.pod ? shortPod(h.pod) : 'Pod'} ${h.label.replace(/^veži /, '')}`).join(', ')}`
  if (step === 5) return `povuci sliku i pokreni ${ps.join(', ')}`
  if (step === 6) return `status: Running (${ps.join(', ')})`
  return uniq(hs.map((h) => h.label)).join(' · ')
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)]
}

/** The Pod the detail line and „Obriši Pod” act on: the clicked one, else the first one in trouble, else a klopa-api Pod. */
export function pickPod(s: ClusterState, selected: string | null): Pod | null {
  const live = s.pods.filter((p) => !p.deletion)
  if (selected) {
    const p = s.pods.find((x) => x.name === selected)
    if (p) return p
  }
  return live.find(isPullError) ?? live.find((p) => p.nodeName === null) ?? live.find((p) => p.labels.app === 'klopa-api') ?? live[0] ?? null
}

/** The laptop screen: the last two kubectl commands with their (tail of the) output. */
export function consoleLines(s: ClusterState): TerminalLine[] {
  const out: TerminalLine[] = []
  const log = s.kubectlLog.slice(-2)
  if (!log.length) return [{ comment: 'pritisnite jednu od naredbi iznad ili promijenite nešto u klasteru' }]
  for (const e of log) {
    out.push({ cmd: e.cmd })
    const lines = e.out.length > 13 ? [e.out[0], ...e.out.slice(-12)] : e.out
    for (const l of lines) out.push({ out: l, tone: e.ok ? 'normal' : 'bad' })
  }
  return out
}

export function kubectlProblem(s: ClusterState): 'refused' | 'timeout' | null {
  const last = s.kubectlLog.at(-1)
  if (!last || last.ok) return null
  if (last.out[0] === API_REFUSED) return 'refused'
  if (last.out[0] === ETCD_TIMEOUT) return 'timeout'
  return null
}

export type { Hop }
