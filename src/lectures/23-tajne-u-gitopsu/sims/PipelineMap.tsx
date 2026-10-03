import { Arrow, Cloud, CommitString, Cross, Cylinder, Davor, Diagram, Doodle, K8sGlyph, LoopArrows, MiniLaptop, PodShape, Rough, SvgStamp, Vault } from '../../../kit'
import { APPROACHES, assetsOf, evaluateAccess, podView, rings, tokenSegment } from '../../../engines/access/index.ts'
import type { AccessState, ActorId, Asset } from '../../../engines/access/index.ts'
import { EYES, nodePos } from '../lib/flagship'
import { CONTROLLER_NAME, podCaption, shortMessage, TAG_PLACE, tagOf } from '../lib/mapText'
import type { MapLayout, Place, Pt, Zone } from '../lib/flagship'
import type { TagTone } from '../lib/mapText'
import { Eye } from './Eye'

function ZoneFrame({ z, f }: { z: Zone; f: number }) {
  const seed = 2300 + z.x + z.y
  const stroke = z.kind === 'cluster' || z.kind === 'cp' ? 'var(--pen)' : z.kind === 'disk' ? 'var(--ink-2)' : 'var(--ink-3)'
  const dashed = z.kind === 'outside' || z.kind === 'ns' || z.kind === 'node'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: z.x, y: z.y, w: z.w, h: z.h }} seed={seed} stroke={stroke} strokeWidth={z.kind === 'cluster' ? 1.6 : 1.3} roughness={1.2} dash={dashed ? '7 6' : undefined} />
      {z.kind === 'cluster' && <Rough shape={{ k: 'rect', x: z.x + 4, y: z.y + 4, w: z.w - 8, h: z.h - 8 }} seed={seed + 1} stroke={stroke} strokeWidth={1.1} roughness={1.2} />}
      <text x={z.lx} y={z.ly} className="k-svg-hand" style={{ fontSize: f, fill: z.kind === 'cluster' || z.kind === 'cp' ? 'var(--pen)' : 'var(--ink-2)' }}>
        {z.label}
      </text>
    </g>
  )
}

/** A printed name under a place; `\n` starts a second line. */
function Name({ at, text, f, dim }: { at: Pt | undefined; text: string; f: number; dim?: boolean }) {
  if (!at) return null
  return (
    <text x={at[0]} y={at[1]} textAnchor="middle" className="k-svg-display" style={{ fontSize: f, fontWeight: 700, fill: dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
      {text.split('\n').map((t, i) => (
        <tspan key={i} x={at[0]} dy={i === 0 ? 0 : f + 4}>
          {t}
        </tspan>
      ))}
    </text>
  )
}

/** A small marker tag next to a place where the value lives: red hatch = readable, green = ciphertext / address, grey struck = only revoked values. */
function Tag({ x, y, text, tone, f }: { x: number; y: number; text: string; tone: TagTone; f: number }) {
  const fs = f
  const w = text.length * fs * 0.62 + 18
  const h = fs + 9
  const color = tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--ink-3)'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: x - w / 2, y: y - h / 2, w, h }} seed={Math.round(x * 3 + y)} stroke={color} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" roughness={0.9} />
      {tone === 'bad' && <Rough shape={{ k: 'rect', x: x - w / 2 + 2, y: y - h / 2 + 2, w: 7, h: h - 4 }} seed={Math.round(x + y * 3)} stroke="none" fillColor="var(--red)" hachureGap={2} roughness={0.6} />}
      <text x={x + (tone === 'bad' ? 4 : 0)} y={y + fs * 0.36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: fs, fontWeight: 600, fill: color, textDecoration: tone === 'old' ? 'line-through' : undefined }}>
        {text}
      </text>
    </g>
  )
}

/** A countdown ring around a place (Argo CD poll, ESO refreshInterval): the arc grows until the next check. */
function Ring({ at, r, progress, stroke, seed }: { at: Pt; r: number; progress: number; stroke: string; seed: number }) {
  const p = Math.max(0.02, Math.min(1, progress))
  const start = -Math.PI / 2
  const stop = start + p * Math.PI * 2
  const x2 = at[0] + r * Math.cos(stop)
  const y2 = at[1] + r * Math.sin(stop)
  const large = p > 0.5 ? 1 : 0
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: at[0], cy: at[1], w: r * 2, h: r * 2 }} seed={seed} stroke="var(--ink-4)" strokeWidth={1} roughness={0.6} dash="3 5" />
      <path d={`M${at[0]} ${at[1] - r} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`} style={{ fill: 'none', stroke, strokeWidth: 2.4, strokeLinecap: 'round' }} />
      <circle cx={x2} cy={y2} r={3.2} style={{ fill: stroke }} />
    </g>
  )
}

const FLOW_COLOR: Record<string, string> = {
  'ci-log': 'var(--red)',
  cache: 'var(--red)',
  log: 'var(--red)',
  unseal: 'var(--green)',
  eso: 'var(--green)',
  csi: 'var(--green)',
  'store-write': 'var(--green)',
}

/**
 * The map of „Put tajne (2. dio)”: the GitOps pipeline around the SMS key (laptop → Git → Argo CD → API / etcd → node →
 * Pod, plus CI, the external store and KMS), the ten eyes (open red = can read a still-valid value), where copies of
 * the value live, the Pods and the tokens moving along the graph. A pure function of the engine state.
 */
export function PipelineMap({ s, L, selected }: { s: AccessState; L: MapLayout; selected: ActorId | null }) {
  const f = L.font
  const report = evaluateAccess(s)
  const reads = new Map(report.verdicts.map((v) => [v.actorId, v.reads]))
  const focus = s.secrets.find((x) => x.id === s.config.focusSecretId) ?? s.secrets[0]
  const approach = focus.approach
  const assets = assetsOf(s)
  const encrypted = s.config.encryption.provider !== 'identity'
  const storeUp = s.config.store.available
  const rg = rings(s)
  const esoRing = rg.eso[focus.id]
  const csiRing = rg.csi[focus.id]
  const redCount = EYES.filter((id) => reads.get(id)).length
  const ctrlName = CONTROLLER_NAME[approach]
  const usesStore = approach === 'eso' || approach === 'csi' || approach === 'avp'

  // tags per place (≤ 2, readable first; the rest folded into „+n”)
  const tagRows = new Map<Place, { text: string; tone: TagTone }[]>()
  const sorted = [...assets].sort((a: Asset, b: Asset) => Number(b.valid && (b.form === 'plain' || b.form === 'base64')) - Number(a.valid && (a.form === 'plain' || a.form === 'base64')))
  for (const a of sorted) {
    const place = TAG_PLACE[a.kind]
    const t = tagOf(a)
    if (!place || !t) continue
    tagRows.set(place, [...(tagRows.get(place) ?? []), t])
  }

  // Pods: klopa-api uses the DB password, klopa-worker the SMS key
  const apiPods = podView(s, 'db').filter((p) => p.workloadId === 'api')
  const workerPods = podView(s, 'sms').filter((p) => p.workloadId === 'worker')
  const pods = [...apiPods, ...workerPods].slice(0, 5)
  const [pa, pb] = [L.pods[0], L.pods[L.pods.length - 1]]
  const podSize = pods.length > 4 ? L.pod * 0.9 : L.pod
  const stuckPod = pods.find((p) => p.kitStatus !== 'running' && p.kitStatus !== 'terminating' && (p.label === 'CreateContainerConfigError' || p.reason === 'FailedMount'))
  const stuckRaw = stuckPod ? s.pods.find((p) => p.id === stuckPod.id) : undefined
  const stuckLines = stuckPod ? [stuckPod.reason === 'FailedMount' ? `${stuckPod.label} · FailedMount` : stuckPod.label, shortMessage(stuckRaw?.message ?? null)] : null

  const label = `Put tajne (${focus.label}) kroz GitOps: ${redCount} od ${EYES.length} očiju može pročitati važeću vrijednost. Pristup: ${APPROACHES[approach].label}. Šifriranje u mirovanju: ${encrypted ? 'uključeno' : 'isključeno'}. Trezor ${storeUp ? 'dostupan' : 'nedostupan'}.`

  const edge = (pts: Pt[], stroke: string, seed: number, dash?: string, width = 1.35) => <Arrow pts={pts.map((p) => [p[0], p[1]])} stroke={stroke} strokeWidth={width} seed={seed} dash={dash} />

  return (
    <Diagram width={L.w} height={L.h} label={label}>
      {L.zones.map((z) => (
        <ZoneFrame key={`${z.label}-${z.x}-${z.y}`} z={z} f={L.hand} />
      ))}

      {/* routes */}
      {edge(L.edges.commit, 'var(--ink-3)', 2401)}
      {edge(L.edges.pull, 'var(--pen)', 2402, '6 5')}
      {edge(L.edges.ci, 'var(--ink-3)', 2403, '4 5')}
      {edge(L.edges.sync, 'var(--pen)', 2404)}
      {edge(L.edges.cache, assets.some((a) => a.kind === 'redis' && a.valid) ? 'var(--red)' : 'var(--ink-3)', 2405)}
      {edge(L.edges.etcd, 'var(--ink-2)', 2406)}
      {edge(L.edges.kubelet, 'var(--ink-2)', 2407)}
      {ctrlName && edge(L.edges.ctrl, 'var(--pen)', 2408)}
      {approach === 'eso' && edge(L.edges.storeCtrl, storeUp ? 'var(--green)' : 'var(--red)', 2409, storeUp ? undefined : '4 6')}
      {approach === 'avp' && edge(L.edges.storeArgo, storeUp ? 'var(--orange)' : 'var(--red)', 2410, storeUp ? undefined : '4 6')}
      {approach === 'csi' && edge(L.edges.storeNode, storeUp ? 'var(--green)' : 'var(--red)', 2411, storeUp ? undefined : '4 6')}
      {usesStore && edge(L.edges.storeWrite, 'var(--ink-3)', 2412, '3 6', 1.1)}
      {s.config.encryption.provider === 'kms-v2' && edge(L.edges.kms, 'var(--green)', 2413, '5 4')}

      {/* outside the cluster: the team */}
      <MiniLaptop x={L.at.laptop[0] - 36} y={L.at.laptop[1] - 26} w={72} h={48} />
      <Name at={L.name.laptop} text="Lanin laptop" f={f} />
      <CommitString x={L.at.git[0] - 46} y={L.at.git[1]} w={92} n={3} />
      <Name at={L.name.git} text="Git" f={f} />
      <Doodle kind="pipeline" x={L.at.ci[0] - 28} y={L.at.ci[1] - 22} scale={0.88} />
      <Name at={L.name.ci} text="CI" f={f} />
      <Rough shape={{ k: 'rect', x: L.at.cilog[0] - 26, y: L.at.cilog[1] - 18, w: 52, h: 36 }} seed={2420} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'line', x1: L.at.cilog[0] - 18, y1: L.at.cilog[1] - 8 + i * 9, x2: L.at.cilog[0] + 18 - i * 9, y2: L.at.cilog[1] - 8 + i * 9 }} seed={2421 + i} stroke="var(--ink-3)" strokeWidth={1} />
      ))}
      {edge(L.edges.cilog, 'var(--ink-3)', 2425)}
      <Name at={L.name.cilog} text="CI log" f={f} />
      <Davor x={L.at.memory[0] - 17} y={L.at.memory[1] - 34} scale={0.44} holding="phone" seed={2430} />
      <Name at={L.name.memory} text={'Davor\n(na Erasmusu)'} f={f} />

      {/* Argo CD */}
      <LoopArrows cx={L.at.argocd[0]} cy={L.at.argocd[1]} r={26} check={false} seed={2440} />
      {rg.argo && <Ring at={L.at.argocd} r={36} progress={rg.argo.progress} stroke="var(--pen)" seed={2441} />}
      <Name at={L.name.argocd} text="Argo CD" f={f} />
      <Cylinder x={L.at.redis[0] - 23} y={L.at.redis[1] - 26} w={46} h={50} seed={2442} />
      <Name at={L.name.redis} text="Redis" f={f} />

      {/* control plane */}
      <K8sGlyph kind="api" x={L.at.api[0] - 26} y={L.at.api[1] - 22} w={52} h={40} />
      <Name at={L.name.api} text="API poslužitelj" f={f} />
      <g opacity={ctrlName ? 1 : 0.4}>
        <K8sGlyph kind="cm-ctrl" x={L.at.controller[0] - 24} y={L.at.controller[1] - 20} w={48} h={38} />
      </g>
      {esoRing && <Ring at={L.at.controller} r={34} progress={esoRing.progress} stroke={storeUp ? 'var(--green)' : 'var(--red)'} seed={2450} />}
      <Name at={L.name.controller} text={ctrlName ?? 'nema kontrolera'} f={f} dim={!ctrlName} />
      <Cylinder x={L.at.etcd[0] - 24} y={L.at.etcd[1] - 28} w={48} h={54} seed={2451} fillColor={encrypted ? 'var(--hl-green-ink)' : undefined} />
      <text x={L.at.etcd[0]} y={L.at.etcd[1] + 12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 700 }}>
        etcd
      </text>

      {/* external services */}
      <Vault x={L.at.store[0] - 30} y={L.at.store[1] - 28} w={60} h={54} seed={2460} />
      <Name at={L.name.store} text="trezor" f={f} dim={!usesStore} />
      {!storeUp && (
        <g>
          <Cross x={L.at.store[0]} y={L.at.store[1]} size={20} />
          <SvgStamp x={L.at.store[0]} y={L.at.store[1] - 40} text="NEDOSTUPAN" size={13} />
        </g>
      )}
      <Cloud x={L.at.kms[0] - 40} y={L.at.kms[1] - 22} w={80} h={44} />
      <text x={L.at.kms[0]} y={L.at.kms[1] + 6} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 600, fill: s.config.encryption.provider === 'kms-v2' ? 'var(--green)' : 'var(--ink-3)' }}>
        {s.config.encryption.provider === 'kms-v2' ? 'KEK' : 'KMS'}
      </text>
      <Name at={L.name.kms} text="vanjski KMS" f={f} dim={s.config.encryption.provider !== 'kms-v2'} />

      {/* where the value lives */}
      {[...tagRows.entries()].map(([place, tags]) => {
        const base = L.tag[place]
        if (!base) return null
        const shown = tags.length > 2 ? [...tags.slice(0, 1), { text: `+${tags.length - 1} još`, tone: 'old' as TagTone }] : tags
        return shown.map((t, i) => <Tag key={`${place}-${i}`} x={base[0]} y={base[1] + i * (f + 13)} text={t.text} tone={t.tone} f={f} />)
      })}

      {/* the Pods on the node */}
      {pods.map((p, i) => {
        const x = pods.length === 1 ? (pa[0] + pb[0]) / 2 : pa[0] + ((pb[0] - pa[0]) * i) / (pods.length - 1)
        const y = pa[1]
        const secret = p.workloadId === 'api' ? 'lozinka baze' : 'SMS ključ'
        return (
          <g key={p.id}>
            <PodShape x={x} y={y} size={podSize} status={p.kitStatus} tone={p.versionTone} label={p.usesVersion === null ? '–' : `v${p.usesVersion}`} ariaLabel={`Pod ${p.id}: ${p.label}${p.usesVersion ? `, ${secret} v${p.usesVersion}` : ''}`} />
            <text x={x} y={y + podSize * 0.62 + 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fill: 'var(--ink-2)' }}>
              {podCaption(p.workloadId)}
            </text>
          </g>
        )
      })}
      {stuckLines && (
        <text x={(pa[0] + pb[0]) / 2} y={pa[1] + L.pod * 0.62 + 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 600, fill: 'var(--red)' }}>
          {stuckLines.filter(Boolean).map((t, i) => (
            <tspan key={i} x={(pa[0] + pb[0]) / 2} dy={i === 0 ? 0 : f + 3}>
              {t}
            </tspan>
          ))}
        </text>
      )}
      {csiRing && <Ring at={L.at.node} r={18} progress={csiRing.progress} stroke="var(--green)" seed={2470} />}

      {/* the eyes */}
      {EYES.map((id, i) => {
        const at = L.eyes[id]
        if (!at) return null
        return (
          <g key={id}>
            <Eye x={at[0]} y={at[1]} w={32} open={!!reads.get(id)} seed={2500 + i * 13} selected={selected === id} />
            <text x={at[0] + L.num[0]} y={at[1] + L.num[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 700, fill: reads.get(id) ? 'var(--red)' : 'var(--ink-2)' }}>
              {i + 1}
            </text>
          </g>
        )
      })}

      {/* cosmetic flows (commit, sync, unseal, ESO…): the model effect has already happened */}
      {s.flows.map((fl) => {
        const seg = tokenSegment(s, fl)
        const from = seg.from === 'actor' ? nodePos(L, fl.hops[0]) : nodePos(L, seg.from)
        const to = nodePos(L, seg.to)
        const x = from[0] + (to[0] - from[0]) * seg.f
        const y = from[1] + (to[1] - from[1]) * seg.f
        const c = FLOW_COLOR[fl.kind] ?? 'var(--pen)'
        return (
          <g key={fl.id} aria-hidden="true">
            <rect x={x - 9} y={y - 6} width={18} height={12} rx={2} style={{ fill: 'var(--paper)', stroke: c, strokeWidth: 1.8 }} />
            <path d={`M${x - 8} ${y - 5} L${x} ${y + 1} L${x + 8} ${y - 5}`} style={{ fill: 'none', stroke: c, strokeWidth: 1.4 }} />
          </g>
        )
      })}

      {/* read attempts on their way */}
      {s.attempts.map((a) => {
        const start = L.eyes[a.actorId]
        if (!start) return null
        const seg = tokenSegment(s, a)
        const from = seg.from === 'actor' ? start : nodePos(L, seg.from)
        const to = nodePos(L, seg.to)
        const x = from[0] + (to[0] - from[0]) * seg.f
        const y = from[1] + (to[1] - from[1]) * seg.f
        const done = a.doneAt !== null
        const ok = a.success
        return (
          <g key={a.id} aria-hidden="true">
            <circle cx={x} cy={y} r={9} style={{ fill: 'var(--paper)', stroke: done ? (ok ? 'var(--red)' : 'var(--green)') : 'var(--pen)', strokeWidth: 2 }} />
            <circle cx={x} cy={y} r={3.4} style={{ fill: done ? (ok ? 'var(--red)' : 'var(--green)') : 'var(--pen)' }} />
            {done && ok && <Cross x={x + 14} y={y - 12} size={7} />}
            {done && (
              <text x={x} y={y - 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f, fontWeight: 700, fill: ok ? 'var(--red)' : 'var(--green)' }}>
                {ok ? 'čita!' : 'stop'}
              </text>
            )}
          </g>
        )
      })}
    </Diagram>
  )
}
