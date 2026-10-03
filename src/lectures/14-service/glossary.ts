import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 14 (Service) that the course glossary does not have yet. Course-wide entries win on
 * id conflicts (service, endpointslice, label, namespace live in src/curriculum/data.ts; kube-proxy in lecture 11).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'selector',
    term: 'Label selector',
    hr: 'selektor',
    definition:
      'Popis parova ključ=vrijednost kojim objekt (npr. Service ili Deployment) bira Podove. Pod je odabran samo ako ima SVE navedene oznake s točno tim vrijednostima i nalazi se u istom Namespaceu.',
    menza: 'spremljena pretraga po hashtagovima',
  },
  {
    id: 'clusterip',
    term: 'ClusterIP',
    hr: 'ClusterIP',
    definition:
      'Stalna virtualna IP adresa Servicea, dostupna samo unutar klastera. Nijedno računalo je nema na mrežnoj kartici: pravila na svakom čvoru pakete za nju preusmjere na jedan spreman Pod.',
    menza: 'glavni broj telefona menze',
  },
  {
    id: 'coredns',
    term: 'CoreDNS',
    hr: 'CoreDNS',
    definition:
      'DNS poslužitelj klastera. Za svaki Service drži ime oblika ime.namespace.svc.cluster.local; Podovi ga pitaju za adresu Servicea.',
  },
  {
    id: 'dnat',
    term: 'DNAT',
    hr: 'promjena odredišne adrese',
    definition:
      'Destination NAT: jezgra operacijskog sustava paketu zamijeni odredišnu adresu (ClusterIP Servicea) adresom odabranog Poda. conntrack zapamti zamjenu i u odgovoru vrati izvornu adresu.',
  },
  {
    id: 'conntrack',
    term: 'conntrack',
    hr: 'praćenje veza',
    definition:
      'Tablica u jezgri operacijskog sustava koja pamti svaku vezu i njezine zamjene adresa. Zato svi paketi jedne veze idu istom Podu, a odgovor izgleda kao da dolazi od Servicea.',
  },
  {
    id: 'session-affinity',
    term: 'sessionAffinity: ClientIP',
    hr: 'afinitet po IP adresi klijenta',
    definition:
      'Postavka Servicea: nove veze s iste izvorne IP adrese idu istom Podu (zadano do 10 800 s). Ne razlikuje korisnike iza istog NAT-a – cijeli kampus može završiti na jednom Podu.',
  },
]

export default glossary
