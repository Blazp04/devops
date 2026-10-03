// Prototype: message queue vs direct calls, retries/backoff/DLQ, visibility timeout duplicates.
// Run: node queue-sim.ts

function mulberry32(seed: number) {
  return function () { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
interface Msg { id: number; tPub: number; attempts: number; visibleAt: number; poison: boolean }
interface Consumer { busyUntil: number; msg: Msg | null; failing: boolean; crashAt: number | null }

function run(o: {
  mode: 'queue' | 'direct'; seconds: number; lambda: (t: number) => number; consumers: number; svcMs: number;
  pFail?: number; pPoison?: number; maxDeliveries?: number; vtMs?: number; backoffBase?: number; backoffCap?: number;
  idempotent?: boolean; crashEvery?: number; seed?: number; maxQueue?: number;
}) {
  const rnd = mulberry32(o.seed ?? 7);
  const dt = 10;
  const exp = (mean: number) => -Math.log(1 - rnd()) * mean;
  let t = 0, id = 0;
  let nextArr = exp(1000 / o.lambda(0));
  const ready: Msg[] = []; // includes delayed (visibleAt in future)
  const cons: Consumer[] = Array.from({ length: o.consumers }, () => ({ busyUntil: 0, msg: null, failing: false, crashAt: null }));
  const inflight = new Map<number, { msg: Msg; deadline: number }>();
  let acked = 0, lost = 0, dlq = 0, retries = 0, effects = 0, dupEffects = 0, rejected = 0;
  const done = new Set<number>();
  const lat: number[] = [];
  let depthMax = 0; let areaL = 0;
  const series: string[] = [];
  const vt = o.vtMs ?? 30000;
  while (t < o.seconds * 1000) {
    while (nextArr <= t) {
      const m: Msg = { id: id++, tPub: t, attempts: 0, visibleAt: t, poison: rnd() < (o.pPoison ?? 0) };
      if (o.mode === 'direct') {
        const free = cons.find((c) => c.msg === null);
        if (free) { free.msg = m; free.busyUntil = t + exp(o.svcMs); m.attempts++; } else lost++;
      } else if (o.maxQueue !== undefined && ready.length >= o.maxQueue) rejected++;
      else ready.push(m);
      const lam = o.lambda(t);
      nextArr += exp(1000 / lam);
    }
    // visibility timeout expiry → message visible again
    for (const [mid, f] of inflight) if (t >= f.deadline) { inflight.delete(mid); f.msg.visibleAt = t; ready.push(f.msg); }
    for (const c of cons) {
      if (c.msg && t >= c.busyUntil) {
        const m = c.msg; c.msg = null;
        const fail = m.poison || rnd() < (o.pFail ?? 0);
        if (o.mode === 'direct') { if (!fail) { acked++; lat.push(t - m.tPub); } else lost++; continue; }
        if (!inflight.has(m.id)) { /* VT already expired: our ack/nack is late */ }
        if (!fail) {
          // side effect, then ack
          if (done.has(m.id)) { if (!o.idempotent) { effects++; dupEffects++; } } else { effects++; done.add(m.id); }
          if (inflight.has(m.id)) { inflight.delete(m.id); acked++; lat.push(t - m.tPub); }
        } else {
          inflight.delete(m.id);
          if (m.attempts >= (o.maxDeliveries ?? 5)) dlq++;
          else {
            retries++;
            const cap = o.backoffCap ?? 30000, base = o.backoffBase ?? 500;
            m.visibleAt = t + rnd() * Math.min(cap, base * 2 ** m.attempts); // full jitter
            ready.push(m);
          }
        }
      }
      if (o.mode === 'queue' && c.msg === null) {
        const idx = ready.findIndex((m) => m.visibleAt <= t);
        if (idx >= 0) {
          const m = ready.splice(idx, 1)[0]; m.attempts++;
          c.msg = m; c.busyUntil = t + exp(o.svcMs);
          inflight.set(m.id, { msg: m, deadline: t + vt });
        }
      }
    }
    depthMax = Math.max(depthMax, ready.length);
    areaL += (ready.length + inflight.size) * dt;
    if (t % 5000 === 0) series.push(`${t / 1000}s:${ready.length}`);
    t += dt;
  }
  lat.sort((a, b) => a - b);
  const q = (p: number) => lat.length ? Math.round(lat[Math.ceil(p * lat.length) - 1]) : NaN;
  const W = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  return { acked, lost, rejected, dlq, retries, effects, dupEffects, depthMax, p50: q(0.5), p95: q(0.95), littleL: +(areaL / (o.seconds * 1000)).toFixed(2), lambdaW: +((acked / o.seconds) * W / 1000).toFixed(2), series: series.join(' ') };
}

function erlangB(c: number, A: number) { let B = 1; for (let k = 1; k <= c; k++) B = (A * B) / (k + A * B); return B; }
console.log('Erlang B c=4 A=2 →', erlangB(4, 2).toFixed(3), ' c=4 A=3 →', erlangB(4, 3).toFixed(3), ' c=8 A=4 →', erlangB(8, 4).toFixed(3));

const steady = () => 2;
console.log('direct, 2 msg/s, 4 consumers @1s:', JSON.stringify(run({ mode: 'direct', seconds: 2000, lambda: steady, consumers: 4, svcMs: 1000 })));
console.log('queue,  2 msg/s, 4 consumers @1s:', JSON.stringify({ ...run({ mode: 'queue', seconds: 2000, lambda: steady, consumers: 4, svcMs: 1000 }), series: undefined }));
const burst = (t: number) => (t >= 30000 && t < 40000 ? 15 : 2);
console.log('direct burst:', JSON.stringify({ ...run({ mode: 'direct', seconds: 150, lambda: burst, consumers: 4, svcMs: 1000 }), series: undefined }));
console.log('queue burst:', JSON.stringify(run({ mode: 'queue', seconds: 150, lambda: burst, consumers: 4, svcMs: 1000 })));
console.log('queue burst 8 consumers:', JSON.stringify(run({ mode: 'queue', seconds: 150, lambda: burst, consumers: 8, svcMs: 1000 })));
console.log('failures+poison:', JSON.stringify({ ...run({ mode: 'queue', seconds: 600, lambda: steady, consumers: 4, svcMs: 1000, pFail: 0.1, pPoison: 0.02, maxDeliveries: 5 }), series: undefined }));
console.log('VT too short (2s, svc 1s exp):', JSON.stringify({ ...run({ mode: 'queue', seconds: 600, lambda: steady, consumers: 4, svcMs: 1000, vtMs: 2000 }), series: undefined }));
console.log('VT too short + idempotent:', JSON.stringify({ ...run({ mode: 'queue', seconds: 600, lambda: steady, consumers: 4, svcMs: 1000, vtMs: 2000, idempotent: true }), series: undefined }));
for (const lam of [2, 3, 3.5, 3.8]) console.log('util', lam / 4, JSON.stringify({ ...run({ mode: 'queue', seconds: 4000, lambda: () => lam, consumers: 4, svcMs: 1000 }), series: undefined }));
