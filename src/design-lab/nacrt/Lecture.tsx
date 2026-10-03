import { motion } from 'motion/react'
import { SectionMark, Stamp } from './Draw'
import { breakLine } from './geom'
import s from './nacrt.module.css'

const LISTS = [
  {
    no: '01',
    title: 'Klopa izlazi na internet',
    sub: 'Od laptopa do javne adrese: što se dogodi kad netko upiše klopa.hr.',
    min: 25,
    status: 'done' as const,
  },
  {
    no: '02',
    title: 'Ručak u 12:00: granice jednog poslužitelja',
    sub: 'Mjerimo kada jedan poslužitelj prestaje stizati i što tada vide korisnici.',
    min: 30,
    status: 'next' as const,
  },
  {
    no: '04',
    title: 'Load balancer: tko dijeli promet?',
    sub: 'Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.',
    min: 35,
    status: 'todo' as const,
  },
]

/** Duration drawn as a dimension line to scale (3 px per minute). */
function DurDim({ min }: { min: number }) {
  const w = min * 3
  return (
    <svg className={s.durDim} viewBox="0 0 112 16" aria-hidden="true">
      <path d={`M1,3 V13 M${w + 1},3 V13`} />
      <path d={`M1,8 H${w + 1}`} />
      <path d={`M1,8 l6,-3 v6 Z M${w + 1},8 l-6,-3 v6 Z`} className={s.durHead} />
    </svg>
  )
}

export function Register() {
  return (
    <section className={s.register} id="kurikulum" aria-labelledby="reg-title">
      <header className={s.secHead}>
        <SectionMark n="M1" sheet="1–4" />
        <div>
          <p className={s.kicker}>Kurikulum · popis listova</p>
          <h2 className={s.h2} id="reg-title">
            Modul 1 · Zašto raspodijeljeni sustavi
          </h2>
        </div>
      </header>
      <div className={s.regHead} aria-hidden="true">
        <span>List</span>
        <span>Naziv i sažetak</span>
        <span>Trajanje</span>
        <span>Status</span>
      </div>
      <ol className={s.regTable} aria-label="Predavanja u modulu 1">
        {LISTS.map((l, i) => (
          <li key={l.no} className={s.regRowWrap}>
            {i === 2 && (
              <div className={s.regBreak} aria-hidden="true">
                <span>list 03 izostavljen iz isječka</span>
                <svg viewBox="0 0 400 14" preserveAspectRatio="none">
                  <path d={breakLine(0, 400, 7)} />
                </svg>
              </div>
            )}
            <a className={s.regRow} href="#predavanje" data-status={l.status}>
              <span className={s.regNo}>
                <span className={s.srOnly}>List </span>
                {l.no}
              </span>
              <span className={s.regMain}>
                <span className={s.regTitle}>{l.title}</span>
                <span className={s.regSub}>{l.sub}</span>
              </span>
              <span className={s.regDur}>
                <DurDim min={l.min} />
                <span>{l.min} min</span>
              </span>
              <span className={s.regStatus}>
                {l.status === 'done' && <Stamp tone="pencil">Završeno ✓</Stamp>}
                {l.status === 'next' && (
                  <span className={s.regNext}>
                    <svg viewBox="0 0 22 12" aria-hidden="true">
                      <path d="M0,6 H20 M14,1 L20,6 L14,11" />
                    </svg>
                    sljedeće
                  </span>
                )}
                {l.status === 'todo' && <span className={s.regTodo}>nije započeto</span>}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}

const GOALS = [
  'objasniti zašto za horizontalno skaliranje treba load balancer',
  'razlikovati ulogu procesora i RAM-a na poslužitelju',
  'usporediti kružno raspoređivanje i „najmanje aktivnih veza”',
]

/** Lecture header as an engineering drawing's title block. */
export function TitleBlock() {
  return (
    <header className={s.tb} id="predavanje" aria-labelledby="lec-title">
      <div className={s.tbStrip}>
        <span>{'LIST\u00a004 · LOAD BALANCER · MJ\u00a01:1 · REV\u00a0B'}</span>
        <span className={s.tbStripR}>KON-L04-LB</span>
      </div>
      <div className={s.tbGrid}>
        <div className={s.tbNo}>
          <span className={s.cellLabel}>Predavanje</span>
          <span className={s.tbBig}>04</span>
        </div>
        <div className={s.tbMain}>
          <span className={s.cellLabel}>Naziv lista</span>
          <h1 className={s.tbTitle} id="lec-title">
            Load balancer: tko dijeli promet?
          </h1>
          <p className={s.tbSub}>Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.</p>
        </div>
        <dl className={s.tbMeta}>
          <div>
            <dt className={s.cellLabel}>Modul</dt>
            <dd>1 · Zašto raspodijeljeni sustavi</dd>
          </div>
          <div>
            <dt className={s.cellLabel}>Trajanje</dt>
            <dd>≈ 35 min</dd>
          </div>
          <div>
            <dt className={s.cellLabel}>Mjerilo</dt>
            <dd>1 : 1</dd>
          </div>
          <div>
            <dt className={s.cellLabel}>List</dt>
            <dd>04 od 24</dd>
          </div>
          <div>
            <dt className={s.cellLabel}>Revizija</dt>
            <dd className={s.tbRevCell}>
              <svg viewBox="0 0 24 22" aria-hidden="true">
                <path d="M12,2 L22,20 L2,20 Z" />
                <text x="12" y="17.5" textAnchor="middle">
                  B
                </text>
              </svg>
              B
            </dd>
          </div>
        </dl>
        <div className={s.tbGoals}>
          <span className={s.cellLabel}>Opće napomene · nakon ovog lista moći ćete</span>
          <ol className={s.goals}>
            {GOALS.map((g, i) => (
              <motion.li
                key={g}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.4 }}
              >
                <span className={s.balloon}>{i + 1}</span>
                <span>{g}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </header>
  )
}
