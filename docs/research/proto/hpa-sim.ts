// Prototype: HPA (autoscaling/v2 default behavior) + simplified Cluster Autoscaler
// Run: node hpa-sim.ts

interface Pod { id: number; node: number | null; phase: 'Pending' | 'Starting' | 'Ready' | 'Terminating'; t: number; startAt: number; cpuWindow: number[] }
interface Node { id: number; allocCpu: number; allocMem: number; dsCpu: number; dsMem: number; readyAt: number; hasImage: boolean; unneededSince: number | null; draining: boolean }
interface Rec { t: number; v: number }
interface Ev { t: number; d: number }

const C = {
  podReqCpu: 500, podLimCpu: 1000, podReqMem: 512, cpuPerReq: 25, // m-CPU-seconds per request (=25 ms CPU)
  targetUtil: 50, tolerance: 0.1, minR: 2, maxR: 20,
  syncPeriod: 15, scrape: 15,
  upStab: 0, downStab: 300,
  upPolicies: [{ type: 'Percent', value: 100, period: 15 }, { type: 'Pods', value: 4, period: 15 }],
  downPolicies: [{ type: 'Percent', value: 100, period: 15 }],
  pullNew: 6, pullCached: 1, appStart: 10, probePeriod: 5,
  node: { allocCpu: 1930, allocMem: 6500, dsCpu: 200, dsMem: 300 },
  nodeProvision: 75, caScan: 10, caUtilThr: 0.5, caUnneeded: 600, caDelayAfterAdd: 600, maxNodes: 6, minNodes: 2,
};

function rpsAt(t: number) { return t < 60 ? 20 : t < 420 ? 100 : 20; }

let t = 0, pid = 0, nid = 0;
const nodes: Node[] = [];
const pods: Pod[] = [];
const addNode = (readyAt: number, hasImage: boolean) => nodes.push({ id: nid++, ...C.node, readyAt, hasImage, unneededSince: null, draining: false });
addNode(0, true); addNode(0, true);
let replicas = 2;
for (let i = 0; i < 2; i++) pods.push({ id: pid++, node: i, phase: 'Ready', t: 0, startAt: -999, cpuWindow: [], created: -1000, readyAt: -1000 } as any);
const recs: Rec[] = []; const upEv: Ev[] = []; const downEv: Ev[] = [];
let lastScaleUpAdd = -1e9;
let metricSnapshot = new Map<number, number>(); let lastScrape = 0; // pod id -> avg millicores over last scrape window
let dropped = 0, served = 0;
const log: string[] = [];

const nodeReqCpu = (n: Node) => n.dsCpu + pods.filter((p) => p.node === n.id && p.phase !== 'Terminating').length * C.podReqCpu;
const nodeReqMem = (n: Node) => n.dsMem + pods.filter((p) => p.node === n.id && p.phase !== 'Terminating').length * C.podReqMem;
const fits = (n: Node) => t >= n.readyAt && !n.draining && nodeReqCpu(n) + C.podReqCpu <= n.allocCpu && nodeReqMem(n) + C.podReqMem <= n.allocMem;

function changeInPeriod(ev: Ev[], period: number) { return ev.filter((e) => e.t > t - period).reduce((s, e) => s + e.d, 0); }

function hpaDesired(): { desired: number; util: number | null } {
  const active = pods.filter((p) => p.phase !== 'Terminating');
  // HPA 'unready' rule for CPU: not Ready, or (within cpu-initialization-period 300s of start AND
  // the metric window began before the pod became Ready)
  const hpaReady = (p: Pod) => p.phase === 'Ready' && metricSnapshot.has(p.id) &&
    !((t - (p as any).created < 300) && (lastScrape - C.scrape < (p as any).readyAt));
  const ready = active.filter(hpaReady);
  const unready = active.filter((p) => !hpaReady(p));
  if (ready.length === 0) return { desired: replicas, util: null };
  const sumUse = ready.reduce((s, p) => s + metricSnapshot.get(p.id)!, 0);
  const util = Math.floor((sumUse * 100) / (ready.length * C.podReqCpu));
  const ratio = util / C.targetUtil;
  const within = (r: number) => r >= 1 - C.tolerance && r <= 1 + C.tolerance;
  if (!(unready.length > 0 && ratio > 1)) {
    if (within(ratio)) return { desired: replicas, util };
    return { desired: Math.ceil(ratio * ready.length), util };
  }
  // scale-up with unready pods: count them as 0 usage
  const newUtil = Math.floor((sumUse * 100) / ((ready.length + unready.length) * C.podReqCpu));
  const newRatio = newUtil / C.targetUtil;
  if (within(newRatio) || newRatio < 1) return { desired: replicas, util };
  return { desired: Math.ceil(newRatio * (ready.length + unready.length)), util };
}

function normalize(desired: number) {
  // stabilization
  let upRec = desired, downRec = desired;
  for (const r of recs) { if (r.t > t - C.upStab) upRec = Math.min(upRec, r.v); if (r.t > t - C.downStab) downRec = Math.max(downRec, r.v); }
  recs.push({ t, v: desired });
  let rec = replicas; if (rec < upRec) rec = upRec; if (rec > downRec) rec = downRec;
  // rate limits
  if (rec > replicas) {
    let limit = -Infinity;
    for (const p of C.upPolicies) {
      const start = replicas - changeInPeriod(upEv, p.period) + changeInPeriod(downEv, p.period);
      limit = Math.max(limit, p.type === 'Pods' ? start + p.value : Math.ceil(start * (1 + p.value / 100)));
    }
    limit = Math.max(limit, replicas);
    rec = Math.min(rec, limit, C.maxR);
  } else if (rec < replicas) {
    let limit = Infinity;
    for (const p of C.downPolicies) {
      const start = replicas - changeInPeriod(upEv, p.period) + changeInPeriod(downEv, p.period);
      limit = Math.min(limit, p.type === 'Pods' ? start - p.value : Math.floor(start * (1 - p.value / 100)));
    }
    limit = Math.min(limit, replicas);
    rec = Math.max(rec, limit, C.minR);
  }
  return rec;
}

const dt = 1;
while (t <= 1800) {
  const rps = rpsAt(t);
  // traffic to ready pods
  const ready = pods.filter((p) => p.phase === 'Ready');
  const per = ready.length ? rps / ready.length : 0;
  const capPerPod = C.podLimCpu / C.cpuPerReq;
  if (t % 30 === 0 && ready.length) { const rho = Math.min(per / capPerPod, 0.99); log.push(`   ρ=${rho.toFixed(2)} est.latency=${Math.round(50 / (1 - rho))}ms`); }
  for (const p of ready) {
    const s = Math.min(per, capPerPod);
    p.cpuWindow.push(s * C.cpuPerReq); if (p.cpuWindow.length > C.scrape) p.cpuWindow.shift();
    served += s; dropped += per - s;
  }
  if (!ready.length) dropped += rps;
  // metrics-server scrape
  if (t % C.scrape === 0) { lastScrape = t; metricSnapshot = new Map(); for (const p of ready) if (p.cpuWindow.length) metricSnapshot.set(p.id, p.cpuWindow.reduce((a, b) => a + b, 0) / p.cpuWindow.length); }
  // HPA
  if (t % C.syncPeriod === 0 && t > 0) {
    const { desired, util } = hpaDesired();
    const clamped = Math.min(C.maxR, Math.max(C.minR, desired));
    const next = normalize(clamped);
    if (next !== replicas) {
      log.push(`t=${t} HPA util=${util}% raw=${desired} -> replicas ${replicas}→${next}`);
      if (next > replicas) upEv.push({ t, d: next - replicas }); else downEv.push({ t, d: replicas - next });
      replicas = next;
    }
  }
  // ReplicaSet
  const act = pods.filter((p) => p.phase !== 'Terminating');
  if (act.length < replicas) for (let i = act.length; i < replicas; i++) pods.push({ id: pid++, node: null, phase: 'Pending', t, startAt: 0, cpuWindow: [], created: t } as any);
  if (act.length > replicas) {
    const victims = [...act].sort((a, b) => (a.phase === 'Ready' ? 1 : 0) - (b.phase === 'Ready' ? 1 : 0) || b.t - a.t).slice(0, act.length - replicas);
    for (const v of victims) { v.phase = 'Terminating'; v.t = t; }
  }
  for (let i = pods.length - 1; i >= 0; i--) if (pods[i].phase === 'Terminating' && t - pods[i].t >= 5) pods.splice(i, 1);
  // scheduler (LeastAllocated-ish: pick node with lowest requested cpu)
  for (const p of pods.filter((p) => p.phase === 'Pending' && p.node === null)) {
    const cands = nodes.filter(fits).sort((a, b) => nodeReqCpu(a) - nodeReqCpu(b));
    if (cands.length) { const n = cands[0]; p.node = n.id; p.phase = 'Starting'; p.t = t; p.startAt = t + (n.hasImage ? C.pullCached : C.pullNew) + C.appStart; n.hasImage = true; }
  }
  for (const p of pods) if (p.phase === 'Starting' && t >= p.startAt && (t - p.startAt) % C.probePeriod === 0) { p.phase = 'Ready'; p.t = t; p.cpuWindow = []; (p as any).readyAt = t; }
  // Cluster Autoscaler
  if (t % C.caScan === 0) {
    const pending = pods.filter((p) => p.phase === 'Pending' && p.node === null).length;
    const upcoming = nodes.filter((n) => t < n.readyAt).length;
    const perNode = Math.floor(Math.min((C.node.allocCpu - C.node.dsCpu) / C.podReqCpu, (C.node.allocMem - C.node.dsMem) / C.podReqMem));
    const need = Math.ceil(pending / perNode) - upcoming;
    if (pending > 0 && need > 0 && nodes.length < C.maxNodes) {
      const add = Math.min(need, C.maxNodes - nodes.length);
      for (let i = 0; i < add; i++) addNode(t + C.nodeProvision, false);
      lastScaleUpAdd = t;
      log.push(`t=${t} CA: ${pending} pending → add ${add} node(s), ready at t=${t + C.nodeProvision}`);
    } else if (pending === 0 && t - lastScaleUpAdd >= C.caDelayAfterAdd) {
      for (const n of nodes) {
        if (t < n.readyAt) continue;
        const u = Math.max(nodeReqCpu(n) / n.allocCpu, nodeReqMem(n) / n.allocMem);
        if (u < C.caUtilThr && nodes.length > C.minNodes) { n.unneededSince ??= t; } else n.unneededSince = null;
      }
      const victim = nodes.find((n) => n.unneededSince !== null && t - n.unneededSince >= C.caUnneeded);
      if (victim) {
        // evict pods (they go Pending and get rescheduled) and remove node
        for (const p of pods.filter((p) => p.node === victim.id)) { p.node = null; p.phase = 'Pending'; }
        nodes.splice(nodes.indexOf(victim), 1);
        log.push(`t=${t} CA: removed node ${victim.id} (unneeded ${C.caUnneeded}s)`);
      }
    }
  }
  if (t % 30 === 0) log.push(`t=${t} rps=${rps} replicas=${replicas} ready=${pods.filter((p) => p.phase === 'Ready').length} pending=${pods.filter((p) => p.phase === 'Pending').length} nodes=${nodes.length}(${nodes.filter((n) => t >= n.readyAt).length} ready) dropped=${dropped.toFixed(0)}`);
  t += dt;
}
console.log(log.join('\n'));
console.log('served', served.toFixed(0), 'dropped', dropped.toFixed(0));
