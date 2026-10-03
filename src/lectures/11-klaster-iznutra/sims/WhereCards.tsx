import type { ReactNode } from 'react'
import { BoxedComputer, Cloud, MiniLaptop, RoughBox } from '../../../kit'
import styles from '../styles.module.css'

interface Where {
  title: string
  who: string
  icon: ReactNode
  points: ReactNode[]
  tone: string
}

const CARDS: Where[] = [
  {
    title: 'Upravljani klaster',
    who: 'EKS, GKE, AKS…',
    icon: <Cloud x={6} y={8} w={60} h={40} />,
    tone: 'var(--pen)',
    points: ['Upravljačku ravninu (i etcd) vodi pružatelj usluge: kopije, nadogradnje, certifikate.', 'Vi održavate čvorove – obično virtualne strojeve u istom oblaku – i ono što na njima radi.'],
  },
  {
    title: 'Vlastiti klaster',
    who: 'kubeadm na vlastitim strojevima',
    icon: <BoxedComputer x={10} y={6} w={52} h={44} />,
    tone: 'var(--ink)',
    points: ['Sve je vaše: etcd i njegove sigurnosne kopije, nadogradnje, certifikati, mreža.', 'Ima smisla kad nema oblaka ili kad tim zna i želi voditi upravljačku ravninu.'],
  },
  {
    title: 'Klaster za učenje',
    who: 'kind, minikube, Killercoda',
    icon: <MiniLaptop x={8} y={8} w={56} h={42} />,
    tone: 'var(--green)',
    points: ['kind pokreće cijeli klaster na vašem računalu: svaki „čvor” je Docker kontejner.', 'minikube radi slično; Killercoda daje klaster u pregledniku, bez instalacije.'],
  },
]

/** Scene 6 „Gdje živi klaster”: three kinds of clusters as three cards. */
export function WhereCards() {
  return (
    <div className={styles.where}>
      {CARDS.map((c, i) => (
        <RoughBox key={c.title} className={styles.whereCard} stroke={c.tone} strokeWidth={1.7} seed={4501 + i * 7}>
          <svg viewBox="0 0 72 56" width="72" height="56" aria-hidden="true">
            {c.icon}
          </svg>
          <div className={styles.whereTitle}>{c.title}</div>
          <div className={styles.whereWho}>{c.who}</div>
          <ul>
            {c.points.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </RoughBox>
      ))}
    </div>
  )
}
