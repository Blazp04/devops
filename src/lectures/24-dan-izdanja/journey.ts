/**
 * „Put jednog commita” – the release-day path of 2.0.2 assembled from two engines:
 *   E4 Tvornica  `releaseDayJourney()` (preset `dan-izdanja`): PR checks, main build with the cache, push → digest,
 *                staging + E2E, gate, the bot commit to the config repo (wall clock from 11:48).
 *   E6 Git↔klaster `PRESETS.l24` + `startCiRelease('2.0.2')`: from that bot commit to Synced + Healthy – webhook,
 *                OutOfSync, sync, new ReplicaSet, scheduling, image pull, readiness, all Pods ready.
 * Each station keeps a snapshot of the engine state (jobs, Pods, Argo CD status) so the timeline can be scrubbed.
 */
import { releaseDayJourney, fmtMB } from '../../engines/build/index.ts'
import * as G from '../../engines/gitops/index.ts'

export type Zone = 'ci' | 'registar' | 'git' | 'klaster'

export interface PodSnap {
  status: G.KitPodStatus
  tag: string
}

export interface Station {
  id: string
  zone: Zone
  clock: string
  title: string
  body: string
  risk: string
  lectures: string[]
  /** CI jobs of the current phase (PR checks or the main run) at this moment, from the E4 timeline */
  jobs: { name: string; state: 'waiting' | 'running' | 'done' }[]
  /** which CI run the drawers show, and a short note under them */
  ciNote: string
  /** the 2.0.2 image is in the registry (from the push station on) */
  pushed: boolean
  /** a commit in the config repo exists for 2.0.2 */
  botCommit: boolean
  argo: { sync: string; health: string }
  pods: PodSnap[]
  endpoints: number
  traffic: boolean
}

export interface Journey {
  stations: Station[]
  digest: string
  downloadMB: string
  changedLayers: number
  totalLayers: number
  prOpened: string
  botAt: string
  healthyAt: string
  leadMin: string
}

function addClock(hhmmss: string, s: number): string {
  const [h, m, sec] = hhmmss.split(':').map(Number)
  const t = h * 3600 + m * 60 + (sec || 0) + Math.round(s)
  const hh = Math.floor(t / 3600)
  const mm = Math.floor((t % 3600) / 60)
  const ss = t % 60
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

const JOBS = ['lint', 'testovi', 'slika', 'skeniranje']
/** E4 station id of each drawer */
const E4_STATION: Record<string, string> = { lint: 'lint', testovi: 'test', slika: 'build', skeniranje: 'scan' }

export function buildJourney(): Journey {
  // ── E4: from Lana's PR to the bot commit ──
  const j = releaseDayJourney()
  const e = (phase: 'pr' | 'main', station: string) => j.entries.find((x) => x.phase === phase && x.station === station)
  const origin = '11:48:00'
  const at = (sec: number) => addClock(origin, sec)
  const prEnd = Math.max(0, ...j.entries.filter((x) => x.phase === 'pr').map((x) => x.end ?? x.start ?? 0))
  const push = e('main', 'push')
  const staging = e('main', 'staging')
  const e2e = e('main', 'e2e')
  const prod = e('main', 'prod')
  const botSec = prod?.start ?? 640
  const botAt = at(botSec)
  const digest = j.digest.slice(0, 19)

  // ── E6: from the bot commit to Synced + Healthy (two passes: times, then snapshots at those times) ──
  const probe = G.createGitOps({ ...G.PRESETS.l24 })
  G.startCiRelease(probe, '2.0.2')
  G.advance(probe, 120)
  const tl = G.commitTimeline(probe).filter((x) => x.station !== 'ci')
  const s = G.createGitOps({ ...G.PRESETS.l24 })
  G.startCiRelease(s, '2.0.2')
  const snaps = new Map<string, { argo: { sync: string; health: string }; pods: PodSnap[] }>()
  let lastT = 0
  for (const st of tl) {
    G.advance(s, Math.max(0, st.t - lastT) + 0.05)
    lastT = st.t + 0.05
    const a = G.appView(s)
    snaps.set(st.station, { argo: { sync: a.sync, health: a.health }, pods: G.podsView(s).map((p) => ({ status: p.kitStatus, tag: p.tag })) })
  }
  const rel = (station: string) => tl.find((x) => x.station === station)?.sinceCommitS ?? 0
  const snap = (station: string) => snaps.get(station) ?? { argo: { sync: 'Synced', health: 'Healthy' }, pods: [] }
  const before = snap('commit')
  const oldPods: PodSnap[] = before.pods.length ? before.pods : [0, 1, 2, 3].map(() => ({ status: 'running' as const, tag: '2.0.1' }))
  const ready = (p: PodSnap[]) => p.filter((x) => x.status === 'running').length

  /** the four drawers of one CI run at `t` seconds after the PR commit */
  const ciAt = (phase: 'pr' | 'main', t: number): Station['jobs'] =>
    JOBS.map((name) => {
      const x = e(phase, E4_STATION[name])
      const state = !x || x.start === null || t < x.start ? 'waiting' : x.end !== null && t >= x.end ? 'done' : 'running'
      return { name, state }
    })
  const mainStart = e('main', 'lint')?.start ?? 160
  const pushAt = push?.start ?? 320
  const mainDone = ciAt('main', Infinity)
  const base = { botCommit: false, argo: { sync: 'Synced', health: 'Healthy' }, pods: oldPods, endpoints: ready(oldPods), traffic: true, jobs: mainDone, ciNote: 'main ✓ · predmemorija ✓', pushed: true }

  const stations: Station[] = [
    {
      ...base,
      id: 'pr',
      zone: 'ci',
      clock: at(0),
      title: 'Lana otvara pull request',
      body: `Ispravak popusta je jedan commit. Provjere PR-a (lint ‖ testovi, izgradnja slike, skeniranje) traju ${Math.floor(prEnd / 60)} min ${Math.round(prEnd % 60)} s jer su ovisnosti i slojevi slike u predmemoriji.`,
      risk: 'Pad testa zaustavlja PR: ništa ne ide dalje, produkcija je netaknuta.',
      lectures: ['21'],
      jobs: ciAt('pr', 0),
      ciNote: 'PR · provjere u tijeku',
      pushed: false,
    },
    {
      ...base,
      id: 'main',
      zone: 'ci',
      clock: at(mainStart),
      title: 'Spajanje u main: CI gradi još jednom',
      body: 'Na mainu se slika gradi ponovno, iz istog Dockerfilea i iste predmemorije. U produkciju ide slika izgrađena na mainu, ne ona iz PR-a.',
      risk: 'Crveni main: tim vraća commit (`git revert`) prije nego što itko drugi gradi na njemu.',
      lectures: ['21'],
      jobs: ciAt('main', mainStart),
      ciNote: 'main · PR je prošao ✓',
      pushed: false,
    },
    {
      ...base,
      id: 'push',
      zone: 'registar',
      clock: at(pushAt),
      title: 'Slika ide u registar',
      body: `Slika s tagom \`2.0.2\` dobiva digest \`${digest}…\`: tag se kasnije može pomaknuti na drugu sliku, a digest uvijek označava točno ove slojeve – zato bot u Git piše oboje.`,
      risk: 'Ako push ne uspije, nema digesta i nema commita u config repozitorij – produkcija ostaje na 2.0.1.',
      lectures: ['08', '21'],
      jobs: ciAt('main', pushAt),
    },
    {
      ...base,
      id: 'staging',
      zone: 'git',
      clock: at(staging?.start ?? 340),
      title: 'Staging i E2E testovi',
      body: `Bot sprema \`2.0.2@sha256:…\` u config repozitorij za staging. E2E testovi traju ${e2e && e2e.end !== null && e2e.start !== null ? Math.round((e2e.end - e2e.start) / 60) : 4} min – u 11:55 Klopa je baš ovdje.`,
      risk: 'Pad E2E testa zaustavlja put prije produkcije: zato staging postoji.',
      lectures: ['20', '21'],
    },
    {
      ...base,
      id: 'bot',
      zone: 'git',
      clock: botAt,
      title: 'Bot commit za produkciju',
      body: 'Vrata su automatska, pa bot sprema isti digest u produkcijski dio config repozitorija. CI nema ključ klastera: samo piše u Git.',
      risk: 'Pogrešan tag u Gitu znači ImagePullBackOff i uvođenje koje stoji (13, 22).',
      lectures: ['22'],
      botCommit: true,
    },
    ...tl
      .filter((x) => x.station !== 'commit')
      .map((x): Station => {
        const sn = snap(x.station)
        const common = { ...base, botCommit: true, argo: sn.argo, pods: sn.pods.length ? sn.pods : oldPods, endpoints: ready(sn.pods.length ? sn.pods : oldPods), clock: addClock(botAt, x.sinceCommitS), id: x.station }
        const plus = `+${String(x.sinceCommitS).replace('.', ',')} s nakon bot commita`
        switch (x.station) {
          case 'seen':
            return { ...common, zone: 'git', title: 'Argo CD vidi commit', body: `${plus}: webhook javlja Argo CD-u odmah, bez čekanja na redovito provjeravanje Gita (svakih 120 s + do 60 s).`, risk: 'Bez webhooka Argo CD primijeti commit tek pri sljedećoj provjeri.', lectures: ['22'] }
          case 'outOfSync':
            return { ...common, zone: 'git', title: 'OutOfSync', body: `${plus}: Git kaže 2.0.2, klaster još vrti 2.0.1. Razlika je točno jedno polje: \`image\`.`, risk: 'OutOfSync bez automatske sinkronizacije čeka čovjeka.', lectures: ['22'] }
          case 'syncStarted':
            return { ...common, zone: 'git', title: 'Sinkronizacija počinje', body: `${plus}: Argo CD radi \`kubectl apply\` iz Gita – isti put koji smo u 11. predavanju pratili od API poslužitelja do etcd-a.`, risk: 'Ako API poslužitelj odbije manifest, sinkronizacija pada, a stari Podovi rade dalje.', lectures: ['11', '22'] }
          case 'applied':
            return { ...common, zone: 'klaster', title: 'Deployment ima novi predložak', body: `${plus}: željeno stanje se promijenilo; kontroler Deploymenta uspoređuje i kreće s uvođenjem.`, risk: 'Neispravan predložak (npr. ključ kojeg nema u Secretu) zaustavlja uvođenje kasnije, na Podu.', lectures: ['10', '13'] }
          case 'rsCreated':
            return { ...common, zone: 'klaster', title: 'Novi ReplicaSet', body: `${plus}: novi ReplicaSet za 2.0.2; maxSurge i maxUnavailable određuju koliko se Podova mijenja odjednom.`, risk: 'Stari ReplicaSet ostaje kao povijest – njime radi `rollout undo`.', lectures: ['13'] }
          case 'firstScheduled':
            return { ...common, zone: 'klaster', title: 'Raspoređivač bira čvor', body: `${plus}: raspoređivač gleda \`requests\`, ne stvarnu potrošnju, i veže Pod uz čvor.`, risk: 'Ako nigdje nema mjesta po requests, Pod ostaje Pending (a Cluster Autoscaler dodaje čvor).', lectures: ['11', '17'] }
          case 'imagePulled':
            return { ...common, zone: 'klaster', title: 'kubelet povlači samo promijenjeni sloj', body: `${plus}: čvor već ima ${j.totalLayers - j.changedLayers} od ${j.totalLayers} slojeva, pa preuzima samo ${fmtMB(j.downloadMB)} (sloj s kodom).`, risk: 'Tag kojeg nema u registru: ErrImagePull → ImagePullBackOff.', lectures: ['08', '11'] }
          case 'firstReady': {
            const n = common.pods.filter((p) => p.tag === '2.0.2' && p.status === 'running').length
            const who = n > 1 ? `prva ${n} Poda 2.0.2 su spremna. EndpointSlice ih označava \`ready: true\`, pa im` : 'prvi Pod 2.0.2 je spreman. EndpointSlice ga označava `ready: true`, pa mu'
            return { ...common, zone: 'klaster', title: 'Provjera spremnosti prolazi', body: `${plus}: ${who} Gateway počinje slati zahtjeve.`, risk: 'Pod koji nikad nije spreman nikad ne dobije promet – stari Podovi poslužuju dalje.', lectures: ['12', '14', '15'] }
          }
          case 'allReady':
            return { ...common, zone: 'klaster', title: 'Svi Podovi 2.0.2 spremni', body: `${plus}: stari Podovi su ugašeni postupno, uz preStop i odvod veza; studenti ništa nisu primijetili.`, risk: 'Bez preStop odgode Podovi se gase prije nego što ih Gateway i kube-proxy prestanu koristiti – nekoliko grešaka po uvođenju.', lectures: ['13', '14'] }
          default:
            return { ...common, zone: 'git', id: 'healthy', title: 'Synced i Healthy', body: `${plus}: klaster odgovara Gitu, a svi resursi su zdravi. 2.0.2 je u produkciji prije 12:00.`, risk: 'Synced ne znači da je kod ispravan: zato nakon izdanja gledamo metrike.', lectures: ['22', '24'] }
        }
      }),
  ]
  const healthy = stations.at(-1)?.clock ?? botAt
  return {
    stations,
    digest,
    downloadMB: fmtMB(j.downloadMB),
    changedLayers: j.changedLayers,
    totalLayers: j.totalLayers,
    prOpened: at(0).slice(0, 5),
    botAt,
    healthyAt: healthy,
    leadMin: `${Math.floor((botSec + rel('healthy')) / 60)} min ${Math.round((botSec + rel('healthy')) % 60)} s`,
  }
}
