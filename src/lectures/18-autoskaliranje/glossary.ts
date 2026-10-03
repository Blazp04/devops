import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 18 that the course glossary does not have yet. Course-wide entries with the same id
 * take precedence (horizontalpodautoscaler and cluster-autoscaler live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'hpa-tolerance',
    term: 'HPA tolerance',
    hr: 'tolerancija HPA-a',
    definition:
      'Mrtva zona oko cilja: ako je omjer izmjerene i ciljne iskorištenosti između 0,9 i 1,1, HPA ne mijenja broj replika. Zadano je 10 %, a može se postaviti za svaki HPA posebno.',
    lecture: '18',
  },
  {
    id: 'stabilization-window',
    term: 'stabilizationWindowSeconds',
    hr: 'prozor stabilizacije',
    definition:
      'HPA pamti svoje preporuke iz zadnjih N sekundi i pri smanjivanju bira najveću. Za smanjivanje je zadano 300 s, za povećavanje 0 s – zato Podovi dolaze brzo, a odlaze polako.',
    lecture: '18',
  },
  {
    id: 'keda',
    term: 'KEDA',
    hr: 'KEDA (skaliranje prema događajima)',
    definition:
      'Dodatak za Kubernetes koji skalira prema vanjskim izvorima, npr. dubini reda poruka. Njegov operator budi Deployment s 0 na 1 Pod, a HPA koji KEDA stvori skalira od 1 do N.',
    lecture: '18',
    menza: 'kuhar koji dolazi tek kad stigne prvi listić',
  },
  {
    id: 'pod-disruption-budget',
    term: 'PodDisruptionBudget',
    hr: 'PodDisruptionBudget (PDB)',
    definition:
      'Pravilo koliko Podova smije istodobno nedostajati (minAvailable ili maxUnavailable) pri dobrovoljnim prekidima kroz Eviction API, npr. kubectl drain. Ne štiti od pada čvora.',
    lecture: '18',
  },
  {
    id: 'vertical-pod-autoscaler',
    term: 'Vertical Pod Autoscaler',
    hr: 'Vertical Pod Autoscaler (VPA)',
    definition:
      'Zaseban dodatak koji predlaže ili mijenja requests Podova prema stvarnoj potrošnji (načini Off, Initial, Recreate, InPlaceOrRecreate). Ne smije upravljati istom metrikom kao HPA.',
    lecture: '18',
  },
  {
    id: 'karpenter',
    term: 'Karpenter',
    hr: 'Karpenter',
    definition:
      'Alternativa Cluster Autoscaleru: ne povećava unaprijed zadane grupe čvorova, nego prema requests Podova koji čekaju sam odabere i naruči odgovarajući čvor.',
    lecture: '18',
  },
]

export default glossary
