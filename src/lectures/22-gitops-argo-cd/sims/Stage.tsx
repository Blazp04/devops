/**
 * The lecture's main drawing, used by the scene widgets and the flagship: on the left the config repo as a notebook
 * page (files of HEAD + the newest commits on a string, CI bot lane), on the right the cluster with Argo CD inside it
 * (poll ring, sync + health tags) and its resource tree: Deployment → ReplicaSets → Pods (lunchboxes), Service,
 * ConfigMap, HPA. Everything is read from the E6 engine's selectors; the commit dot follows `deliveryView`.
 * Three layouts by container width: wide ≥ 680 px, medium side by side ≥ 540 px (tablets), else the narrow stacked
 * one (max 460 px).
 */
import { AnimatePresence } from 'motion/react'
import { Arrow, DBar, Diagram, K8sGlyph, LoopMagnifier, PodShape, Rough, plural, useWidth } from '../../../kit'
import { appView, commitGraph, deliveryView, hpaView, podsView, pollRing, repoFiles, resourceTree, type GitOpsState, type TreeNode } from '../../../engines/gitops'
import { secs, shortMessage } from '../lib/labels'
import { ClusterFrame, HealthTag, NotebookPage, PollRing, SyncTag, T } from './parts'

const WIDE_MIN = 680
/** 600 × 12 / 13,5 ≈ 533: the side-by-side medium layout stays legible down to 540 px (tablets). */
const MID_MIN = 540

interface Geo {
  /** long labels (Deployment, ReplicaSet, HPA details) */
  wide: boolean
  /** side by side, but narrow columns (≈ 540–680 px): short tags */
  mid: boolean
  /** repo above the cluster (phones), max 460 px */
  stacked: boolean
  W: number
  H: number
  mono: number
  small: number
  hand: number
  repo: { x: number; y: number; w: number; h: number }
  repoTitle: [number, number]
  filesHead: [number, number]
  fileX: number
  fileY0: number
  fileDy: number
  sepY: number
  laneY: number
  beadX: number
  commitY0: number
  commitDy: number
  maxCommits: number
  textX: number
  tagX: number
  msgMax: number
  barW: number
  cluster: { x: number; y: number; w: number; h: number }
  clusterTitle: [number, number]
  argo: { cx: number; cy: number; r: number }
  pull: [number, number][]
  refreshPath: [number, number][]
  syncPath: [number, number][]
  argoCaption: [number, number] | null
  pollText: [number, number]
  appX: number
  appY: number
  tagsY: number
  revY: number
  opY: number
  healthX: number
  dep: { gx: number; x: number; y: number; right: number }
  nsLabel: [number, number]
  rsY0: number
  rsDy: number
  podDy: number
  podX0: number
  podStep: number
  podSize: number
  maxPods: number
  otherY0: number
  otherDy: number
}

const WIDE: Geo = {
  wide: true,
  mid: false,
  stacked: false,
  W: 760,
  H: 480,
  mono: 13.5,
  small: 13.5,
  hand: 20,
  repo: { x: 10, y: 40, w: 290, h: 430 },
  repoTitle: [14, 28],
  filesHead: [40, 70],
  fileX: 54,
  fileY0: 93,
  fileDy: 21,
  sepY: 194,
  laneY: 217,
  beadX: 46,
  commitY0: 248,
  commitDy: 45,
  maxCommits: 5,
  textX: 62,
  tagX: 290,
  msgMax: 31,
  barW: 100,
  cluster: { x: 322, y: 40, w: 430, h: 430 },
  clusterTitle: [336, 28],
  argo: { cx: 384, cy: 104, r: 25 },
  pull: [
    [344, 104],
    [304, 104],
  ],
  refreshPath: [
    [290, 248],
    [311, 248],
    [311, 104],
    [346, 104],
  ],
  syncPath: [
    [384, 186],
    [384, 196],
    [352, 206],
  ],
  argoCaption: [384, 162],
  pollText: [392, 181],
  appX: 440,
  appY: 84,
  tagsY: 108,
  revY: 130,
  opY: 151,
  healthX: 560,
  dep: { gx: 352, x: 374, y: 210, right: 742 },
  nsLabel: [742, 184],
  rsY0: 254,
  rsDy: 58,
  podDy: 28,
  podX0: 398,
  podStep: 34,
  podSize: 28,
  maxPods: 9,
  otherY0: 388,
  otherDy: 28,
}

const MID: Geo = {
  wide: false,
  mid: true,
  stacked: false,
  W: 600,
  H: 480,
  mono: 13.5,
  small: 13.5,
  hand: 20,
  repo: { x: 6, y: 40, w: 236, h: 430 },
  repoTitle: [10, 28],
  filesHead: [32, 70],
  fileX: 46,
  fileY0: 93,
  fileDy: 21,
  sepY: 194,
  laneY: 217,
  beadX: 34,
  commitY0: 248,
  commitDy: 45,
  maxCommits: 5,
  textX: 50,
  tagX: 236,
  msgMax: 24,
  barW: 82,
  cluster: { x: 252, y: 40, w: 342, h: 430 },
  clusterTitle: [264, 28],
  argo: { cx: 300, cy: 104, r: 21 },
  pull: [
    [265, 104],
    [244, 104],
  ],
  refreshPath: [
    [236, 248],
    [246, 248],
    [246, 104],
    [266, 104],
  ],
  syncPath: [
    [300, 196],
    [300, 204],
    [272, 212],
  ],
  argoCaption: [300, 154],
  pollText: [300, 174],
  appX: 344,
  appY: 84,
  tagsY: 108,
  revY: 130,
  opY: 151,
  healthX: 456,
  dep: { gx: 272, x: 294, y: 222, right: 584 },
  nsLabel: [584, 196],
  rsY0: 266,
  rsDy: 58,
  podDy: 28,
  podX0: 318,
  podStep: 32,
  podSize: 26,
  maxPods: 8,
  otherY0: 400,
  otherDy: 26,
}

const NARROW: Geo = {
  wide: false,
  mid: false,
  stacked: true,
  W: 360,
  H: 738,
  mono: 14,
  small: 14,
  hand: 20,
  repo: { x: 6, y: 34, w: 348, h: 280 },
  repoTitle: [10, 24],
  filesHead: [36, 62],
  fileX: 50,
  fileY0: 85,
  fileDy: 21,
  sepY: 184,
  laneY: 207,
  beadX: 40,
  commitY0: 238,
  commitDy: 40,
  maxCommits: 2,
  textX: 56,
  tagX: 346,
  msgMax: 34,
  barW: 112,
  cluster: { x: 6, y: 340, w: 348, h: 392 },
  clusterTitle: [96, 333],
  argo: { cx: 50, cy: 394, r: 21 },
  pull: [
    [50, 360],
    [50, 318],
  ],
  refreshPath: [
    [50, 314],
    [50, 360],
  ],
  syncPath: [
    [50, 468],
    [50, 474],
    [30, 478],
  ],
  argoCaption: null,
  pollText: [50, 446],
  appX: 96,
  appY: 378,
  tagsY: 402,
  revY: 424,
  opY: 446,
  healthX: 220,
  dep: { gx: 30, x: 50, y: 494, right: 346 },
  nsLabel: [346, 472],
  rsY0: 540,
  rsDy: 52,
  podDy: 24,
  podX0: 64,
  podStep: 31,
  podSize: 26,
  maxPods: 8,
  otherY0: 662,
  otherDy: 26,
}

const SHORT_KIND: Record<string, string> = { Deployment: 'deploy', Service: 'svc', ConfigMap: 'cm', HorizontalPodAutoscaler: 'hpa', Job: 'job', Secret: 'secret', ReplicaSet: 'rs' }
const GLYPH: Record<string, 'deploy' | 'svc' | 'cm' | 'hpa' | 'job' | 'secret'> = { Deployment: 'deploy', Service: 'svc', ConfigMap: 'cm', HorizontalPodAutoscaler: 'hpa', Job: 'job', Secret: 'secret' }
const KIND_NAME: Record<string, string> = { HorizontalPodAutoscaler: 'HPA' }

/** A Pod of a broken version whose failure is already visible (ErrImagePull, ImagePullBackOff, CrashLoopBackOff). */
function failingPod(p: { broken: boolean; status: string }): boolean {
  return p.broken && /Err|BackOff/.test(p.status)
}

/** Point at fraction t (0..1) along a polyline. */
function along(pts: [number, number][], t: number): [number, number] {
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    seg.push(d)
    total += d
  }
  let rest = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < seg.length; i++) {
    if (rest <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, rest / seg[i]) : 0
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]
    }
    rest -= seg[i]
  }
  return pts[pts.length - 1]
}

export function GitOpsStage({ s, ci = false, caption }: { s: GitOpsState; ci?: boolean; caption?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = width === null ? NARROW : width >= WIDE_MIN ? WIDE : width >= MID_MIN ? MID : NARROW
  const app = appView(s)
  const tree = resourceTree(s)
  const dep = tree.find((n) => n.kind === 'Deployment')
  const head = deliveryView(s, 1)[0]
  const broken = podsView(s).filter(failingPod)
  // the deployed commit is the culprit when Pods of the live Deployment's image do not start
  const deployedBroken = Boolean(dep?.tag) && broken.some((p) => p.tag === dep?.tag)
  const brokenText = broken.length ? ` ${plural(broken.length, ['Pod ne radi', 'Poda ne rade', 'Podova ne radi'])} (${broken[0].status}).` : ''
  const label = `Config repozitorij: zadnji commit ${head ? `${head.short} „${head.message}”` : ''}. Argo CD: ${app.sync}, ${app.health}.${dep ? ` Deployment ${dep.name}: ${dep.status || dep.health}.` : ''}${brokenText}${caption ? ` ${caption}` : ''}`
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ maxWidth: g.stacked ? 460 : undefined, margin: '0 auto' }}>
      <Diagram width={g.W} height={g.H} label={label}>
        <RepoPane s={s} g={g} ci={ci} deployedBroken={deployedBroken} />
        <ClusterPane s={s} g={g} tree={tree} />
        <CommitDot s={s} g={g} />
      </Diagram>
      </div>
    </div>
  )
}

function RepoPane({ s, g, ci, deployedBroken }: { s: GitOpsState; g: Geo; ci: boolean; deployedBroken: boolean }) {
  const files = repoFiles(s).filter((f) => f.inAppPath)
  const commits = commitGraph(s, g.maxCommits)
  const run = s.ci.runs.find((r) => r.status === 'running')
  const protectedRepo = s.repo.protection.requirePullRequest
  const r = g.repo
  const ys = commits.map((_, i) => g.commitY0 + i * g.commitDy)
  return (
    <g>
      <T x={g.repoTitle[0]} y={g.repoTitle[1]} font="hand" size={g.hand}>
        config repozitorij (Git)
      </T>
      <NotebookPage x={r.x} y={r.y} w={r.w} h={r.h} seed={2301} />
      <T x={g.filesHead[0]} y={g.filesHead[1]} size={g.mono} fill="var(--ink-2)">
        {s.repo.appPath}/
      </T>
      {files.slice(0, 5).map((f, i) => {
        const y = g.fileY0 + i * g.fileDy
        const removed = f.change === 'removed'
        const mark = f.change === 'added' ? '+' : removed ? '−' : f.change === 'modified' ? '~' : ''
        const ink = f.change === 'added' ? 'var(--green)' : removed ? 'var(--red)' : 'var(--ink)'
        const name = f.path.slice(s.repo.appPath.length + 1)
        return (
          <g key={f.path}>
            {f.change === 'modified' && <rect x={g.fileX - 3} y={y - g.mono + 1} width={name.length * g.mono * 0.6 + 6} height={g.mono + 3} rx={3} style={{ fill: 'var(--hl-yellow)' }} />}
            {mark && (
              <T x={g.fileX - 14} y={y} size={g.mono} fill={ink} weight={700}>
                {mark}
              </T>
            )}
            <T x={g.fileX} y={y} size={g.mono} fill={ink} strike={removed}>
              {name}
            </T>
          </g>
        )
      })}
      <Rough shape={{ k: 'line', x1: r.x + 26, y1: g.sepY, x2: r.x + r.w - 8, y2: g.sepY }} seed={2311} stroke="var(--ink-3)" strokeWidth={1} roughness={0.7} />
      {ci && run ? (
        <g>
          <T x={g.textX - 20} y={g.laneY} size={g.small} fill="var(--pen)" weight={600}>
            CI gradi {run.version}
          </T>
          <DBar x={g.tagX - g.barW - 8} y={g.laneY - 11} w={g.barW} h={12} value={run.progress} tone="blue" />
        </g>
      ) : (
        <T x={g.textX - 20} y={g.laneY} size={g.small} fill="var(--ink-3)">
          grana main{protectedRepo ? ' · zaštićena' : ''}
          {ci && !g.mid ? ' · CI miruje' : ''}
        </T>
      )}
      {commits.length > 1 && <Rough shape={{ k: 'line', x1: g.beadX, y1: ys[0], x2: g.beadX, y2: ys[ys.length - 1] + 14 }} seed={2312} strokeWidth={1.4} />}
      {commits.map((c, i) => {
        const y = ys[i]
        const bot = c.lane === 'bot'
        const bad = c.lane === 'attacker'
        const culprit = c.isDeployed && deployedBroken
        const beadInk = bad || culprit ? 'var(--red)' : bot ? 'var(--pen)' : 'var(--ink)'
        const revertIdx = c.revertOf ? commits.findIndex((x) => x.sha === c.revertOf) : -1
        const tags: { text: string; ink: string }[] = []
        if (c.isHead) tags.push({ text: 'HEAD', ink: 'var(--ink)' })
        if (c.isDeployed) tags.push(culprit ? { text: g.mid ? '✗ klaster' : '✗ u klasteru', ink: 'var(--red)' } : { text: g.mid ? '✓ klaster' : '✓ u klasteru', ink: 'var(--green)' })
        else if (c.kind === 'revert') tags.push({ text: '↩ revert', ink: 'var(--red)' })
        const author = c.author === 'ci-bot' ? 'ci-bot' : c.author
        return (
          <g key={c.sha}>
            <Rough shape={{ k: 'ellipse', cx: g.beadX, cy: y - 4, w: 13, h: 13 }} seed={2320 + i} stroke={beadInk} strokeWidth={1.6} fillColor={c.isHead ? beadInk : 'var(--paper)'} fillStyle="solid" />
            {revertIdx > i && (
              <Rough
                shape={{ k: 'curve', pts: [[g.beadX - 7, y - 2], [g.beadX - 22, (y + ys[revertIdx]) / 2], [g.beadX - 7, ys[revertIdx] - 6]] }}
                seed={2330 + i}
                stroke="var(--red)"
                strokeWidth={1.5}
              />
            )}
            <T x={g.textX} y={y} size={g.mono} fill={bad || culprit ? 'var(--red)' : 'var(--ink)'} weight={600}>
              {c.short}
            </T>
            {tags.map((t, k) => (
              <T key={t.text} x={g.tagX - 8 - (k === 0 ? 0 : tags.slice(0, k).reduce((sum, p) => sum + p.text.length * g.small * 0.62 + 10, 0))} y={y} size={g.small} fill={t.ink} anchor="end" weight={700}>
                {t.text}
              </T>
            ))}
            <T x={g.textX} y={y + 18} size={g.small} font="ui" fill={bad ? 'var(--red)' : bot ? 'var(--pen)' : 'var(--ink-2)'} weight={500}>
              {shortMessage(`${author}: ${c.message}`, g.msgMax)}
            </T>
          </g>
        )
      })}
    </g>
  )
}

function ClusterPane({ s, g, tree }: { s: GitOpsState; g: Geo; tree: TreeNode[] }) {
  const app = appView(s)
  const ring = pollRing(s)
  const c = g.cluster
  const dep = tree.find((n) => n.kind === 'Deployment')
  const pods = podsView(s)
  const hpa = hpaView(s)
  const rsNodes = dep ? tree.filter((n) => n.kind === 'ReplicaSet' && n.parentId === dep.id).sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0)) : []
  const others = tree.filter((n) => n.parentId === tree[0]?.id && n.kind !== 'Deployment' && n.kind !== 'ReplicaSet' && n.kind !== 'Pod').slice(0, 3)
  const op = app.operation
  const lo = app.lastOperation
  const opText = op
    ? op.nextRetryInS !== null
      ? `ponovni pokušaj #${op.retryCount} za ${secs(op.nextRetryInS)}`
      : 'sinkronizacija u tijeku…'
    : lo && lo.phase !== 'Succeeded'
      ? `zadnja sinkronizacija: ${lo.phase}`
      : ''
  const pollIn = `za ${secs(Math.round(ring.nextInS))}`
  // wide: one line; medium and narrow: two short lines under the ring
  const pollLines = ring.webhookPendingInS !== null ? ['webhook…'] : g.wide ? [`provjera ${pollIn}`] : ['provjera', pollIn]
  const depMissing = dep && dep.health === 'Missing'
  return (
    <g>
      <T x={g.clusterTitle[0]} y={g.clusterTitle[1]} font="hand" size={g.hand}>
        klaster
      </T>
      <ClusterFrame x={c.x} y={c.y} w={c.w} h={c.h} seed={2401} />
      {/* Argo CD pulls from Git: the arrow points at the repo */}
      <Arrow pts={g.pull} stroke="var(--pen)" strokeWidth={1.8} seed={2402} />
      <PollRing cx={g.argo.cx} cy={g.argo.cy} r={g.argo.r + 12} progress={ring.progress} webhook={ring.mode === 'webhook'} seed={2403} />
      <LoopMagnifier cx={g.argo.cx} cy={g.argo.cy} r={g.argo.r} seed={2404} />
      {g.argoCaption && (
        <T x={g.argoCaption[0]} y={g.argoCaption[1]} font="hand" size={20} anchor="middle" fill="var(--pen)">
          Argo CD
        </T>
      )}
      {pollLines.map((line, i) => (
        <T key={i} x={g.pollText[0]} y={g.pollText[1] + i * 16} size={g.small} anchor="middle" fill="var(--ink-2)">
          {line}
        </T>
      ))}
      <T x={g.appX} y={g.appY} size={15} font="ui" weight={700}>
        {g.wide ? `Application ${tree[0]?.name ?? ''}` : `Argo CD · ${tree[0]?.name ?? ''}`}
      </T>
      <SyncTag x={g.appX} y={g.tagsY} sync={app.sync} size={g.mono + 0.5} />
      <HealthTag x={g.healthX} y={g.tagsY} health={app.health} size={g.mono + 0.5} />
      <T x={g.appX} y={g.revY} size={g.small} fill={app.behindGit ? 'var(--orange)' : 'var(--ink-3)'}>
        {app.behindGit ? `Git: ${app.headRevision.slice(0, 7)} – još nije viđen` : `uspoređuje s ${app.knownRevision?.slice(0, 7) ?? '—'}`}
      </T>
      {opText && (
        <T x={g.appX} y={g.opY} size={g.small} fill={lo && lo.phase !== 'Succeeded' && !op ? 'var(--red)' : 'var(--pen)'}>
          {opText}
        </T>
      )}
      {/* Deployment */}
      {dep && (
        <T x={g.nsLabel[0]} y={g.nsLabel[1]} size={g.small} anchor="end" fill="var(--ink-3)">
          Namespace klopa
        </T>
      )}
      {dep && (
        <g>
          <g opacity={depMissing ? 0.45 : 1}>
            <K8sGlyph kind="deploy" x={g.dep.gx - 14} y={g.dep.y - 18} w={28} h={21} />
          </g>
          <T x={g.dep.x} y={g.dep.y - 4} size={g.mono + 0.5} weight={700} fill={depMissing ? 'var(--ink-3)' : 'var(--ink)'}>
            {g.wide ? 'Deployment' : 'deploy'} {dep.name}
          </T>
          <SyncTag x={g.dep.right} y={g.dep.y - 4} sync={dep.sync} size={g.small} anchor="end" />
          <T x={g.dep.x} y={g.dep.y + 16} size={g.small} fill={depMissing ? 'var(--orange)' : 'var(--ink-2)'}>
            {depMissing ? 'nema ga u klasteru' : `${dep.status} spremno${g.wide && dep.tag ? ` · slika ${dep.tag}` : ''}`}
          </T>
          <HealthTag x={g.dep.right} y={g.dep.y + 16} health={dep.health} size={g.small} anchor="end" />
          {depMissing && <Rough shape={{ k: 'rect', x: g.dep.x - 6, y: g.dep.y + 26, w: g.dep.right - g.dep.x, h: g.rsDy - 12 }} seed={2410} stroke="var(--orange)" strokeWidth={1.2} dash="5 5" />}
        </g>
      )}
      {rsNodes.slice(0, 2).map((rs, i) => {
        const y = g.rsY0 + i * g.rsDy
        const mine = pods.filter((p) => `ReplicaSet/${p.owner}` === rs.id)
        const shown = mine.slice(0, g.maxPods)
        const failing = mine.find(failingPod)
        return (
          <g key={rs.id}>
            <T x={g.dep.x + 6} y={y} size={g.small} fill={failing ? 'var(--red)' : 'var(--ink-2)'} weight={failing ? 600 : undefined}>
              {failing ? `✗ ${g.wide ? 'ReplicaSet' : 'rs'} · ${rs.tag} · ${failing.status}` : `${g.wide ? 'ReplicaSet' : 'rs'} · ${rs.tag} · ${rs.status}`}
            </T>
            <AnimatePresence initial={false}>
              {shown.map((p, k) => (
                <PodShape
                  key={p.id}
                  x={g.podX0 + k * g.podStep}
                  y={y + g.podDy}
                  size={g.podSize}
                  status={p.kitStatus === 'crash' && p.status !== 'CrashLoopBackOff' ? 'notready' : p.kitStatus}
                  tone={p.broken ? 'rose' : p.newVersion ? 'green' : 'blue'}
                  restarts={p.kitStatus === 'crash' ? p.restarts : undefined}
                  ariaLabel={`Pod ${p.id}: ${p.status}`}
                />
              ))}
            </AnimatePresence>
            {mine.length > shown.length && (
              <T x={g.podX0 + shown.length * g.podStep} y={y + g.podDy + 5} size={g.small} fill="var(--ink-2)">
                +{mine.length - shown.length}
              </T>
            )}
          </g>
        )
      })}
      {rsNodes.length > 2 && (
        <T x={g.dep.right} y={g.rsY0 + 2 * g.rsDy - 8} size={g.small} anchor="end" fill="var(--ink-3)">
          +{plural(rsNodes.length - 2, ['stariji', 'starija', 'starijih'])}
        </T>
      )}
      {others.map((n, i) => {
        const y = g.otherY0 + i * g.otherDy
        const kindName = g.wide ? (KIND_NAME[n.kind] ?? n.kind) : (SHORT_KIND[n.kind] ?? n.kind)
        const glyph = GLYPH[n.kind]
        const missing = n.health === 'Missing'
        const extra = n.kind === 'HorizontalPodAutoscaler' && hpa ? ` ${hpa.min}–${hpa.max}${hpa.desired ? ` · želi ${hpa.desired}` : ''}` : ''
        return (
          <g key={n.id} opacity={1}>
            {glyph && (
              <g opacity={missing ? 0.45 : 1}>
                <K8sGlyph kind={glyph} x={g.dep.gx - 12} y={y - 15} w={24} h={18} />
              </g>
            )}
            <T x={g.dep.x} y={y} size={g.small} fill={n.requiresPruning ? 'var(--orange)' : 'var(--ink)'}>
              {kindName} {n.name}
              {g.wide ? extra : ''}
            </T>
            {n.requiresPruning ? (
              <T x={g.dep.right} y={y} size={g.small} anchor="end" fill="var(--orange)" weight={700}>
                {g.mid ? '! čeka prune' : '! zahtijeva brisanje'}
              </T>
            ) : (
              <g>
                {g.wide && n.health && <HealthTag x={g.dep.right - 96} y={y} health={n.health} size={g.small} anchor="end" />}
                <SyncTag x={g.dep.right} y={y} sync={n.sync} size={g.small} anchor="end" />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** The newest commit on its way: Git → Argo CD (refresh), Argo CD → Deployment (sync). */
function CommitDot({ s, g }: { s: GitOpsState; g: Geo }) {
  const head = deliveryView(s, 1)[0]
  if (!head || (head.hop !== 'refresh' && head.hop !== 'sync') || s.mode !== 'pull') return null
  const path = head.hop === 'refresh' ? g.refreshPath : g.syncPath
  const p = head.hop === 'sync' && head.progress === 0 ? path[0] : along(path, head.progress)
  return (
    <g aria-hidden="true">
      <circle cx={p[0]} cy={p[1]} r={7} style={{ fill: 'var(--pen)', stroke: 'var(--paper)', strokeWidth: 2 }} />
    </g>
  )
}
