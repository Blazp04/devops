import { Arrow, Cross, Diagram, FoodBox, Rough, Stepper, stepColor, useWidth } from '../../../kit'
import { Hand, Mono } from './Parts'
import { FS } from './stage'

const STEPS = [
  {
    title: 'Na Laninu laptopu',
    body: 'Sjetimo se 8. predavanja: naredba docker razgovara s demonom dockerd, on predaje posao containerdu, a containerd za svaki kontejner pozove runc, koji stvori proces s imenskim prostorima i cgroups – i izađe.',
  },
  {
    title: 'Na čvoru u klasteru',
    body: 'Na čvoru nema ni naredbe docker ni dockerd. kubelet razgovara izravno s izvršnim okruženjem kontejnera (engl. container runtime) preko standardnog sučelja CRI (engl. Container Runtime Interface).',
  },
  {
    title: 'Isti donji katovi',
    body: 'containerd i runc isti su i na laptopu i na čvoru. Zato slika koju je Lana izgradila naredbom docker build radi i u klasteru: to je standardna OCI slika, a za njezino pokretanje Docker nije potreban (samo neka je izgrađena za procesor čvora, npr. amd64).',
  },
  {
    title: 'Docker nije potreban',
    body: 'Nekad je kubelet do Dockera išao preko prijelaznog sloja dockershim, a Docker (demon dockerd) tek onda do containerda. I taj sloj i dockerd na čvoru su nestali, pa klaster treba izvršno okruženje koje govori CRI: containerd, CRI-O ili Docker preko dodatka cri-dockerd.',
  },
]

interface Lv {
  y: number
  h: number
}

function Drawing({ step }: { step: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = (width ?? 720) < 560
  const W = narrow ? 400 : 720
  const H = narrow ? 470 : 380
  const colW = narrow ? 160 : 210
  const xs = narrow ? [8, 232] : [110, 400]
  const top = narrow ? 56 : 52
  const gap = narrow ? 78 : 62
  const lv: Lv[] = [0, 1, 2, 3, 4].map((i) => ({ y: top + i * gap, h: i === 4 ? (narrow ? 64 : 56) : 38 }))
  const shared = step >= 2
  const col = stepColor(step)
  // dimmed parts: the pencil lines fade, the lettering only turns --ink-3 (never opacity on text)
  const box = (x: number, i: number, label: string, o: { dim?: boolean; color?: string; dash?: string; seed: number }) => (
    <g>
      <g opacity={o.dim ? 0.28 : 1}>
        <Rough shape={{ k: 'rect', x, y: lv[i].y, w: colW, h: lv[i].h }} seed={o.seed} stroke={o.color ?? 'var(--ink)'} strokeWidth={1.7} dash={o.dash} fillColor="var(--paper)" fillStyle="solid" />
      </g>
      <Mono x={x + colW / 2} y={lv[i].y + 25} anchor="middle" color={o.dim ? 'var(--ink-3)' : o.color === 'var(--red)' ? 'var(--red)' : 'var(--ink)'}>
        {label}
      </Mono>
    </g>
  )
  const arrow = (x: number, from: number, to: number, o: { dim?: boolean; label?: string; seed: number }) => {
    const ax = x + colW / 2
    return (
      <g>
        <g opacity={o.dim ? 0.28 : 1}>
          <Arrow pts={[[ax, lv[from].y + lv[from].h + 2], [ax, lv[to].y - 3]]} stroke="var(--ink-2)" strokeWidth={1.5} seed={o.seed} />
        </g>
        {o.label && (
          <Mono x={ax + 10} y={(lv[from].y + lv[from].h + lv[to].y) / 2 + 6} color={o.dim ? 'var(--ink-3)' : 'var(--pen)'} weight={600}>
            {o.label}
          </Mono>
        )}
      </g>
    )
  }
  const [L, R] = xs
  const oldY = lv[0].y + lv[0].h + 8
  const oldH = lv[2].y - 8 - oldY
  const leftDim = step === 1
  const rightDim = step === 0
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Diagram width={W} height={H} label="Dva stoga: na laptopu docker, dockerd, containerd, runc i kontejner; na čvoru kubelet preko sučelja CRI do containerd, runc i kontejnera, bez Dockera.">
          <text x={L + colW / 2} y={30} textAnchor="middle" className="k-svg-display" style={{ fontSize: FS.title, fill: leftDim ? 'var(--ink-3)' : undefined }}>
            Lanin laptop
          </text>
          <text x={R + colW / 2} y={30} textAnchor="middle" className="k-svg-display" style={{ fontSize: FS.title, fill: rightDim ? 'var(--ink-3)' : undefined }}>
            čvor u klasteru
          </text>
          {/* the shared lower floors */}
          {shared && <Rough shape={{ k: 'rect', x: L - 8, y: lv[2].y - 8, w: R + colW - L + 16, h: lv[3].y + lv[3].h - lv[2].y + 16 }} seed={4201} stroke="none" fillColor="var(--hl-green-ink)" hachureGap={6} fillWeight={1.2} />}
          {/* left: docker stack */}
          {box(L, 0, 'docker', { dim: leftDim, seed: 4211 })}
          {arrow(L, 0, 1, { dim: leftDim, seed: 4212 })}
          {box(L, 1, 'dockerd', { dim: leftDim, seed: 4213 })}
          {arrow(L, 1, 2, { dim: leftDim, seed: 4214 })}
          {box(L, 2, 'containerd', { dim: leftDim, seed: 4215 })}
          {arrow(L, 2, 3, { dim: leftDim, seed: 4216 })}
          {box(L, 3, 'runc', { dim: leftDim, seed: 4217 })}
          {arrow(L, 3, 4, { dim: leftDim, seed: 4218 })}
          <g opacity={leftDim ? 0.28 : 1}>
            <FoodBox x={L + colW / 2 - 34} y={lv[4].y} w={68} h={lv[4].h - 6} />
          </g>
          {/* right: the node */}
          {box(R, 0, 'kubelet', { dim: rightDim, seed: 4221, color: step === 1 ? col : undefined })}
          {step >= 3 ? (
            <g>
              {/* the old path: kubelet → dockershim → dockerd → containerd (a whole extra daemon), crossed out */}
              <Rough shape={{ k: 'rect', x: R, y: oldY, w: colW, h: oldH }} seed={4222} stroke="var(--red)" strokeWidth={1.7} dash="6 4" fillColor="var(--paper)" fillStyle="solid" />
              <Mono x={R + colW / 2} y={oldY + oldH / 2 - 4} anchor="middle" color="var(--red)">
                dockershim
              </Mono>
              <Mono x={R + colW / 2} y={oldY + oldH / 2 + 18} anchor="middle" color="var(--red)">
                → dockerd
              </Mono>
              <Cross x={R + colW - 16} y={oldY + 16} size={10} />
            </g>
          ) : (
            <g>
              <g opacity={rightDim ? 0.28 : 1}>
                <Arrow pts={[[R + colW / 2, lv[0].y + lv[0].h + 2], [R + colW / 2, lv[2].y - 3]]} stroke={step === 1 ? col : 'var(--ink-2)'} strokeWidth={1.7} seed={4223} />
              </g>
              <Mono x={R + colW / 2 + 10} y={lv[1].y + 25} color={rightDim ? 'var(--ink-3)' : 'var(--pen)'} weight={600}>
                CRI
              </Mono>
            </g>
          )}
          {step >= 3 && (
            <g>
              <Arrow pts={[[R - 4, lv[0].y + lv[0].h / 2], [R - 22, lv[0].y + lv[0].h / 2], [R - 22, lv[2].y + lv[2].h / 2], [R - 4, lv[2].y + lv[2].h / 2]]} stroke="var(--pen)" strokeWidth={1.7} seed={4224} />
              <Mono x={R - 30} y={(lv[1].y + lv[1].h / 2) + 6} anchor="end" color="var(--pen)" weight={600}>
                CRI
              </Mono>
            </g>
          )}
          {box(R, 2, 'containerd', { dim: rightDim, seed: 4225 })}
          {arrow(R, 2, 3, { dim: rightDim, seed: 4226 })}
          {box(R, 3, 'runc', { dim: rightDim, seed: 4227 })}
          {arrow(R, 3, 4, { dim: rightDim, seed: 4228 })}
          <g opacity={rightDim ? 0.28 : 1}>
            <FoodBox x={R + colW / 2 - 34} y={lv[4].y} w={68} h={lv[4].h - 6} />
          </g>
          {shared && !narrow && <Hand x={R + colW + 14} y={lv[3].y + 16} lines={['isti donji', 'katovi']} color="var(--green)" />}
          {shared && narrow && <Hand x={W / 2} y={lv[4].y + lv[4].h + 28} anchor="middle" lines={['isti donji katovi: containerd i runc']} color="var(--green)" />}
          {step >= 3 && !narrow && <Hand x={R + colW + 14} y={lv[1].y + 24} lines={['uklonjeno']} color="var(--red)" />}
          {step >= 3 && !narrow && <Hand x={R + colW + 14} y={lv[2].y + 26} lines={['ili CRI-O']} color="var(--ink-2)" />}
        </Diagram>
      </div>
    </div>
  )
}

export function RuntimeStepper() {
  return (
    <Stepper title="Tko pokreće kontejnere" steps={STEPS} autoPlay={0} caption="Isti kontejner, dva puta do njega: s Dockerom na laptopu i s kubeletom na čvoru.">
      {(step) => <Drawing step={step} />}
    </Stepper>
  )
}
