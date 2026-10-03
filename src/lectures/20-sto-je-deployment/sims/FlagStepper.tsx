import { Check, DLabel, Davor, Diagram, Doodle, Lana, Mira, Petra, PodShape, Rough, Stepper, stepColor, useWidth } from '../../../kit'

const STEPS = [
  {
    title: 'Postavljeno, ali isključeno',
    body: (
      <>
        Verzija 2.0.1 radi na sva četiri Poda, ali zastavica <code>nova_kosarica</code> je isključena. Svi studenti i dalje vide staru košaricu.
      </>
    ),
    aria: 'Verzija 2.0.1 radi na sva četiri Poda, ali zastavica nova_kosarica je isključena. Svi studenti i dalje vide staru košaricu.',
  },
  {
    title: 'Izdanje za 1 % studenata',
    body: 'Zastavica se uključi za 1 % studenata. Nitko nije ponovno postavljao aplikaciju: isti Podovi, ista slika.',
    aria: 'Zastavica se uključi za 1 % studenata. Nitko nije ponovno postavljao aplikaciju: isti Podovi, ista slika.',
  },
  {
    title: 'Osoblje menze i tim',
    body: 'Teta Mira, Lana, Davor i Petra dobiju novu košaricu prije svih. Ako nešto pukne, zastavica se isključi za sekundu – bez povratka na staru verziju.',
    aria: 'Teta Mira, Lana, Davor i Petra dobiju novu košaricu prije svih. Ako nešto pukne, zastavica se isključi za sekundu – bez povratka na staru verziju.',
  },
  {
    title: 'Svi studenti',
    body: 'Izdanje za sve je poslovna odluka i jedan klik u sustavu za zastavice. Postavljanje se dogodilo danima ranije.',
    aria: 'Izdanje za sve je poslovna odluka i jedan klik u sustavu za zastavice. Postavljanje se dogodilo danima ranije.',
  },
]

const PCT = ['0 %', '1 %', '1 % + osoblje', '100 %']

/** students who see the new cart at each step (of 100, row-major); 1 % = the student with index 37 */
function seesNew(step: number, i: number): boolean {
  if (step >= 3) return true
  return step >= 1 && i === 37
}

function Scene({ step, wide }: { step: number; wide: boolean }) {
  const pods = wide ? { x: 40, y: 46, dx: 46 } : { x: 40, y: 44, dx: 50 }
  const panel = wide ? { x: 20, y: 92, w: 236, h: 104 } : { x: 10, y: 86, w: 320, h: 92 }
  const grid = wide ? { x: 300, y: 34, d: 21 } : { x: 22, y: 220, d: 21 }
  const staff = wide ? { x: 528, y: 22 } : { x: 236, y: 214 }
  const on = step > 0
  const pen = stepColor(step)
  const knobX = panel.x + (on ? 98 : 70)
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <PodShape key={i} x={pods.x + i * pods.dx} y={pods.y} size={30} status="running" tone="violet" ariaLabel={`Pod 2.0.1 broj ${i + 1}, Running`} />
      ))}
      <DLabel x={pods.x - 22} y={pods.y - 26} text={wide ? '2.0.1 na svim Podovima (isti digest u svakom koraku)' : '2.0.1 na svim Podovima'} mono size={12.5} anchor="start" tone="violet" />

      <Rough shape={{ k: 'rect', x: panel.x, y: panel.y, w: panel.w, h: panel.h }} seed={2401} stroke="var(--ink-2)" fillColor="var(--paper-2)" fillStyle="solid" />
      <Doodle kind="flag" x={panel.x + 4} y={panel.y + 8} scale={0.7} />
      <text x={panel.x + 56} y={panel.y + 26} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600 }}>
        nova_kosarica
      </text>
      <Rough shape={{ k: 'rect', x: panel.x + 58, y: panel.y + 40, w: 54, h: 24 }} seed={2402} stroke={on ? 'var(--green)' : 'var(--ink-3)'} fillColor={on ? 'var(--hl-green)' : undefined} fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: knobX, cy: panel.y + 52, w: 20, h: 20 }} seed={2403} stroke="var(--ink)" fillColor="var(--paper)" fillStyle="solid" />
      <text x={panel.x + 122} y={panel.y + 58} className="k-svg-display" style={{ fontSize: 15, fill: on ? 'var(--green)' : 'var(--ink-2)' }}>
        {on ? 'uključena' : 'isključena'}
      </text>
      <text x={panel.x + 14} y={panel.y + (wide ? 90 : 84)} className="k-svg-mono" style={{ fontSize: 13, fill: pen, fontWeight: 600 }}>
        za: {PCT[step]}
      </text>

      {Array.from({ length: 100 }, (_, i) => {
        const cx = grid.x + (i % 10) * grid.d
        const cy = grid.y + Math.floor(i / 10) * grid.d
        const nw = seesNew(step, i)
        return nw ? <circle key={i} cx={cx} cy={cy} r={7} fill="var(--violet)" stroke="var(--violet)" strokeWidth={1.4} /> : <circle key={i} cx={cx} cy={cy} r={6.5} fill="none" stroke="var(--pen)" strokeWidth={1.4} />
      })}
      {step === 1 && <Rough shape={{ k: 'ellipse', cx: grid.x + 7 * grid.d, cy: grid.y + 3 * grid.d, w: 30, h: 30 }} seed={2404} stroke="var(--red)" strokeWidth={1.8} />}
      {/* legend with the same marks as the grid: filled violet = new cart, blue outline = old cart */}
      <g>
        <text x={grid.x - 8} y={grid.y + 10 * grid.d + 10} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          100 studenata:
        </text>
        <circle cx={grid.x + 112} cy={grid.y + 10 * grid.d + 4} r={6.5} fill="var(--violet)" stroke="var(--violet)" strokeWidth={1.4} />
        <text x={grid.x + 123} y={grid.y + 10 * grid.d + 10} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          nova
        </text>
        <circle cx={grid.x + 170} cy={grid.y + 10 * grid.d + 4} r={6} fill="none" stroke="var(--pen)" strokeWidth={1.4} />
        <text x={grid.x + 181} y={grid.y + 10 * grid.d + 10} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          stara košarica
        </text>
      </g>

      {/* the staff get it first: teta Mira, Lana, Davor and Petra */}
      {[0, 1, 2, 3].map((i) => {
        const px = staff.x + (i % 2) * 46
        const py = staff.y + Math.floor(i / 2) * 64
        const p = { x: px, y: py, scale: 0.42, holding: 'none', mood: step >= 2 ? 'smile' : 'flat' } as const
        return (
          <g key={i}>
            {i === 0 ? <Mira {...p} /> : i === 1 ? <Lana {...p} /> : i === 2 ? <Davor {...p} /> : <Petra {...p} />}
            {step >= 2 && <Check x={px + 36} y={py + 8} size={8} />}
          </g>
        )
      })}
      <DLabel x={staff.x + 40} y={staff.y + 146} text={step >= 2 ? 'osoblje: nova ✓' : 'osoblje'} size={12.5} tone={step >= 2 ? 'green' : 'neutral'} />
    </g>
  )
}

/** Scene 6: deploy dark, release with a feature flag (1 % → staff → everyone) without redeploying. */
export function FlagStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = (width ?? 0) >= 640
  return (
    <div ref={ref}>
      <Stepper steps={STEPS} title="Zastavica nova_kosarica" autoPlay={0}>
        {(step) =>
          wide ? (
            <Diagram width={640} height={270} label={`${STEPS[step].title}. ${STEPS[step].aria}`}>
              <Scene step={step} wide />
            </Diagram>
          ) : (
            <div style={{ maxWidth: 460, margin: '0 auto' }}>
              <Diagram width={340} height={460} label={`${STEPS[step].title}. ${STEPS[step].aria}`}>
                <Scene step={step} wide={false} />
              </Diagram>
            </div>
          )
        }
      </Stepper>
    </div>
  )
}
