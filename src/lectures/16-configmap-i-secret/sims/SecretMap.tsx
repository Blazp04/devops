import { Arrow, Cloud, CommitString, Cross, Cylinder, Diagram, K8sGlyph, MiniLaptop, PodShape, Rough, Shelf } from '../../../kit'
import { assetsOf, effectiveConsumeOf, evaluateAccess, podView, tokenSegment } from '../../../engines/access/index.ts'
import type { AccessState, ActorId, Asset, GraphNodeId } from '../../../engines/access/index.ts'
import { EYE_WORD, EYES, nodePos } from '../lib/flagship'
import { podTone } from '../lib/timeline'
import type { MapLayout, Pt, Zone } from '../lib/flagship'
import { Eye } from './Eye'

const LOCAL_KEY = new Set(['aescbc', 'aesgcm', 'secretbox'])

function ZoneFrame({ z, f }: { z: Zone; f: number }) {
  const seed = 1600 + z.x + z.y
  const stroke = z.kind === 'cluster' ? 'var(--pen)' : z.kind === 'disk' ? 'var(--ink-2)' : 'var(--ink-3)'
  return (
    <g>
      {z.kind === 'cluster' ? (
        <>
          <Rough shape={{ k: 'rect', x: z.x, y: z.y, w: z.w, h: z.h }} seed={seed} stroke={stroke} strokeWidth={1.5} roughness={1.2} />
          <Rough shape={{ k: 'rect', x: z.x + 4, y: z.y + 4, w: z.w - 8, h: z.h - 8 }} seed={seed + 1} stroke={stroke} strokeWidth={1.1} roughness={1.2} />
        </>
      ) : (
        <Rough shape={{ k: 'rect', x: z.x, y: z.y, w: z.w, h: z.h }} seed={seed} stroke={stroke} strokeWidth={z.kind === 'disk' ? 1.5 : 1.3} roughness={1.3} dash={z.kind === 'disk' ? undefined : '7 6'} />
      )}
      <text x={z.lx} y={z.ly} className="k-svg-hand" style={{ fontSize: f, fill: z.kind === 'cluster' ? 'var(--pen)' : 'var(--ink-2)' }}>
        {z.label}
      </text>
    </g>
  )
}

function Name({ at, dy, text, f }: { at: Pt; dy: number; text: string; f: number }) {
  return (
    <text x={at[0]} y={at[1] + dy} textAnchor="middle" className="k-svg-display k-dhalo" style={{ fontSize: f, fontWeight: 700, fill: 'var(--ink-2)' }}>
      {text}
    </text>
  )
}

type TagTone = 'bad' | 'ok' | 'old'

/** A small marker tag next to a place where the value lives: red hatch = readable, green = ciphertext, grey = old. */
function Tag({ x, y, text, tone, f }: { x: number; y: number; text: string; tone: TagTone; f: number }) {
  const w = text.length * f * 0.62 + 16
  const h = f + 8
  const color = tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--ink-3)'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: x - w / 2, y: y - h / 2, w, h }} seed={Math.round(x * 3 + y)} stroke={color} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" roughness={0.9} />
      {tone === 'bad' && <Rough shape={{ k: 'rect', x: x - w / 2 + 2, y: y - h / 2 + 2, w: 7, h: h - 4 }} seed={Math.round(x + y * 3)} stroke="none" fillColor="var(--red)" hachureGap={2} roughness={0.6} />}
      <text x={x + (tone === 'bad' ? 4 : 0)} y={y + f * 0.36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fontWeight: 600, fill: color, textDecoration: tone === 'old' ? 'line-through' : undefined }}>
        {text}
      </text>
    </g>
  )
}

function tagOf(a: Asset): { text: string; tone: TagTone } | null {
  const tone: TagTone = !a.valid ? 'old' : a.form === 'encrypted' || a.form === 'reference' ? 'ok' : 'bad'
  switch (a.kind) {
    case 'laptop-file':
      return { text: 'secret.yaml', tone }
    case 'git-plain':
      return { text: 'čitljivo', tone }
    case 'git-base64':
      // the committed secret.yaml (stringData: plain text) – readable either way
      return { text: 'secret.yaml', tone }
    case 'image':
      return { text: 'ENV u slici', tone }
    case 'etcd':
      return { text: a.form === 'encrypted' ? 'šifrat' : 'čitljivo', tone }
    case 'log':
      return { text: 'lozinka u logu', tone }
    default:
      return null
  }
}

/**
 * The map of „Put tajne”: where the DB password lives (laptop, Git, registry, etcd on the control-plane disk, Pods,
 * logs), the nine eyes (open red = reads it, closed grey = does not) and the attempts travelling along the graph.
 * Pure function of the engine state.
 */
export function SecretMap({ s, L, selected }: { s: AccessState; L: MapLayout; selected: ActorId | null }) {
  const f = L.font
  const report = evaluateAccess(s)
  const reads = new Map(report.verdicts.map((v) => [v.actorId, v.reads]))
  const assets = assetsOf(s)
  const secret = s.secrets[0]
  const approach = secret.approach
  const provider = s.config.encryption.provider
  const localKey = LOCAL_KEY.has(provider)
  const kms = provider === 'kms-v2'
  const pods = podView(s)
  const consume = effectiveConsumeOf(s, 'api')
  const redCount = EYES.filter((id) => reads.get(id)).length
  // green only when the copy in etcd really is ciphertext (a ConfigMap stays readable even with encryption on)
  const etcdEnc = assets.find((a) => a.kind === 'etcd')?.form === 'encrypted'

  // tags per node, stacked under the node's name
  const tagRows = new Map<string, { text: string; tone: TagTone }[]>()
  for (const a of assets) {
    const t = tagOf(a)
    if (!t) continue
    const key = a.kind === 'laptop-file' ? 'laptop' : a.kind.startsWith('git') ? 'git' : a.kind === 'image' ? 'registry' : a.kind === 'log' ? 'logs' : 'etcd'
    tagRows.set(key, [...(tagRows.get(key) ?? []), t])
  }
  const tagBase: Record<string, Pt> = {
    laptop: [L.laptop[0], L.laptop[1] + 58],
    git: [L.git[0], L.git[1] + 50],
    registry: [L.registry[0], L.registry[1] + 56],
    etcd: [L.etcd[0], L.etcd[1] + 72],
    logs: L.logTag,
  }
  const carrier =
    approach === 'secret' ? { glyph: 'secret' as const, text: 'Secret klopa-db' } : approach === 'configmap' ? { glyph: 'cm' as const, text: 'ConfigMap' } : approach === 'manifest-env' ? { glyph: 'deploy' as const, text: 'Deployment (env)' } : null

  const label = `Put lozinke baze: ${redCount} od ${EYES.length} očiju može je pročitati. Šifriranje u mirovanju: ${provider === 'identity' ? 'isključeno' : provider}.`

  return (
    <Diagram width={L.w} height={L.h} label={label}>
      {L.zones.map((z) => (
        <ZoneFrame key={z.label} z={z} f={L.hand} />
      ))}

      {/* routes */}
      <Arrow pts={L.edges.commit.map((p) => [p[0], p[1]])} stroke="var(--ink-3)" strokeWidth={1.3} seed={1701} />
      <Arrow pts={L.edges.ci.map((p) => [p[0], p[1]])} stroke="var(--ink-3)" strokeWidth={1.3} seed={1702} dash={approach === 'image' ? undefined : '4 5'} />
      <Arrow pts={L.edges.apply.map((p) => [p[0], p[1]])} stroke="var(--pen)" strokeWidth={1.4} seed={1703} />
      <text x={L.edges.applyLabel[0]} y={L.edges.applyLabel[1]} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: f - 1, fill: 'var(--pen)' }}>
        kubectl apply
      </text>
      <Arrow pts={L.edges.etcd.map((p) => [p[0], p[1]])} stroke="var(--ink-2)" strokeWidth={1.4} seed={1704} />
      <Arrow pts={L.edges.kubelet.map((p) => [p[0], p[1]])} stroke="var(--ink-2)" strokeWidth={1.4} seed={1705} />

      {/* outside the cluster */}
      <MiniLaptop x={L.laptop[0] - 34} y={L.laptop[1] - 26} w={68} h={46} />
      <Name at={L.laptop} dy={38} text="Lanin laptop" f={f} />
      <CommitString x={L.git[0] - 46} y={L.git[1]} w={92} n={3} />
      <Name at={L.git} dy={30} text="Git repozitorij" f={f} />
      <Shelf x={L.registry[0] - 40} y={L.registry[1] - 30} w={80} h={46} />
      <Name at={L.registry} dy={36} text="registar slika" f={f} />

      {/* control plane */}
      <K8sGlyph kind="api" x={L.api[0] - 26} y={L.api[1] - 26} w={52} h={40} />
      <Name at={L.api} dy={32} text="API poslužitelj" f={f} />
      <Cylinder x={L.etcd[0] - 26} y={L.etcd[1] - 30} w={52} h={56} fillColor={etcdEnc ? 'var(--hl-green-ink)' : undefined} />
      <text x={L.etcd[0]} y={L.etcd[1] + 12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 700 }}>
        etcd
      </text>
      {carrier && (
        <g>
          <K8sGlyph kind={carrier.glyph} x={L.etcd[0] - 64} y={L.etcd[1] - 2} w={28} h={22} />
          <text x={L.etcd[0]} y={L.etcd[1] + 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fill: 'var(--ink-2)' }}>
            {carrier.text}
          </text>
        </g>
      )}
      {!carrier && (
        <text x={L.etcd[0]} y={L.etcd[1] + 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fill: 'var(--ink-3)' }}>
          lozinka nije ovdje
        </text>
      )}
      {/* the encryption key: a file next to etcd (local provider) or away in an external KMS */}
      {localKey && (
        <g>
          <Rough shape={{ k: 'poly', pts: [[L.key[0] - 20, L.key[1] - 26], [L.key[0] + 12, L.key[1] - 26], [L.key[0] + 20, L.key[1] - 18], [L.key[0] + 20, L.key[1] + 22], [L.key[0] - 20, L.key[1] + 22]] }} seed={1711} strokeWidth={1.4} fillColor="var(--note-yellow)" fillStyle="solid" />
          <text x={L.key[0]} y={L.key[1] + 2} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fontWeight: 600, fill: 'var(--note-ink)' }}>
            ključ
          </text>
          <text x={L.key[0]} y={L.key[1] + 42} textAnchor="middle" className="k-svg-hand" style={{ fontSize: L.hand, fill: 'var(--red)' }}>
            <tspan x={L.key[0]}>na istom</tspan>
            <tspan x={L.key[0]} dy={L.hand * 0.95}>
              disku!
            </tspan>
          </text>
        </g>
      )}
      <Cloud x={L.kms[0] - 40} y={L.kms[1] - 26} w={80} h={44} />
      <text x={L.kms[0]} y={L.kms[1] + 2} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fontWeight: 600, fill: kms ? 'var(--green)' : 'var(--ink-3)' }}>
        {kms ? 'ključ (KEK)' : 'KMS'}
      </text>
      <Name at={L.kms} dy={34} text="vanjski KMS" f={f} />
      {/* only the API server (through the KMS plugin) asks the KMS; etcd never sees the key */}
      {kms && <Arrow pts={L.edges.kms.map((p) => [p[0], p[1]])} stroke="var(--green)" strokeWidth={1.3} seed={1712} dash="5 4" />}

      {/* the node and the app Pods */}
      {pods.slice(0, 3).map((p, i, shown) => {
        const [a, b] = [L.pods[0], L.pods[L.pods.length - 1]]
        const x = shown.length === 1 ? (a[0] + b[0]) / 2 : a[0] + ((b[0] - a[0]) * i) / (shown.length - 1)
        const y = a[1]
        return (
          <g key={p.id}>
            <PodShape x={x} y={y} size={L.pod} status={p.kitStatus} tone={podTone(p)} label={p.usesVersion === null ? '–' : `v${p.usesVersion}`} ariaLabel={`Pod ${p.id}: ${p.label}${p.usesVersion ? `, lozinka v${p.usesVersion}` : ''}`} />
            {shown.length < 3 && (
              <text x={x} y={y + L.pod * 0.6 + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f - 1, fill: 'var(--ink-2)' }}>
                {p.kitStatus === 'running' ? (consume === 'volume' ? 'datoteka' : consume) : p.label}
              </text>
            )}
          </g>
        )
      })}
      {pods.some((p) => p.stale && p.kitStatus === 'running') && (
        <text x={nodePos(L, 'pod')[0]} y={L.pods[0][1] + L.pod * 0.6 + 42} textAnchor="middle" className="k-svg-hand" style={{ fontSize: L.hand, fill: 'var(--red)' }}>
          stara lozinka
        </text>
      )}

      {/* logs */}
      <Rough shape={{ k: 'rect', x: L.logs[0] - 34, y: L.logs[1] - 20, w: 68, h: 40 }} seed={1720} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'line', x1: L.logs[0] - 26, y1: L.logs[1] - 10 + i * 10, x2: L.logs[0] + 26 - i * 12, y2: L.logs[1] - 10 + i * 10 }} seed={1721 + i} stroke="var(--ink-3)" strokeWidth={1} />
      ))}
      <Name at={L.logs} dy={38} text="logovi" f={f} />

      {/* where the value lives */}
      {[...tagRows.entries()].map(([node, tags]) =>
        tags.map((t, i) => {
          const base = tagBase[node]
          return <Tag key={`${node}-${i}`} x={base[0]} y={base[1] + i * (f + 12)} text={t.text} tone={t.tone} f={f} />
        }),
      )}

      {/* the eyes */}
      {EYES.map((id, i) => {
        const at = L.eyes[id]
        if (!at) return null
        const t = L.eyeText[id] ?? { dx: 0, dy: 28, anchor: 'middle' as const }
        const color = reads.get(id) ? 'var(--red)' : 'var(--ink-2)'
        return (
          <g key={id}>
            <Eye x={at[0]} y={at[1]} w={34} open={!!reads.get(id)} seed={1800 + i * 13} selected={selected === id} />
            <text x={at[0] + t.dx} y={at[1] + t.dy} textAnchor={t.anchor} className="k-dhalo" style={{ fill: color }}>
              <tspan className="k-svg-mono" style={{ fontSize: f, fontWeight: 700 }}>
                {i + 1}
              </tspan>
              <tspan className="k-svg-hand" dx={5} style={{ fontSize: L.hand }}>
                {EYE_WORD[id]}
              </tspan>
            </text>
          </g>
        )
      })}

      {/* attempts on their way */}
      {s.attempts.map((a) => {
        if (!L.eyes[a.actorId]) return null
        const seg = tokenSegment(s, a)
        const from = seg.from === 'actor' ? L.eyes[a.actorId] : nodePos(L, seg.from)
        const to = nodePos(L, seg.to)
        const done = a.doneAt !== null
        // a finished token stops in a free spot beside its target, so the result never covers the node's own label
        const slot = done ? L.slots[seg.to as GraphNodeId] : undefined
        const k = done ? Math.min(seg.f, 0.65) : seg.f
        const x = slot ? slot.at[0] : from[0] + (to[0] - from[0]) * k
        const y = slot ? slot.at[1] : from[1] + (to[1] - from[1]) * k
        const side = slot?.anchor === 'end' ? -1 : 1
        const ok = a.success
        const color = done ? (ok ? 'var(--red)' : 'var(--green)') : 'var(--pen)'
        return (
          <g key={a.id}>
            <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              <Rough shape={{ k: 'ellipse', cx: 0, cy: 0, w: 19, h: 18 }} seed={1730} stroke={color} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" roughness={0.9} />
              <Rough shape={{ k: 'ellipse', cx: 0, cy: 0, w: 7, h: 7 }} seed={1731} stroke={color} strokeWidth={1.2} fillColor={color} fillStyle="solid" roughness={0.6} />
            </g>
            {done && ok && <Cross x={x - 18 * side} y={y - 12} size={7} />}
            {done && (
              <text x={x + 14 * side} y={y + 5} textAnchor={side === 1 ? 'start' : 'end'} className="k-svg-mono k-dhalo" style={{ fontSize: f - 1, fontWeight: 700, fill: color }}>
                {ok ? 'čita!' : 'stop'}
              </text>
            )}
          </g>
        )
      })}
    </Diagram>
  )
}
