import { useState } from 'react'
import { Meter, Segmented, SimFrame, fmt, useSimulation, useWidth } from '../../../kit'
import { configure, connectionMap, createTraffic, hitShares, resetHits, stepTraffic, type Layer } from '../../../engines/traffic'
import { klopaRack } from '../lb'
import { RackStage } from './RackStage'
import css from '../styles.module.css'

/* One browser that keeps a single keep-alive connection open (HTTP/2). Behind an L4 balancer every request on
   that connection lands on the server the connection was opened to (round robin: the first one, Mali – as in the
   envelope stepper); behind an L7 balancer each request is routed on its own. Engine: layer 'L4' | 'L7',
   clients.mode 'keepAlive', one client, round robin, 4 requests/s – Mali's CPU visibly fills while the others idle. */

const LAMBDA = 4

export function KeepAliveDemo() {
  const [layer, setLayer] = useState<Layer>('L4')
  const [ref, w] = useWidth<HTMLDivElement>()
  const sim = useSimulation({
    init: () => createTraffic({ seed: 42, mode: 'lb', servers: klopaRack(), workload: 'api', lambda: LAMBDA, algo: 'rr', layer, clients: { mode: 'keepAlive', count: 1 } }),
    step: (s, dt) => stepTraffic(s, dt),
  })
  const s = sim.state
  const shares = hitShares(s)
  const total = shares.reduce((a, h) => a + h.hits, 0)
  // the app's one connection: pinned to a server behind L4, ending at the redar behind L7 (none drawn before it opens)
  const conn = connectionMap(s)[0]?.conns[0]
  const pinned = conn ? (layer === 'L4' ? conn.server : null) : undefined
  const pinnedName = conn?.server ? shares.find((h) => h.id === conn.server)?.name : undefined
  const change = (l: Layer) => {
    setLayer(l)
    sim.mutate((x) => {
      configure(x, { layer: l })
      resetHits(x)
    })
  }
  return (
    <SimFrame
      title="jedna trajna veza"
      subtitle={`Preglednik s otvorenom Klopom drži jednu HTTP/2 vezu i njome šalje ${LAMBDA} zahtjeva u sekundi. Load balancer raspoređuje kružno.`}
      sim={sim}
      showTime
      minHeight={260}
      hint="usporedite koliko prometa dobiva svaki poslužitelj iza L4 i iza L7 load balancera."
      controls={
        <>
          <Segmented label="Load balancer" value={layer} onChange={change} options={[{ value: 'L4', label: 'L4 (veze)' }, { value: 'L7', label: 'L7 (zahtjevi)' }]} />
          <ul className={css.hits} aria-label="Udio zahtjeva po poslužitelju">
            {shares.map((h) => (
              <li key={h.id}>
                <Meter value={total ? h.share : 0} label={h.name} valueLabel={total ? fmt.pct(h.share) : '–'} />
              </li>
            ))}
          </ul>
          <p className={css.small}>
            {layer === 'L4'
              ? `L4 je poslužitelj izabrao jednom, kad se veza otvorila${pinnedName ? ` (${pinnedName})` : ''}. Plava cijev je ta veza.`
              : 'L7 prihvaća vezu klijenta kod sebe, čita svaki zahtjev i raspoređuje ga zasebno, iako svi stižu istom vezom.'}
          </p>
        </>
      }
    >
      <div ref={ref} className={css.stage}>
        <RackStage
          s={s}
          width={w}
          lambda={LAMBDA}
          single={layer === 'L4' ? 'jedan klijent · jedna trajna veza' : 'jedan klijent · veza završava kod redara'}
          pinned={pinned}
          label={`Jedna trajna veza iza ${layer} load balancera${layer === 'L4' && pinnedName ? `, vezana uz poslužitelj ${pinnedName}` : ''}: ${shares.map((h) => `${h.name} ${fmt.pct(h.share)}`).join(', ')} zahtjeva.`}
        />
      </div>
    </SimFrame>
  )
}
