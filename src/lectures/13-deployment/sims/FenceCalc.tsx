/**
 * Scene 4 „Ograde”: maxSurge rounds up, maxUnavailable rounds down (engine `fenceposts` / `validateStrategy`).
 * Pick N and both values; the formula, the two fences and the 25 %/25 % table follow.
 */
import { useState } from 'react'
import { Diagram, RoughBox, Segmented, Slider } from '../../../kit'
import { fenceposts, scaledValue, validateStrategy, type IntOrPercent } from '../../../engines/cluster'
import { FENCE_SEG, fenceKey, fenceLabel, parseFence } from '../lib/options'
import { FenceGauge } from './parts'
import styles from '../styles.module.css'

function roundText(v: IntOrPercent, n: number, up: boolean): string {
  if (typeof v === 'number') return `${v}`
  const raw = (parseFloat(v) * n) / 100
  const r = scaledValue(v, n, up)
  return `${up ? '⌈' : '⌊'}${parseFloat(v)} % × ${n}${up ? '⌉' : '⌋'} = ${up ? '⌈' : '⌊'}${raw.toLocaleString('hr-HR', { maximumFractionDigits: 2 })}${up ? '⌉' : '⌋'} = ${r}`
}

export function FenceCalc() {
  const [n, setN] = useState(4)
  const [surgeIn, setSurge] = useState<IntOrPercent>('25%')
  const [unavIn, setUnav] = useState<IntOrPercent>('25%')
  const err = validateStrategy(surgeIn, unavIn)
  const f = fenceposts(surgeIn, unavIn, n)
  const rawSurge = scaledValue(surgeIn, n, true)
  const rawUnav = scaledValue(unavIn, n, false)
  const bumped = !err && rawSurge === 0 && rawUnav === 0
  return (
    <RoughBox seed={9901} stroke="var(--ink-3)" pad={14}>
      <div className={styles.calc}>
        <div>
          <Slider label="replicas (N)" value={n} min={1} max={10} onChange={setN} />
          <Segmented label="maxSurge" value={fenceKey(surgeIn)} options={FENCE_SEG} onChange={(v) => setSurge(parseFence(v))} size="sm" />
          <Segmented label="maxUnavailable" value={fenceKey(unavIn)} options={FENCE_SEG} onChange={(v) => setUnav(parseFence(v))} size="sm" />
        </div>
        <div aria-live="polite">
          {err ? (
            <p className={styles.err}>
              ✗ API odbija Deployment: {err}. Bez ijednog dodatnog i bez ijednog nedostupnog Poda uvođenje se ne bi moglo ni pomaknuti.
            </p>
          ) : (
            <>
              <div className={styles.formula}>
                <div>surge = {roundText(surgeIn, n, true)}</div>
                <div>
                  unavailable = {roundText(unavIn, n, false)}
                  {bumped ? ' → 1' : rawUnav > f.unavailable ? ` → ${f.unavailable} (najviše N)` : ''}
                </div>
                <div>
                  ukupno ≤ {n} + {f.surge} = <strong>{n + f.surge}</strong>
                </div>
                <div>
                  dostupno ≥ {n} − {f.unavailable} = <strong>{n - f.unavailable}</strong>
                </div>
              </div>
              {bumped && <p className={styles.small}>Oba su nakon zaokruživanja 0, pa Kubernetes uzima maxUnavailable = 1 – inače se uvođenje ne bi pomaknulo.</p>}
              <div className={styles.calcFig}>
              <Diagram width={320} height={136} label={`Ograde za N = ${n}: ukupno najviše ${n + f.surge} Podova, dostupno najmanje ${n - f.unavailable}.`}>
                <FenceGauge x={6} y={4} w={308} kind="max" label="Podova ukupno smije biti" count={n + f.surge} limit={n + f.surge} slots={n + f.surge} />
                <FenceGauge x={6} y={70} w={308} kind="min" label="dostupnih mora ostati" count={n - f.unavailable} limit={n - f.unavailable} slots={n} />
              </Diagram>
              </div>
            </>
          )}
        </div>
      </div>
      <FenceTable n={n} />
    </RoughBox>
  )
}

/** The default 25 % / 25 % for N = 1…10 (both from the engine's fenceposts). */
function FenceTable({ n }: { n: number }) {
  const ns = Array.from({ length: 10 }, (_, i) => i + 1)
  return (
    <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Tablica zadanih vrijednosti 25 % / 25 % za N od 1 do 10">
      <table className={styles.fenceTable}>
        <caption className={styles.small} style={{ captionSide: 'top', textAlign: 'left' }}>
          Zadano {fenceLabel('25%')} / {fenceLabel('25%')}:
        </caption>
        <tbody>
          <tr>
            <th scope="row">N</th>
            {ns.map((k) => (
              <td key={k} className={k === n ? styles.cur : undefined}>
                {k}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">+ / −</th>
            {ns.map((k) => {
              const f = fenceposts('25%', '25%', k)
              return (
                <td key={k} className={k === n ? styles.cur : undefined}>
                  {f.surge}/{f.unavailable}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
