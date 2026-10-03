import { useId, type ReactNode } from 'react'
import { Defs, Pod, Valve, type PodState } from './Draw'
import { roughLine, safeId } from './geom'
import s from './nacrt.module.css'
import l from './legend.module.css'
import c from './cluster.module.css'

function Item({ glyph, children, w = 64, h = 28, vb }: { glyph: ReactNode; children: ReactNode; w?: number; h?: number; vb?: string }) {
  return (
    <li>
      <svg viewBox={vb ?? `0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        {glyph}
      </svg>
      <span>{children}</span>
    </li>
  )
}

const RED = roughLine(4, 16, 60, 12, 41, { strokeWidth: 1.8 })

const PODS: { st: PodState; v: 1 | 2; term: string; text: string }[] = [
  { st: 'ready', v: 1, term: 'Running · Ready', text: 'puna linija s unutarnjim obrubom; prima promet' },
  { st: 'ready', v: 2, term: 'nova verzija v2', text: 'olovka izmjena i revizijski trokut △2' },
  { st: 'running', v: 1, term: 'Running · nije Ready', text: 'lančana linija; radi, ali ne prima promet' },
  { st: 'creating', v: 2, term: 'ContainerCreating', text: 'crtkana linija; kontejner se tek diže' },
  { st: 'pending', v: 2, term: 'Pending', text: 'crtkana linija bez kontejnera; čeka čvor' },
  { st: 'crash', v: 1, term: 'CrashLoopBackOff', text: 'crvena olovka, križ i broj ponovnih pokretanja' },
]

/** One legend for detail A (simulation) and detail B (cluster): the same line conventions everywhere. */
export function Legend() {
  const uid = safeId(useId())
  return (
    <section className={l.legend} aria-labelledby={`${uid}-t`}>
      <svg width="0" height="0" className={l.defs} aria-hidden="true">
        <Defs uid={uid} />
      </svg>
      <header className={l.head}>
        <h3 id={`${uid}-t`} className={l.title}>
          Legenda
        </h3>
        <span className={l.meta}>konvencije crteža · vrijede za detalje A i B i za sve listove tečaja</span>
      </header>
      <div className={l.cols}>
        <div>
          <h4 className={l.colHead}>Vrste linija</h4>
          <ul className={l.list}>
            <Item glyph={<path d="M4,14 H60" className={s.pipe} />}>
              <b>puna</b> — postoji i radi (u rotaciji, Ready)
            </Item>
            <Item glyph={<path d="M4,14 H60" className={l.dashed} />}>
              <b>crtkana</b> — još ne postoji (Pending, diže se)
            </Item>
            <Item glyph={<path d="M4,14 H60" className={l.chain} />}>
              <b>lančana</b> — postoji, ali ne prima promet
            </Item>
            <Item glyph={<path d="M4,14 H60" className={s.pipeBack} />}>
              <b>točkasta</b> — povratna traka (odgovori)
            </Item>
            <Item
              glyph={
                <>
                  <path d="M4,14 H60" className={c.ctl} />
                  <path d="M18,18 L22,10 M22,18 L26,10 M40,18 L44,10 M44,18 L48,10" className={c.ctlMark} />
                </>
              }
            >
              <b>signalna</b> — upravljanje (api-server ↔ kubelet), nikad promet
            </Item>
            <Item glyph={<path d={RED} className={s.redPencil} />}>
              <b className={l.red}>crvena olovka</b> — kvar, greška, ispravak
            </Item>
            <Item glyph={<path d="M4,14 H60" className={l.pencil} />}>
              <b className={l.pencilTxt}>olovka izmjena</b> — novo, odabrano, zdravo
            </Item>
          </ul>
        </div>
        <div>
          <h4 className={l.colHead}>Simboli</h4>
          <ul className={l.list}>
            <Item glyph={<use href={`#${uid}-req`} x={32} y={14} className={s.dotReq} />}>zahtjev u letu (stalnom brzinom)</Item>
            <Item glyph={<use href={`#${uid}-res`} x={32} y={14} className={s.dotRes} />}>odgovor, putuje natrag prema studentu</Item>
            <Item glyph={<use href={`#${uid}-err`} x={32} y={14} className={s.dotErr} />}>greška 502 / 503 na mjestu kvara</Item>
            <Item
              glyph={
                <>
                  <path d="M4,14 H60" className={s.pipe} />
                  {[0, 1, 2, 3, 4].map((k) => (
                    <circle key={k} cx={54 - k * 10} cy={14} r={3.4} className={k < 3 ? s.bead : s.beadEmpty} />
                  ))}
                </>
              }
            >
              red čekanja: zahtjev / slobodno mjesto (prazan krug znači samo to)
            </Item>
            <Item
              glyph={
                <>
                  <rect x={4} y={3} width={56} height={22} className={l.housing} />
                  <rect x={22} y={7} width={24} height={14} className={l.counterBox} />
                  <text x={34} y={18.5} textAnchor="middle" className={l.counterNum}>
                    3
                  </text>
                  <path d="M12,9 v10 l7,-5 Z" className={l.pickTri} />
                </>
              }
            >
              brojač na izlazu load balancera: otvorene veze; ▸ sljedeći izbor
            </Item>
            <Item
              glyph={
                <>
                  <path d="M4,14 H60" className={s.pipe} />
                  <Valve x={20} y={14} closed={false} />
                  <path d="M38,14 H60" className={l.chain} />
                  <Valve x={46} y={14} closed />
                </>
              }
            >
              zasun otvoren / zatvoren (izvan rotacije)
            </Item>
            <Item
              glyph={
                <>
                  <rect x={4} y={4} width={16} height={20} fill={`url(#${uid}-h)`} className={s.core} />
                  <rect x={24} y={4} width={16} height={20} fill={`url(#${uid}-hp)`} className={s.core} />
                  <rect x={44} y={4} width={16} height={20} fill={`url(#${uid}-st)`} className={s.core} />
                </>
              }
            >
              šrafura: procesor radi / čeka bazu / sustav
            </Item>
          </ul>
        </div>
        <div>
          <h4 className={l.colHead}>Pod (šesterokut)</h4>
          <ul className={l.list}>
            {PODS.map((p, i) => (
              <li key={p.term} className={l.podItem}>
                <svg viewBox="-34 -28 68 56" width={68} height={56} aria-hidden="true">
                  <Pod cx={-4} cy={0} r={22} state={p.st} version={p.v} uid={uid} restarts={p.st === 'crash' ? 4 : undefined} />
                </svg>
                <span>
                  <b className={p.st === 'crash' ? l.red : i === 1 ? l.pencilTxt : undefined}>{p.term}</b> — {p.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
