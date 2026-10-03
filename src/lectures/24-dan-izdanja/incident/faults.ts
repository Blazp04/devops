/**
 * L24 „Incident u 12:00” – the fault deck (metadata only; injection and checks live in model.ts).
 * Every fault reproduces the symptoms of the lecture that taught its mechanism (curriculum flagship model).
 */

export type FaultId =
  | 'selektor'
  | 'liveness-baza'
  | 'readiness-baza'
  | 'tag'
  | 'secret-kljuc'
  | 'hpa-max'
  | 'hpa-bez-cpu'
  | 'stara-lozinka'
  | 'httproute'
  | 'worker-oom'
  | 'otrovna-poruka'
  | 'drift'

export type SignalId = 'red' | 'pods' | 'describe' | 'logs' | 'events' | 'endpoints' | 'hpa' | 'argocd' | 'trace' | 'queue'

export interface FaultMeta {
  id: FaultId
  /** cause as offered in the „Hipoteza” form */
  cause: string
  /** pager line shown when the incident starts (symptom only, never the cause) */
  alert: string
  /** lectures that explain the mechanism */
  lectures: string[]
  /** signals that reveal it (any of them counts) */
  signals: SignalId[]
  /** what protected (or should have protected) the system */
  mechanism: string
  /** the fix that closes it (shown after it is resolved) */
  fix: string
  /** true: needs no commit – a mechanism already contains it */
  selfContained?: boolean
}

export const SIGNAL_LABEL: Record<SignalId, string> = {
  red: 'metrike (RED)',
  pods: 'kubectl get pods',
  describe: 'kubectl describe pod',
  logs: 'kubectl logs',
  events: 'kubectl get events',
  endpoints: 'kubectl get endpointslices',
  hpa: 'kubectl get hpa',
  argocd: 'argocd app get / diff',
  trace: 'trag zahtjeva',
  queue: 'red poruka (dubina, DLQ)',
}

export const LECTURE_OPTIONS: { value: string; label: string }[] = [
  { value: '06', label: '06 · Redovi poruka' },
  { value: '12', label: '12 · Pod' },
  { value: '13', label: '13 · Deployment' },
  { value: '14', label: '14 · Service' },
  { value: '15', label: '15 · Gateway API' },
  { value: '16', label: '16 · ConfigMap i Secret' },
  { value: '17', label: '17 · Resursi i raspoređivanje' },
  { value: '18', label: '18 · Autoskaliranje' },
  { value: '22', label: '22 · GitOps i Argo CD' },
  { value: '23', label: '23 · Tajne u GitOpsu' },
]

export const FAULTS: Record<FaultId, FaultMeta> = {
  selektor: {
    id: 'selektor',
    cause: 'Selektor Servicea ne odgovara oznakama Podova',
    alert: 'klopa-api: gotovo svaki zahtjev završava greškom',
    lectures: ['14'],
    signals: ['endpoints', 'red', 'trace'],
    mechanism: 'EndpointSlice sadrži samo Podove čije oznake odgovaraju selektoru. Podovi su zdravi, ali Service ih ne vidi.',
    fix: 'Commit: `selector: app: klopa-api` u `service.yaml` (ili `git revert` Ivina commita).',
  },
  'liveness-baza': {
    id: 'liveness-baza',
    cause: 'Provjera živosti ovisi o bazi',
    alert: 'klopa-api: Podovi se ponovno pokreću, greške rastu',
    lectures: ['12'],
    signals: ['pods', 'describe', 'events'],
    mechanism: 'Provjera živosti treba pitati samo „je li proces živ?”. Kad pita bazu, kratak prekid baze ubija sve Podove odjednom i šalje ih u CrashLoopBackOff.',
    fix: 'Commit: `livenessProbe` natrag na `/healthz`.',
  },
  'readiness-baza': {
    id: 'readiness-baza',
    cause: 'Provjera spremnosti ovisi o bazi',
    alert: 'klopa-api: odjednom nijedan spreman Pod',
    lectures: ['12', '14'],
    signals: ['endpoints', 'pods', 'red'],
    mechanism: 'Kad baza zastane, svi Podovi istodobno postanu nespremni (`ready: false` u EndpointSliceu), pa Gateway nema kamo poslati zahtjev. Jedan kvar ovisnosti ugasi cijeli API.',
    fix: 'Commit: `readinessProbe` na `/ready` (provjera vlastite spremnosti, ne baze).',
  },
  tag: {
    id: 'tag',
    cause: 'U Gitu je tag slike koji ne postoji u registru',
    alert: 'klopa-api: novi Podovi ne kreću, uvođenje stoji',
    lectures: ['13', '22'],
    signals: ['pods', 'describe', 'argocd', 'events'],
    mechanism: 'Uvođenje staje: novi Podovi su u ImagePullBackOff, a stari i dalje poslužuju (maxUnavailable). Nakon roka napretka Deployment javlja ProgressDeadlineExceeded i ne vraća se sam.',
    fix: '`git revert` lošeg commita ili commit s ispravnim tagom.',
  },
  'secret-kljuc': {
    id: 'secret-kljuc',
    cause: 'Deployment traži ključ kojeg nema u Secretu',
    alert: 'klopa-api: uvođenje zapelo usred puta',
    lectures: ['16', '23'],
    signals: ['pods', 'describe', 'events'],
    mechanism: 'Kontejner se ne može ni stvoriti (CreateContainerConfigError), pa novi Podovi nikad nisu spremni. Stari Podovi drže promet dok se uvođenje ne popravi.',
    fix: 'Commit: `secretKeyRef.key: kljuc` (ime ključa koje ExternalSecret stvarno puni).',
  },
  'hpa-max': {
    id: 'hpa-max',
    cause: '`maxReplicas` HPA-a je premalen za ručak',
    alert: 'klopa-api: p95 iznad 1 s',
    lectures: ['18'],
    signals: ['hpa', 'red'],
    mechanism: 'HPA računa da treba više Podova, ali staje na `maxReplicas`. Procesorske jezgre Podova su zasićene i čekanje raste.',
    fix: 'Commit: `maxReplicas: 10` u `hpa.yaml`.',
  },
  'hpa-bez-cpu': {
    id: 'hpa-bez-cpu',
    cause: 'Podovi nemaju `requests.cpu`, pa je HPA slijep',
    alert: 'klopa-api: HPA ne skalira tijekom ručka',
    lectures: ['17', '18'],
    signals: ['hpa', 'argocd', 'events'],
    mechanism: 'HPA računa iskorištenost kao potrošnju podijeljenu sa `requests.cpu`. Bez te vrijednosti nema postotka, pa nema ni skaliranja.',
    fix: 'Commit: vratite `resources.requests.cpu` (i `limits.cpu`).',
  },
  'stara-lozinka': {
    id: 'stara-lozinka',
    cause: 'Podovi drže staru lozinku baze nakon rotacije',
    alert: 'klopa-api: greške 500 na svakoj narudžbi',
    lectures: ['16', '23'],
    signals: ['logs', 'trace', 'red'],
    mechanism: 'Varijabla okoline iz Secreta čita se samo kad se kontejner stvara. ESO je osvježio Secret, ali Podovi koji već rade i dalje šalju staru lozinku.',
    fix: 'Commit anotacije `restartedAt` u predlošku Poda (ponovno uvođenje kroz Git).',
  },
  httproute: {
    id: 'httproute',
    cause: 'HTTPRoute više nema pravilo za `/api`',
    alert: 'klopa.example: svi API zahtjevi vraćaju 404',
    lectures: ['15'],
    signals: ['red', 'trace', 'argocd'],
    mechanism: 'Bez pravila za `/api` zahtjev uhvati opće pravilo `/` i završi u klopa-web, koji ne zna za `/api/…` (404). Podovi klopa-api su zdravi, ali do njih ništa ne stiže.',
    fix: 'Commit: pravilo `PathPrefix /api → klopa-api` u `httproute.yaml`.',
  },
  'worker-oom': {
    id: 'worker-oom',
    cause: 'Ograničenje memorije potrošača je premalo',
    alert: 'klopa-worker: narudžbe stoje u redu',
    lectures: ['17', '06'],
    signals: ['pods', 'describe', 'queue', 'events'],
    mechanism: 'Jezgra operacijskog sustava ubija kontejner čim prijeđe `limits.memory` (OOMKilled, izlazni kod 137). Red čuva narudžbe pa se ništa ne gubi, ali kuhinja ne dobiva listiće.',
    fix: 'Commit: `limits.memory: 256Mi` za `klopa-worker`.',
  },
  'otrovna-poruka': {
    id: 'otrovna-poruka',
    cause: 'Otrovna poruka (narudžba koju nijedan potrošač ne može obraditi)',
    alert: 'klopa-worker: ista narudžba pada iznova',
    lectures: ['06'],
    signals: ['logs', 'queue'],
    mechanism: 'Ponovni pokušaji s odgodom, a nakon zadnjeg poruka ide u DLQ. Ostale narudžbe teku dalje – mehanizam je kvar sam obuzdao.',
    fix: 'Nije potreban commit: poruka je u DLQ-u, a ispravak koda ide redovnim putem.',
    selfContained: true,
  },
  drift: {
    id: 'drift',
    cause: 'Ručna promjena u klasteru (odstupanje od Gita)',
    alert: 'Argo CD: klopa je OutOfSync, red raste',
    lectures: ['22'],
    signals: ['argocd', 'queue'],
    mechanism: 'Netko je ručno promijenio klaster dok je selfHeal bio isključen. Argo CD pokazuje razliku, ali je ne ispravlja sam.',
    fix: '`argocd app sync klopa` vrati klaster na Git; `selfHeal: true` vraća se commitom u `argocd/klopa.yaml` (u simulaciji se to dogodi samo).',
  },
}

export const FAULT_IDS = Object.keys(FAULTS) as FaultId[]

export const CAUSE_OPTIONS: { value: FaultId | 'drugo'; label: string }[] = [
  ...FAULT_IDS.map((id) => ({ value: id, label: FAULTS[id].cause.replace(/`/g, '') })),
  { value: 'drugo' as const, label: 'Nešto drugo' },
]
