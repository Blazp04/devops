// Prototype of the load-balancer simulation model (headless) used to tune defaults.
// Run: node lb-sim.ts

type Algo = 'rr' | 'wrr' | 'lc' | 'wlc' | 'p2c' | 'random' | 'lrt' | 'hash';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Workload { cpuMs: number; ioMs: number; memMB: number; cpuCv: number }
interface ServerCfg { name: string; cores: number; ramMB: number; weight?: number }

interface Req {
  id: number; tArrive: number; cpuLeft: number; ioLeft: number; server: number;
  clientGaveUp: boolean;
}

interface Server {
  cfg: ServerCfg; workers: number; inflight: Req[]; queue: Req[];
  state: 'up' | 'down'; lbHealthy: boolean; busyCoreMs: number; downUntil: number;
  ewmaLat: number; cw: number; handled: number; okFails: number; hcFail: number; hcOk: number;
}

const BASE_MB = 512;
const DT = 10; // ms

function simulate(opts: {
  servers: ServerCfg[]; wl: Workload; lambda: number; algo: Algo; seconds: number;
  queueMax?: number; timeoutMs?: number; seed?: number; unbounded?: boolean;
  killAt?: { t: number; idx: number };
}) {
  const rnd = mulberry32(opts.seed ?? 42);
  const queueMax = opts.queueMax ?? 10;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const servers: Server[] = opts.servers.map((c) => ({
    cfg: c,
    workers: opts.unbounded ? Infinity : Math.max(1, Math.floor((c.ramMB - BASE_MB) / opts.wl.memMB)),
    inflight: [], queue: [], state: 'up', lbHealthy: true, busyCoreMs: 0, downUntil: 0,
    ewmaLat: opts.wl.cpuMs + opts.wl.ioMs, cw: 0, handled: 0, okFails: 0, hcFail: 0, hcOk: 0,
  }));
  const weights = servers.map((s) => s.cfg.weight ?? 1);
  let rrIdx = 0;
  let t = 0;
  let nextArr = -Math.log(1 - rnd()) / opts.lambda * 1000;
  let id = 0;
  const lat: number[] = [];
  let ok = 0, rej503 = 0, to504 = 0, err502 = 0, wasted = 0;
  const warm = 10_000; // ignore first 10 s for stats

  const healthy = () => servers.map((s, i) => i).filter((i) => servers[i].lbHealthy);
  const active = (i: number) => servers[i].inflight.length + servers[i].queue.length;

  function pick(): number | null {
    const h = healthy();
    if (h.length === 0) return null;
    switch (opts.algo) {
      case 'rr': { const i = h[rrIdx % h.length]; rrIdx++; return i; }
      case 'wrr': { // nginx smooth weighted round robin
        let total = 0, best = -1;
        for (const i of h) { servers[i].cw += weights[i]; total += weights[i]; if (best < 0 || servers[i].cw > servers[best].cw) best = i; }
        servers[best].cw -= total; return best;
      }
      case 'lc': {
        let best = h[0];
        for (const i of h) if (active(i) < active(best)) best = i;
        // tie-break: among equal, rotate
        const ties = h.filter((i) => active(i) === active(best));
        return ties[Math.floor(rnd() * ties.length)];
      }
      case 'wlc': {
        let best = h[0];
        for (const i of h) if ((active(i) + 1) / weights[i] < (active(best) + 1) / weights[best]) best = i;
        return best;
      }
      case 'p2c': {
        if (h.length === 1) return h[0];
        const a = h[Math.floor(rnd() * h.length)];
        let b = a; while (b === a) b = h[Math.floor(rnd() * h.length)];
        return active(a) <= active(b) ? a : b;
      }
      case 'random': return h[Math.floor(rnd() * h.length)];
      case 'lrt': {
        let best = h[0];
        for (const i of h) if (servers[i].ewmaLat * (active(i) + 1) < servers[best].ewmaLat * (active(best) + 1)) best = i;
        return best;
      }
      default: return h[0];
    }
  }

  const total = opts.seconds * 1000;
  while (t < total) {
    // kill event
    if (opts.killAt && t === opts.killAt.t) {
      const s = servers[opts.killAt.idx];
      s.state = 'down';
      for (const r of [...s.inflight, ...s.queue]) if (t > warm) err502++;
      s.inflight = []; s.queue = [];
    }
    // health checks every 2 s, unhealthy after 2 fails
    if (t % 2000 === 0) {
      for (const s of servers) {
        if (s.state === 'down') { s.hcFail++; s.hcOk = 0; if (s.hcFail >= 2) s.lbHealthy = false; }
        else { s.hcOk++; s.hcFail = 0; if (s.hcOk >= 2) s.lbHealthy = true; }
      }
    }
    // arrivals
    while (nextArr <= t) {
      const cpu = opts.wl.cpuMs * (opts.wl.cpuCv > 0 ? -Math.log(1 - rnd()) : 1);
      const r: Req = { id: id++, tArrive: t, cpuLeft: cpu, ioLeft: opts.wl.ioMs, server: -1, clientGaveUp: false };
      const i = pick();
      if (i === null) { if (t > warm) rej503++; }
      else {
        const s = servers[i]; r.server = i;
        if (s.state === 'down') { if (t > warm) err502++; }
        else if (s.inflight.length < s.workers) s.inflight.push(r);
        else if (s.queue.length < queueMax) s.queue.push(r);
        else { if (t > warm) rej503++; }
      }
      nextArr += -Math.log(1 - rnd()) / opts.lambda * 1000;
    }
    // process
    for (const s of servers) {
      if (s.state === 'down') { if (s.downUntil > 0 && t >= s.downUntil) { s.state = 'up'; s.downUntil = 0; } continue; }
      if (BASE_MB + s.inflight.length * opts.wl.memMB > s.cfg.ramMB) { // OOM kill
        for (const r of [...s.inflight, ...s.queue]) if (t > warm) err502++;
        s.inflight = []; s.queue = []; s.state = 'down'; s.downUntil = t + 5000; (s as any).ooms = ((s as any).ooms ?? 0) + 1; continue;
      }
      // drop timed-out queued requests
      s.queue = s.queue.filter((r) => { if (t - r.tArrive > timeoutMs) { if (t > warm) to504++; return false; } return true; });
      const cpuReqs = s.inflight.filter((r) => r.cpuLeft > 0);
      const share = cpuReqs.length > 0 ? Math.min(1, s.cfg.cores / cpuReqs.length) : 0;
      s.busyCoreMs += Math.min(cpuReqs.length, s.cfg.cores) * DT;
      for (const r of s.inflight) {
        if (r.cpuLeft > 0) r.cpuLeft -= DT * share; else r.ioLeft -= DT;
      }
      const done = s.inflight.filter((r) => r.cpuLeft <= 0 && r.ioLeft <= 0);
      s.inflight = s.inflight.filter((r) => !(r.cpuLeft <= 0 && r.ioLeft <= 0));
      for (const r of done) {
        const L = t + DT - r.tArrive;
        s.ewmaLat = 0.8 * s.ewmaLat + 0.2 * L;
        s.handled++;
        if (t > warm) { if (L > timeoutMs) { to504++; wasted++; } else { ok++; lat.push(L); } }
      }
      while (s.inflight.length < s.workers && s.queue.length > 0) s.inflight.push(s.queue.shift()!);
    }
    t += DT;
  }
  lat.sort((a, b) => a - b);
  const q = (p: number) => (lat.length ? lat[Math.max(0, Math.ceil(p * lat.length) - 1)] : NaN);
  const measured = (total - warm) / 1000;
  return {
    algo: opts.algo, lambda: opts.lambda,
    okRps: +(ok / measured).toFixed(1),
    errPct: +((100 * (rej503 + to504 + err502)) / Math.max(1, ok + rej503 + to504 + err502)).toFixed(1),
    p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), p99: Math.round(q(0.99)),
    rej503, to504, err502,
    util: servers.map((s) => Math.round((100 * s.busyCoreMs) / (s.cfg.cores * total))),
    share: servers.map((s) => s.handled),
    workers: servers.map((s) => s.workers), ooms: servers.map((s) => (s as any).ooms ?? 0),
  };
}

const wl: Workload = { cpuMs: 200, ioMs: 300, memMB: 256, cpuCv: 1 };
const servers: ServerCfg[] = [
  { name: 'S1 1vCPU/2GB', cores: 1, ramMB: 2048 },
  { name: 'S2 2vCPU/4GB', cores: 2, ramMB: 4096 },
  { name: 'S3 4vCPU/8GB', cores: 4, ramMB: 8192 },
];
// weights proportional to capacity
const cap = (s: ServerCfg) => {
  const W = Math.floor((s.ramMB - BASE_MB) / wl.memMB);
  return Math.min((s.cores * 1000) / wl.cpuMs, (W * 1000) / (wl.cpuMs + wl.ioMs));
};
servers.forEach((s) => (s.weight = Math.round(cap(s) / cap(servers[0]))));
console.log('capacities', servers.map((s) => cap(s).toFixed(1)), 'weights', servers.map((s) => s.weight));

const mode = process.argv[2] ?? 'algos';
if (mode === 'algos') {
  for (const lambda of [8, 15, 20, 25, 30]) {
    for (const algo of ['rr', 'random', 'wrr', 'lc', 'p2c', 'lrt'] as Algo[]) {
      const r = simulate({ servers, wl, lambda, algo, seconds: 130 });
      console.log(JSON.stringify(r));
    }
    console.log('');
  }
}
if (mode === 'ram') {
  // same cores, different RAM, IO-heavy workload
  const io: Workload = { cpuMs: 50, ioMs: 1000, memMB: 256, cpuCv: 1 };
  for (const ram of [2048, 4096, 8192]) {
    for (const lambda of [5, 10, 15, 20, 30]) {
      const r = simulate({ servers: [{ name: 'x', cores: 2, ramMB: ram }], wl: io, lambda, algo: 'rr', seconds: 130 });
      console.log(ram, JSON.stringify(r));
    }
  }
  for (const ram of [2048, 4096, 8192]) {
    for (const lambda of [5, 8, 10, 12]) {
      const r = simulate({ servers: [{ name: 'x', cores: 2, ramMB: ram }], wl, lambda, algo: 'rr', seconds: 130 });
      console.log('default-wl', ram, JSON.stringify(r));
    }
  }
}
if (mode === 'oom') {
  for (const lambda of [4, 6, 8]) {
    const r = simulate({ servers: [{ name: 'x', cores: 1, ramMB: 2048 }], wl, lambda, algo: 'rr', seconds: 130, unbounded: true });
    console.log('unbounded', JSON.stringify(r));
  }
}
if (mode === 'table') {
  for (const lambda of [10, 15, 20, 25, 30, 35]) {
    const row: string[] = [];
    for (const algo of ['rr', 'random', 'wrr', 'lc', 'p2c', 'lrt'] as Algo[]) {
      const r = simulate({ servers, wl, lambda, algo, seconds: 310 });
      row.push(`${algo}: ok=${r.okRps} err=${r.errPct}% p95=${r.p95}`);
    }
    console.log('λ=' + lambda + ' | ' + row.join(' | '));
  }
}
if (mode === 'io') {
  const io: Workload = { cpuMs: 50, ioMs: 1000, memMB: 256, cpuCv: 1 };
  const sv: ServerCfg[] = [{ name: 'A 4vCPU/2GB', cores: 4, ramMB: 2048, weight: 1 }, { name: 'B 1vCPU/8GB', cores: 1, ramMB: 8192, weight: 1 }];
  for (const lambda of [5, 10, 15, 20, 25]) for (const algo of ['rr', 'lc'] as Algo[]) {
    const r = simulate({ servers: sv, wl: io, lambda, algo, seconds: 310 });
    console.log('io', lambda, algo, JSON.stringify({ ok: r.okRps, err: r.errPct, p95: r.p95, util: r.util, share: r.share, workers: r.workers }));
  }
}
if (mode === 'kill') {
  for (const algo of ['rr', 'lc'] as Algo[]) {
    const r = simulate({ servers, wl, lambda: 15, algo, seconds: 130, killAt: { t: 60_000, idx: 2 } });
    console.log(JSON.stringify(r));
  }
}
