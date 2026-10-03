/**
 * Terminal sessions for the code section, printed by the cluster engine from the incident preset (so the numbers
 * match the incident card and the flagship sim). `kubectl top` and `describe node` are formatted here from
 * nodeView / podView – the engine has no metrics-server table, the values are its own.
 */
import { advance, kubectlDescribePod, kubectlRun, nodeView, podView } from '../../../engines/cluster'
import { makePreset } from './model'
import type { TerminalLine as TermLine } from '../../../kit'

function pad(s: string, n: number): string {
  return s.length >= n ? `${s}  ` : s + ' '.repeat(n - s.length)
}

export function incidentTerminal(): { pending: TermLine[]; leaky: TermLine[] } {
  const s = makePreset('incident')
  advance(s, 120)
  const pending: TermLine[] = []
  // the engine keeps Iva's test Pods in 'klopa'; in the story they live in klopa-staging, so they get their own listing
  const listing = kubectlRun(s, 'get pods').lines
  const isIva = (l: string) => l.startsWith('ivina-proba')
  pending.push({ cmd: 'kubectl get pods -n klopa' })
  for (const l of listing) if (!isIva(l)) pending.push({ out: l })
  pending.push({ cmd: 'kubectl get pods -n klopa-staging' })
  pending.push({ out: listing[0] })
  for (const l of listing) if (isIva(l)) pending.push({ out: l })
  pending.push({ cmd: 'kubectl describe pod fragment -n klopa | tail -3' })
  const desc = kubectlRun(s, 'describe pod fragment').lines
  const evHead = desc.findIndex((l) => /^\s*Type\s+Reason\s+Age/.test(l))
  const fs = desc.filter((l) => /^\s*Warning\s+FailedScheduling/.test(l))
  pending.push({ out: evHead >= 0 ? desc[evHead] : '  Type      Reason             Age    From                Message', tone: 'muted' })
  pending.push({ out: evHead >= 0 && desc[evHead + 1] ? desc[evHead + 1] : '  ----      ------             ----   ----                -------', tone: 'muted' })
  for (const l of fs.slice(-1)) pending.push({ out: l, tone: 'bad', note: 'Insufficient cpu? A graf kaže 30 %!', who: 'davor' })
  pending.push({ cmd: 'kubectl top nodes   # treba metrics-server' })
  pending.push({ out: `${pad('NAME', 9)}${pad('CPU(cores)', 13)}${pad('CPU(%)', 9)}${pad('MEMORY(bytes)', 16)}MEMORY(%)` })
  for (const n of s.nodes) {
    const v = nodeView(s, n)
    pending.push({
      out: `${pad(n.name, 9)}${pad(`${Math.round(v.used.cpuM)}m`, 13)}${pad(`${Math.round((v.used.cpuM / v.allocatable.cpuM) * 100)}%`, 9)}${pad(`${Math.round(v.used.memMi)}Mi`, 16)}${Math.round((v.used.memMi / v.allocatable.memMi) * 100)}%`,
    })
  }
  pending.push({ cmd: 'kubectl describe node node-2 | grep -A 6 "Allocated resources"' })
  const n2 = s.nodes.find((n) => n.name === 'node-2')!
  const v2 = nodeView(s, n2)
  const pct = (a: number, b: number) => `(${Math.round((a / b) * 100)}%)`
  pending.push({ out: 'Allocated resources:' })
  pending.push({ out: '  (Total limits may be over 100 percent, i.e., overcommitted.)', tone: 'muted' })
  pending.push({ out: `  ${pad('Resource', 10)}${pad('Requests', 16)}Limits` })
  pending.push({ out: `  ${pad('--------', 10)}${pad('--------', 16)}------`, tone: 'muted' })
  pending.push({
    out: `  ${pad('cpu', 10)}${pad(`${v2.requested.cpuM}m ${pct(v2.requested.cpuM, v2.allocatable.cpuM)}`, 16)}${v2.limits.cpuM}m ${pct(v2.limits.cpuM, v2.allocatable.cpuM)}`,
    tone: 'warn',
    note: 'Rezervirano 98 %, troši se 34 %. Raspoređivač gleda lijevi stupac.',
    who: 'lana',
  })
  pending.push({ out: `  ${pad('memory', 10)}${pad(`${v2.requested.memMi}Mi ${pct(v2.requested.memMi, v2.allocatable.memMi)}`, 16)}${v2.limits.memMi}Mi ${pct(v2.limits.memMi, v2.allocatable.memMi)}` })

  const leaky: TermLine[] = []
  const lp = s.pods.find((p) => p.name === 'leaky')!
  const lv = podView(s, lp)
  leaky.push({ cmd: 'kubectl describe pod leaky -n klopa' })
  const keep = ['Name:', 'Node:', 'State:', 'Reason:', 'Last State:', 'Exit Code:', 'Restart Count:', 'Limits:', 'memory:', 'Requests:', 'cpu:', 'QoS Class:']
  for (const l of kubectlDescribePod(s, 'leaky')) {
    const t = l.trim()
    if (!keep.some((k) => t.startsWith(k))) continue
    if (t.startsWith('Exit Code:')) leaky.push({ out: l, tone: 'bad', note: `137 = 128 + 9 (SIGKILL): prešao je limit od ${lv.mem.limitMi}Mi.`, who: 'lana' })
    else leaky.push({ out: l })
  }
  const ld = kubectlDescribePod(s, 'leaky')
  const backoff = ld.filter((l) => /^\s*Warning\s+BackOff/.test(l)).pop()
  const head = ld.find((l) => /^\s*Type\s+Reason\s+Age/.test(l))
  if (backoff) {
    leaky.push({ comment: 'Events (zadnji red):' })
    if (head) leaky.push({ out: head, tone: 'muted' })
    leaky.push({ out: backoff, tone: 'warn' })
  }
  return { pending, leaky }
}
