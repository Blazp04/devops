import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Check, Diagram, Laptop, Rough, Shelf, Stepper, SvgStamp, TrayStack, stepColor, useWidth } from '../../../kit'

const DIGEST = 'sha256:7c1e9a…'
const PIN = 'images: …@sha256:7c1e…'
const IMAGE_OUT = `image: …@${DIGEST}`

type Env = { name: string; sub: string; facts: string[]; risky: boolean[]; overlay: string[]; out: string[]; diff: boolean[] }

const ENVS: Env[] = [
  {
    name: 'dev',
    sub: 'kind na Laninom laptopu',
    facts: ['podatci: 40 narudžbi', 'promet: 1 zahtjev/s', 'SMS: sandbox'],
    risky: [false, false, false],
    overlay: ['replicas: 1', 'LOG_LEVEL: debug', PIN],
    out: ['namespace: klopa', 'replicas: 1', 'LOG_LEVEL: debug', IMAGE_OUT],
    diff: [false, true, true, true],
  },
  {
    name: 'staging',
    sub: 'namespace klopa-staging',
    facts: ['podatci: 2000 narudžbi', 'promet: 3 zahtjeva/s', 'SMS: sandbox'],
    risky: [false, false, false],
    overlay: ['namespace: klopa-staging', PIN],
    out: ['namespace: klopa-staging', 'replicas: 2', 'LOG_LEVEL: info', IMAGE_OUT],
    diff: [true, false, false, true],
  },
  {
    name: 'prod',
    sub: 'namespace klopa',
    facts: ['podatci: 30 000 narudžbi', 'promet: 20 zahtjeva/s', 'SMS: pravi studenti'],
    risky: [true, true, true],
    overlay: ['replicas: 4', PIN],
    out: ['namespace: klopa', 'replicas: 4', 'LOG_LEVEL: info', IMAGE_OUT],
    diff: [false, true, false, true],
  },
]

const STEPS = [
  {
    title: 'Jedna slika, jedan digest',
    body: 'Slika se gradi jednom. Njezin digest je sha256 sažetak sadržaja (manifesta slike) – ne može se promijeniti, za razliku od oznake (tag).',
    aria: 'Slika se gradi jednom. Njezin digest je sha256 sažetak sadržaja (manifesta slike) – ne može se promijeniti, za razliku od oznake (tag).',
  },
  {
    title: 'Promocija: isti artefakt putuje dalje',
    body: 'Ista slika, s istim digestom, ide u dev, pa u staging, pa u produkciju. Ne gradimo je ponovno za svako okruženje.',
    aria: 'Ista slika, s istim digestom, ide u dev, pa u staging, pa u produkciju. Ne gradimo je ponovno za svako okruženje.',
  },
  {
    title: 'Staging je prošao ≠ produkcija radi',
    body: 'Okruženja se razlikuju u podatcima, opterećenju i konfiguraciji. Zato i nakon staginga u produkciji treba oprezno uvođenje.',
    aria: 'Okruženja se razlikuju u podatcima, opterećenju i konfiguraciji. Zato i nakon staginga u produkciji treba oprezno uvođenje.',
  },
  {
    title: 'Kustomize: osnova i slojevi',
    body: (
      <>
        Zajednički manifesti stoje u <code>base/</code>. Svako okruženje ima tanki sloj (overlay) koji mijenja samo ono što je drukčije – i u njemu isti digest slike. Kao slojevi slike u 8. predavanju.
      </>
    ),
    aria: 'Zajednički manifesti stoje u base/. Svako okruženje ima tanki sloj (overlay) koji mijenja samo ono što je drukčije – i u njemu isti digest slike. Kao slojevi slike u 8. predavanju.',
  },
  {
    title: 'Tri obična YAML-a',
    body: (
      <>
        <code>kubectl kustomize</code> iz osnove i sloja izradi običan YAML za svako okruženje. Označeno markerom: samo retci koje je promijenio sloj (osnova ima <code>namespace: klopa</code>, <code>replicas: 2</code> i <code>LOG_LEVEL: info</code>).
      </>
    ),
    aria: 'kubectl kustomize iz osnove i sloja izradi običan YAML za svako okruženje. Označeno markerom: samo retci koje je promijenio sloj (osnova ima namespace: klopa, replicas: 2 i LOG_LEVEL: info).',
  },
]

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function EnvBox({ env, i, b, step, font, reduce }: { env: Env; i: number; b: Box; step: number; font: number; reduce: boolean }) {
  const lh = font + 6
  const bodyY = b.y + 52
  const ovH = lh * env.overlay.length + 10
  const pen = stepColor(Math.min(step, 2))
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={2100 + i} stroke={step === 0 ? 'var(--ink-3)' : 'var(--ink-2)'} dash={step === 0 ? '6 5' : undefined} strokeWidth={1.5} />
      <text x={b.x + 12} y={b.y + 22} className="k-svg-display" style={{ fontSize: font + 3 }}>
        {env.name}
      </text>
      <text x={b.x + 12} y={b.y + 40} className="k-svg-mono" style={{ fontSize: 12.5, fill: 'var(--ink-2)' }}>
        {env.sub}
      </text>

      {step === 1 && (
        <motion.g initial={reduce ? false : { opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.35 + i * 0.55, duration: 0.5, ease: 'linear' }}>
          <Rough shape={{ k: 'rect', x: b.x + 12, y: bodyY, w: Math.min(b.w - 24, 160), h: 30 }} seed={2110 + i} stroke="var(--violet)" fillColor="var(--paper)" fillStyle="solid" strokeWidth={1.6} />
          <text x={b.x + 20} y={bodyY + 20} className="k-svg-mono" style={{ fontSize: font, fill: 'var(--violet)', fontWeight: 600 }}>
            {DIGEST}
          </text>
          <Check x={b.x + Math.min(b.w - 24, 160) + 26} y={bodyY + 15} size={16} />
        </motion.g>
      )}

      {step === 2 &&
        env.facts.map((f, k) => (
          <text key={f} x={b.x + 12} y={bodyY + 14 + k * lh} className="k-svg-mono" style={{ fontSize: font, fill: env.risky[k] ? 'var(--red)' : 'var(--ink)', fontWeight: env.risky[k] ? 600 : 400 }}>
            {env.risky[k] ? '! ' : ''}
            {f}
          </text>
        ))}
      {step === 2 && i === 1 && <SvgStamp x={b.x + b.w - 50} y={b.y + b.h - 26} text="✓ prošao" tone="green" size={13} />}

      {step === 3 && (
        <g>
          {/* two paper layers: base/ underneath, the environment's overlay sheet on top */}
          <Rough shape={{ k: 'rect', x: b.x + 16, y: bodyY + 4, w: b.w - 22, h: ovH + 12 }} seed={2120 + i} stroke="var(--ink-3)" fillColor="var(--paper-2)" fillStyle="solid" strokeWidth={1.2} />
          <text x={b.x + b.w - 12} y={bodyY + ovH + 13} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12.5, fill: 'var(--ink-3)' }}>
            base/
          </text>
          <Rough shape={{ k: 'rect', x: b.x + 8, y: bodyY - 8, w: b.w - 18, h: ovH }} seed={2130 + i} stroke={pen} fillColor="var(--paper)" fillStyle="solid" strokeWidth={1.6} dash="6 4" />
          {env.overlay.map((line, k) => (
            <text key={line} x={b.x + 15} y={bodyY + 10 + k * lh} className="k-svg-mono" style={{ fontSize: font, fill: pen }}>
              {line}
            </text>
          ))}
        </g>
      )}

      {step === 4 &&
        env.out.map((line, k) => (
          <g key={line}>
            {env.diff[k] && <rect x={b.x + 9} y={bodyY + 1 + k * lh} width={Math.min(b.w - 18, line.length * font * 0.62 + 8)} height={lh - 2} fill="var(--hl-yellow)" />}
            <text x={b.x + 12} y={bodyY + 14 + k * lh} className="k-svg-mono" style={{ fontSize: font }}>
              {line}
            </text>
          </g>
        ))}
    </g>
  )
}

function Band({ x, y, w, step, font, narrow }: { x: number; y: number; w: number; step: number; font: number; narrow: boolean }) {
  if (step >= 3) {
    return (
      <g>
        <Rough shape={{ k: 'rect', x, y: y + 6, w: w, h: narrow ? 92 : 70 }} seed={2140} stroke="var(--ink-2)" fillColor="var(--paper-2)" fillStyle="solid" />
        <text x={x + 14} y={y + 30} className="k-svg-display" style={{ fontSize: font + 2 }}>
          base/ – zajedničko svima
        </text>
        <text x={x + 14} y={y + 52} className="k-svg-mono" style={{ fontSize: font }}>
          {narrow ? 'deployment.yaml · service.yaml' : 'deployment.yaml · service.yaml · kustomization.yaml'}
        </text>
        {(narrow ? ['namespace: klopa · replicas: 2', 'LOG_LEVEL: info'] : ['namespace: klopa · replicas: 2 · LOG_LEVEL: info']).map((line, k) => (
          <text key={line} x={x + 14} y={y + 70 + k * 19} className="k-svg-mono" style={{ fontSize: 12.5, fill: 'var(--ink-2)' }}>
            {line}
          </text>
        ))}
      </g>
    )
  }
  const lw = narrow ? 64 : 96
  const sx = narrow ? 96 : 190
  const rx = narrow ? 172 : 330
  const sw = narrow ? 78 : 120
  return (
    <g>
      <Laptop x={x + 6} y={y + 6} w={lw} />
      <text x={x + 6 + lw / 2} y={y + lw * 0.62 + 30} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--pen)' }}>
        gradi se jednom
      </text>
      <Arrow pts={[[x + lw + 14, y + 34], [x + sx - 8, y + 34]]} stroke="var(--ink-3)" seed={2151} />
      <TrayStack x={x + sx} y={y + 8} w={narrow ? 58 : 74} h={56} n={3} labels={['FROM', 'COPY', 'CMD']} labelSize={narrow ? 12.5 : 12} />
      <Arrow pts={[[x + sx + (narrow ? 64 : 82), y + 34], [x + rx - 8, y + 34]]} stroke="var(--ink-3)" seed={2152} />
      <Shelf x={x + rx} y={y + 6} w={sw} h={60} />
      <text x={x + rx + sw / 2} y={y + 82} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12.5, fill: 'var(--ink-2)' }}>
        registry
      </text>
      {narrow ? (
        <text x={x + w - 4} y={y + 100} textAnchor="end" className="k-svg-mono" style={{ fontSize: font, fill: 'var(--violet)', fontWeight: 600 }}>
          klopa-api:2.0.0 = {DIGEST}
        </text>
      ) : (
        <g>
          <Rough shape={{ k: 'rect', x: x + 478, y: y + 14, w: w - 480, h: 48 }} seed={2155} stroke="var(--violet)" fillColor="var(--paper)" fillStyle="solid" strokeWidth={1.6} />
          <text x={x + 490} y={y + 34} className="k-svg-mono" style={{ fontSize: font, fill: 'var(--ink)' }}>
            klopa-api:2.0.0
          </text>
          <text x={x + 490} y={y + 53} className="k-svg-mono" style={{ fontSize: font, fill: 'var(--violet)', fontWeight: 600 }}>
            {DIGEST}
          </text>
        </g>
      )}
    </g>
  )
}

/** Scene 2: one artefact promoted dev → staging → prod, then Kustomize base + overlays rendering three YAMLs. */
export function PromotionStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const reduce = !!useReducedMotion()
  const wide = (width ?? 0) >= 690
  return (
    <div ref={ref}>
      <Stepper steps={STEPS} title="Od laptopa do produkcije" autoPlay={0}>
        {(step) =>
          wide ? (
            <Diagram width={720} height={272} label={`${STEPS[step].title}. ${STEPS[step].aria}`}>
              <Band x={10} y={6} w={700} step={step} font={13} narrow={false} />
              {ENVS.map((env, i) => (
                <EnvBox key={env.name} env={env} i={i} b={{ x: 10 + i * 238, y: 112, w: 224, h: 152 }} step={step} font={13} reduce={reduce} />
              ))}
              {step === 1 && (
                <>
                  <Arrow pts={[[236, 182], [248, 182]]} stroke="var(--violet)" seed={2161} />
                  <Arrow pts={[[474, 182], [486, 182]]} stroke="var(--violet)" seed={2162} />
                </>
              )}
            </Diagram>
          ) : (
            <div style={{ maxWidth: 460, margin: '0 auto' }}>
              <Diagram width={340} height={556} label={`${STEPS[step].title}. ${STEPS[step].aria}`}>
                <Band x={4} y={4} w={332} step={step} font={12.5} narrow />
                {ENVS.map((env, i) => (
                  <EnvBox key={env.name} env={env} i={i} b={{ x: 4, y: 118 + i * 146, w: 332, h: 136 }} step={step} font={12.5} reduce={reduce} />
                ))}
              </Diagram>
            </div>
          )
        }
      </Stepper>
    </div>
  )
}
