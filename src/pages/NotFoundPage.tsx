import { Link } from 'react-router'
import { Boil, Davor, Rough, SpeechBubble } from '../kit'
import { usePageTitle } from '../shell/usePageTitle'

/** A page torn out of the notebook. */
export function NotFoundPage() {
  usePageTitle('Stranica ne postoji')
  return (
    <div className="nb-page nb-404">
      <svg className="nb-404__art" viewBox="-20 -80 300 210" aria-hidden="true">
        <Boil slow>
          <Davor x={0} y={10} scale={1} mood="worry" holding="pager" buzz />
        </Boil>
        <SpeechBubble x={96} y={-76} w={170} h={78} tx={56} ty={22} lines={['404! Ove stranice', 'nema u bilježnici.']} size={18} seed={3601} tail={18} />
      </svg>
      <div className="nb-404__text">
        <span className="nb-404__code">
          404
          <svg viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true">
            <Rough shape={{ k: 'ellipse', cx: 100, cy: 46, w: 190, h: 80 }} seed={3603} stroke="var(--red)" strokeWidth={2.4} multi roughness={1.5} draw="mount" duration={0.8} />
          </svg>
        </span>
        <h1 className="nb-h1">Ova stranica ne postoji</h1>
        <p className="nb-pagehead__lead">Netko ju je istrgnuo iz bilježnice — ili je predavanje u međuvremenu preimenovano. Vratite se na kazalo i nastavite odande.</p>
        <Link to="/#kurikulum" className="nb-link-hand">
          ← natrag na kazalo
        </Link>
      </div>
    </div>
  )
}
