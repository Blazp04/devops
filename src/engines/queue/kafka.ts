/**
 * Kafka DeepDive stepper for L06 („Za znatiželjne: log i Kafka”), sim-models SIM 2 „Kafka sub-sim”:
 * partition = hash(key) mod P (FNV-1a here; the text says Kafka's default partitioner uses murmur2),
 * each partition goes to exactly one consumer of a classic group (consumers beyond P sit idle),
 * lag = end − committed, commit after processing, replay resets the offset. No time, no queue – a script of
 * snapshots a Stepper can render as a pure function of the step.
 */
import { createRng, plural } from '../../kit/sim/math.ts'

/** FNV-1a 32-bit hash of a string (UTF-16 code units). */
export function fnv1a32(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** partition = hash(key) mod P (P < 1 → 0). */
export function kafkaPartition(key: string, partitions: number): number {
  const p = Math.max(1, Math.floor(Number.isFinite(partitions) ? partitions : 1))
  return fnv1a32(key) % p
}

/** Classic range assignment: consumer i gets a contiguous block of partitions; consumers beyond P get none. */
export function rangeAssign(partitions: number, consumers: number): number[][] {
  const p = Math.max(0, Math.floor(partitions))
  const c = Math.max(0, Math.floor(consumers))
  const out: number[][] = Array.from({ length: c }, () => [])
  if (c === 0) return out
  const per = Math.floor(p / c)
  const extra = p % c
  let next = 0
  for (let i = 0; i < c; i++) {
    const n = per + (i < extra ? 1 : 0)
    for (let k = 0; k < n; k++) out[i].push(next++)
  }
  return out
}

export interface KafkaRecord {
  key: string
  partition: number
  offset: number
  /** Per-key sequence number – stays in order within its partition. */
  seq: number
}

export interface KafkaStep {
  title: string
  body: string
  /** The whole log so far (records are never removed by consuming). */
  records: KafkaRecord[]
  /** Next offset to be written, per partition. */
  end: number[]
  /** Group A („kuhinja”) committed offsets and lag = end − committed. */
  committed: number[]
  lag: number[]
  /** Group B („analitika”) reads the same log independently. */
  analyticsCommitted: number[]
  /** Group A: consumer index (0-based) → partitions. */
  assignment: number[][]
  /** 0-based indices of group-A consumers without a partition. */
  idleConsumers: number[]
  /** Display names per consumer index: consumerLabels[0] = „Potrošač 1” (the text uses these 1-based names). */
  consumerLabels: string[]
  /** Records group A processed again after a crash before commit (step „pad prije commita”). */
  reprocessed: number
}

export interface KafkaStepperOptions {
  partitions?: number
  /** Distinct user keys (default 10). */
  keys?: number
  /** Share of records from the hot key „korisnik-1” (default 0,5). */
  hotKeyShare?: number
  /** Consumers in group A (default 2). */
  consumers?: number
  /** Records produced (default 12). */
  records?: number
  seed?: number
}

/** Deterministic snapshots for the L06 Kafka DeepDive stepper (P 3, 10 keys, hot key 50 %, C 2, seed 42). */
export function kafkaStepperScript(opts: KafkaStepperOptions = {}): KafkaStep[] {
  const P = Math.max(1, Math.floor(opts.partitions ?? 3))
  const K = Math.max(1, Math.floor(opts.keys ?? 10))
  const hot = Math.min(1, Math.max(0, opts.hotKeyShare ?? 0.5))
  const C = Math.max(1, Math.floor(opts.consumers ?? 2))
  const N = Math.max(1, Math.floor(opts.records ?? 12))
  const rng = createRng(opts.seed ?? 42)
  const records: KafkaRecord[] = []
  const end = new Array<number>(P).fill(0)
  const seqs = new Map<string, number>()
  for (let i = 0; i < N; i++) {
    const key = rng.next() < hot ? 'korisnik-1' : `korisnik-${rng.int(1, K)}`
    const partition = kafkaPartition(key, P)
    const seq = (seqs.get(key) ?? 0) + 1
    seqs.set(key, seq)
    records.push({ key, partition, offset: end[partition]++, seq })
  }
  const lagOf = (committed: number[]) => end.map((e, p) => e - committed[p])
  const snap = (title: string, body: string, committed: number[], analytics: number[], consumers: number, reprocessed = 0): KafkaStep => {
    const assignment = rangeAssign(P, consumers)
    return {
      title,
      body,
      records: records.map((r) => ({ ...r })),
      end: [...end],
      committed: [...committed],
      lag: lagOf(committed),
      analyticsCommitted: [...analytics],
      assignment,
      idleConsumers: assignment.flatMap((parts, i) => (parts.length === 0 ? [i] : [])),
      consumerLabels: assignment.map((_, i) => `Potrošač ${i + 1}`),
      reprocessed,
    }
  }
  const zero = new Array<number>(P).fill(0)
  const hotPartition = kafkaPartition('korisnik-1', P)
  const steps: KafkaStep[] = []
  const hotText = hot > 0 ? ` Vrući ključ „korisnik-1” puni particiju ${hotPartition}.` : ''
  steps.push(
    snap(
      'Zapisi stižu u particije',
      `Particija = hash(ključ) mod ${P} (ovdje FNV-1a; Kafkin zadani particioner koristi murmur2, pa bi stvarne particije bile drukčije). Svi zapisi istog korisnika idu u istu particiju, pa im redoslijed ostaje sačuvan.${hotText}`,
      zero,
      zero,
      C,
    ),
  )
  const share =
    C === 1
      ? P === 1
        ? 'Jedan potrošač čita jedinu particiju.'
        : `Jedan potrošač čita sve particije (${P}).`
      : `${plural(C, ['potrošač čita', 'potrošača dijele', 'potrošača dijeli'])} ${plural(P, ['particiju', 'particije', 'particija'])}.`
  steps.push(snap('Svaka particija ide jednom potrošaču', `U klasičnoj grupi svaku particiju čita točno jedan potrošač. ${share}`, zero, zero, C))
  const half = end.map((e) => Math.max(0, e - 2))
  steps.push(snap('Obrada pa commit', 'Potrošač commita pomak tek nakon obrade. Zaostatak (lag) = kraj − commitani pomak. Analitika čita isti log neovisno, svojim pomakom.', half, [...end], C))
  const crashedPart = rangeAssign(P, C)[0][0] ?? 0
  const redo = Math.min(2, end[crashedPart] - half[crashedPart])
  const crashText =
    redo === 0
      ? `Potrošač 1 padne prije commita, ali u particiji ${crashedPart} nema neobrađenih zapisa, pa se ništa ne ponavlja. Da ih ima, obradili bi se ponovno – i Kafka je „barem jednom”.`
      : `Potrošač 1 obradi još ${plural(redo, ['zapis', 'zapisa', 'zapisa'])} iz particije ${crashedPart} i padne prije commita. Nakon preraspodjele ${redo === 1 ? 'taj se zapis obrađuje' : 'ti se zapisi obrađuju'} ponovno – i Kafka je „barem jednom”.`
  steps.push(snap('Pad prije commita', crashText, half, [...end], C, redo))
  steps.push(snap('Ponovno čitanje (replay)', 'Zapisi ostaju u logu do isteka zadržavanja. Vraćanjem pomaka na 0 grupa ponovno čita sve.', zero, [...end], C))
  steps.push(snap('Više potrošača nego particija', `S ${P + 1} potrošača u klasičnoj grupi jedan nema particiju i čeka. (Kafka ≥ 4.2 share groups dijele posao i bez toga.)`, [...end], [...end], P + 1))
  return steps
}

/* ------------------------------------------------------------------ L06 „Red, pub/sub ili log”: work queue vs fan-out */

export interface FanoutDelivery {
  /** 1-based message number. */
  msg: number
  /** Croatian message text (a command or an event). */
  label: string
  /** The queue the copy went to. */
  queue: string
  /** 1-based consumer within that queue (competing consumers, round-robin). */
  consumer: number
}

export interface FanoutStep {
  title: string
  body: string
  /** Queues bound to the exchange (work queue: one). */
  queues: string[]
  /** Every delivery so far. */
  deliveries: FanoutDelivery[]
}

export interface FanoutOptions {
  mode: 'work-queue' | 'fanout'
  /** Subscribers of the fan-out event, each with its own queue (default kuhinja, sms, analitika). */
  subscribers?: string[]
  /** Messages to publish (default 3, 1–20). */
  messages?: number
  /** Competing consumers per queue (default 2, 1–6). */
  consumersPerQueue?: number
  /** First order number in the texts (default 42). */
  firstOrderId?: number
}

/**
 * Deterministic snapshots for the „Red, pub/sub ili log” topology toggle: a command („Skuhaj narudžbu 42”) goes to
 * ONE queue and exactly one consumer handles it; an event („NarudzbaZaprimljena”) is copied by a fan-out exchange
 * into every subscriber's queue, and within each queue one consumer takes the copy. A pure function for a Stepper.
 */
export function fanoutScript(opts: FanoutOptions): FanoutStep[] {
  const fan = opts.mode === 'fanout'
  const subs = fan ? (opts.subscribers && opts.subscribers.length > 0 ? opts.subscribers.slice(0, 6) : ['kuhinja', 'sms', 'analitika']) : ['narudzbe']
  const M = Math.max(1, Math.min(20, Math.floor(Number.isFinite(opts.messages) ? (opts.messages as number) : 3)))
  const C = Math.max(1, Math.min(6, Math.floor(Number.isFinite(opts.consumersPerQueue) ? (opts.consumersPerQueue as number) : 2)))
  const first = Math.max(1, Math.floor(Number.isFinite(opts.firstOrderId) ? (opts.firstOrderId as number) : 42))
  const deliveries: FanoutDelivery[] = []
  const steps: FanoutStep[] = []
  const snap = (title: string, body: string) => steps.push({ title, body, queues: [...subs], deliveries: deliveries.map((d) => ({ ...d })) })
  if (!fan) {
    snap(
      'Naredba ide u jedan red',
      `API šalje naredbu „Skuhaj narudžbu ${first}” u red „narudzbe”. ${C === 1 ? 'Jedan kuhar uzima poruke redom' : `${plural(C, ['kuhar se natječe', 'kuhara se natječu', 'kuhara se natječe'])} za poruke`}: svaku dobiva točno jedan.`,
    )
    for (let i = 0; i < M; i++) {
      const label = `Skuhaj narudžbu ${first + i}`
      const consumer = (i % C) + 1
      deliveries.push({ msg: i + 1, label, queue: 'narudzbe', consumer })
      snap(`Poruka ${i + 1}: „${label}”`, `Posrednik je predaje kuharu ${consumer}; ostali je ne vide. Jedna naredba = jedna obrada.`)
    }
    snap('Rad se dijeli', `${plural(M, ['naredba', 'naredbe', 'naredbi'])} → ${plural(M, ['obrada', 'obrade', 'obrada'])}. Više potrošača na istom redu ne dobiva kopije, nego dijeli posao.`)
    return steps
  }
  snap(
    'Događaj ide svim pretplatnicima',
    `API objavljuje događaj „NarudzbaZaprimljena” na fanout exchange. Pretplatnici (${subs.join(', ')}) imaju svaki svoj red i dobivaju vlastitu kopiju.`,
  )
  for (let i = 0; i < M; i++) {
    const label = `NarudzbaZaprimljena #${first + i}`
    const consumer = (i % C) + 1
    for (const q of subs) deliveries.push({ msg: i + 1, label, queue: q, consumer })
    snap(
      `Događaj ${i + 1}: „${label}”`,
      `Exchange stavlja kopiju u ${plural(subs.length, ['red', 'reda', 'redova'])}. Unutar svakog reda kopiju uzima jedan potrošač (ovdje ${consumer}.), kao u radnom redu.`,
    )
  }
  snap(
    'Kopija po pretplatniku',
    `${plural(M, ['događaj', 'događaja', 'događaja'])} → ${plural(M * subs.length, ['isporuka', 'isporuke', 'isporuka'])}. Novi pretplatnik (npr. bodovi vjernosti) samo veže svoj red – API se ne mijenja.`,
  )
  return steps
}
