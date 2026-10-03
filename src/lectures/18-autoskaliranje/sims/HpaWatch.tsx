/**
 * `kubectl get hpa klopa-api -w` during the validated spike: every row is the engine's kubectl table at the moment
 * what it shows changed (seed 42, nalet od t = 60 s do t = 420 s); REPLICAS is the count before that sync's rescale.
 */
import { useState } from 'react'
import { Terminal, type TerminalLine } from '../../../kit'
import { spikeStory } from '../lib/story'

export function HpaWatch() {
  const [story] = useState(spikeStory)
  const lines: TerminalLine[] = [{ cmd: 'kubectl get hpa klopa-api -n klopa -w' }, { out: story.watchHeader }]
  for (const w of story.watch) {
    const nine = w.row.includes('55%/50%')
    const down = w.t > 700 && w.replicas === 2
    if (nine) lines.push({ out: w.row, note: '55 % i 9 Podova: omjer 1,10 je unutar tolerancije, nije kvar', who: 'davor' })
    else if (down) lines.push({ out: w.row, tone: 'ok' })
    else lines.push({ out: w.row })
  }
  return <Terminal title="Lanin laptop · nalet u t = 60 s" lines={lines} caption="Novi redak pojavi se kad se promijeni izmjereni postotak (TARGETS) ili broj replika. REPLICAS je broj prije odluke iz tog retka – nova vrijednost vidi se redak kasnije." />
}
