/** Short index of the course's lectures (number → slug, title, module) for links from this capstone. */
export interface LectureRef {
  id: string
  slug: string
  title: string
  module: 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6'
  /** what this lecture added to Klopa, in a few words (the concept graph) */
  added: string
}

export const COURSE: LectureRef[] = [
  { id: '01', slug: 'put-jednog-zahtjeva', title: 'Put jednog zahtjeva', module: 'm1', added: 'DNS, TCP, HTTP' },
  { id: '02', slug: 'granice-jednog-posluzitelja', title: 'Jedan poslužitelj u 12:00', module: 'm1', added: 'jezgre, RAM, red čekanja' },
  { id: '03', slug: 'zasto-raspodijeljeni-sustavi', title: 'Zašto raspodijeljeni sustavi', module: 'm1', added: 'više poslužitelja, dostupnost' },
  { id: '04', slug: 'load-balancer', title: 'Load balancer', module: 'm1', added: 'raspodjela opterećenja' },
  { id: '05', slug: 'kad-posluzitelj-padne', title: 'Kad poslužitelj padne', module: 'm1', added: 'provjere ispravnosti, stanje izvan procesa' },
  { id: '06', slug: 'redovi-poruka', title: 'Redovi poruka', module: 'm1', added: 'red, ponovni pokušaji, DLQ' },
  { id: '07', slug: 'virtualni-stroj-i-kontejner', title: 'Virtualni stroj i kontejner', module: 'm2', added: 'namespaceovi, cgroups' },
  { id: '08', slug: 'docker', title: 'Docker', module: 'm2', added: 'slika, slojevi, registar' },
  { id: '09', slug: 'docker-compose', title: 'Docker Compose', module: 'm2', added: 'cijela Klopa na jednom računalu' },
  { id: '10', slug: 'zasto-kubernetes', title: 'Zašto Kubernetes', module: 'm3', added: 'željeno stanje, petlja usklađivanja' },
  { id: '11', slug: 'klaster-iznutra', title: 'Klaster iznutra', module: 'm3', added: 'API poslužitelj, etcd, raspoređivač, kubelet' },
  { id: '12', slug: 'pod', title: 'Pod', module: 'm3', added: 'provjere živosti i spremnosti' },
  { id: '13', slug: 'deployment', title: 'Deployment', module: 'm3', added: 'uvođenje i povratak' },
  { id: '14', slug: 'service', title: 'Service', module: 'm3', added: 'stalna adresa, EndpointSlice' },
  { id: '15', slug: 'gateway-api', title: 'Gateway API', module: 'm3', added: 'ulaz, TLS, HTTPRoute' },
  { id: '16', slug: 'configmap-i-secret', title: 'ConfigMap i Secret', module: 'm4', added: 'konfiguracija izvan slike' },
  { id: '17', slug: 'resursi-i-rasporedivanje', title: 'Resursi i raspoređivanje', module: 'm4', added: 'requests, limits, OOMKilled' },
  { id: '18', slug: 'autoskaliranje', title: 'Automatsko skaliranje', module: 'm4', added: 'HPA, Cluster Autoscaler, KEDA' },
  { id: '19', slug: 'pohrana-i-statefulset', title: 'Volumeni i StatefulSet', module: 'm4', added: 'podatci koji preživljavaju' },
  { id: '20', slug: 'sto-je-deployment', title: 'Što je deploy', module: 'm5', added: 'strategije izdanja, canary' },
  { id: '21', slug: 'ci-cd', title: 'CI/CD', module: 'm5', added: 'pipeline, predmemorija, digest' },
  { id: '22', slug: 'gitops-argo-cd', title: 'GitOps i Argo CD', module: 'm5', added: 'Git kao izvor istine, selfHeal' },
  { id: '23', slug: 'tajne-u-gitopsu', title: 'Tajne u GitOpsu', module: 'm5', added: 'ESO, Sealed Secrets' },
  { id: '24', slug: 'dan-izdanja', title: 'Dan izdanja', module: 'm6', added: 'observability' },
]

export const MODULE_TITLE: Record<LectureRef['module'], string> = {
  m1: 'Zašto raspodijeljeni sustavi',
  m2: 'Kontejneri',
  m3: 'Kubernetes: temelji',
  m4: 'Kubernetes u pogonu',
  m5: 'Isporuka softvera',
  m6: 'Sve zajedno',
}

export function lectureRef(id: string): LectureRef | undefined {
  return COURSE.find((l) => l.id === id)
}

export function lectureHref(id: string): string {
  const l = lectureRef(id)
  return l ? `/predavanje/${l.slug}` : '/'
}
