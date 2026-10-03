/** Texts of L24 that are data (myths, quiz, recap, Davor's on-call handbook). */

export const MYTHS = [
  {
    statement: 'Kubernetes koristi Docker.',
    fact: 'Čvorovi pokreću kontejnere preko containerd-a ili CRI-O-a.',
    explain: 'Posrednik za Docker (dockershim) davno je uklonjen. Slike izgrađene Dockerom i dalje rade jer su standardne OCI slike (08, 11).',
  },
  {
    statement: 'Secreti su šifrirani.',
    fact: 'Po zadanom su samo base64 i nešifrirani u etcd-u.',
    explain: 'base64 je kodiranje, ne šifra. Šifriranje u etcd-u treba uključiti, a pristup ograničiti RBAC-om (16, 23).',
  },
  {
    statement: 'Service dijeli zahtjeve kružno, jedan po jedan.',
    fact: 'kube-proxy za svaku novu vezu bira nasumičan spreman Pod.',
    explain: 'Odluka je po vezi, ne po zahtjevu: dugotrajna veza ostaje na istom Podu (14).',
  },
  {
    statement: 'Za ulaz u klaster koristite ingress-nginx.',
    fact: 'Kontroler Ingress NGINX je umirovljen; novi ulaz je Gateway API.',
    explain: 'Ingress API i dalje postoji, ali Klopa koristi Gateway i HTTPRoute (15).',
  },
  {
    statement: 'Argo CD reagira odmah.',
    fact: 'Git provjerava svakih 120 s uz do 60 s odstupanja – osim s webhookom.',
    explain: 'Zato je u Klopi uključen webhook: commit se vidi za oko sekundu (22).',
  },
  {
    statement: 'Više RAM-a znači brži poslužitelj.',
    fact: 'RAM ograničava koliko zahtjeva stane odjednom; jezgre ograničavaju propusnost.',
    explain: 'Kad su jezgre zasićene, dodatna memorija ne skraćuje čekanje (02, 04).',
  },
  {
    statement: 'Red poruka ubrzava obradu.',
    fact: 'Red upija nalete; kapacitet dodaju samo potrošači.',
    explain: 'Ako stalno stiže više nego što potrošači stignu, red samo raste (06).',
  },
  {
    statement: 'Raspoređivač gleda stvarnu potrošnju čvora.',
    fact: 'Raspoređivač gleda samo `requests`.',
    explain: 'Čvor može biti „pun” po requests, a gotovo besposlen po stvarnoj potrošnji – i obrnuto (17).',
  },
  {
    statement: 'Deployment se sam vrati kad uvođenje ne uspije.',
    fact: 'Uvođenje stane s ProgressDeadlineExceeded i tu ostane.',
    explain: 'Povratak je `kubectl rollout undo` ili, u GitOpsu, `git revert` (13, 22).',
  },
  {
    statement: 'Kafka treba ZooKeeper.',
    fact: 'Novije verzije Kafke rade samo s KRaftom, bez ZooKeepera.',
    explain: 'Metapodatke klastera Kafka sada vodi sama (06, za znatiželjne).',
  },
]

export const QUIZ = [
  {
    q: 'Svi Podovi klopa-api su Running i 1/1, a Gateway na svaki zahtjev vraća 503. `kubectl get endpointslices` ne pokazuje nijednu adresu. Što je najvjerojatnije?',
    options: ['Podovi su OOMKilled', 'Argo CD je OutOfSync', 'Selektor Servicea ne odgovara oznakama Podova', 'Baza ne odgovara'],
    correct: 2,
    explain: 'Zdravi Podovi i prazan EndpointSlice znače da ih Service ne vidi: selektor i oznake se ne poklapaju (14).',
  },
  {
    q: 'Koji signal najbrže pokaže gdje na putu zahtjev gubi vrijeme ili pada?',
    options: ['Trag (engl. trace) tog zahtjeva', 'Prosječna latencija', 'Broj Podova', '`kubectl get nodes`'],
    correct: 0,
    explain: 'Metrike kažu da nešto ne valja, logovi zašto, a trag gdje: svaki sloj je jedan raspon na vremenskoj crti.',
  },
  {
    q: 'U Gitu je pogrešan tag. Pokrenuli ste `kubectl set image` s ispravnim, a nekoliko sekundi kasnije Podovi opet traže pogrešan. Zašto?',
    options: ['kubectl je promjenu spremio samo u lokalnu datoteku', 'ReplicaSet ne prihvaća sliku koja nije iz Gita', 'Registar je odbio sliku zbog krivog digesta', 'selfHeal vraća klaster na ono što piše u Gitu'],
    correct: 3,
    explain: 'Izvor istine je Git. Ručnu promjenu Argo CD vidi kao odstupanje i vraća je – popravak mora biti commit (22).',
  },
  {
    q: 'Potrošač klopa-worker ima `limits.memory: 96Mi`, a obrada narudžbe treba oko 150 MiB. Što ćete vidjeti?',
    options: ['Pod ostaje Pending dok se ne nađe čvor s više memorije', 'OOMKilled, izlazni kod 137, CrashLoopBackOff i red koji raste', 'Sporiju obradu, ali bez ponovnih pokretanja i bez rasta reda', 'Narudžbe se gube čim se potrošač ponovno pokrene'],
    correct: 1,
    explain: 'Jezgra operacijskog sustava ubija kontejner iznad ograničenja (17). Red čuva narudžbe, ali nitko ih ne obrađuje (06).',
  },
  {
    q: 'Uvođenje s tagom kojeg nema u registru: što se dogodi kad istekne `progressDeadlineSeconds`?',
    options: ['Deployment se sam vrati na prethodnu verziju', 'Svi Podovi se ugase dok se slika ne pojavi', 'Deployment javi ProgressDeadlineExceeded; stari Podovi i dalje poslužuju', 'Argo CD automatski napravi git revert lošeg commita'],
    correct: 2,
    explain: 'Nema automatskog povratka. Argo CD pokaže Degraded, a povratak je `git revert` (13, 22).',
  },
  {
    q: 'ESO je osvježio Secret s novom lozinkom baze. Zašto Podovi koji rade i dalje šalju staru?',
    options: ['Varijabla okoline iz Secreta čita se samo kad se kontejner stvara', 'ESO ne smije pisati u Secret koji Pod već koristi', 'Baza još neko vrijeme prihvaća samo staru lozinku', 'kubelet briše Secrete iz Podova nakon pokretanja'],
    correct: 0,
    explain: 'Treba novo uvođenje: u GitOpsu commit anotacije `restartedAt` (16, 23).',
  },
]

export const RECAP = [
  'Commit do produkcije: CI gradi i testira, registar daje digest, bot ga zapiše u config repozitorij, Argo CD primijeni promjenu Deploymenta, a kontroler Deploymenta uvede novi ReplicaSet.',
  'Zahtjev: DNS → load balancer → Gateway (TLS, HTTPRoute, adrese iz EndpointSlicea) → Pod → Postgres i red → potrošač → SMS.',
  'Svaki sloj ima mehanizam koji ga štiti i signal koji otkriva kad mehanizam nije dovoljan.',
  'Metrike kažu da nešto ne valja, tragovi gdje, logovi zašto; trace_id ih povezuje.',
  'Popravak ide kroz Git: hipoteza, signal, pa commit ili `git revert`. Ručne promjene polja iz Gita selfHeal vraća.',
]

export interface HandbookRow {
  symptom: string
  cause: string
  command: string
  lecture: string
}

export const HANDBOOK: HandbookRow[] = [
  { symptom: 'Podovi Running, a Gateway vraća 503', cause: 'selektor ≠ oznake, EndpointSlice prazan', command: 'kubectl get endpointslices -n klopa', lecture: '14' },
  { symptom: 'svi Podovi odjednom se ponovno pokreću', cause: 'provjera živosti ovisi o bazi', command: 'kubectl describe pod <pod> -n klopa', lecture: '12' },
  { symptom: 'svi Podovi odjednom READY 0/1', cause: 'provjera spremnosti ovisi o bazi ili drugom servisu', command: 'kubectl get pods -n klopa', lecture: '12' },
  { symptom: 'ImagePullBackOff, uvođenje stoji', cause: 'tag ne postoji u registru', command: 'kubectl describe pod <pod> -n klopa', lecture: '13' },
  { symptom: 'CreateContainerConfigError', cause: 'Secret ili ključ ne postoji', command: 'kubectl describe pod <pod> -n klopa', lecture: '16' },
  { symptom: 'OOMKilled, izlazni kod 137', cause: '`limits.memory` premalen', command: 'kubectl describe pod <pod> -n klopa', lecture: '17' },
  { symptom: 'Pending', cause: 'nigdje dovoljno mjesta po requests', command: 'kubectl describe pod <pod> -n klopa', lecture: '17' },
  { symptom: 'p95 raste, HPA na maksimumu', cause: '`maxReplicas` premalen', command: 'kubectl describe hpa klopa-api -n klopa', lecture: '18' },
  { symptom: 'HPA TARGETS <unknown>', cause: 'nema `requests.cpu`, metrics-servera ili još nema mjerenja', command: 'kubectl get hpa -n klopa', lecture: '18' },
  { symptom: '500 password authentication failed', cause: 'Secret rotiran, Podovi imaju staru vrijednost', command: 'kubectl logs <pod> -n klopa', lecture: '16' },
  { symptom: 'svi API zahtjevi 404', cause: 'HTTPRoute nema pravilo za putanju', command: 'kubectl get httproute klopa -n klopa -o yaml', lecture: '15' },
  { symptom: 'ista poruka pada iznova', cause: 'otrovna poruka – nakon pokušaja ide u DLQ', command: 'kubectl logs <pod-potrošača> -n klopa', lecture: '06' },
  { symptom: 'Argo CD OutOfSync bez novog commita', cause: 'ručna promjena u klasteru', command: 'argocd app diff klopa', lecture: '22' },
  { symptom: 'Synced, ali Degraded', cause: 'uvođenje stoji (ProgressDeadlineExceeded)', command: 'argocd app get klopa', lecture: '22' },
]

export function handbookMarkdown(): string {
  const head = [
    '# Davorov dežurni priručnik – Klopa',
    '',
    'Simptom → uzrok → naredba. Popravak uvijek ide kroz Git (commit ili `git revert`).',
    '',
    '| Simptom | Vjerojatan uzrok | Prva naredba | Predavanje |',
    '|---|---|---|---|',
  ]
  const rows = HANDBOOK.map((r) => `| ${r.symptom} | ${r.cause.replace(/`/g, '')} | \`${r.command}\` | ${r.lecture} |`)
  const tail = ['', 'Tri signala: metrike kažu da nešto ne valja, tragovi gdje, logovi zašto; trace_id ih povezuje.', '']
  return [...head, ...rows, ...tail].join('\n')
}

export const NEXT_STEPS: { icon: 'eye' | 'secret' | 'helm' | 'loop' | 'flag'; title: string; text: string }[] = [
  { icon: 'eye', title: 'Observability u dubini', text: 'Prometheus (prikuplja metrike povlačenjem), Grafana i OpenTelemetry za tragove.' },
  { icon: 'secret', title: 'Sigurnost klastera', text: 'RBAC (tko smije što), NetworkPolicy (tko smije s kim razgovarati) i Pod Security.' },
  { icon: 'helm', title: 'Helm u dubini', text: 'Paketi manifesta s vrijednostima; Argo CD ih renderira s `helm template`.' },
  { icon: 'loop', title: 'Service mesh', text: 'mTLS i ponovni pokušaji između servisa, bez promjene koda.' },
  { icon: 'flag', title: 'KCNA', text: 'Ulazni certifikat CNCF-a: temelji Kubernetesa, orkestracija, isporuka i arhitektura.' },
]
