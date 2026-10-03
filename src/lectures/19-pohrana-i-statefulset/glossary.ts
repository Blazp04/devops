import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 19 that the course glossary does not have yet (persistentvolume,
 * persistentvolumeclaim and statefulset live in src/curriculum/data.ts; crd in lecture 15).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'storageclass',
    term: 'StorageClass',
    hr: 'StorageClass (klasa pohrane)',
    definition:
      'Predložak za stvaranje diskova: koji CSI driver ih izrađuje, s kojim postavkama, kada (volumeBindingMode) i što se s diskom događa nakon brisanja PVC-a (reclaimPolicy).',
    menza: 'tvornica hladnjaka',
    lecture: '19',
  },
  {
    id: 'emptydir',
    term: 'emptyDir',
    hr: 'emptyDir',
    definition:
      'Prazan direktorij koji nastaje s Podom i nestaje s njim. Preživi ponovno pokretanje kontejnera, ali ne i brisanje ili preseljenje Poda.',
    menza: 'pretinac u kutiji za ručak',
    lecture: '19',
  },
  {
    id: 'access-mode',
    term: 'Access mode',
    hr: 'način pristupa',
    definition:
      'Tko smije koristiti volumen: RWO (jedan čvor; Podovi na njemu ga mogu dijeliti), ROX (više čvorova, samo čitanje), RWX (više čvorova, čitanje i pisanje) i RWOP (točno jedan Pod).',
    lecture: '19',
  },
  {
    id: 'headless-service',
    term: 'Headless Service',
    hr: 'headless Service',
    definition:
      'Service bez ClusterIP adrese (clusterIP: None). DNS za njega vraća IP adrese samih Podova, a uz StatefulSet svaki Pod dobiva stalno ime poput db-1.db.klopa.svc.cluster.local.',
    lecture: '19',
  },
  {
    id: 'csi-driver',
    term: 'CSI driver',
    hr: 'CSI driver',
    definition:
      'Dodatak koji Kubernetesu omogućuje rad s određenom vrstom pohrane (disk u oblaku, NFS, lokalni disk): stvara, spaja, odspaja i briše volumene. CSI = Container Storage Interface.',
    lecture: '19',
  },
  {
    id: 'operator',
    term: 'Operator',
    hr: 'operator',
    definition:
      'Vlastiti tip objekta (CRD) i kontroler koji zna voditi određenu aplikaciju, npr. Postgres: postavlja primarnu bazu i replike, radi preuzimanje rada (engl. failover) i sigurnosne kopije.',
    lecture: '19',
  },
]

export default glossary
