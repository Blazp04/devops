import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 11 (klaster iznutra) that the course glossary does not have. Course entries win on id conflicts. */
const glossary: GlossaryEntry[] = [
  {
    id: 'controller-manager',
    term: 'kube-controller-manager',
    hr: 'controller-manager',
    definition: 'Dio upravljačke ravnine u kojem rade kontroleri (ReplicaSet, čvorovi, Namespacei…). Svaki gleda API poslužitelj i svodi stvarno stanje na željeno.',
    lecture: '11',
    menza: 'tko pazi da ništa ne nedostaje',
  },
  {
    id: 'kubectl',
    term: 'kubectl',
    hr: 'kubectl',
    definition: 'Klijent za naredbeni redak za Kubernetes. Svaka naredba je zahtjev API poslužitelju: kubectl apply zapisuje željeno stanje, kubectl get i describe ga čitaju.',
    lecture: '11',
    menza: 'kreda kojom pišemo po ploči',
  },
  {
    id: 'manifest',
    term: 'Manifest',
    hr: 'manifest',
    definition: 'YAML (ili JSON) datoteka koja opisuje jedan ili više Kubernetes objekata: apiVersion, kind, metadata i spec.',
    lecture: '11',
    menza: 'narudžbenica',
  },
  {
    id: 'imagepullbackoff',
    term: 'ImagePullBackOff',
    hr: 'ImagePullBackOff',
    definition: 'Stanje Poda kad kubelet ne može povući sliku (krivi tag, nedostupan registar, nema prava). Ponovni pokušaji razmiču se: 10 s, 20 s, 40 s… do 5 minuta.',
    lecture: '11',
  },
  {
    id: 'cri',
    term: 'Container Runtime Interface (CRI)',
    hr: 'CRI',
    definition: 'Standardno sučelje preko kojeg kubelet razgovara s izvršnim okruženjem kontejnera (containerd, CRI-O). Zbog njega Kubernetes ne treba Docker.',
    lecture: '11',
  },
  {
    id: 'kube-proxy',
    term: 'kube-proxy',
    hr: 'kube-proxy',
    definition: 'Neobavezna komponenta na svakom čvoru koja postavlja mrežna pravila za Service. Neki mrežni dodaci obavljaju taj posao sami.',
    lecture: '11',
  },
]

export default glossary
