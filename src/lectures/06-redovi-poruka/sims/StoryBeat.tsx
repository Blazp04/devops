import { Boil, Lana, Mira, SpeechBubble } from '../../../kit'

/** Story beat of the hook: Lana adds retries, teta Mira gets the same order twice. Characters speak only in bubbles. */
export function StoryBeat() {
  return (
    <figure style={{ margin: '8px auto 22px', maxWidth: 480 }}>
      <svg viewBox="0 0 380 212" role="img" aria-label="Lana kaže: Sad ponavljamo ako ne uspije! Teta Mira iz kuhinje: Dvaput ćevapi za istu narudžbu?!" style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
        <Boil>
          <Lana x={0} y={88} mood="grin" />
        </Boil>
        <SpeechBubble x={74} y={4} w={190} h={70} tx={58} ty={104} lines={['Sad ponavljamo', 'ako ne uspije!']} size={22} seed={9301} />
        <Boil slow>
          <Mira x={300} y={88} mood="worry" />
        </Boil>
        <SpeechBubble x={120} y={96} w={170} h={104} tx={326} ty={118} lines={['Dvaput ćevapi', 'za istu', 'narudžbu?!']} size={22} seed={9311} tone="red" />
      </svg>
    </figure>
  )
}
