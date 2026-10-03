import type { Host, Rule } from './routing.ts'

/** Klopa's finished rules (three HTTPRoutes: klopa, klopa-admin, klopa-ostalo) for the „Koje pravilo vrijedi?” exercise. */
export const DEMO_RULES: Rule[] = [
  { id: 1, host: 'klopa.example', pathType: 'PathPrefix', path: '/', beta: false, backends: [{ svc: 'klopa-web', weight: 1 }] },
  {
    id: 2,
    host: 'klopa.example',
    pathType: 'PathPrefix',
    path: '/api',
    beta: false,
    backends: [
      { svc: 'klopa-api', weight: 90 },
      { svc: 'klopa-api-141', weight: 10 },
    ],
  },
  { id: 3, host: 'klopa.example', pathType: 'PathPrefix', path: '/api', beta: true, backends: [{ svc: 'klopa-api-141', weight: 1 }] },
  { id: 4, host: 'klopa.example', pathType: 'Exact', path: '/api/narudzbe', beta: false, backends: [{ svc: 'klopa-api', weight: 1 }] },
  { id: 5, host: 'admin.klopa.example', pathType: 'PathPrefix', path: '/', beta: false, backends: [{ svc: 'klopa-admin', weight: 1 }] },
  { id: 6, host: '*.klopa.example', pathType: 'PathPrefix', path: '/', beta: false, backends: [{ svc: 'klopa-web', weight: 1 }] },
]

export const DEMO_HOSTS: Host[] = ['klopa.example', 'admin.klopa.example', 'www.klopa.example', 'menza.example']
export const DEMO_PATHS = ['/', '/jelovnik', '/api', '/api/jelovnik', '/api/narudzbe', '/api/narudzbe/7', '/apix']

export const RULE_NOTE: Record<number, string> = {
  1: 'sve ostalo ide webu',
  2: 'API: 90 / 10 između dviju verzija',
  3: 'beta testeri na novu verziju',
  4: 'narudžbe uvijek na stabilnu verziju',
  5: 'administracija na svojoj domeni',
  6: 'sve druge poddomene',
}
