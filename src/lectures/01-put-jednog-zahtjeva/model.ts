/**
 * Lecture 01 · the journey of one request — a deterministic step model (no React).
 *
 * Petra (or Lana) sends one HTTP(S) request. The model lists what happens, hop by hop, with real milliseconds:
 *   DNS (resolver round trip, or 0 ms from the cache) → TCP handshake (1 RTT) → TLS 1.3 (1 RTT, https only)
 *   → HTTP request/response (1 RTT) + 20 ms in the app.
 * Break-it switches produce the four symptoms, each pointing to one layer:
 *   NXDOMAIN (name) · connection refused, fast (door: nothing listens) · timeout, slow (route: nobody answers)
 *   · 502 (process behind the proxy).
 * RTT = lower bound from distance (light in fibre ≈ 200 000 km/s ⇒ ≥ 1 ms per 100 km, there and back).
 * Addresses come from the documentation ranges (RFC 5737) and the private range 192.168/16; the domain is
 * klopa.example (RFC 2606). Refused and timeout never share timing: refused = 1 RTT, timeout = the client's limit.
 */
import { createRng } from '../../kit'

export type Scenario = 'laptop' | 'vps' | 'proxy'
export type Place = 'zagreb' | 'split' | 'frankfurt' | 'ashburn' | 'sydney'
/** who sends the request and what they type */
export type ClientId = 'petra' | 'petra-localhost' | 'lana-local'
export type Outcome = 'ok' | 'nxdomain' | 'refused' | 'timeout' | 'bad-gateway'
/** the layer a symptom points to */
export type Layer = 'ime' | 'put' | 'vrata' | 'proces'

export interface Faults {
  /** the name has no DNS record (NXDOMAIN) */
  nxdomain: boolean
  /** the A record still points to the old server's address */
  stale: boolean
  /** the firewall silently drops packets to the port (DROP) */
  drop: boolean
  /** gunicorn is not running */
  appDown: boolean
  /** gunicorn listens only on 127.0.0.1:8000 */
  loopbackOnly: boolean
}

export const NO_FAULTS: Faults = { nxdomain: false, stale: false, drop: false, appDown: false, loopbackOnly: false }

/** incident #1 (preset lanin-laptop): Lana started gunicorn without --bind, so it listens on 127.0.0.1:8000 */
export const INCIDENT_FAULTS: Faults = { ...NO_FAULTS, loopbackOnly: true }

/** great-circle distance from Zagreb and the RTT lower bound (km / 100, rounded down to 0,1 ms) */
export const PLACES: Record<Place, { label: string; km: number; rtt: number }> = {
  zagreb: { label: 'Zagreb', km: 10, rtt: 0.1 },
  split: { label: 'Split', km: 259, rtt: 2.6 },
  frankfurt: { label: 'Frankfurt', km: 723, rtt: 7.2 },
  ashburn: { label: 'Ashburn (SAD)', km: 7254, rtt: 72.5 },
  sydney: { label: 'Sydney', km: 16028, rtt: 160 },
}

export const PLACE_ORDER: Place[] = ['zagreb', 'split', 'frankfurt', 'ashburn', 'sydney']

/** Lower bound of the round-trip time in ms: there and back at ≈ 200 000 km/s ⇒ km / 100. */
export const rttOf = (km: number): number => km / 100

/** one round trip to the resolver, which looked the name up for us (an example value, not a law) */
export const DNS_MS = 12
/** gunicorn handles GET / */
export const SERVER_MS = 20
/** a round trip over loopback: the request never leaves the machine */
export const LOOP_MS = 0.1
/** the client gives up waiting for an answer (sim) — real clients wait tens of seconds */
export const TIMEOUT_MS = 5000
/** SYN retransmissions while waiting (Linux: 1 s, then doubling) */
export const SYN_RETRIES_MS = [1000, 3000]

export const IP = {
  petra: '198.51.100.23',
  resolver: '192.0.2.53',
  vps: '203.0.113.10',
  old: '198.51.100.7',
  laptop: '192.168.1.23',
  router: '198.51.100.44',
} as const

export type RouteId =
  | 'dns-out'
  | 'dns-back'
  | 'to-proxy'
  | 'from-proxy'
  | 'to-door8000'
  | 'from-door8000'
  | 'to-app'
  | 'from-app'
  | 'to-fw443'
  | 'to-fw8000'
  | 'to-old'
  | 'to-private'
  | 'proxy-app'
  | 'app-proxy'
  | 'petra-loop-out'
  | 'petra-loop-back'
  | 'lana-out'
  | 'lana-back'

/** where a tray can stand still (processing, waiting) and where a failure glyph is drawn */
export type Spot = 'client' | 'resolver' | 'net' | 'old' | 'fw443' | 'fw8000' | 'door8000' | 'proxy' | 'app' | 'lana' | 'petra-loop'

export type SegKind = 'dns' | 'tcp' | 'tls' | 'http' | 'app' | 'wait'
export type SegTone = 'req' | 'ok' | 'bad'
export type EventTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info'

export interface Seg {
  kind: SegKind
  /** the tray travels this route; without a route it stands at `at` */
  route?: RouteId
  at?: Spot
  /** real milliseconds since the request started */
  t0: number
  t1: number
  tone: SegTone
  /** handwritten note next to the tray */
  label: string
  /** packet header while this segment runs: source → destination */
  header?: string
  /** one sentence for the ticker under the drawing */
  note: string
  /** logged in "Što se upravo dogodilo" when the segment ends */
  event?: { text: string; tone: EventTone }
}

export interface Phase {
  kind: 'dns' | 'tcp' | 'tls' | 'http'
  t0: number
  t1: number
  label: string
  /** this phase ended in the failure */
  bad?: boolean
  /** the client waited and nothing came back (drawn hollow) */
  hollow?: boolean
  /** part of an http phase spent inside the app */
  server?: [number, number]
}

export interface TraceParams {
  scenario: Scenario
  client: ClientId
  place: Place
  faults: Faults
  dnsCached: boolean
  seed: number
}

export interface Trace {
  params: TraceParams
  url: string
  segs: Seg[]
  phases: Phase[]
  outcome: Outcome
  layer: Layer | null
  /** ms until the browser shows something (an answer or an error) */
  total: number
  /** RTT (lower bound) used for this trace, 0 on loopback / unreachable */
  rtt: number
  /** where the failure glyph sits (null when the answer arrived) */
  failAt: Spot | null
  /** what the browser shows */
  browser: { title: string; code: string }
  /** what curl prints for the same request */
  curl: string
  /** the curl command that prints exactly `curl` (flags chosen by the outcome) */
  curlCmd: string
  /** one-sentence explanation of the outcome */
  explain: string
  /** (sim) note about the client timeout */
  timeoutNote?: string
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: '200 OK',
  nxdomain: 'NXDOMAIN',
  refused: 'odbijena veza',
  timeout: 'istek vremena',
  'bad-gateway': '502 Bad Gateway',
}

export const LAYER_LABEL: Record<Layer, string> = {
  ime: 'ime (DNS)',
  put: 'put do poslužitelja (adresa ili vatrozid)',
  vrata: 'vrata (port)',
  proces: 'proces iza proxyja',
}

export const BROWSER: Record<Outcome, { title: string; code: string }> = {
  ok: { title: 'Klopa · današnji jelovnik', code: '200 OK' },
  nxdomain: { title: 'Stranica nije dostupna', code: 'DNS_PROBE_FINISHED_NXDOMAIN' },
  refused: { title: 'Stranica nije dostupna', code: 'ERR_CONNECTION_REFUSED' },
  timeout: { title: 'Stranica nije dostupna', code: 'ERR_CONNECTION_TIMED_OUT' },
  'bad-gateway': { title: 'Stranica ne radi', code: 'HTTP ERROR 502' },
}

/** The address a client types in each scenario. */
export function urlOf(scenario: Scenario, client: ClientId): string {
  if (client !== 'petra') return 'http://localhost:8000'
  if (scenario === 'laptop') return `http://${IP.laptop}:8000`
  if (scenario === 'vps') return 'http://klopa.example:8000'
  return 'https://klopa.example'
}

/** Which break-it switches matter in a scenario (the others are disabled in the UI). */
export function faultApplies(scenario: Scenario, f: keyof Faults): boolean {
  if (scenario === 'laptop') return f === 'appDown' || f === 'loopbackOnly'
  return true
}

const r1 = (v: number) => Math.round(v * 1000) / 1000

/** Build the trace of one request. Pure and deterministic (the seed only picks the client's source ports). */
export function traceRequest(params: TraceParams): Trace {
  const { scenario, client, place, faults, dnsCached, seed } = params
  const rng = createRng(seed)
  const cport = rng.int(49152, 65535)
  const dport = rng.int(49152, 65535)
  const pport = rng.int(32768, 60999)
  const url = urlOf(scenario, client)
  const segs: Seg[] = []
  const phases: Phase[] = []

  /* ---------- localhost on Petra's phone: a U-turn into her own phone ---------- */
  if (client === 'petra-localhost') {
    const h = `127.0.0.1:${cport} → 127.0.0.1:8000`
    segs.push(
      { kind: 'tcp', route: 'petra-loop-out', t0: 0, t1: LOOP_MS / 2, tone: 'req', label: 'SYN', header: h, note: 'localhost = 127.0.0.1 = ovaj mobitel: paket se okreće i vraća u Petrin mobitel.' },
      {
        kind: 'tcp',
        route: 'petra-loop-back',
        t0: LOOP_MS / 2,
        t1: LOOP_MS,
        tone: 'bad',
        label: 'RST',
        header: `127.0.0.1:8000 → 127.0.0.1:${cport}`,
        note: 'Na vratima 8000 Petrina mobitela nitko ne sluša, pa ga operacijski sustav odmah odbije.',
        event: { text: 'localhost je Petrin mobitel: na njegovu portu 8000 nitko ne sluša → odbijena veza', tone: 'bad' },
      },
    )
    phases.push({ kind: 'tcp', t0: 0, t1: LOOP_MS, label: 'TCP · odbijeno', bad: true })
    return finish(params, url, segs, phases, 'refused', 'vrata', 0, 'petra-loop', {
      curl: "curl: (7) Failed to connect to localhost port 8000 after 0 ms: Couldn't connect to server",
      explain: 'localhost uvijek znači „ovo računalo” – za Petru je to njezin mobitel, a na njemu Klopa ne radi.',
    })
  }

  /* ---------- Lana on the machine that runs Klopa: localhost reaches the app ---------- */
  if (client === 'lana-local') {
    const h = `127.0.0.1:${cport} → 127.0.0.1:8000`
    const where = scenario === 'laptop' ? 'na svojem laptopu' : 'na poslužitelju (preko ssh-a)'
    segs.push({ kind: 'tcp', route: 'lana-out', t0: 0, t1: LOOP_MS / 2, tone: 'req', label: 'GET /', header: h, note: `Lana ${where} otvara localhost:8000: zahtjev ne izlazi iz računala.` })
    if (faults.appDown) {
      segs.push({
        kind: 'tcp',
        route: 'lana-back',
        t0: LOOP_MS / 2,
        t1: LOOP_MS,
        tone: 'bad',
        label: 'RST',
        header: `127.0.0.1:8000 → 127.0.0.1:${cport}`,
        note: 'gunicorn ne radi: na portu 8000 nitko ne sluša, veza je odmah odbijena.',
        event: { text: 'gunicorn ne radi → odbijena veza i na samom računalu', tone: 'bad' },
      })
      phases.push({ kind: 'tcp', t0: 0, t1: LOOP_MS, label: 'TCP · odbijeno', bad: true })
      return finish(params, url, segs, phases, 'refused', 'vrata', 0, 'app', {
        curl: "curl: (7) Failed to connect to localhost port 8000 after 0 ms: Couldn't connect to server",
        explain: 'Aplikacija ne radi, pa ni s istog računala nitko ne odgovara na portu 8000 – odbijanje stiže odmah.',
      })
    }
    const a0 = LOOP_MS / 2
    segs.push(
      { kind: 'app', at: 'app', t0: a0, t1: a0 + SERVER_MS, tone: 'req', label: 'obrada', note: `gunicorn obrađuje GET / (${SERVER_MS} ms).` },
      {
        kind: 'http',
        route: 'lana-back',
        t0: a0 + SERVER_MS,
        t1: LOOP_MS + SERVER_MS,
        tone: 'ok',
        label: '200 OK',
        header: `127.0.0.1:8000 → 127.0.0.1:${cport}`,
        note: faults.loopbackOnly ? 'Radi: aplikacija sluša na 127.0.0.1, a zahtjev i dolazi s 127.0.0.1.' : 'Odgovor 200 OK vraća se istim putem, bez mreže.',
        event: { text: `Lana ${where}: 200 OK za ${fmtMs(LOOP_MS + SERVER_MS)}`, tone: 'ok' },
      },
    )
    phases.push({ kind: 'tcp', t0: 0, t1: a0, label: 'TCP' }, { kind: 'http', t0: a0, t1: LOOP_MS + SERVER_MS, label: 'HTTP', server: [a0, a0 + SERVER_MS] })
    return finish(params, url, segs, phases, 'ok', null, 0, null, {
      curl: 'HTTP/1.1 200 OK',
      explain: faults.loopbackOnly
        ? 'Na samom računalu radi i kad aplikacija sluša samo na 127.0.0.1 – zato „kod mene radi” ne dokazuje da radi i za druge.'
        : 'Na istom računalu zahtjev ne prolazi mrežom: nema DNS-a, nema vatrozida, latencija je gotovo nula.',
    })
  }

  /* ---------- Petra on mobile data, Klopa on Lana's laptop: a private address ---------- */
  if (scenario === 'laptop') {
    segs.push(
      {
        kind: 'tcp',
        route: 'to-private',
        t0: 0,
        t1: 1,
        tone: 'req',
        label: 'SYN',
        header: `${IP.petra}:${cport} → ${IP.laptop}:8000`,
        note: `${IP.laptop} je privatna adresa: na internetu nijedan usmjerivač ne zna put do nje.`,
        event: { text: `IP adresa upisana izravno – bez DNS-a. SYN prema ${IP.laptop}:8000…`, tone: 'info' },
      },
      {
        kind: 'wait',
        at: 'net',
        t0: 1,
        t1: TIMEOUT_MS,
        tone: 'bad',
        label: 'čeka…',
        header: `${IP.petra}:${cport} → ${IP.laptop}:8000`,
        note: 'Paket se izgubio u mreži operatera. Petrin mobitel ponavlja SYN i čeka odgovor koji nikad ne stiže.',
        event: { text: 'Istek vremena: privatna adresa iza NAT-a nije dostupna s interneta', tone: 'bad' },
      },
    )
    phases.push({ kind: 'tcp', t0: 0, t1: TIMEOUT_MS, label: 'TCP · čeka odgovor', bad: true, hollow: true })
    return finish(params, url, segs, phases, 'timeout', 'put', 0, 'net', {
      curl: `curl: (28) Failed to connect to ${IP.laptop} port 8000 after ${TIMEOUT_MS} ms: Timeout was reached`,
      explain: 'Lanin laptop ima privatnu adresu iza kućnog usmjerivača (NAT). S interneta do nje ne vodi nijedan put – kako god aplikacija slušala.',
    })
  }

  /* ---------- Petra → klopa.example (VPS, with or without the proxy) ---------- */
  const https = scenario === 'proxy'
  const port = https ? 443 : 8000
  const r = PLACES[place].rtt
  const host = 'klopa.example'
  const target = faults.stale ? IP.old : IP.vps

  // DNS
  let d = 0
  if (dnsCached) {
    segs.push({
      kind: 'dns',
      at: 'client',
      t0: 0,
      t1: 0,
      tone: faults.nxdomain ? 'bad' : 'req',
      label: 'iz predmemorije',
      note: faults.nxdomain ? 'Mobitel se sjeća da to ime ne postoji (i negativni odgovor ima TTL).' : `Mobitel se još sjeća odgovora (TTL): ${host} → ${target}. DNS ne treba pitati.`,
      event: faults.nxdomain ? undefined : { text: `DNS iz predmemorije: ${host} → ${target} (0 ms)`, tone: 'info' },
    })
    phases.push({ kind: 'dns', t0: 0, t1: 0, label: 'DNS · predmemorija', bad: faults.nxdomain })
  } else {
    d = DNS_MS
    const qh = `${IP.petra}:${dport} → ${IP.resolver}:53`
    segs.push({ kind: 'dns', route: 'dns-out', t0: 0, t1: d / 2, tone: 'req', label: `${host}?`, header: qh, note: `Mobitel pita DNS razrješivač: koja je IP adresa imena ${host}?` })
    segs.push({
      kind: 'dns',
      route: 'dns-back',
      t0: d / 2,
      t1: d,
      tone: faults.nxdomain ? 'bad' : 'ok',
      label: faults.nxdomain ? 'NXDOMAIN' : target,
      header: `${IP.resolver}:53 → ${IP.petra}:${dport}`,
      note: faults.nxdomain ? `Razrješivač odgovara NXDOMAIN: ime ${host} ne postoji.` : `Odgovor: ${host} → ${target} (TTL 300 s). Port DNS ne zna.`,
      event: faults.nxdomain ? undefined : { text: `DNS: ${host} → ${target} (${fmtMs(d)})`, tone: faults.stale ? 'warn' : 'info' },
    })
    phases.push({ kind: 'dns', t0: 0, t1: d, label: 'DNS', bad: faults.nxdomain })
  }
  if (faults.nxdomain) {
    const last = segs[segs.length - 1]
    last.event = { text: `NXDOMAIN nakon ${fmtMs(d)}: ime ne postoji, TCP veza se nikad ne otvara`, tone: 'bad' }
    return finish(params, url, segs, phases, 'nxdomain', 'ime', 0, 'resolver', {
      curl: `curl: (6) Could not resolve host: ${host}`,
      explain: 'DNS ne zna to ime, pa preglednik ne zna kamo poslati paket. Nijedan paket nije stigao do poslužitelja.',
    })
  }

  const syn = `${IP.petra}:${cport} → ${target}:${port}`
  const back = `${target}:${port} → ${IP.petra}:${cport}`

  // TCP: the SYN goes nowhere — stale record or a firewall that drops
  if (faults.stale || faults.drop) {
    const route: RouteId = faults.stale ? 'to-old' : port === 443 ? 'to-fw443' : 'to-fw8000'
    const at: Spot = faults.stale ? 'old' : port === 443 ? 'fw443' : 'fw8000'
    segs.push(
      {
        kind: 'tcp',
        route,
        t0: d,
        t1: d + r / 2,
        tone: 'req',
        label: 'SYN',
        header: syn,
        note: faults.stale ? `DNS je dao staru adresu ${IP.old}: tamo više nitko ne radi.` : `Vatrozid ne propušta port ${port} i paket tiho baca (DROP) – bez ikakvog odgovora.`,
        event: { text: faults.stale ? `SYN prema staroj adresi ${IP.old}:${port}…` : `Vatrozid je tiho odbacio SYN prema :${port}`, tone: 'warn' },
      },
      {
        kind: 'wait',
        at,
        t0: d + r / 2,
        t1: d + TIMEOUT_MS,
        tone: 'bad',
        label: 'čeka…',
        header: syn,
        note: 'Nitko ne odgovara. Mobitel ponavlja SYN i čeka dok ne odustane.',
        event: { text: `Istek vremena nakon ${fmtMs(d + TIMEOUT_MS)} (sim) – nitko nije odgovorio`, tone: 'bad' },
      },
    )
    phases.push({ kind: 'tcp', t0: d, t1: d + TIMEOUT_MS, label: 'TCP · čeka odgovor', bad: true, hollow: true })
    return finish(params, url, segs, phases, 'timeout', 'put', r, at, {
      curl: `curl: (28) Failed to connect to ${host} port ${port} after ${TIMEOUT_MS} ms: Timeout was reached`,
      explain: faults.stale
        ? `Zapis u DNS-u pokazuje na staru adresu ${IP.old}, na kojoj nitko ne odgovara. Paket ne dobiva ni „ne” – samo tišinu.`
        : `Vatrozid tiho odbacuje pakete (DROP). Klijent ne dobije nikakav odgovor i čeka do isteka vremena. Pravilo REJECT odgovorilo bi odmah i izgledalo kao odbijena veza.`,
    })
  }

  // TCP: the SYN reaches the server, but nothing listens on 203.0.113.10:8000
  if (!https && (faults.appDown || faults.loopbackOnly)) {
    segs.push(
      { kind: 'tcp', route: 'to-door8000', t0: d, t1: d + r / 2, tone: 'req', label: 'SYN', header: syn, note: `SYN stiže do poslužitelja ${IP.vps} na port 8000.` },
      {
        kind: 'tcp',
        route: 'from-door8000',
        t0: d + r / 2,
        t1: d + r,
        tone: 'bad',
        label: 'RST',
        header: back,
        note: faults.appDown ? 'gunicorn ne radi: na portu 8000 nitko ne sluša, pa operacijski sustav poslužitelja odmah vraća RST.' : `gunicorn sluša samo na 127.0.0.1:8000, a paket je stigao na ${IP.vps}:8000 – tamo nitko ne sluša.`,
        event: { text: `Odbijena veza nakon ${fmtMs(d + r)}: na ${IP.vps}:8000 nitko ne sluša`, tone: 'bad' },
      },
    )
    phases.push({ kind: 'tcp', t0: d, t1: d + r, label: 'TCP · odbijeno', bad: true })
    return finish(params, url, segs, phases, 'refused', 'vrata', r, 'door8000', {
      curl: `curl: (7) Failed to connect to ${host} port 8000 after ${Math.max(1, Math.round(d + r))} ms: Couldn't connect to server`,
      explain: faults.appDown
        ? 'Paket je stigao do poslužitelja, ali na portu 8000 nitko ne sluša. Odbijanje stiže brzo – nakon jednog povratnog putovanja.'
        : 'gunicorn sluša samo na 127.0.0.1. Na samom poslužitelju radi curl http://localhost:8000, a izvana je veza odbijena.',
    })
  }

  // TCP handshake succeeds
  segs.push(
    { kind: 'tcp', route: https ? 'to-proxy' : 'to-door8000', t0: d, t1: d + r / 2, tone: 'req', label: 'SYN', header: syn, note: `TCP rukovanje: SYN prema ${IP.vps}:${port}.` },
    {
      kind: 'tcp',
      route: https ? 'from-proxy' : 'from-door8000',
      t0: d + r / 2,
      t1: d + r,
      tone: 'ok',
      label: 'SYN-ACK',
      header: back,
      note: 'Poslužitelj odgovara SYN-ACK: veza je otvorena (1 povratno putovanje).',
      event: { text: `TCP veza otvorena (${fmtMs(r)} = 1 RTT)`, tone: 'info' },
    },
  )
  phases.push({ kind: 'tcp', t0: d, t1: d + r, label: 'TCP' })
  let h0 = d + r

  if (https) {
    segs.push(
      { kind: 'tls', route: 'to-proxy', t0: h0, t1: h0 + r / 2, tone: 'req', label: 'ClientHello', header: syn, note: 'TLS 1.3: mobitel predlaže ključeve za šifriranje.' },
      {
        kind: 'tls',
        route: 'from-proxy',
        t0: h0 + r / 2,
        t1: h0 + r,
        tone: 'ok',
        label: 'certifikat',
        header: back,
        note: 'Caddy šalje certifikat za klopa.example i svoj dio ključa: kanal je šifriran.',
        event: { text: `TLS 1.3 gotov (${fmtMs(r)} = 1 RTT)`, tone: 'info' },
      },
    )
    phases.push({ kind: 'tls', t0: h0, t1: h0 + r, label: 'TLS' })
    h0 += r
  }

  const reqArrive = h0 + r / 2
  if (https) {
    segs.push({ kind: 'http', route: 'to-proxy', t0: h0, t1: reqArrive, tone: 'req', label: 'GET /', header: syn, note: 'HTTP zahtjev GET / (šifriran) stiže do Caddyja na portu 443.' })
    const lh = `127.0.0.1:${pport} → 127.0.0.1:8000`
    segs.push({ kind: 'http', route: 'proxy-app', t0: reqArrive, t1: reqArrive, tone: 'req', label: 'GET /', header: lh, note: 'Caddy prosljeđuje zahtjev aplikaciji na istom stroju: 127.0.0.1:8000.' })
    if (faults.appDown) {
      segs.push(
        {
          kind: 'http',
          route: 'app-proxy',
          t0: reqArrive,
          t1: reqArrive,
          tone: 'bad',
          label: 'RST',
          header: `127.0.0.1:8000 → 127.0.0.1:${pport}`,
          note: 'gunicorn ne radi: Caddyjeva veza prema 127.0.0.1:8000 odbijena je.',
          event: { text: 'Caddy → 127.0.0.1:8000: odbijena veza (aplikacija ne radi)', tone: 'warn' },
        },
        {
          kind: 'http',
          route: 'from-proxy',
          t0: reqArrive,
          t1: h0 + r,
          tone: 'bad',
          label: '502',
          header: back,
          note: 'Caddy radi pa Petri odgovara on: 502 Bad Gateway – „iza mene nitko ne odgovara”.',
          event: { text: `502 Bad Gateway nakon ${fmtMs(h0 + r)}: proxy radi, aplikacija ne`, tone: 'bad' },
        },
      )
      phases.push({ kind: 'http', t0: h0, t1: h0 + r, label: 'HTTP · 502', bad: true })
      return finish(params, url, segs, phases, 'bad-gateway', 'proces', r, 'proxy', {
        curl: 'HTTP/2 502',
        explain: 'Veza, TLS i HTTP do proxyja rade; proxy ne može dosegnuti aplikaciju pa odgovara 502. Kvar je u procesu iza proxyja.',
      })
    }
    segs.push(
      {
        kind: 'app',
        at: 'app',
        t0: reqArrive,
        t1: reqArrive + SERVER_MS,
        tone: 'req',
        label: 'obrada',
        note: faults.loopbackOnly ? `gunicorn (127.0.0.1:8000) obrađuje zahtjev – proxy na istom stroju do njega dolazi (${SERVER_MS} ms).` : `gunicorn obrađuje zahtjev (${SERVER_MS} ms).`,
      },
      { kind: 'http', route: 'app-proxy', t0: reqArrive + SERVER_MS, t1: reqArrive + SERVER_MS, tone: 'ok', label: '200', header: `127.0.0.1:8000 → 127.0.0.1:${pport}`, note: 'Aplikacija vraća odgovor Caddyju.' },
      {
        kind: 'http',
        route: 'from-proxy',
        t0: reqArrive + SERVER_MS,
        t1: h0 + r + SERVER_MS,
        tone: 'ok',
        label: '200 OK',
        header: back,
        note: 'Odgovor 200 OK putuje natrag do Petre.',
        event: { text: `200 OK: prvi bajt nakon ${fmtMs(h0 + r + SERVER_MS)}`, tone: 'ok' },
      },
    )
  } else {
    segs.push(
      { kind: 'http', route: 'to-app', t0: h0, t1: reqArrive, tone: 'req', label: 'GET /', header: syn, note: 'HTTP zahtjev GET / stiže do gunicorna na portu 8000 (nešifriran!).' },
      { kind: 'app', at: 'app', t0: reqArrive, t1: reqArrive + SERVER_MS, tone: 'req', label: 'obrada', note: `gunicorn obrađuje zahtjev (${SERVER_MS} ms).` },
      {
        kind: 'http',
        route: 'from-app',
        t0: reqArrive + SERVER_MS,
        t1: h0 + r + SERVER_MS,
        tone: 'ok',
        label: '200 OK',
        header: back,
        note: 'Odgovor 200 OK putuje natrag do Petre.',
        event: { text: `200 OK: prvi bajt nakon ${fmtMs(h0 + r + SERVER_MS)}`, tone: 'ok' },
      },
    )
  }
  phases.push({ kind: 'http', t0: h0, t1: h0 + r + SERVER_MS, label: 'HTTP', server: [reqArrive, reqArrive + SERVER_MS] })
  return finish(params, url, segs, phases, 'ok', null, r, null, {
    curl: https ? 'HTTP/2 200' : 'HTTP/1.1 200 OK',
    explain: https
      ? `Nova HTTPS veza: DNS + TCP + TLS + HTTP = ${fmtMs(d)} + 3 × ${fmtMs(r)} + ${SERVER_MS} ms obrade.`
      : `HTTP bez TLS-a: DNS + TCP + HTTP = ${fmtMs(d)} + 2 × ${fmtMs(r)} + ${SERVER_MS} ms obrade.`,
  })
}

function finish(
  params: TraceParams,
  url: string,
  segs: Seg[],
  phases: Phase[],
  outcome: Outcome,
  layer: Layer | null,
  rtt: number,
  failAt: Spot | null,
  extra: { curl: string; explain: string },
): Trace {
  for (const s of segs) {
    s.t0 = r1(s.t0)
    s.t1 = r1(s.t1)
  }
  const total = segs.length ? segs[segs.length - 1].t1 : 0
  return {
    params,
    url,
    segs,
    phases: phases.map((p) => ({ ...p, t0: r1(p.t0), t1: r1(p.t1) })),
    outcome,
    layer,
    total,
    rtt,
    failAt,
    browser: BROWSER[outcome],
    curl: extra.curl,
    curlCmd: `${outcome === 'timeout' ? `curl --connect-timeout ${TIMEOUT_MS / 1000}` : outcome === 'ok' || outcome === 'bad-gateway' ? 'curl -sI' : 'curl'} ${url}`,
    explain: extra.explain,
    timeoutNote: outcome === 'timeout' ? `${fmtMs(TIMEOUT_MS)} (sim) · stvarno: desetci sekundi, ovisno o klijentu` : undefined,
  }
}

/** Kilometres in Croatian notation: 4 digits without a separator (7254), from 10 000 with a narrow no-break space (16 028). */
export function fmtKm(km: number): string {
  const n = Math.round(km)
  return n < 10000 ? String(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}

/** Milliseconds in Croatian notation: 0,1 ms · 7,2 ms · 53,6 ms · 480 ms · 5,0 s */
export function fmtMs(v: number): string {
  const nb = ' '
  if (v >= 1000) return `${(v / 1000).toLocaleString('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${nb}s`
  if (v >= 100) return `${Math.round(v).toLocaleString('hr-HR')}${nb}ms`
  if (v === 0) return `0${nb}ms`
  const rounded = Math.round(v * 10) / 10
  return `${rounded.toLocaleString('hr-HR', { minimumFractionDigits: rounded % 1 ? 1 : 0, maximumFractionDigits: 1 })}${nb}ms`
}

/** The real ms shown on the stopwatch while segment `i` is `frac` done. */
export function msAt(trace: Trace, i: number, frac: number): number {
  const s = trace.segs[Math.min(i, trace.segs.length - 1)]
  if (!s) return 0
  return s.t0 + (s.t1 - s.t0) * Math.max(0, Math.min(1, frac))
}

/* =====================================================================
   The four tickets of the diagnosis challenge ("Četiri prijave")
   ===================================================================== */

export interface Ticket {
  id: number
  when: string
  /** what Petra writes */
  says: string
  params: TraceParams
  layer: Layer
  /** what actually happened (revealed after a correct answer) */
  reveal: string
}

const base = (scenario: Scenario, faults: Partial<Faults>, seed: number): TraceParams => ({
  scenario,
  client: 'petra',
  place: 'frankfurt',
  faults: { ...NO_FAULTS, ...faults },
  dnsCached: false,
  seed,
})

export const TICKETS: Ticket[] = [
  {
    id: 1,
    when: 'utorak, 08:10',
    says: 'Greška iskoči čim kliknem.',
    params: base('vps', { loopbackOnly: true }, 11),
    layer: 'vrata',
    reveal: 'Lana je nakon nadogradnje ponovno pokrenula gunicorn bez `--bind`, pa sluša samo na `127.0.0.1:8000`. Paket stiže na `203.0.113.10:8000`, ali tamo nitko ne sluša – operacijski sustav odmah vraća RST.',
  },
  {
    id: 2,
    when: 'srijeda, 11:42',
    says: 'Vrti se, vrti… i odustane.',
    params: base('vps', { drop: true }, 12),
    layer: 'put',
    reveal: 'U vatrozidu u oblaku obrisano je pravilo za port 8000. Paketi se tiho odbacuju (DROP), pa mobitel čeka do isteka vremena.',
  },
  {
    id: 3,
    when: 'četvrtak, 12:05',
    says: 'Upisala sam klopa.example i ništa.',
    params: base('proxy', { nxdomain: true }, 13),
    layer: 'ime',
    reveal: 'Klopa sada radi iza Caddyja, ali nitko nije produžio registraciju domene `klopa.example`, pa DNS za nju više ne zna: razrješivač odgovara NXDOMAIN i nijedan paket ne kreće prema poslužitelju.',
  },
  {
    id: 4,
    when: 'petak, 12:01',
    says: 'Stranica se otvori, ali piše 502.',
    params: base('proxy', { appDown: true }, 14),
    layer: 'proces',
    reveal: 'Caddy radi i odgovara, ali `gunicorn` se srušio. Proxy se ne može spojiti na `127.0.0.1:8000` pa vraća 502 Bad Gateway.',
  },
]

export const DIAGNOSES: { value: Layer | 'spor'; label: string }[] = [
  { value: 'ime', label: 'Ime: DNS ne zna to ime' },
  { value: 'vrata', label: 'Vrata: na tom portu nitko ne sluša' },
  { value: 'put', label: 'Put: paketu nitko ne odgovara (vatrozid ga baca ili je adresa kriva)' },
  { value: 'proces', label: 'Proces: proxy radi, aplikacija iza njega ne' },
  { value: 'spor', label: 'Poslužitelj je preopterećen i spor' },
]
