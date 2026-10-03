/** Scene 3 data: who owns which link of GatewayClass → Gateway → HTTPRoute → Service → Pods. */

export type Role = 'class' | 'gw' | 'route'

export const ROLE_LABEL: Record<Role, string> = {
  class: 'Pružatelj infrastrukture',
  gw: 'Operater klastera (Davor)',
  route: 'Tim aplikacije (Lana)',
}

/** which chain links (0 GatewayClass, 1 Gateway, 2 HTTPRoute, 3 Service, 4 Pods) each role owns */
export const OWNS: Record<Role, number[]> = { class: [0], gw: [1], route: [2, 3, 4] }

/** snippet lines; a leading '!' marks the reference line */
export const SNIPPET: Record<Role, string[]> = {
  class: ['apiVersion: gateway.networking.k8s.io/v1', 'kind: GatewayClass', 'metadata:', '  name: eg', 'spec:', '!  controllerName: gateway.envoyproxy.io/gatewayclass-controller'],
  gw: [
    'kind: Gateway',
    'metadata:',
    '  name: klopa-gw',
    '  namespace: klopa',
    'spec:',
    '!  gatewayClassName: eg',
    '  listeners:',
    '    - name: https',
    '      protocol: HTTPS',
    '      port: 443',
    '      tls:',
    '        certificateRefs:',
    '          - name: klopa-tls',
    '      allowedRoutes:',
    '        namespaces:',
    '          from: Same',
  ],
  route: [
    'kind: HTTPRoute',
    'metadata:',
    '  name: klopa',
    '  namespace: klopa',
    'spec:',
    '  parentRefs:',
    '!    - name: klopa-gw',
    '  hostnames: ["klopa.example"]',
    '  rules:',
    '    - matches:',
    '        - path: { type: PathPrefix, value: /api }',
    '      backendRefs:',
    '!        - name: klopa-api',
    '          port: 80',
    '---',
    'kind: Service',
    'metadata:',
    '  name: klopa-api',
    'spec:',
    '  selector:',
    '!    app: klopa-api',
    '    version: "1.4.0"',
  ],
}
