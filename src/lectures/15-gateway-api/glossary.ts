import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 15 that the course glossary does not have yet
 * (gateway-api and ingress live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'httproute',
    term: 'HTTPRoute',
    hr: 'HTTPRoute',
    definition:
      'Objekt Gateway API-ja s pravilima za HTTP promet: domene (hostnames), putanje (PathPrefix ili Exact), zaglavlja i backendRefs s težinama. Piše ga tim aplikacije, a vrijedi kad ga Gateway prihvati.',
    lecture: '15',
    menza: 'natpis na putokazu iza gradskih vrata',
  },
  {
    id: 'gatewayclass',
    term: 'GatewayClass',
    hr: 'GatewayClass',
    definition: 'Vrsta vrata: kaže koji kontroler (implementacija, npr. Envoy Gateway) gradi Gatewaye te klase. Objavljuje je pružatelj infrastrukture.',
    lecture: '15',
    menza: 'nacrt vrata',
  },
  {
    id: 'crd',
    term: 'CustomResourceDefinition (CRD)',
    hr: 'CRD',
    definition:
      'Definicija nove vrste objekta u API-ju Kubernetesa. Nakon instalacije API server prihvaća i sprema takve objekte, ali nešto se događa tek kad ih kontroler (petlja usklađivanja) počne ostvarivati.',
    lecture: '15',
  },
]

export default glossary
