import type { ReactNode } from 'react'
import { Cloud, FoodBox, K8sGlyph, RoughBox, Term, type K8sKind } from '../../../kit'
import styles from '../styles.module.css'

interface Item {
  icon: K8sKind | 'cloud' | 'runtime'
  name: ReactNode
  role: ReactNode
  optional?: boolean
}

const CONTROL_PLANE: Item[] = [
  { icon: 'api', name: <>API poslužitelj · <code>kube-apiserver</code></>, role: 'Jedina ulazna točka. Provjeri tko piše i smije li, zapiše u etcd i javlja promjene svima koji promatraju.' },
  { icon: 'etcd', name: <code>etcd</code>, role: 'Baza ključ–vrijednost s cijelim stanjem klastera: željenim i stvarnim. Izvor istine; s njom razgovara samo API poslužitelj.' },
  { icon: 'sched', name: <><Term id="scheduler">raspoređivač</Term> (engl. <em>scheduler</em>) · <code>kube-scheduler</code></>, role: 'Novom Podu bira čvor s dovoljno mjesta i upiše ga u objekt. Ništa ne pokreće.' },
  { icon: 'cm-ctrl', name: <Term id="controller-manager"><code>kube-controller-manager</code></Term>, role: 'Desetci kontrolera – petlji usklađivanja (ReplicaSet, čvorovi, Namespacei…). Svaki svodi stvarno stanje na željeno.' },
  { icon: 'cloud', name: <code>cloud-controller-manager</code>, role: 'Razgovara s oblakom: vanjski load balanceri za Service, mrežne rute i podatci o virtualnim strojevima (zona, tip, je li stroj obrisan).', optional: true },
]

const NODE: Item[] = [
  { icon: 'kubelet', name: <>agent <code>kubelet</code></>, role: 'Gleda Podove dodijeljene svojem čvoru, preko izvršnog okruženja ih pokreće, provjerava i javlja njihovo stanje.' },
  { icon: 'runtime', name: <>izvršno okruženje (<code>containerd</code>, CRI-O)</>, role: 'Povlači slike i pokreće kontejnere. S kubeletom razgovara preko sučelja CRI.' },
  { icon: 'proxy', name: <Term id="kube-proxy"><code>kube-proxy</code></Term>, role: 'Mrežna pravila za Service (14. predavanje). Neki mrežni dodaci obavljaju taj posao sami.', optional: true },
]

function Icon({ icon }: { icon: Item['icon'] }) {
  return (
    <svg viewBox="0 0 48 40" width="48" height="40" aria-hidden="true" className={styles.whoIcon}>
      {icon === 'cloud' ? <Cloud x={4} y={6} w={40} h={28} /> : icon === 'runtime' ? <FoodBox x={8} y={6} w={32} h={28} /> : <K8sGlyph kind={icon} x={4} y={4} w={40} h={32} />}
    </svg>
  )
}

function Column({ title, items, tone, seed }: { title: string; items: Item[]; tone: string; seed: number }) {
  return (
    <RoughBox className={styles.whoCol} stroke={tone} strokeWidth={1.8} seed={seed} double={tone === 'var(--pen)'}>
      <div className={styles.whoTitle} style={{ color: tone }}>
        {title}
      </div>
      <ul className={styles.whoList}>
        {items.map((it, i) => (
          <li key={i}>
            <Icon icon={it.icon} />
            <div>
              <div className={styles.whoName}>
                {it.name}
                {it.optional && <span className={styles.whoOpt}> neobavezno</span>}
              </div>
              <div className={styles.whoRole}>{it.role}</div>
            </div>
          </li>
        ))}
      </ul>
    </RoughBox>
  )
}

/** Objective 1: every component of the control plane and of a node with its one job. */
export function WhoIsWho() {
  return (
    <div className={styles.who}>
      <Column title="Upravljačka ravnina: odlučuje i pamti" items={CONTROL_PLANE} tone="var(--pen)" seed={4401} />
      <Column title="Svaki radni čvor: izvodi" items={NODE} tone="var(--ink)" seed={4411} />
    </div>
  )
}
