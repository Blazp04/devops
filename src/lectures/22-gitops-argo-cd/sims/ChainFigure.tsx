/**
 * Scene 5 „end-to-end chain”: who does what. CI builds, tests and pushes the image, then its bot commits the new
 * tag/digest to the config repo – it holds only a token for that repo. Argo CD, inside the cluster, pulls and
 * applies. Static drawing (no motion), two layouts by container width.
 */
import { Arrow, CommitString, Diagram, Drawer, LoopMagnifier, MiniLaptop, PodShape, Rough, Shelf, useWidth } from '../../../kit'
import { Firewall, FirewallH, NotebookPage, T } from './parts'

export function ChainFigure() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= 640
  const label =
    'Put jedne promjene: Lana spremi kod, CI izgradi, testira i objavi sliku u registar, CI bot spremi novi digest slike u config repozitorij. Argo CD u klasteru povuče config repozitorij i uskladi Podove. CI ima samo token za config repozitorij; ključ za klaster ima samo Argo CD u klasteru.'
  if (wide) {
    return (
      <div ref={ref} style={{ width: '100%' }}>
        <Diagram width={720} height={250} label={label}>
          {/* brackets: who does what */}
          <Rough shape={{ k: 'curve', pts: [[96, 62], [100, 52], [320, 50], [548, 52], [552, 62]] }} seed={3001} stroke="var(--pen)" strokeWidth={1.6} />
          <T x={324} y={40} font="hand" size={20} anchor="middle" fill="var(--pen)">
            CI: gradi, testira, objavljuje i sprema commit
          </T>
          <Rough shape={{ k: 'curve', pts: [[592, 62], [596, 52], [652, 50], [708, 52], [712, 62]] }} seed={3002} stroke="var(--green)" strokeWidth={1.6} />
          <T x={712} y={40} font="hand" size={20} anchor="end" fill="var(--green)">
            Argo CD: postavlja
          </T>
          {/* Lana */}
          <MiniLaptop x={16} y={98} w={62} h={44} seed={3003} />
          <T x={47} y={166} size={13.5} anchor="middle">
            git push
          </T>
          <Arrow pts={[[82, 120], [100, 120]]} strokeWidth={1.5} seed={3004} />
          <CommitString x={104} y={120} w={58} n={3} r={5} seed={3005} />
          <T x={133} y={166} size={13.5} anchor="middle">
            kod
          </T>
          <Arrow pts={[[168, 120], [190, 120]]} strokeWidth={1.5} seed={3006} />
          {['build', 'test', 'push'].map((t, i) => (
            <g key={t}>
              <Drawer x={194 + i * 58} y={102} w={46} h={36} seed={3010 + i} />
              <T x={217 + i * 58} y={166} size={13.5} anchor="middle">
                {t}
              </T>
              {i < 2 && <Arrow pts={[[242 + i * 58, 120], [250 + i * 58, 120]]} strokeWidth={1.3} head={6} seed={3020 + i} />}
            </g>
          ))}
          <Arrow pts={[[358, 120], [372, 120]]} strokeWidth={1.5} seed={3030} />
          <Shelf x={376} y={92} w={62} h={56} seed={3031} />
          <T x={407} y={166} size={13.5} anchor="middle">
            registar
          </T>
          <T x={407} y={184} size={13.5} anchor="middle" fill="var(--ink-3)">
            2.0.1@sha256:…
          </T>
          <Arrow pts={[[442, 120], [458, 120]]} stroke="var(--pen)" strokeWidth={1.7} seed={3032} />
          <NotebookPage x={462} y={90} w={86} h={62} seed={3033} />
          <T x={505} y={128} size={13.5} anchor="middle" fill="var(--pen)" weight={600}>
            2.0.1
          </T>
          <T x={505} y={166} size={13.5} anchor="middle">
            config repo
          </T>
          <T x={505} y={204} size={13.5} anchor="middle" fill="var(--pen)">
            commit bota
          </T>
          <Firewall x={572} y1={66} y2={214} seed={3034} />
          <Rough shape={{ k: 'rect', x: 590, y: 66, w: 122, h: 148 }} seed={3035} stroke="var(--pen)" strokeWidth={1.6} />
          <LoopMagnifier cx={622} cy={108} r={20} seed={3036} />
          <Arrow pts={[[600, 112], [552, 118]]} stroke="var(--pen)" strokeWidth={1.8} seed={3037} />
          <PodShape x={650} y={176} size={28} status="running" tone="green" />
          <PodShape x={690} y={176} size={28} status="running" tone="green" />
          <Arrow pts={[[630, 132], [646, 154]]} stroke="var(--green)" strokeWidth={1.5} head={6} seed={3038} />
          <T x={676} y={112} size={13.5} anchor="middle" fill="var(--pen)" weight={600}>
            povlači
          </T>
          <T x={320} y={230} size={13.5} anchor="middle" fill="var(--ink-2)">
            ključ CI-ja: samo token za config repo (pull request)
          </T>
          <T x={712} y={236} size={13.5} anchor="end" fill="var(--ink-2)">
            ključ: u klasteru
          </T>
        </Diagram>
      </div>
    )
  }
  const rows = [
    { y: 52, text: 'Lana: git push' },
    { y: 126, text: 'kod (app repo)' },
    { y: 200, text: 'CI: build → test → push' },
    { y: 284, text: 'registar: 2.0.1@sha256:…' },
    { y: 368, text: 'commit bota u config repo' },
  ]
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <Diagram width={360} height={600} label={label}>
          <MiniLaptop x={26} y={28} w={62} h={44} seed={3051} />
          <CommitString x={28} y={126} w={60} n={3} r={5} seed={3052} />
          {[0, 1, 2].map((i) => (
            <Drawer key={i} x={22 + i * 26} y={188 + i * 4} w={34} h={26} seed={3053 + i} />
          ))}
          <Shelf x={28} y={258} w={60} h={52} seed={3056} />
          <NotebookPage x={22} y={340} w={72} h={56} seed={3057} />
          {rows.map((r) => (
            <T key={r.y} x={110} y={r.y + 6} size={14} fill={r.y === 368 ? 'var(--pen)' : 'var(--ink)'}>
              {r.text}
            </T>
          ))}
          {[[78, 112], [140, 182], [222, 254], [314, 336]].map(([a, b2], i) => (
            <Arrow key={i} pts={[[58, a], [58, b2]]} stroke={i === 3 ? 'var(--pen)' : 'var(--ink)'} strokeWidth={1.5} head={7} seed={3060 + i} />
          ))}
          <Rough shape={{ k: 'line', x1: 340, y1: 20, x2: 340, y2: 404 }} seed={3065} stroke="var(--pen)" strokeWidth={1.6} />
          <T x={330} y={424} font="hand" size={20} anchor="end" fill="var(--pen)">
            CI (token za config repo)
          </T>
          <FirewallH y={446} x1={6} x2={354} seed={3066} />
          <Rough shape={{ k: 'rect', x: 6, y: 462, w: 348, h: 130 }} seed={3067} stroke="var(--pen)" strokeWidth={1.6} />
          <LoopMagnifier cx={58} cy={512} r={22} seed={3068} />
          <Arrow pts={[[58, 486], [58, 402]]} stroke="var(--pen)" strokeWidth={1.8} seed={3069} />
          <T x={92} y={506} size={14} fill="var(--pen)" weight={600}>
            Argo CD povlači
          </T>
          <PodShape x={130} y={556} size={28} status="running" tone="green" />
          <PodShape x={172} y={556} size={28} status="running" tone="green" />
          <T x={340} y={584} font="hand" size={20} anchor="end" fill="var(--green)">
            Argo CD postavlja
          </T>
        </Diagram>
      </div>
    </div>
  )
}
