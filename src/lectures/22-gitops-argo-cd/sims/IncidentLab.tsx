/**
 * „Isti kvar, dva modela” — reproduces incident 22 on the E6 engine (preset l22Push, seed 22) and then lets the
 * student repeat the same night in the pull model (l22Auto + webhook): who holds which key, does Git still describe
 * production, and does anyone notice a manual `kubectl edit`.
 */
import {
  Arrow,
  Button,
  ControlGroup,
  Cross,
  Diagram,
  Drawer,
  EventLog,
  Goals,
  Legend,
  LoopMagnifier,
  MiniLaptop,
  Rough,
  Segmented,
  SimFrame,
  Stat,
  StatRow,
  Toggle,
  plural,
  useSimulation,
  useWidth,
} from '../../../kit'
import { appView, attackerCommit, deployPaths, kubectlEdit, leakCiCredentials, setProjectRestricted, setRepoProtection, startCiRelease, type GitOpsState } from '../../../engines/gitops'
import { ENV_PATH, NIGHT_VALUE, createLab, stepLab, storyFields, switchModel, type FieldRow } from '../lib/incident'
import { shortValue, logEvents } from '../lib/labels'
import { Firewall, FirewallH, KeyGlyph, NotebookPage, Padlock, SyncTag, T } from './parts'
import styles from '../styles.module.css'

export function IncidentLab() {
  const sim = useSimulation({ init: createLab, step: stepLab })
  const st = sim.state
  const g = st.g
  const push = g.mode === 'push'
  const fields = storyFields(g)
  const paths = deployPaths(g)
  const ciBusy = g.ci.runs.some((r) => r.status === 'running')
  const released = g.ci.runs.length > 0
  const edited = g.stats.kubectlChanges > 0
  const leaked = g.security.ciCredentialLeaked
  const prot = g.repo.protection.requirePullRequest
  return (
    <SimFrame
      title="Isti kvar, dva modela"
      subtitle="model guranja (preset l22Push) i model povlačenja (l22Auto + webhook) · seed 22"
      sim={sim}
      showTime
      hint="Reproducirajte incident: u modelu guranja izdajte 2.0.1 kroz CI, pa pokrenite ručni kubectl edit. Zatim istu noć ponovite u modelu povlačenja."
      controls={
        <>
          <ControlGroup title="Model">
            <Segmented
              label="Tko postavlja u klaster?"
              value={g.mode}
              options={[
                { value: 'push', label: 'guranje' },
                { value: 'pull', label: 'povlačenje' },
              ]}
              onChange={(m) => sim.mutate((x) => switchModel(x, m))}
            />
          </ControlGroup>
          <ControlGroup title="Noć prije obnove">
            <Button variant="primary" disabled={ciBusy || released} onClick={() => sim.mutate((x) => void startCiRelease(x.g, '2.0.1'))}>
              Izdaj 2.0.1 kroz CI
            </Button>
            <Button variant="danger" disabled={edited} onClick={() => sim.mutate((x) => void kubectlEdit(x.g, 'Deployment', x.g.mainDeployment, ENV_PATH, NIGHT_VALUE))}>
              Ručni kubectl edit (02:00)
            </Button>
            <Button variant="danger" disabled={leaked} onClick={() => sim.mutate((x) => leakCiCredentials(x.g))}>
              Procuri ključ CI-ja
            </Button>
            {!push && (
              <Button variant="danger" disabled={!leaked} onClick={() => sim.mutate((x) => void attackerCommit(x.g, 'image'))} title="Napadač s procurjelim tokenom sprema commit izravno u main">
                Spremi napadačev commit u main
              </Button>
            )}
          </ControlGroup>
          {!push && (
            <ControlGroup title="Zaštita">
              <Toggle label="Zaštita grane main (pull request + potpis)" checked={prot} onChange={(v) => sim.mutate((x) => setRepoProtection(x.g, { requirePullRequest: v, requireSignedCommits: v }))} />
              <Toggle label="AppProject: aplikacije samo u Namespaceu klopa" checked={g.argo.project.restricted} onChange={(v) => sim.mutate((x) => setProjectRestricted(x.g, v))} />
            </ControlGroup>
          )}
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Git ↔ klaster" value={fields.diffs === 0 ? 'isto' : plural(fields.diffs, ['razlika', 'razlike', 'razlika'])} tone={fields.diffs ? 'bad' : 'ok'} sub="polja koja se razlikuju" />
            <Stat label="Upozorenja o odstupanju" value={g.stats.driftsDetected} tone={edited ? (g.stats.driftsDetected ? 'ok' : 'bad') : 'neutral'} sub={push ? 'nitko ne uspoređuje' : 'Argo CD uspoređuje'} />
            <Stat label="Ključ klastera izvan klastera" value={push ? 'u CI-ju' : 'nema'} tone={push ? 'warn' : 'ok'} sub={push ? 'cluster-admin u tajnama CI-ja' : 'Argo CD radi u klasteru'} />
          </StatRow>
          <div className={styles.paths}>
            <p className={styles.pathsTitle}>Tko sve može promijeniti produkciju?</p>
            <ul>
              {paths.map((p) => (
                <li key={p.who}>
                  <span className={p.guarded ? styles.ok : styles.bad} aria-hidden="true">
                    {p.guarded ? '✓' : '✗'}
                  </span>{' '}
                  <strong>{p.who}</strong> – {p.how}; zaštita: <em>{p.guard}</em>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Guranje: Git i klaster razlikuju se u 2 polja, a nitko nije upozoren', done: st.done.push },
                { text: 'Povlačenje: CI izda 2.0.1, a Argo CD primijeti ručni kubectl edit', done: st.done.pull },
                { text: 'Zaštitite config repozitorij: napadačev commit neka bude odbijen', done: st.done.guard },
              ]}
            />
            <EventLog events={logEvents(g.events)} />
          </div>
        </>
      }
    >
      <LabDrawing g={g} rows={fields.rows} />
      <Legend
        items={[
          { color: 'var(--red)', label: 'ključ klastera izvan klastera / ručna promjena', shape: 'line' },
          { color: 'var(--pen)', label: 'commit u Git i povlačenje iz Gita', shape: 'line' },
          { color: 'var(--red)', label: 'polje u klasteru drukčije nego u Gitu', shape: 'cross' },
        ]}
      />
    </SimFrame>
  )
}

interface LabGeo {
  wide: boolean
  W: number
  H: number
  mono: number
  zone: [number, number] | null
  ci: { x: number; y: number; w: number; h: number }
  ciLabel: [number, number]
  key: [number, number]
  keyLabel: [number, number]
  laptop: { x: number; y: number; w: number; h: number }
  laptopLabel: [number, number]
  laptopAnchor: 'start' | 'middle'
  git: { x: number; y: number; w: number; h: number }
  live: { x: number; y: number; w: number; h: number }
  cluster: { x: number; y: number; w: number; h: number }
  clusterTitle: [number, number]
  clusterAnchor: 'start' | 'end'
  fire: { x: number; y1: number; y2: number } | { y: number; x1: number; x2: number }
  argo: [number, number]
  argoText: [number, number]
  argoAnchor: 'start' | 'end'
  nobody: [number, number]
  pushPath: [number, number][]
  pushLabel: [number, number]
  editPath: [number, number][]
  commitPath: [number, number][]
  commitLabel: [number, number] | null
  pullPath: [number, number][]
  rowDy: number
}

const WIDE: LabGeo = {
  wide: true,
  W: 720,
  H: 400,
  mono: 14,
  zone: [16, 26],
  ci: { x: 24, y: 46, w: 96, h: 58 },
  ciLabel: [72, 124],
  key: [160, 72],
  keyLabel: [160, 100],
  laptop: { x: 24, y: 338, w: 74, h: 50 },
  laptopLabel: [110, 358],
  laptopAnchor: 'start',
  git: { x: 16, y: 160, w: 296, h: 164 },
  live: { x: 384, y: 146, w: 308, h: 172 },
  cluster: { x: 364, y: 34, w: 348, h: 358 },
  clusterTitle: [380, 26],
  clusterAnchor: 'start',
  fire: { x: 342, y1: 34, y2: 392 },
  argo: [408, 86],
  argoText: [440, 80],
  argoAnchor: 'start',
  nobody: [392, 104],
  pushPath: [
    [120, 58],
    [640, 58],
    [640, 142],
  ],
  pushLabel: [130, 50],
  editPath: [
    [100, 384],
    [440, 384],
    [440, 322],
  ],
  commitPath: [
    [72, 106],
    [72, 156],
  ],
  commitLabel: [82, 136],
  pullPath: [
    [384, 96],
    [316, 178],
  ],
  rowDy: 48,
}

const NARROW: LabGeo = {
  wide: false,
  W: 360,
  H: 632,
  mono: 14,
  zone: null,
  ci: { x: 20, y: 190, w: 84, h: 52 },
  ciLabel: [62, 262],
  key: [140, 212],
  keyLabel: [140, 242],
  laptop: { x: 236, y: 186, w: 76, h: 52 },
  laptopLabel: [274, 256],
  laptopAnchor: 'middle',
  git: { x: 10, y: 34, w: 340, h: 132 },
  live: { x: 20, y: 418, w: 320, h: 192 },
  cluster: { x: 6, y: 306, w: 348, h: 318 },
  clusterTitle: [346, 338],
  clusterAnchor: 'end',
  fire: { y: 290, x1: 6, x2: 354 },
  argo: [50, 352],
  argoText: [82, 346],
  argoAnchor: 'start',
  nobody: [100, 372],
  pushPath: [
    [80, 246],
    [80, 414],
  ],
  pushLabel: [90, 404],
  editPath: [
    [290, 278],
    [290, 414],
  ],
  commitPath: [
    [62, 188],
    [62, 170],
  ],
  commitLabel: null,
  pullPath: [
    [34, 334],
    [14, 300],
    [14, 172],
  ],
  rowDy: 44,
}

function LabDrawing({ g, rows }: { g: GitOpsState; rows: FieldRow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = width !== null && width >= 650 ? WIDE : NARROW
  const push = g.mode === 'push'
  const app = appView(g)
  const leaked = g.security.ciCredentialLeaked
  const edited = g.stats.kubectlChanges > 0
  const prot = g.repo.protection.requirePullRequest
  const attacked = g.repo.commits.some((c) => c.kind === 'attack')
  const rejected = g.stats.rejectedCommits > 0
  const released = g.ci.runs.some((r) => r.status === 'done')
  const label = `${push ? 'Model guranja' : 'Model povlačenja'}. ${rows.map((r) => `${r.label}: u Gitu ${r.git}, u klasteru ${r.live}${r.differs ? ' (razlikuje se)' : ''}`).join('; ')}.`
  const card = (box: LabGeo['git'], title: string, which: 'git' | 'live') => (
    <g>
      <T x={box.x + (which === 'git' ? 30 : 20)} y={box.y + 28} size={L.mono} font="ui" weight={700}>
        {title}
      </T>
      {rows.map((r, i) => {
        const y = box.y + 62 + i * L.rowDy
        const x = box.x + (which === 'git' ? 30 : 20)
        const v = which === 'git' ? r.git : r.live
        const shown = r.key === 'image' ? shortValue(v) : `"${v}"`
        const bad = which === 'live' && r.differs
        return (
          <g key={r.key}>
            <T x={x} y={y} size={L.mono - 0.5} fill="var(--ink-3)">
              {r.label}:
            </T>
            <T x={x + 8} y={y + 19} size={L.mono} weight={700} fill={bad ? 'var(--red)' : 'var(--ink)'}>
              {shown}
            </T>
            {bad && (
              <g>
                <Rough shape={{ k: 'ellipse', cx: x + 8 + shown.length * L.mono * 0.31, cy: y + 14, w: shown.length * L.mono * 0.62 + 22, h: 26 }} seed={2501 + i} stroke="var(--red)" strokeWidth={1.6} />
                <Cross x={box.x + box.w - 22} y={y + 12} size={7} seed={2511 + i} />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ maxWidth: L.wide ? undefined : 460, margin: '0 auto' }}>
      <Diagram width={L.W} height={L.H} label={label}>
        {L.zone && (
          <T x={L.zone[0]} y={L.zone[1]} font="hand" size={20}>
            izvan klastera
          </T>
        )}
        {!L.wide && (
          <T x={10} y={24} font="hand" size={20}>
            config repozitorij (Git)
          </T>
        )}
        <NotebookPage x={L.git.x} y={L.git.y} w={L.git.w} h={L.git.h} seed={2521} />
        {card(L.git, 'Git · deployment.yaml', 'git')}
        {prot && <Padlock x={L.git.x + L.git.w - 22} y={L.git.y + 26} s={1.1} seed={2522} />}
        {/* CI and its key */}
        <Drawer x={L.ci.x} y={L.ci.y} w={L.ci.w} h={L.ci.h} seed={2531} />
        <T x={L.ciLabel[0]} y={L.ciLabel[1]} font="ui" size={15} weight={700} anchor="middle">
          CI
        </T>
        <KeyGlyph x={L.key[0]} y={L.key[1]} s={1.25} stroke={push || leaked ? 'var(--red)' : 'var(--ink-2)'} seed={2532} />
        <T x={L.keyLabel[0]} y={L.keyLabel[1]} size={L.mono - 0.5} anchor="middle" fill={leaked ? 'var(--red)' : push ? 'var(--red)' : 'var(--ink-2)'} weight={600}>
          {leaked ? 'procurio!' : push ? 'cluster-admin' : 'token za Git'}
        </T>
        {/* the laptop of 02:00 */}
        <MiniLaptop x={L.laptop.x} y={L.laptop.y} w={L.laptop.w} h={L.laptop.h} seed={2533} />
        <T x={L.laptopLabel[0]} y={L.laptopLabel[1]} size={L.mono - 0.5} anchor={L.laptopAnchor} fill={edited ? 'var(--red)' : 'var(--ink-2)'}>
          kubectl edit
        </T>
        <T x={L.laptopLabel[0]} y={L.laptopLabel[1] + 17} size={L.mono - 0.5} anchor={L.laptopAnchor} fill="var(--ink-3)">
          02:00
        </T>
        {/* firewall and cluster */}
        {'x' in L.fire ? <Firewall x={L.fire.x} y1={L.fire.y1} y2={L.fire.y2} seed={2541} /> : <FirewallH y={L.fire.y} x1={L.fire.x1} x2={L.fire.x2} seed={2541} />}
        <Rough shape={{ k: 'rect', x: L.cluster.x, y: L.cluster.y, w: L.cluster.w, h: L.cluster.h }} seed={2542} stroke="var(--pen)" strokeWidth={1.7} />
        <Rough shape={{ k: 'rect', x: L.cluster.x + 4, y: L.cluster.y + 4, w: L.cluster.w - 8, h: L.cluster.h - 8 }} seed={2543} stroke="var(--pen)" strokeWidth={1.1} />
        <T x={L.clusterTitle[0]} y={L.clusterTitle[1]} font="hand" size={20} anchor={L.clusterAnchor}>
          klaster
        </T>
        <Rough shape={{ k: 'rect', x: L.live.x, y: L.live.y, w: L.live.w, h: L.live.h }} seed={2544} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
        {card(L.live, 'Deployment klopa-api (živo)', 'live')}
        {push ? (
          <T x={L.nobody[0]} y={L.nobody[1]} font="hand" size={20} fill="var(--ink-3)">
            {L.wide ? 'ovdje nitko ne uspoređuje' : 'nitko ne uspoređuje'}
          </T>
        ) : (
          <g>
            <LoopMagnifier cx={L.argo[0]} cy={L.argo[1]} r={22} seed={2545} />
            <T x={L.argoText[0]} y={L.argoText[1]} size={15} font="ui" weight={700} anchor={L.argoAnchor}>
              Argo CD
            </T>
            <SyncTag x={L.argoText[0]} y={L.argoText[1] + 22} sync={app.sync} size={L.mono} anchor={L.argoAnchor} />
            <T x={L.argoText[0]} y={L.argoText[1] + 44} font="hand" size={20} fill="var(--pen)" anchor={L.argoAnchor}>
              povlači iz Gita
            </T>
            <Arrow pts={L.pullPath} stroke="var(--pen)" strokeWidth={1.8} seed={2546} />
          </g>
        )}
        {/* push: CI applies straight into the cluster with its key */}
        {push && (released || leaked) && (
          <g>
            <Arrow pts={L.pushPath} stroke="var(--red)" strokeWidth={2} seed={2551} />
            <T x={L.pushLabel[0]} y={L.pushLabel[1]} size={L.mono - 0.5} fill="var(--red)" weight={600}>
              {leaked ? 'napadač: kubectl apply' : 'kubectl apply'}
            </T>
          </g>
        )}
        {/* pull: the CI bot only commits to Git */}
        {!push && (released || attacked || rejected) && (
          <g>
            <Arrow pts={L.commitPath} stroke={attacked || rejected ? 'var(--red)' : 'var(--pen)'} strokeWidth={1.8} seed={2552} />
            {L.commitLabel && (
              <T x={L.commitLabel[0]} y={L.commitLabel[1]} size={L.mono - 0.5} fill={attacked || rejected ? 'var(--red)' : 'var(--pen)'}>
                {attacked || rejected ? 'napadač: push u main' : 'commit'}
              </T>
            )}
            {rejected && !attacked && <Cross x={(L.commitPath[0][0] + L.commitPath[1][0]) / 2} y={(L.commitPath[0][1] + L.commitPath[1][1]) / 2} size={10} seed={2553} />}
          </g>
        )}
        {edited && <Arrow pts={L.editPath} stroke="var(--red)" strokeWidth={1.8} dash="7 5" seed={2554} />}
      </Diagram>
      </div>
    </div>
  )
}
