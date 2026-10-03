import { useState } from 'react'
import { CodeBlock } from '../../../kit'
import { cleanRepoFiles } from '../incident/model'

/** Margin notes: the lines where today's faults hide, plus honest notes where the repo is shortened for the simulation. */
const SHORTENED = [
  { match: /progressDeadlineSeconds: 60/, text: 'skraćeno za simulaciju; zadano 600 s' },
  { match: /periodSeconds: 2$/, text: 'skraćeno za simulaciju; zadano 10 s' },
]

const NOTES: Record<string, { match: RegExp; text: string }[]> = {
  'apps/klopa-api/deployment.yaml': [
    { match: /image: /, text: 'bot piše tag@digest; ovdje skraćeno na tag. Krivi tag = ImagePullBackOff' },
    ...SHORTENED,
    { match: /path: \/ready$/, text: 'spremnost: samo vlastito stanje, ne baza' },
    { match: /path: \/healthz/, text: 'živost: „je li proces živ?”' },
    { match: /key: kljuc/, text: 'ključ mora postojati u Secretu klopa-sms' },
    { match: /cpu: 200m/, text: 'bez requests.cpu HPA je slijep' },
    { match: /name: klopa-db/, text: 'Secret klopa-db puni ExternalSecret (ovdje izostavljen)' },
  ],
  'apps/klopa-api/service.yaml': [{ match: /app: klopa-api/, text: 'selektor mora odgovarati oznakama Podova' }],
  'apps/klopa-api/hpa.yaml': [{ match: /maxReplicas/, text: 'premalo = p95 raste u 12:00' }],
  'apps/gateway/httproute.yaml': [{ match: /value: \/api$/, text: 'bez ovog pravila zahtjev uhvati pravilo / (klopa-web): 404' }],
  'apps/klopa-worker/deployment.yaml': [...SHORTENED, { match: /memory: 256Mi/, text: 'premalo (npr. 96Mi) = OOMKilled 137' }],
  'apps/postgres/statefulset.yaml': [{ match: /image: postgres/, text: 'pojednostavljeno: u pravom manifestu i volumeMounts (podatci → /var/lib/postgresql) te POSTGRES_PASSWORD iz Secreta klopa-db' }],
}

function notesFor(path: string, yaml: string) {
  const lines = yaml.split('\n')
  const out: { lines: string; text: string }[] = []
  for (const n of NOTES[path] ?? []) {
    const i = lines.findIndex((l) => n.match.test(l))
    if (i >= 0) out.push({ lines: String(i + 1), text: n.text })
  }
  return out
}

/** The Klopa config repo as the GitOps engine holds it (one CodeBlock per file, closed by default). */
export function RepoTree() {
  const [files] = useState(cleanRepoFiles)
  return (
    <div>
      {files.map((f) => (
        <CodeBlock key={f.path} title={f.path} code={f.yaml} lang="yaml" mode={f.path === 'apps/klopa-api/deployment.yaml' ? 'preview' : 'closed'} previewLines={14} notes={notesFor(f.path, f.yaml)} />
      ))}
    </div>
  )
}
