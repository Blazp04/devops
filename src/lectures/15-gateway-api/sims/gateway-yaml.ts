/**
 * The flagship's config as YAML (Gateway API) or as the equivalent Ingress. Every line knows its owner (roles view)
 * and, for HTTPRoute rules, the rule id (so the matching rule can light up).
 */
import { HOST_MATCHES, type Rule } from './routing.ts'
import { routeNameOf, secretReason, secretValid, svcByName, type Config } from './gateway-model.ts'

export type Owner = 'class' | 'gw' | 'route' | 'ingress'

export interface YamlLine {
  text: string
  owner: Owner
  ruleId?: number
  /** status comment (problem) */
  bad?: boolean
  /** comment that explains what Ingress cannot say */
  note?: boolean
}

export const OWNER_LABEL: Record<Owner, string> = {
  class: 'pružatelj infrastrukture',
  gw: 'operater klastera · Davor',
  route: 'tim aplikacije · Lana',
  ingress: 'jedan objekt za sve',
}

function ruleLines(r: Rule, out: YamlLine[]) {
  const L = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'route', ruleId: r.id, ...extra })
  L('    - matches:')
  L('        - path:')
  L(`            type: ${r.pathType}`)
  L(`            value: ${r.path}`)
  if (r.beta) {
    L('          headers:')
    L('            - name: x-beta')
    L('              value: "1"')
  }
  L('      backendRefs:')
  for (const b of r.backends) {
    L(`        - name: ${b.svc}`)
    L('          port: 80')
    if (r.backends.length > 1) L(`          weight: ${b.weight}`)
  }
}

export function gatewayYaml(c: Config): YamlLine[] {
  const out: YamlLine[] = []
  const C = (text: string) => out.push({ text, owner: 'class' })
  const G = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'gw', ...extra })
  C('apiVersion: gateway.networking.k8s.io/v1')
  C('kind: GatewayClass')
  C('metadata:')
  C('  name: eg')
  C('spec:')
  C('  controllerName: gateway.envoyproxy.io/gatewayclass-controller')
  G('---')
  G('apiVersion: gateway.networking.k8s.io/v1')
  G('kind: Gateway')
  G('metadata:')
  G('  name: klopa-gw')
  G('  namespace: klopa')
  G('spec:')
  G('  gatewayClassName: eg')
  G('  listeners:')
  G('    - name: http')
  G('      protocol: HTTP')
  G('      port: 80')
  if (c.https) {
    G('    - name: https')
    G('      protocol: HTTPS')
    G('      port: 443')
    G('      tls:')
    G('        mode: Terminate')
    G('        certificateRefs:')
    if (c.secret.includes('/')) {
      const [ns, name] = c.secret.split('/')
      G(`          - name: ${name}`)
      G(`            namespace: ${ns}`)
    } else G(`          - name: ${c.secret}`)
    if (!secretValid(c.secret)) G(`# status: https  Programmed=False  ResolvedRefs=False (${secretReason(c.secret)})`, { bad: true })
  }
  for (const h of HOST_MATCHES) {
    const rules = c.rules.filter((r) => r.host === h)
    if (!rules.length) continue
    const R = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'route', ...extra })
    R('---')
    R('apiVersion: gateway.networking.k8s.io/v1')
    R('kind: HTTPRoute')
    R('metadata:')
    R(`  name: ${routeNameOf(h)}`)
    R('  namespace: klopa')
    R('spec:')
    R('  parentRefs:')
    R('    - name: klopa-gw')
    if (c.https) R('      sectionName: https')
    R('  hostnames:')
    R(`    - "${h}"`)
    R('  rules:')
    for (const r of rules) ruleLines(r, out)
    const missing = rules.flatMap((r) => r.backends.filter((b) => !svcByName(b.svc)).map((b) => b.svc))
    if (missing.length) R(`# status: ResolvedRefs=False (BackendNotFound: ${missing.join(', ')})`, { bad: true })
  }
  const hosts = HOST_MATCHES.filter((h) => c.rules.some((r) => r.host === h))
  if (c.https && hosts.length) {
    // the routes above attach only to the https listener; on :80 one small route just redirects to https://
    const R = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'route', ...extra })
    R('---')
    R('apiVersion: gateway.networking.k8s.io/v1')
    R('kind: HTTPRoute')
    R('metadata:')
    R('  name: klopa-http-preusmjeri')
    R('  namespace: klopa')
    R('spec:')
    R('  parentRefs:')
    R('    - name: klopa-gw')
    R('      sectionName: http')
    R('  hostnames:')
    for (const h of hosts) R(`    - "${h}"`)
    R('  rules:')
    R('    - filters:')
    R('        - type: RequestRedirect')
    R('          requestRedirect:')
    R('            scheme: https')
    R('            statusCode: 301')
  }
  return out
}

/** The same intent as one Ingress: weights and header matches are not part of the Ingress API. */
export function ingressYaml(c: Config): YamlLine[] {
  const out: YamlLine[] = []
  const I = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'ingress', ...extra })
  I('apiVersion: networking.k8s.io/v1')
  I('kind: Ingress')
  I('metadata:')
  I('  name: klopa')
  I('  namespace: klopa')
  const needsAnno = c.rules.some((r) => r.beta || r.backends.length > 1)
  if (needsAnno) {
    I('  annotations:')
    I('    # težine i zaglavlja: samo anotacije kontrolera', { note: true })
    I('    # (svaki kontroler ima svoje – ovisi o kontroleru)', { note: true })
  }
  I('spec:')
  I('  ingressClassName: klopa-ingress')
  if (c.https) {
    I('  tls:')
    I('    - hosts:')
    for (const h of HOST_MATCHES.filter((x) => c.rules.some((r) => r.host === x))) I(`        - "${h}"`)
    I(`      secretName: ${c.secret.includes('/') ? c.secret.split('/')[1] + '   # drugi Namespace: Ingress to ne može' : c.secret}`, c.secret.includes('/') ? { bad: true } : {})
  }
  I('  rules:')
  for (const h of HOST_MATCHES) {
    const rules = c.rules.filter((r) => r.host === h)
    if (!rules.length) continue
    I(`    - host: "${h}"`)
    I('      http:')
    I('        paths:')
    for (const r of rules) {
      const L = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'ingress', ruleId: r.id, ...extra })
      L(`          - path: ${r.path}`)
      L(`            pathType: ${r.pathType === 'PathPrefix' ? 'Prefix' : 'Exact'}`)
      L('            backend:')
      L('              service:')
      L(`                name: ${r.backends[0]?.svc ?? '?'}`)
      L('                port:')
      L('                  number: 80')
      if (r.beta) L('            # x-beta: 1 → anotacija (ovisi o kontroleru)', { note: true })
      if (r.backends.length > 1) L(`            # ${r.backends.slice(1).map((b) => `${b.weight} na ${b.svc}`).join(', ')} → anotacija (ovisi o kontroleru)`, { note: true })
    }
  }
  return out
}

/** Mode 'lb': the three LoadBalancer Services Davor wrote (each one = a public IP and a bill). */
export function lbYaml(): YamlLine[] {
  const out: YamlLine[] = []
  const svcs: [string, number][] = [
    ['klopa-web', 8080],
    ['klopa-api', 8000],
    ['klopa-admin', 8000],
  ]
  svcs.forEach(([name, port], i) => {
    const L = (text: string, extra: Partial<YamlLine> = {}) => out.push({ text, owner: 'ingress', ...extra })
    if (i) L('---')
    L('apiVersion: v1')
    L('kind: Service')
    L('metadata:')
    L(`  name: ${name}`)
    L('  namespace: klopa')
    L('spec:')
    L('  type: LoadBalancer      # nova javna adresa, novi račun', { note: true })
    L('  selector:')
    L(`    app: ${name}`)
    L('  ports:')
    L('    - port: 80')
    L(`      targetPort: ${port}`)
  })
  return out
}
