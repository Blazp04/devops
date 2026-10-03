import { Arrow, Cloud, Cylinder, Diagram, Envelope, K8sGlyph, MiniLaptop, Rough, StepBadge, Stepper, stepColor } from '../../../kit'
import { providerLadder } from '../lib/scenes'
import { useBoxWidth } from '../lib/useBoxWidth'
import { Eye } from './Eye'

const LADDER = providerLadder()

const STEPS = [
  {
    title: 'Put do baze etcd',
    body: (
      <>
        Lana pošalje <code>secret.yaml</code> naredbom <code>kubectl apply</code>. API poslužitelj zapiše Secret u bazu <code>etcd</code> na disku upravljačke ravnine. Kad Secret pročitamo iz API-ja, vrijednost je prikazana kao base64.
      </>
    ),
  },
  {
    title: 'Po zadanom: nešifrirano',
    body: (
      <>
        Zadani pružatelj šifriranja (engl. <em>provider</em>) je <code>identity</code>: zapis u bazi nije šifriran. Base64 je samo prikaz u API-ju – na disku leži sama lozinka. Tko ukrade kopiju baze ili disk, čita je.
      </>
    ),
  },
  {
    title: 'Šifriranje s lokalnim ključem',
    body: (
      <>
        Pružatelj <code>secretbox</code> (ili <code>aesgcm</code>) šifrira zapis prije upisa. Kopija same baze sad je bezopasna – ali ključ je datoteka na istom disku, pa kradljivac cijelog diska ima i bravu i ključ.
      </>
    ),
  },
  {
    title: 'KMS v2: ključ živi drugdje',
    body: (
      <>
        S pružateljem KMS v2 glavni ključ (KEK) čuva vanjski KMS, a na disku su samo šifrati. Ni kopija baze ni cijeli disk više ne otkrivaju lozinku. (Postoji i <code>aescbc</code>, ali se ne preporučuje.)
      </>
    ),
  },
]

interface Geo {
  w: number
  h: number
  font: number
  hand: number
  laptop: [number, number]
  api: [number, number]
  cp: [number, number, number, number]
  disk: [number, number, number, number]
  etcd: [number, number]
  record: [number, number, number]
  key: [number, number]
  kms: [number, number]
  eyes: [[number, number], [number, number]]
}

const WIDE: Geo = {
  w: 780,
  h: 380,
  font: 14,
  hand: 20,
  laptop: [70, 92],
  api: [300, 86],
  cp: [200, 18, 400, 344],
  disk: [216, 150, 368, 196],
  etcd: [278, 248],
  record: [350, 196, 220],
  key: [404, 306],
  kms: [690, 86],
  eyes: [
    [668, 236],
    [668, 314],
  ],
}

const NARROW: Geo = {
  w: 400,
  h: 640,
  font: 15,
  hand: 21,
  laptop: [62, 70],
  api: [262, 70],
  cp: [8, 140, 384, 370],
  disk: [22, 214, 330, 284],
  etcd: [84, 300],
  record: [142, 262, 196],
  key: [96, 444],
  kms: [330, 590],
  eyes: [
    [70, 574],
    [180, 574],
  ],
}

function Scene({ step, g }: { step: number; g: Geo }) {
  const ladder = LADDER[Math.max(0, step - 1)]
  const enc = step >= 2
  const narrow = g === NARROW
  const [rx, ry, rw] = g.record
  const prefix = step === 2 ? 'k8s:enc:secretbox:v1:' : 'k8s:enc:kms:v2:'
  // step 1 shows only the path; the thieves appear from step 2 on (identity: both read)
  const eyeOpen = [ladder.etcdThief, ladder.diskThief]
  const thieves = step >= 1 ? ` Kopija baze etcd: ${eyeOpen[0] ? 'čita lozinku' : 'ne čita'}; ukradeni disk: ${eyeOpen[1] ? 'čita lozinku' : 'ne čita'}.` : ''
  const label = `Put Secreta do baze etcd. Korak ${step + 1}: ${STEPS[step].title}.${thieves}`
  return (
    <Diagram width={g.w} height={g.h} label={label}>
      {/* control plane: double blue pen; the disk inside it */}
      <Rough shape={{ k: 'rect', x: g.cp[0], y: g.cp[1], w: g.cp[2], h: g.cp[3] }} seed={2501} stroke="var(--pen)" strokeWidth={1.5} roughness={1.2} />
      <Rough shape={{ k: 'rect', x: g.cp[0] + 4, y: g.cp[1] + 4, w: g.cp[2] - 8, h: g.cp[3] - 8 }} seed={2502} stroke="var(--pen)" strokeWidth={1.1} roughness={1.2} />
      <text x={g.cp[0] + 14} y={g.cp[1] + 28} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
        upravljačka ravnina
      </text>
      <Rough shape={{ k: 'rect', x: g.disk[0], y: g.disk[1], w: g.disk[2], h: g.disk[3] }} seed={2503} stroke="var(--ink-2)" strokeWidth={1.5} />
      <text x={g.disk[0] + g.disk[2] - 10} y={g.disk[1] + 26} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        disk upravljačke ravnine
      </text>

      {/* Lana's laptop → API server */}
      <MiniLaptop x={g.laptop[0] - 34} y={g.laptop[1] - 26} w={68} h={46} />
      <text x={g.laptop[0]} y={g.laptop[1] + 40} textAnchor="middle" className="k-svg-display" style={{ fontSize: g.font, fontWeight: 700, fill: 'var(--ink-2)' }}>
        Lanin laptop
      </text>
      <Arrow pts={[[g.laptop[0] + 40, g.laptop[1] - 6], [g.api[0] - 34, g.api[1] - 6]]} stroke={step === 0 ? stepColor(0) : 'var(--ink-3)'} strokeWidth={1.6} seed={2504} />
      <text x={(g.laptop[0] + g.api[0]) / 2} y={g.laptop[1] - 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.font - 1, fill: step === 0 ? stepColor(0) : 'var(--ink-2)' }}>
        kubectl apply
      </text>
      <K8sGlyph kind="api" x={g.api[0] - 26} y={g.api[1] - 26} w={52} h={40} />
      <text x={narrow ? g.api[0] + 26 : g.api[0]} y={g.api[1] + 34} textAnchor={narrow ? 'end' : 'middle'} className="k-svg-display" style={{ fontSize: g.font, fontWeight: 700, fill: 'var(--ink-2)' }}>
        API poslužitelj
      </text>
      {/* an unsealed envelope: base64 is a costume, not a lock */}
      <Envelope x={g.api[0] + 66} y={g.api[1] - 22} w={48} h={32} open seed={2505} />
      <text x={narrow ? g.api[0] + 90 : g.api[0] + 122} y={narrow ? g.api[1] - 46 : g.api[1] - 2} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
        base64
      </text>
      <Arrow pts={[[g.api[0] - 8, g.api[1] + 44], [g.etcd[0] + 4, g.etcd[1] - 40]]} stroke={step === 0 ? stepColor(0) : 'var(--ink-3)'} strokeWidth={1.6} seed={2506} />
      {step === 0 && <StepBadge n={1} x={g.api[0] + (narrow ? -64 : 90)} y={g.api[1] + (narrow ? 60 : 32)} color={stepColor(0)} r={narrow ? 15 : 13} />}

      {/* etcd and the record as it lies on the disk */}
      <Cylinder x={g.etcd[0] - 28} y={g.etcd[1] - 32} w={56} h={62} fillColor={enc ? 'var(--hl-green-ink)' : undefined} />
      <text x={g.etcd[0]} y={g.etcd[1] + 12} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: g.font, fontWeight: 700 }}>
        etcd
      </text>
      {step >= 1 && (
        <g>
          <Rough shape={{ k: 'rect', x: rx, y: ry, w: rw, h: 74 }} seed={2507} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" stroke={enc ? 'var(--green)' : 'var(--red)'} />
          <text x={rx + 8} y={ry + 20} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
            {narrow ? '/registry/secrets/…' : '/registry/secrets/klopa/…'}
          </text>
          {enc ? (
            <>
              <text x={rx + 8} y={ry + 40} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--green)', fontWeight: 600 }}>
                {narrow ? prefix.slice(0, 22) : prefix}
              </text>
              <text x={rx + 8} y={ry + 60} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--green)', fontWeight: 600 }}>
                ▒▒▒▒▒▒▒▒▒▒ šifrat
              </text>
            </>
          ) : (
            <>
              <text x={rx + 8} y={ry + 40} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
                …DB_PASSWORD…
              </text>
              <text x={rx + 8} y={ry + 60} className="k-svg-mono" style={{ fontSize: g.font, fill: 'var(--red)', fontWeight: 700 }}>
                klopa_db
              </text>
            </>
          )}
          <Arrow pts={[[g.etcd[0] + 30, g.etcd[1] - 8], [rx - 4, ry + 40]]} stroke="var(--ink-3)" strokeWidth={1.2} seed={2508} dash="4 4" />
        </g>
      )}
      {step === 1 && <StepBadge n={2} x={rx - 16} y={ry - 12} color={stepColor(1)} r={narrow ? 15 : 13} />}

      {/* the key: a file on the same disk (step 3), or away in the KMS (step 4) */}
      {step === 2 && (
        <g>
          <Rough shape={{ k: 'poly', pts: [[g.key[0] - 22, g.key[1] - 26], [g.key[0] + 12, g.key[1] - 26], [g.key[0] + 22, g.key[1] - 16], [g.key[0] + 22, g.key[1] + 24], [g.key[0] - 22, g.key[1] + 24]] }} seed={2509} strokeWidth={1.4} fillColor="var(--note-yellow)" fillStyle="solid" />
          <text x={g.key[0]} y={g.key[1] + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.font - 1, fontWeight: 700, fill: 'var(--note-ink)' }}>
            ključ
          </text>
          <text x={g.key[0] + 32} y={g.key[1] + 8} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
            na istom disku!
          </text>
          <StepBadge n={3} x={g.key[0] - 40} y={g.key[1]} color={stepColor(2)} r={narrow ? 15 : 13} />
        </g>
      )}
      {step === 3 && (
        <g>
          <Cloud x={g.kms[0] - 46} y={g.kms[1] - 30} w={92} h={52} />
          <text x={g.kms[0]} y={g.kms[1] + 2} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.font - 1, fontWeight: 700, fill: 'var(--green)' }}>
            KEK
          </text>
          <text x={g.kms[0]} y={g.kms[1] + 40} textAnchor="middle" className="k-svg-display" style={{ fontSize: g.font, fontWeight: 700, fill: 'var(--ink-2)' }}>
            vanjski KMS
          </text>
          {/* only the API server (through the KMS plugin) talks to the KMS; etcd never sees the key */}
          <Arrow
            pts={
              narrow
                ? [[g.kms[0] + 20, g.kms[1] - 32], [370, g.kms[1] - 70], [370, g.api[1] + 60], [g.api[0] + 30, g.api[1] + 18]]
                : [[g.kms[0] - 46, g.kms[1] + 18], [g.api[0] + 170, g.api[1] + 38], [g.api[0] + 28, g.api[1] + 12]]
            }
            stroke="var(--green)"
            strokeWidth={1.4}
            seed={2510}
            dash="6 5"
          />
          <text x={narrow ? 362 : g.api[0] + 176} y={narrow ? g.api[1] + 110 : g.api[1] + 54} textAnchor={narrow ? 'end' : 'start'} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--green)' }}>
            KMS plugin
          </text>
          <StepBadge n={4} x={narrow ? g.kms[0] - 62 : g.kms[0] + 58} y={narrow ? g.kms[1] - 20 : g.kms[1] - 26} color={stepColor(3)} r={narrow ? 15 : 13} />
        </g>
      )}

      {/* the two thieves */}
      {step >= 1 && [0, 1].map((i) => {
        const [ex, ey] = g.eyes[i]
        return (
          <g key={i}>
            <Eye x={ex} y={ey} w={36} open={eyeOpen[i]} seed={2520 + i * 13} />
            <text x={ex} y={ey + 34} textAnchor="middle" className="k-svg-display" style={{ fontSize: g.font, fontWeight: 700, fill: eyeOpen[i] ? 'var(--red)' : 'var(--ink-2)' }}>
              {i === 0 ? 'kopija baze' : 'cijeli disk'}
            </text>
          </g>
        )
      })}
    </Diagram>
  )
}

export function WhereStepper() {
  const [ref, width] = useBoxWidth<HTMLDivElement>()
  const g = width === null || width >= Math.ceil((WIDE.w * 12) / (WIDE.font - 1)) ? WIDE : NARROW
  return (
    <Stepper steps={STEPS} title="Gdje tajna živi" autoPlay={0}>
      {(step) => (
        <div ref={ref} style={{ width: '100%' }}>
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <Scene step={step} g={g} />
          </div>
        </div>
      )}
    </Stepper>
  )
}
