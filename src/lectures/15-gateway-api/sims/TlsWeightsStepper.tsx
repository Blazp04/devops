import { Diagram, Envelope, Legend, MenzaGate, Packet, PodShape, Rough, Signpost, Stepper, Student, createRng, stepColor, useDiagramIds, useWidth } from '../../../kit'
import { Padlock } from './parts'

/** 20 requests, each one picks a version with P(1.4.1) = 10 % (seed 15 → 3 of 20). */
const STREAM = (() => {
  const r = createRng(15)
  return Array.from({ length: 20 }, () => r.next() < 0.1)
})()
const CANARY = STREAM.filter(Boolean).length

function StreamStrip({ x, y, w, cols }: { x: number; y: number; w: number; cols: number }) {
  const ids = useDiagramIds()
  const cw = w / cols
  return (
    <g>
      {STREAM.map((c, i) => {
        const cx = x + (i % cols) * cw
        const cy = y + Math.floor(i / cols) * 34
        return (
          <g key={i}>
            <rect x={cx + 2} y={cy} width={cw - 4} height={24} style={{ fill: c ? 'var(--teal)' : 'var(--violet)', opacity: 0.3 }} />
            {ids && <rect x={cx + 2} y={cy} width={cw - 4} height={24} fill={`url(${c ? ids.hatch : ids.hatchR})`} />}
            <Rough shape={{ k: 'rect', x: cx + 2, y: cy, w: cw - 4, h: 24 }} seed={1900 + i} strokeWidth={1.2} stroke={c ? 'var(--ink)' : 'var(--ink-3)'} />
            {c && (
              <text x={cx + cw / 2} y={cy + 17} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700 }}>
                41
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function TlsStage({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 600
  const W = narrow ? 360 : 680
  const H = narrow ? 470 : 350
  const m = 14
  const student: [number, number] = narrow ? [40, 140] : [50, 150]
  const gate = narrow ? { x: 120, y: 60, w: 100, h: 110 } : { x: 230, y: 70, w: 120, h: 130 }
  const gy = gate.y + gate.h * 0.72
  const podsA: [number, number][] = narrow
    ? [
        [70, 300],
        [150, 300],
        [230, 300],
      ]
    : [
        [560, 70],
        [620, 110],
        [560, 150],
      ]
  const podB: [number, number] = narrow ? [310, 300] : [620, 220]
  const sign = narrow ? { x: 236, y: 100, w: 34, h: 44 } : { x: 380, y: 120, w: 40, h: 54 }
  const exit: [number, number] = narrow ? [300, 200] : [420, gy]
  const env = narrow ? { x: 20, y: 196 } : { x: 150, y: 222 }
  const c = stepColor(Math.min(step, 2))
  const tlsLine: [number, number][] = [
    [student[0] + 24, gy],
    [gate.x + 10, gy],
  ]
  const toPod = (p: [number, number]): [number, number][] => (narrow ? [[gate.x + gate.w, gy], exit, [p[0], p[1] - 24]] : [[gate.x + gate.w - 10, gy], exit, [p[0] - 24, p[1]]])
  const labels = [
    'Student otvara HTTPS vezu prema Gatewayu i u rukovanju najavi domenu (SNI); Gateway pokazuje certifikat iz Secreta klopa-tls i dogovara šifriranje.',
    'TLS završava na vratima: Gateway sada vidi i putanju i zaglavlja (domenu zna već iz rukovanja) i bira pravilo.',
    'Od Gatewaya do Poda zahtjev unutar klastera ide običnim HTTP-om.',
    `Dvadeset zahtjeva na pravilo s težinama 90 i 10: ${CANARY} na verziji 1.4.1, ostali na 1.4.0.`,
    'Težine dijele zahtjeve, a ne Podove: tri Poda 1.4.0 i jedan Pod 1.4.1 i dalje dobivaju 90 i 10 posto.',
  ]
  return (
    <div ref={ref}>
      <Diagram width={W} height={H} label={labels[step]}>
        <Student x={student[0] - 24} y={student[1] - 70} scale={0.5} />
        <text x={narrow ? 4 : student[0] - 4} y={narrow ? 66 : student[1] + 22} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: m }}>
          preglednik
        </text>
        <MenzaGate x={gate.x} y={gate.y} w={gate.w} h={gate.h} label="Gateway" labelSize={14} />
        <text x={gate.x + gate.w / 2} y={gate.y + gate.h + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
          :443 · HTTPS
        </text>
        <Rough shape={{ k: 'line', x1: env.x + 56, y1: env.y + 4, x2: gate.x + 8, y2: gate.y + gate.h - 4 }} seed={1921} stroke="var(--pen)" strokeWidth={1.3} dash="4 4" />
        <Envelope x={env.x} y={env.y} w={56} h={36} open={step === 0} dots={step === 0} />
        <text x={narrow ? env.x + 28 : env.x + 66} y={narrow ? env.y + 74 : env.y + 24} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-mono" style={{ fontSize: m }}>
          klopa-tls
        </text>
        {/* the TLS hop: padlock on the line */}
        <Rough shape={{ k: 'lin', pts: tlsLine }} seed={1922} stroke={step === 0 ? 'var(--green)' : 'var(--ink-3)'} strokeWidth={step === 0 ? 3 : 1.5} />
        <Padlock x={(tlsLine[0][0] + tlsLine[1][0]) / 2} y={gy - 16} s={1.2} state="ok" />
        {step === 0 && (
          <g>
            <text x={narrow ? 60 : (tlsLine[0][0] + tlsLine[1][0]) / 2} y={gy + (narrow ? 24 : 26)} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: c }}>
              ① šifrirano
            </text>
            <Packet path={tlsLine} duration={1.2} tone="neutral" r={5} />
          </g>
        )}
        <Signpost {...sign} />
        {step >= 1 && (
          <g>
            <Rough shape={{ k: 'rect', x: narrow ? 12 : gate.x - 20, y: narrow ? 6 : 8, w: narrow ? 210 : 220, h: 46 }} seed={1931} fillColor="var(--note-yellow)" fillStyle="solid" strokeWidth={1.2} />
            <text x={(narrow ? 12 : gate.x - 20) + 10} y={narrow ? 25 : 27} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--note-ink)' }}>
              GET /api/jelovnik
            </text>
            <text x={(narrow ? 12 : gate.x - 20) + 10} y={narrow ? 44 : 46} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--note-ink)' }}>
              Host: klopa.example
            </text>
            {step === 1 && (
              <text x={narrow ? 232 : gate.x + 210} y={narrow ? 34 : 36} className="k-svg-hand" style={{ fontSize: m * 1.45, fill: c }}>
                ② čitljivo!
              </text>
            )}
          </g>
        )}
        {/* Pods */}
        {podsA.map((p, i) => (
          <PodShape key={i} x={p[0]} y={p[1]} size={32} tone="violet" />
        ))}
        <PodShape x={podB[0]} y={podB[1]} size={32} tone="teal" />
        <text x={narrow ? 150 : 626} y={narrow ? 336 : 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
          1.4.0 × 3
        </text>
        <text x={podB[0] + (narrow ? 0 : 0)} y={podB[1] + 36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: m }}>
          1.4.1
        </text>
        {step >= 2 &&
          [...podsA, podB].map((p, i) => (
            <Rough key={i} shape={{ k: 'lin', pts: toPod(p) }} seed={1923 + i} stroke="var(--ink-3)" strokeWidth={1.4} dash={step === 2 ? '6 5' : undefined} />
          ))}
        {step === 2 && (
          <g>
            <text x={narrow ? 180 : 470} y={narrow ? 378 : 300} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: c }}>
              ③ HTTP unutar klastera
            </text>
            <Packet path={toPod(podsA[1])} duration={1.4} tone="neutral" r={5} />
          </g>
        )}
        {step === 3 &&
          STREAM.map((isB, i) => <Packet key={i} path={toPod(isB ? podB : podsA[i % 3])} duration={1.2} delay={i * 0.18} tone="neutral" r={4.4} />)}
        {step >= 3 && (
          <g>
            <StreamStrip x={narrow ? 20 : 40} y={narrow ? 380 : 296} w={narrow ? 320 : 600} cols={narrow ? 10 : 20} />
            <text x={narrow ? 20 : 40} y={narrow ? 366 : 286} className="k-svg-hand" style={{ fontSize: m * 1.45, fill: 'var(--ink-2)' }}>
              {step === 3 ? `20 zahtjeva: ${CANARY} × 1.4.1 („41”), ${20 - CANARY} × 1.4.0` : 'težine: 90 % / 10 % zahtjeva'}
            </text>
          </g>
        )}
        {step === 4 && (
          <text x={narrow ? 180 : 470} y={narrow ? 462 : 344} textAnchor="middle" className="k-svg-hand" style={{ fontSize: m * 1.45, fill: 'var(--red)' }}>
            {narrow ? 'Service: 1 od 4 Poda = 25 %' : 'Service bi dijelio po Podovima: 1 od 4 = 25 % veza'}
          </text>
        )}
      </Diagram>
      <Legend
        items={[
          { color: 'var(--teal)', label: 'verzija 1.4.1 (u traci: „41”)', shape: 'square' },
          { color: 'var(--violet)', label: 'verzija 1.4.0', shape: 'square' },
        ]}
      />
    </div>
  )
}

export function TlsWeightsStepper() {
  return (
    <Stepper
      title="HTTPS na vratima, težine iza njih"
      steps={[
        {
          title: 'Rukovanje na vratima',
          body: (
            <>
              Preglednik otvara HTTPS vezu prema <code>klopa.example:443</code> i već u prvoj poruci najavi domenu (SNI). Gateway po njoj odabere certifikat iz Secreta <code>klopa-tls</code> (vrste{' '}
              <code>kubernetes.io/tls</code>) i s preglednikom obavi TLS rukovanje (engl. <em>handshake</em>): dogovore ključeve za šifriranje.
            </>
          ),
        },
        {
          title: 'TLS završava na ulazu',
          body: (
            <>
              Tu šifrirani promet prestaje: to je <strong>terminacija TLS-a</strong> (engl. <em>TLS termination</em>). Domenu Gateway zna već iz rukovanja (SNI) – po njoj je birao certifikat. Ali putanju i zaglavlja vidi tek sada, nakon terminacije – bez toga ne bi mogao usmjeravati po
              pravilima.
            </>
          ),
        },
        {
          title: 'Unutar klastera',
          body: (
            <>
              Od Gatewaya do Poda zahtjev obično ide običnim HTTP-om kroz mrežu klastera. Treba li i taj dio šifrirati, Gateway API za to ima BackendTLSPolicy.
            </>
          ),
        },
        {
          title: 'Težine 90 / 10, po zahtjevu',
          body: (
            <>
              Pravilo za <code>/api</code> ima dva backendRefa: <code>weight: 90</code> i <code>weight: 10</code>. Za <em>svaki</em> zahtjev Gateway posebno bira verziju, s vjerojatnošću 90 % i 10 %. U ovih 20 zahtjeva verzija 1.4.1
              dobila je {CANARY}; od tisuću zahtjeva dobit će blizu sto.
            </>
          ),
        },
        {
          title: 'Zahtjevi, a ne Podovi',
          body: (
            <>
              Service bi promet dijelio po vezama i Podovima: s tri Poda 1.4.0 i jednim Podom 1.4.1 nova verzija dobije oko četvrtine. Težine na Gatewayu ne ovise o broju Podova – može i 1 %. To je temelj canary izdanja
              (engl. <em>canary release</em>) u 20. predavanju.
            </>
          ),
        },
      ]}
    >
      {(step) => <TlsStage step={step} />}
    </Stepper>
  )
}
