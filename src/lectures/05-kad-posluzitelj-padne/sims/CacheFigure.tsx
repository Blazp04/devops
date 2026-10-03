/**
 * „Kamera prelazi na bazu”: stateless klopa-api servers read the menu cache-aside – Redis first, Postgres only on a
 * miss. Formula from E1 (cacheAside): h 0,9, 1 ms, 20 ms → 3 ms on average and 10 % of the reads reach the database.
 */
import { useState } from 'react'
import { Arrow, Check, Cross, Cylinder, Figure, MiniServer, Slider, Stat, StatRow, SvgStamp, Toggle, fmt, useWidth } from '../../../kit'
import { cacheAside } from '../../../engines/traffic'

const READS = 100
const CACHE_MS = 1
const DB_MS = 20

export function CacheFigure() {
  const [hit, setHit] = useState(90)
  const [dbDown, setDbDown] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 655
  const h = hit / 100
  const r = cacheAside(h, CACHE_MS, DB_MS, READS)
  const misses = Math.round(r.dbLoad)
  const W = narrow ? 380 : 760
  const H = narrow ? 430 : 270
  // narrow: the drawing is ~320 px wide on a phone, so its lettering is one size up
  const mono = narrow ? 15 : 14
  const hand = narrow ? 21 : 20
  type Pt = [number, number]
  const L = narrow
    ? {
        cache: { x: 236, y: 40, w: 124, h: 92 },
        db: { x: 190, y: 280, w: 160, h: 108 },
        ask: [[114, 62], [228, 64]] as Pt[],
        askLabel: [122, 54] as Pt,
        hitArrow: [[228, 108], [114, 112]] as Pt[],
        hitLabel: [106, 92] as Pt,
        save: [[116, 140], [240, 128]] as Pt[],
        saveLabel: [124, 164] as Pt,
        miss: [[70, 236], [184, 320]] as Pt[],
        missLabel: [14, 300] as Pt,
        appLabel: [14, 196] as Pt,
        dbCaption: { x: W / 2, anchor: 'middle' as const },
      }
    : {
        cache: { x: 330, y: 30, w: 130, h: 96 },
        db: { x: 580, y: 130, w: 150, h: 104 },
        ask: [[114, 66], [322, 60]] as Pt[],
        askLabel: [150, 52] as Pt,
        hitArrow: [[322, 104], [114, 108]] as Pt[],
        hitLabel: [160, 90] as Pt,
        save: [[118, 134], [326, 124]] as Pt[],
        saveLabel: [190, 156] as Pt,
        miss: [[112, 166], [572, 182]] as Pt[],
        // under the miss arrow, right of the app's caption and clear of the Postgres cylinder (≈ 300 units of text)
        missLabel: [214, 208] as Pt,
        appLabel: [14, 196] as Pt,
        dbCaption: { x: W - 6, anchor: 'end' as const },
      }
  const { cache, db } = L
  const missW = 1.2 + (1 - h) * 7
  return (
    <Figure caption="Cache-aside: aplikacija prvo pita predmemoriju (Redis). Samo kad podatka ondje nema, sama ga čita iz baze i sprema kopiju u predmemoriju za sljedeći put. Brojevi su za svakih 100 čitanja jelovnika.">
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Od svakih ${READS} čitanja ${READS - misses} pogodi predmemoriju, a za ${misses} aplikacija ide u bazu. Prosječno čekanje ${fmt.num(r.avgMs, 1)} ms.${dbDown ? ' Baza je pala: promašaji i sva pisanja propadaju.' : ''}`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}
        >
          {[0, 1, 2].map((i) => (
            <MiniServer key={i} x={14 + i * 12} y={40 + i * 34} w={70} h={56} seed={6900 + i * 3} />
          ))}
          <text x={L.appLabel[0]} y={L.appLabel[1]} className="k-svg-display" style={{ fontSize: 16 }}>
            klopa-api ×3
          </text>
          <text x={L.appLabel[0]} y={L.appLabel[1] + 26} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--green)' }}>
            bez stanja: svejedno koji
          </text>

          {/* ① every read asks the cache first */}
          <Arrow pts={L.ask} stroke="var(--ink)" strokeWidth={2.4} seed={6910} />
          <text x={L.askLabel[0]} y={L.askLabel[1]} className="k-svg-mono" style={{ fontSize: mono }}>
            {`${READS} čitanja`}
          </text>
          {/* ② a hit comes straight back */}
          <Arrow pts={L.hitArrow} stroke="var(--green)" strokeWidth={1.2 + h * 4} seed={6911} />
          <g transform={`translate(${L.hitLabel[0] + 6} ${L.hitLabel[1] - 5})`}>
            <Check x={0} y={0} size={6} seed={6912} />
          </g>
          <text x={L.hitLabel[0] + 18} y={L.hitLabel[1]} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--green)' }}>
            pogodak: {READS - misses}
          </text>
          <Cylinder x={cache.x} y={cache.y} w={cache.w} h={cache.h} seed={6913} />
          <text x={cache.x + cache.w / 2} y={cache.y + cache.h / 2 + 4} textAnchor="middle" className="k-svg-display" style={{ fontSize: 16 }}>
            Redis
          </text>
          <text x={cache.x + cache.w / 2} y={cache.y + cache.h / 2 + 24} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono }}>
            ≈ {CACHE_MS} ms
          </text>
          <text x={cache.x + cache.w / 2} y={cache.y - 10} textAnchor="middle" className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            predmemorija
          </text>

          {/* ③ on a miss the application itself reads the database … */}
          <Arrow pts={L.miss} stroke={dbDown ? 'var(--red)' : 'var(--ink)'} strokeWidth={missW} seed={6914} dash={dbDown ? '6 5' : undefined} />
          <text x={L.missLabel[0]} y={L.missLabel[1]} className="k-svg-mono" style={{ fontSize: mono, fill: dbDown ? 'var(--red)' : 'var(--ink)' }}>
            {narrow ? `promašaj: ${misses}` : `promašaj: ${misses} → aplikacija čita bazu`}
          </text>
          {/* ④ … and leaves a copy in the cache for the next read */}
          {!dbDown && (
            <>
              <Arrow pts={L.save} stroke="var(--pen)" strokeWidth={1.4} seed={6917} dash="4 5" head={7} />
              <text x={L.saveLabel[0]} y={L.saveLabel[1]} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--pen)' }}>
                spremi kopiju
              </text>
            </>
          )}
          <Cylinder x={db.x} y={db.y} w={db.w} h={db.h} seed={6915} fillColor={dbDown ? 'var(--red)' : undefined} />
          <text x={db.x + db.w / 2} y={db.y + db.h / 2 + 4} textAnchor="middle" className="k-svg-display" style={{ fontSize: 16, fill: dbDown ? 'var(--red)' : 'var(--ink)' }}>
            Postgres
          </text>
          <text x={db.x + db.w / 2} y={db.y + db.h / 2 + 24} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono }}>
            ≈ {DB_MS} ms
          </text>
          <text x={L.dbCaption.x} y={db.y + db.h + 28} textAnchor={L.dbCaption.anchor} className="k-svg-hand" style={{ fontSize: hand, fill: dbDown ? 'var(--red)' : 'var(--ink-2)' }}>
            {dbDown ? 'jedinstvena točka kvara' : 'narudžbe, korisnici, jelovnik'}
          </text>
          {dbDown && (
            <>
              {/* beside the cylinder, never over its lettering */}
              <g transform={`translate(${db.x + db.w - 4} ${db.y - 16})`}>
                <Cross x={0} y={0} size={narrow ? 18 : 22} seed={6916} strokeWidth={3} />
              </g>
              <SvgStamp x={db.x + db.w / 2} y={db.y - 10} text="PALA" size={17} rotate={-6} />
            </>
          )}
        </svg>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'end', marginTop: 12 }}>
        <div style={{ flex: '1 1 260px' }}>
          <Slider label="Pogoci u predmemoriji" value={hit} min={0} max={99} onChange={setHit} format={(v) => `${v} %`} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Toggle label="Baza je pala" checked={dbDown} onChange={setDbDown} hint="promašaji i pisanja i dalje trebaju bazu" />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <StatRow>
          {dbDown ? (
            <Stat label="uspješna čitanja" value={`${READS - misses} od ${READS}`} tone="bad" sub="promašaji nemaju odgovor" />
          ) : (
            <Stat label="prosječno čitanje" value={fmt.num(r.avgMs, 1)} unit="ms" tone={r.avgMs <= 5 ? 'ok' : 'warn'} sub={`h·${CACHE_MS} + (1 − h)·(${CACHE_MS} + ${DB_MS}) ms`} />
          )}
          <Stat label={dbDown ? 'neuspjela čitanja' : 'čitanja do baze'} value={dbDown ? `${misses} ✗` : fmt.num(misses)} tone={dbDown ? 'bad' : misses > 30 ? 'warn' : 'ok'} sub={`od svakih ${READS}`} />
        </StatRow>
      </div>
    </Figure>
  )
}
