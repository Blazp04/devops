import { Brain, Check, Cross, Plate, Tray } from '../../../kit'
import css from '../styles.module.css'

/** Key for the „redar na ulazu” drawing: each item uses the very mark the drawing uses. */
export function StageLegend({ compact }: { compact?: boolean }) {
  return (
    <ul className={css.legend} aria-label="Legenda crteža">
      <li>
        <svg viewBox="-12 -8 24 16" width="30" height="20" aria-hidden="true">
          <Tray x={0} y={0} w={22} />
        </svg>
        pladanj = zahtjev
      </li>
      <li>
        <svg viewBox="0 0 30 24" width="28" height="22" aria-hidden="true">
          <Brain x={2} y={1} w={26} h={22} busy={0.55} seed={4801} />
        </svg>
        mozak = procesorska jezgra (šrafura = zauzeta)
      </li>
      <li>
        <svg viewBox="0 0 44 20" width="40" height="18" aria-hidden="true">
          <Plate cx={10} cy={10} r={8} />
          <Plate cx={32} cy={10} r={8} full />
        </svg>
        tanjur = radnik u RAM-u (hrana = radi)
      </li>
      {!compact && (
        <li>
          <svg viewBox="0 0 26 18" width="26" height="18" aria-hidden="true">
            <rect x={2} y={2} width={22} height={14} rx={2} className={css.qslot} />
          </svg>
          pretinac = mjesto u redu
        </li>
      )}
      <li>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <Check x={10} y={11} size={7} seed={4802} />
        </svg>
        obrađen zahtjev
      </li>
      <li>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <Cross x={10} y={10} size={7} seed={4803} />
        </svg>
        greška (502 / 503 / 504)
      </li>
    </ul>
  )
}
