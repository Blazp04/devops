// Prototype of Deployment RollingUpdate controller (mirrors pkg/controller/deployment/rolling.go)
// Run: node rollout-sim.ts

type Phase = 'Pending' | 'Creating' | 'Starting' | 'Ready' | 'Terminating' | 'CrashLoop';
interface Pod { id: number; rs: number; phase: Phase; t: number; readySince: number | null; probeOk: number; probeFail: number; nextProbe: number; goneAt?: number }
interface RS { rev: number; replicas: number }
interface IntOrPct { v: number; pct: boolean }

const resolve = (x: IntOrPct, n: number, roundUp: boolean) =>
  !x.pct ? x.v : roundUp ? Math.ceil((x.v * n) / 100) : Math.floor((x.v * n) / 100);

export function fenceposts(maxSurge: IntOrPct, maxUnavailable: IntOrPct, n: number) {
  const surge = resolve(maxSurge, n, true);
  let unavailable = resolve(maxUnavailable, n, false);
  if (surge === 0 && unavailable === 0) unavailable = 1; // ResolveFenceposts
  return { surge, unavailable: Math.min(unavailable, n) };
}

function run(opts: {
  n: number; maxSurge: IntOrPct; maxUnavailable: IntOrPct; minReadySeconds?: number;
  newImageBroken?: boolean; seconds: number; log?: boolean;
}) {
  const T = { schedule: 1, pullNew: 4, pullOld: 0, appStart: 6, probePeriod: 2, failThr: 3, grace: 5 };
  const minReady = opts.minReadySeconds ?? 0;
  let t = 0, pid = 0;
  const pods: Pod[] = [];
  const rss: RS[] = [{ rev: 1, replicas: opts.n }, { rev: 2, replicas: 0 }];
  const { surge, unavailable } = fenceposts(opts.maxSurge, opts.maxUnavailable, opts.n);
  // start with old pods ready
  for (let i = 0; i < opts.n; i++) pods.push({ id: pid++, rs: 0, phase: 'Ready', t: 0, readySince: -100, probeOk: 0, probeFail: 0, nextProbe: 0 });

  const active = (rs: number) => pods.filter((p) => p.rs === rs && p.phase !== 'Terminating');
  const isAvailable = (p: Pod) => p.phase === 'Ready' && p.readySince !== null && t - p.readySince >= minReady;
  const availableIn = (rs: number) => active(rs).filter(isAvailable).length;
  const timeline: string[] = [];
  let maxTotal = 0, minAvail = Infinity, maxWithTerminating = 0;

  const dt = 0.1;
  while (t < opts.seconds) {
    // --- Deployment controller: one reconcile per tick (scale up OR scale down)
    const newRS = rss[1], oldRS = rss[0];
    const allCount = newRS.replicas + oldRS.replicas;
    let changed = false;
    if (newRS.replicas < opts.n) {
      const maxTotalPods = opts.n + surge;
      if (allCount < maxTotalPods) {
        const up = Math.min(maxTotalPods - allCount, opts.n - newRS.replicas);
        newRS.replicas += up; changed = true;
      }
    }
    if (!changed && oldRS.replicas > 0) {
      const minAvailable = opts.n - unavailable;
      const newUnavailable = newRS.replicas - availableIn(1);
      const maxScaledDown = allCount - minAvailable - newUnavailable;
      if (maxScaledDown > 0) {
        // cleanupUnhealthyReplicas (old RS replicas that are not available)
        const oldUnhealthy = oldRS.replicas - availableIn(0);
        let cleaned = Math.min(maxScaledDown, Math.max(0, oldUnhealthy));
        oldRS.replicas -= cleaned;
        // scaleDownOldReplicaSetsForRollingUpdate
        const avail = availableIn(0) + availableIn(1);
        if (avail > minAvailable) {
          const down = Math.min(oldRS.replicas, avail - minAvailable);
          oldRS.replicas -= down;
        }
      }
    }
    // --- ReplicaSet controller: reconcile pods to replicas
    for (let r = 0; r < 2; r++) {
      const act = active(r);
      if (act.length < rss[r].replicas) {
        for (let i = act.length; i < rss[r].replicas; i++) pods.push({ id: pid++, rs: r, phase: 'Pending', t, readySince: null, probeOk: 0, probeFail: 0, nextProbe: 0 });
      } else if (act.length > rss[r].replicas) {
        // delete not-ready first, then most recently ready
        const order = [...act].sort((a, b) => (a.phase === 'Ready' ? 1 : 0) - (b.phase === 'Ready' ? 1 : 0) || (b.readySince ?? 0) - (a.readySince ?? 0));
        for (const p of order.slice(0, act.length - rss[r].replicas)) { p.phase = 'Terminating'; p.goneAt = t + T.grace; p.readySince = null; }
      }
    }
    // --- kubelet: pod lifecycle
    for (const p of pods) {
      const pull = p.rs === 1 ? T.pullNew : T.pullOld;
      if (p.phase === 'Pending' && t - p.t >= T.schedule) { p.phase = 'Creating'; p.t = t; }
      else if (p.phase === 'Creating' && t - p.t >= pull) { p.phase = 'Starting'; p.t = t; p.nextProbe = t; }
      else if (p.phase === 'Starting' && t >= p.nextProbe) {
        const ok = !(p.rs === 1 && opts.newImageBroken) && t - p.t >= T.appStart;
        p.nextProbe = t + T.probePeriod;
        if (ok) { p.phase = 'Ready'; p.readySince = t; }
      }
    }
    for (let i = pods.length - 1; i >= 0; i--) if (pods[i].phase === 'Terminating' && t >= pods[i].goneAt!) pods.splice(i, 1);

    const nonTerm = pods.filter((p) => p.phase !== 'Terminating').length;
    const avail = pods.filter(isAvailable).length;
    maxTotal = Math.max(maxTotal, nonTerm);
    maxWithTerminating = Math.max(maxWithTerminating, pods.length);
    if (t > 0.5) minAvail = Math.min(minAvail, avail);
    const snap = `old=${oldRS.replicas} new=${newRS.replicas} | pods: ${pods.map((p) => (p.rs ? 'N' : 'o') + p.phase[0]).join(' ')}`;
    if (opts.log && timeline[timeline.length - 1]?.slice(8) !== snap) timeline.push(`t=${t.toFixed(1).padStart(5)} ${snap}`);
    if (newRS.replicas === opts.n && oldRS.replicas === 0 && availableIn(1) === opts.n && pods.length === opts.n) {
      return { done: t.toFixed(1), surge, unavailable, maxTotal, maxWithTerminating, minAvail, timeline };
    }
    t += dt;
  }
  return { done: 'stalled', surge, unavailable, maxTotal, maxWithTerminating, minAvail, old: rss[0].replicas, new: rss[1].replicas, avail: pods.filter(isAvailable).length, timeline };
}

const P = (v: number): IntOrPct => ({ v, pct: true });
const I = (v: number): IntOrPct => ({ v, pct: false });

for (const n of [1, 2, 3, 4, 5, 10]) console.log('n', n, '25%/25% ->', fenceposts(P(25), P(25), n));
console.log('n 3, 0%/10% ->', fenceposts(P(0), P(10), 3), ' (both resolve to 0 → unavailable forced to 1)');

for (const [label, s, u] of [['25%/25%', P(25), P(25)], ['surge1/unavail0', I(1), I(0)], ['surge0/unavail1', I(0), I(1)], ['100%/0', P(100), I(0)]] as const) {
  const r = run({ n: 4, maxSurge: s, maxUnavailable: u, seconds: 300 });
  console.log(label, JSON.stringify({ ...r, timeline: undefined }));
}
const bad = run({ n: 4, maxSurge: P(25), maxUnavailable: P(25), newImageBroken: true, seconds: 120 });
console.log('broken image', JSON.stringify({ ...bad, timeline: undefined }));
const bad10 = run({ n: 10, maxSurge: I(3), maxUnavailable: I(2), newImageBroken: true, seconds: 120 });
console.log('broken image n=10 surge3 unavail2', JSON.stringify({ ...bad10, timeline: undefined }));
const log = run({ n: 4, maxSurge: P(25), maxUnavailable: P(25), seconds: 300, log: true });
console.log(log.timeline.join('\n'));
