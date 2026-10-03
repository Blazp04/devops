import type { ReactNode } from 'react'
import { Arrow, RoughBox, StickyNote } from '../../../kit'
import styles from './DecisionTree.module.css'

function Question({ children, seed }: { children: ReactNode; seed: number }) {
  return (
    <RoughBox className={styles.q} stroke="var(--pen)" seed={seed} pad={4}>
      <span className={styles.qMark} aria-hidden="true">
        ?
      </span>
      {children}
    </RoughBox>
  )
}

function Answer({ title, children, seed, tone = 'ink', tag }: { title: ReactNode; children: ReactNode; seed: number; tone?: 'ink' | 'green'; tag?: string }) {
  return (
    <RoughBox className={styles.a} stroke={tone === 'green' ? 'var(--green)' : 'var(--ink)'} double={tone === 'green'} seed={seed} pad={4}>
      {tag && <span className={styles.tag}>{tag}</span>}
      <strong className={styles.aTitle}>{title}</strong>
      <span className={styles.aBody}>{children}</span>
    </RoughBox>
  )
}

function Branch({ label, seed, children }: { label: string; seed: number; children: ReactNode }) {
  return (
    <li className={styles.branch}>
      <svg className={styles.edge} width={18} height={32} viewBox="0 0 18 32" aria-hidden="true">
        <Arrow pts={[[9, 2], [9, 29]]} stroke="var(--pen)" strokeWidth={1.6} seed={seed} />
      </svg>
      <span className={styles.edgeLabel}>{label}</span>
      {children}
    </li>
  )
}

/** Scene 5 „Odabir”: a small decision tree (HTML, so the Croatian text wraps), with side notes. */
export function DecisionTree() {
  return (
    <div className={styles.tree} role="group" aria-label="Kako odabrati pristup tajnama">
      <Question seed={3101}>Imate li već trezor ili upravitelja tajni u oblaku?</Question>
      <ul className={styles.branches}>
        <Branch label="da" seed={3111}>
          <Answer title="External Secrets Operator + taj trezor" seed={3102} tone="green" tag="Klopa">
            U Gitu su adrese, a rotacija ne treba commit. Neka se ESO trezoru predstavlja identitetom radnog opterećenja, a ne statičkim tokenom.
          </Answer>
        </Branch>
        <Branch label="ne" seed={3112}>
          <Question seed={3103}>Mali tim, jedan ili dva klastera, malo tajni?</Question>
          <ul className={styles.branches}>
            <Branch label="da" seed={3113}>
              <Answer title="Sealed Secrets" seed={3104}>
                Bez nove usluge. Obavezno: kopija ključeva kontrolera izvan klastera i plan rotacije.
              </Answer>
            </Branch>
            <Branch label="ne" seed={3114}>
              <Answer title="Uvedite trezor + ESO" seed={3105}>
                OpenBao, Vault ili upravitelj tajni u oblaku; jedno mjesto za pristup, verzije i reviziju.
              </Answer>
            </Branch>
          </ul>
        </Branch>
      </ul>
      <div className={styles.notes}>
        <StickyNote c="blue" rotate={-1.2}>
          <strong>Koristite Flux?</strong> SOPS je prirodan izbor: Flux ga dešifrira sam, bez dodatka.
        </StickyNote>
        <StickyNote c="yellow" rotate={0.8}>
          <strong>Tajna samo u Podu?</strong> CSI driver: nema Secreta, ali bez trezora novi Podovi ne kreću.
        </StickyNote>
        <StickyNote c="pink" rotate={-0.6}>
          <strong>argocd-vault-plugin?</strong> Ne: Argo CD ga ne preporučuje, a čitljive tajne završe u njegovoj predmemoriji.
        </StickyNote>
      </div>
    </div>
  )
}
