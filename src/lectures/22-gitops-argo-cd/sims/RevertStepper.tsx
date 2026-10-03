/**
 * Scene 5 „Rollback je git revert”: a bad tag (2.0.l) is Synced but Degraded, git revert makes a NEW commit, Argo CD
 * syncs it like any other, and the history stays. Every sha, count and time comes from the engine run in lib/story.ts
 * (preset l22Auto + webhook, seed 22).
 */
import { Diagram, PodShape, Rough, StepBadge, Stepper, fmt, stepColor, useWidth } from '../../../kit'
import { revertStory, type RevertStory } from '../lib/story'
import { HealthTag, SyncTag, T } from './parts'
import styles from '../styles.module.css'

function steps(r: RevertStory) {
  return [
    {
      title: 'Loš commit u žurbi',
      body: `Lana na brzinu ručno upiše oznaku u pull requestu, a pregled ne primijeti 2.0.l umjesto 2.0.1 (commit ${r.badShort}). Argo CD ga uz webhook vidi za sekundu i sinkronizira: status je Synced – klaster točno odgovara Gitu. Ali slika 2.0.l ne postoji: ${r.stalled.newBroken} nova Poda stoje u ImagePullBackOff, a ${r.stalled.oldReady} stara i dalje poslužuju.`,
    },
    {
      title: 'Synced, ali Degraded',
      body: `${fmt.num(r.degradedAfter, 1)} s nakon sinkronizacije Deployment prijavi ProgressDeadlineExceeded (u Klopinu YAML-u progressDeadlineSeconds: 60, zadano je 600 s), pa Argo CD aplikaciju označi kao Degraded. Sinkronizacija je uspjela, a aplikacija ne radi kako treba – i nitko verziju ne vraća sam.`,
    },
    {
      title: 'git revert = novi commit',
      body: `Lana pokrene git revert ${r.badShort}. Git stvori novi commit ${r.revertShort} koji poništava promjenu, a on i dalje ide u main kroz pull request (hitni pregled). Argo CD ga sinkronizira kao i svaki drugi commit, stari ReplicaSet se ponovno poveća i za ${fmt.num(r.revertHealthyAfter, 0)} s aplikacija je opet Healthy.`,
    },
    {
      title: 'Povijest ostaje zapisana',
      body: 'U Gitu su sva tri commita: što je pošlo po zlu, tko je to vratio i zašto. Povijest Gita postaje povijest postavljanja. Gumb „Rollback” u sučelju Argo CD-a vratio bi klaster, ali Git bi i dalje tvrdio 2.0.l – a dok je automatska sinkronizacija uključena, Argo CD ga ni ne dopušta.',
    },
  ]
}

export function RevertStepper() {
  const r = revertStory()
  return (
    <Stepper steps={steps(r)} title="Rollback je git revert" autoPlay={0} caption="Iz simulacije (preset l22Auto + webhook, seed 22). Lijevo starije, desno novije.">
      {(step) => <RevertDrawing step={step} r={r} />}
    </Stepper>
  )
}

function RevertDrawing({ step, r }: { step: number; r: RevertStory }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= 640
  const col = stepColor(step)
  const W = wide ? 720 : 360
  const H = wide ? 300 : 430
  const lineY = wide ? 64 : 64
  const bx = wide ? [120, 340, 560] : [52, 180, 308]
  const shown = step >= 2 ? 3 : 2
  const head = shown - 1
  const sync = 'Synced' as const
  const health = step === 0 ? ('Progressing' as const) : step === 1 ? ('Degraded' as const) : ('Healthy' as const)
  const commits = [
    { short: r.prevShort, msg: wide ? 'Ćevap-petak popust' : 'popust', ink: 'var(--ink)' },
    { short: r.badShort, msg: wide ? 'klopa-api 2.0.l (tipfeler)' : '2.0.l', ink: 'var(--red)' },
    { short: r.revertShort, msg: wide ? `Revert „2.0.l”` : 'revert', ink: 'var(--green)' },
  ]
  const fs = wide ? 13.5 : 14
  // cluster panel
  const cy = wide ? 150 : 176
  const podY = wide ? 198 : 300
  const podX0 = wide ? 330 : 56
  const podStep = wide ? 52 : 50
  const pods: { status: 'running' | 'notready' | 'creating'; tone: 'blue' | 'rose' }[] =
    step <= 1
      ? [
          { status: 'running', tone: 'blue' },
          { status: 'running', tone: 'blue' },
          { status: 'running', tone: 'blue' },
          { status: 'notready', tone: 'rose' },
          { status: 'notready', tone: 'rose' },
        ]
      : [
          { status: 'running', tone: 'blue' },
          { status: 'running', tone: 'blue' },
          { status: 'running', tone: 'blue' },
          { status: step === 2 ? 'creating' : 'running', tone: 'blue' },
        ]
  const note = [
    wide ? 'ImagePullBackOff: slika 2.0.l ne postoji' : 'slika 2.0.l ne postoji',
    wide ? 'Synced ≠ Healthy – nitko ne vraća sam' : 'Synced ≠ Healthy',
    wide ? 'revert = novi commit, Argo CD ga povuče' : 'revert = novi commit',
    wide ? 'povijest: tko, kada, zašto' : 'tko, kada, zašto',
  ][step]
  const label = `Commitovi: ${commits
    .slice(0, shown)
    .map((c) => `${c.short} ${c.msg}`)
    .join(', ')}. Argo CD: ${sync}, ${health}. ${note}.`
  return (
    <div ref={ref} className={styles.stepFig}>
      <div style={{ maxWidth: wide ? undefined : 460, margin: '0 auto' }}>
        <Diagram width={W} height={H} label={label}>
          <T x={wide ? 24 : 12} y={26} font="hand" size={20}>
            {wide ? 'config repozitorij · main' : 'Git · main'}
          </T>
          <Rough shape={{ k: 'line', x1: bx[0] - (wide ? 70 : 40), y1: lineY, x2: bx[shown - 1] + (wide ? 60 : 30), y2: lineY }} seed={2901 + shown} strokeWidth={1.6} />
          {commits.slice(0, shown).map((c, i) => (
            <g key={c.short}>
              <Rough shape={{ k: 'ellipse', cx: bx[i], cy: lineY, w: 18, h: 18 }} seed={2910 + i} stroke={c.ink} strokeWidth={1.8} fillColor={i === head ? c.ink : 'var(--paper)'} fillStyle="solid" />
              <T x={bx[i]} y={lineY + 32} size={fs} anchor="middle" weight={700} fill={c.ink}>
                {c.short}
              </T>
              <T x={bx[i]} y={lineY + 52} size={fs} anchor="middle" font="ui" fill="var(--ink-2)">
                {c.msg}
              </T>
              {i === head && (
                <T x={bx[i]} y={lineY - 18} size={fs} anchor="middle" weight={700} fill="var(--red)">
                  HEAD
                </T>
              )}
            </g>
          ))}
          {shown === 3 && (
            <g>
              <Rough
                shape={{ k: 'curve', pts: [[bx[2] - 10, lineY - 10], [(bx[1] + bx[2]) / 2, lineY - (wide ? 44 : 40)], [bx[1] + 10, lineY - 12]] }}
                seed={2920}
                stroke="var(--green)"
                strokeWidth={1.7}
              />
              <T x={(bx[1] + bx[2]) / 2} y={lineY - (wide ? 48 : 44)} size={fs} anchor="middle" fill="var(--green)">
                poništava
              </T>
            </g>
          )}
          {step === 3 && (
            <g>
              <Rough shape={{ k: 'curve', pts: [[bx[0] - 16, lineY + 64], [bx[0] - 10, lineY + 74], [(bx[0] + bx[2]) / 2, lineY + 72], [bx[2] + 10, lineY + 74], [bx[2] + 16, lineY + 64]] }} seed={2921} stroke={col} strokeWidth={1.6} />
            </g>
          )}
          {/* the cluster below */}
          <Rough shape={{ k: 'rect', x: wide ? 20 : 8, y: cy - 6, w: W - (wide ? 40 : 16), h: wide ? 120 : 204 }} seed={2930} stroke="var(--pen)" strokeWidth={1.5} />
          <T x={wide ? 40 : 24} y={cy + 24} font="hand" size={20}>
            Argo CD
          </T>
          <SyncTag x={wide ? 40 : 24} y={cy + 50} sync={sync} size={fs} />
          <HealthTag x={wide ? 40 : 160} y={wide ? cy + 74 : cy + 50} health={health} size={fs} />
          {pods.map((p, i) => (
            <PodShape key={`${step < 2 ? 'a' : 'b'}${i}`} x={podX0 + i * podStep} y={podY} size={32} status={p.status} tone={p.tone} />
          ))}
          {step <= 1 && (
            <T x={podX0 + 3.5 * podStep} y={podY + 40} size={fs} anchor="middle" fill="var(--red)">
              ImagePullBackOff
            </T>
          )}
          <T x={W / 2} y={wide ? H - 12 : H - 18} font="hand" size={20} anchor="middle" fill={col}>
            {note}
          </T>
          <StepBadge n={step + 1} x={W - 24} y={wide ? 24 : 150} color={col} />
        </Diagram>
      </div>
    </div>
  )
}
