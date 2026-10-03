/**
 * „Put jednog zahtjeva” and „Što ako ovdje pukne?”: the hops of one order from a phone to the kitchen and back.
 * Span timings are an illustrative example in the range the course's models give (E3: 20–60 ms in a klopa-api Pod
 * without load, E2: an order is cooked in ≈ 1 s); the numbers of each failure come from the engines' presets.
 */
import * as Q from '../../engines/queue/index.ts'
import * as T from '../../engines/traffic/index.ts'
import * as G from '../../engines/gitops/index.ts'
import type { Span } from './incident/trace.ts'

export type HopId = 'dns' | 'lb' | 'gateway' | 'service' | 'pod' | 'db' | 'queue' | 'worker' | 'sms'

export interface Hop {
  id: HopId
  /** short name on the drawing */
  name: string
  /** step title */
  title: string
  /** what this layer does (one or two sentences, may contain `code`) */
  body: string
  lectures: string[]
  /** spans this step adds to the waterfall */
  spans: Span[]
}

export const HOPS: Hop[] = [
  {
    id: 'dns',
    name: 'DNS',
    title: 'DNS: klopa.example → adresa',
    body: 'Mobitel pita DNS za `klopa.example` i dobiva javnu adresu load balancera u oblaku. Odgovor je u predmemoriji, pa ovaj korak obično traje gotovo ništa.',
    lectures: ['01'],
    spans: [{ name: 'DNS klopa.example', start: 0, dur: 1, status: 'ok', depth: 1, note: 'iz predmemorije' }],
  },
  {
    id: 'lb',
    name: 'LB u oblaku',
    title: 'Load balancer u oblaku',
    body: 'Load balancer pružatelja oblaka (L4) prosljeđuje vezu na jedan od Podova Gatewaya. Svoje ciljeve provjerava provjerama ispravnosti.',
    lectures: ['04', '05'],
    spans: [{ name: 'load balancer u oblaku', start: 1, dur: 2, status: 'ok', depth: 1 }],
  },
  {
    id: 'gateway',
    name: 'Gateway',
    title: 'Gateway: TLS i HTTPRoute',
    body: 'Gateway završava TLS. Pravilo HTTPRoutea `PathPrefix /api` kao cilj navodi Service `klopa-api`; Gateway iz EndpointSlicea tog Servicea čita adrese spremnih Podova i za svaki zahtjev sam bira Pod.',
    lectures: ['15'],
    spans: [{ name: 'Gateway: TLS + HTTPRoute', start: 3, dur: 4, status: 'ok', depth: 1, note: 'pravilo /api → klopa-api · Pod iz EndpointSlicea' }],
  },
  {
    id: 'service',
    name: 'Service',
    title: 'Service i EndpointSlice: adresar, ne skok',
    body: 'EndpointSlice popisuje Podove čije oznake odgovaraju selektoru i za svaki bilježi je li spreman (`ready: true/false`); promet dobivaju samo spremni. Zahtjev ne prolazi „kroz” Service – Gateway samo čita te adrese, pa u tragu nema novog raspona. Pozivi unutar klastera (npr. `klopa-web` → `klopa-api`) idu na ClusterIP; kube-proxy za svaku novu vezu bira nasumičan spreman Pod.',
    lectures: ['14'],
    spans: [],
  },
  {
    id: 'pod',
    name: 'Pod',
    title: 'Pod klopa-api',
    body: 'Gunicorn u Podu obrađuje narudžbu. Popust za Ćevap-petak i lozinka baze (iz Secreta) stižu kao varijable okoline, pročitane pri pokretanju kontejnera; u 16. predavanju popust je bio u ConfigMapu.',
    lectures: ['12', '16'],
    spans: [{ name: 'Pod klopa-api (gunicorn)', start: 7, dur: 51, status: 'ok', depth: 1, note: '2.0.2' }],
  },
  {
    id: 'db',
    name: 'Postgres',
    title: 'Postgres: narudžba je zapisana',
    body: 'Narudžba se zapisuje u Postgres. U tečaju je to StatefulSet s PVC-om; u produkciji je to obično upravljana baza ili operator.',
    lectures: ['19'],
    spans: [{ name: 'Postgres: INSERT narudžba', start: 18, dur: 22, status: 'ok', depth: 2 }],
  },
  {
    id: 'queue',
    name: 'RabbitMQ',
    title: 'Red poruka: listić za kuhinju',
    body: 'API objavi poruku u red `narudzbe` i odmah odgovori studentu (201). Kuhinja i SMS više ne usporavaju odgovor.',
    lectures: ['06'],
    spans: [{ name: 'RabbitMQ: objava u red narudžbi', start: 41, dur: 3, status: 'ok', depth: 2 }],
  },
  {
    id: 'worker',
    name: 'klopa-worker',
    title: 'Potrošač: kuhinjski listić',
    body: 'Potrošač `klopa-worker` uzme poruku, ispiše listić za kuhinju i tek onda potvrdi poruku (ack). Ovaj dio je asinkron: student je odgovor već dobio.',
    lectures: ['06'],
    spans: [
      { name: 'narudžba u redu (čeka)', start: 44, dur: 160, status: 'ok', depth: 1, note: 'asinkrono' },
      { name: 'klopa-worker: obrada', start: 204, dur: 900, status: 'ok', depth: 1 },
    ],
  },
  {
    id: 'sms',
    name: 'SMS',
    title: 'SMS: „narudžba je spremna”',
    body: 'Na kraju potrošač zove vanjski SMS-gateway. Ako ne odgovori, poruka se ponavlja s odgodom – narudžba se ne gubi.',
    lectures: ['06'],
    spans: [{ name: 'SMS-gateway', start: 1104, dur: 300, status: 'ok', depth: 1, note: 'vanjski servis' }],
  },
]

export interface BreakInfo {
  hop: HopId
  failure: string
  mechanism: string
  signal: string
  lectures: string[]
  /** a number from an engine (with its source), or null */
  evidence: string | null
}

/** What protects each hop – and a number from the engines' validated presets where one exists. */
export function breakInfos(): BreakInfo[] {
  const sms = Q.cardNumbers(Q.runPreset('l06-sms-down-queue'))
  const oom = Q.runPreset('l24-oom-worker')
  const oomBacklog = Math.round(Q.metrics(oom).backlog)
  const oomDlq = Q.cardNumbers(oom).dlq ?? 0
  const lunch = Q.cardNumbers(Q.runPreset('l06-cevap-petak-queue'))
  const lbInc = T.runPreset('l05-incident').incidents[0]
  const lbDetect = lbInc ? T.detectionDelayMs(lbInc) : null
  return [
    {
      hop: 'dns',
      failure: 'DNS poslužitelj ne odgovara.',
      mechanism: 'Odgovori se pamte (TTL) u resolverima i na mobitelu, a domena ima više DNS poslužitelja.',
      signal: 'vanjska provjera (sonda izvan klastera); klaster sam toga nije svjestan',
      lectures: ['01'],
      evidence: null,
    },
    {
      hop: 'lb',
      failure: 'Čvor na kojem je Pod Gatewaya prestane odgovarati.',
      mechanism: 'Load balancer u oblaku provjerama ispravnosti izbaci čvor. Kubernetes ga označi NotReady, a nakon isteka tolerancije (zadano 300 s) izbaci njegove Podove, pa ReplicaSet stvori nove na drugim čvorovima.',
      signal: '`kubectl get nodes` (NotReady), metrike load balancera',
      lectures: ['05', '11'],
      evidence: lbDetect === null ? null : `2 neuspjele provjere ispravnosti → cilj izbačen nakon ${String(lbDetect / 1000).replace('.', ',')} s (Promet, preset l05-incident; provjera svake 2 s (sim) · stvarno: 30 s)`,
    },
    {
      hop: 'gateway',
      failure: 'Pravilo HTTPRoutea više ne odgovara putanji.',
      mechanism: 'Ništa ne štiti od pogrešne konfiguracije – zato ide kroz Git, pregled i `git revert`.',
      signal: 'nagli skok grešaka 404 u metrikama Gatewaya',
      lectures: ['15', '22'],
      evidence: null,
    },
    {
      hop: 'service',
      failure: 'Selektor Servicea ne odgovara oznakama Podova.',
      mechanism: 'Nijedan automatski: EndpointSlice ostane prazan iako su svi Podovi zdravi.',
      signal: '`kubectl get endpointslices` (bez adresa)',
      lectures: ['14'],
      evidence: null,
    },
    {
      hop: 'pod',
      failure: 'Pod klopa-api se sruši ili zaglavi.',
      mechanism: 'Provjera spremnosti ga u EndpointSliceu označi `ready: false` (više ne dobiva promet), provjera živosti ga ponovno pokrene, a ReplicaSet zamijeni Pod koji nestane.',
      signal: '`kubectl get pods` (RESTARTS, READY 0/1), događaji',
      lectures: ['12', '13'],
      evidence: `ponovno pokretanje: odmah, pa 10 s, 20 s, 40 s … najviše 300 s (CrashLoopBackOff)`,
    },
    {
      hop: 'db',
      failure: 'Postgres na pola minute ne odgovara.',
      mechanism: 'Aplikacija ponavlja upite s odgodom; provjere spremnosti i živosti NE pitaju bazu, pa Podovi ne postanu svi nespremni niti se ponovno pokreću.',
      signal: 'greške 503 u RED metrikama, log aplikacije, trag s crvenim rasponom baze',
      lectures: ['12', '19'],
      evidence: null,
    },
    {
      hop: 'queue',
      failure: 'Ćevap-petak: nalet narudžbi veći od kapaciteta kuhinje.',
      mechanism: 'Red upije nalet, a HPA/KEDA dodaju potrošače; red ne ubrzava obradu, samo ništa ne gubi.',
      signal: 'dubina reda i starost najstarije poruke',
      lectures: ['06', '18'],
      evidence: `${lunch.orders} narudžbi, ${lunch.lost} izgubljenih, najviše ${lunch.peak} u redu (Red, preset l06-cevap-petak-queue)`,
    },
    {
      hop: 'worker',
      failure: 'Potrošač prijeđe ograničenje memorije (OOMKilled).',
      mechanism: 'Red čuva poruke dok se potrošač ponovno pokreće; neobrađena poruka se vraća u red.',
      signal: '`kubectl describe pod` (OOMKilled, izlazni kod 137), dubina reda',
      lectures: ['17', '06'],
      evidence: `nakon 120 s: ${oomBacklog} narudžbi čeka u redu; ${oomDlq} poruka nakon 5 isporuka ide u DLQ (Red, preset l24-oom-worker; 5 isporuka je postavka Klope)`,
    },
    {
      hop: 'sms',
      failure: 'SMS-gateway ne radi 30 s.',
      mechanism: 'Ponovni pokušaji s odgodom (backoff); poruka ostaje u redu dok se SMS ne pošalje.',
      signal: 'stopa grešaka potrošača, log s ponovnim pokušajima',
      lectures: ['06'],
      evidence: `najviše ${sms.peak} u redu, red se isprazni za ${String(sms.drainS).replace('.', ',')} s, ${sms.lost} izgubljenih (Red, preset l06-sms-down-queue)`,
    },
  ]
}

/** Argo CD's self-heal (the bonus row under the hops). */
export function selfHealLabel(): string {
  return G.TIMINGS.selfHealFirst.label
}
