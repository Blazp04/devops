/**
 * "Kamo idemo": the course trailer. The Klopa map at the end of the course (lecture 24), rewound module by module —
 * delivery, operations, Kubernetes, containers — down to where this lecture starts: Lana's laptop on localhost:8000.
 * One StoryMap whose `at` changes (what a module added fades away), then the start scene. User-paced: a timeline of
 * stops + one button that keeps its place (its label changes at the end).
 */
import { useState } from 'react'
import { Rewind } from 'lucide-react'
import { Button, Figure, Segmented, StoryMap } from '../../../kit'
import { REWIND } from '../rewind'
import { RewindStart } from './RewindStart'
import styles from '../styles.module.css'

export function CourseRewind() {
  const [i, setI] = useState(0)
  const stop = REWIND[i]
  const last = i === REWIND.length - 1
  return (
    <div className={`${styles.rewind} k-wide`}>
      <div className={styles.rewindBar}>
        <Segmented
          label="Klopa nakon predavanja"
          size="sm"
          value={stop.at}
          options={REWIND.map((s) => ({ value: s.at, label: s.at === 'start' ? 'danas' : s.at, title: s.title }))}
          onChange={(v) => setI(Math.max(0, REWIND.findIndex((s) => s.at === v)))}
        />
        <Button variant={last ? 'secondary' : 'primary'} size="sm" icon={Rewind} onClick={() => setI(last ? 0 : i + 1)}>
          {last ? 'Opet na kraj tečaja' : 'Premotaj unatrag'}
        </Button>
      </div>
      <p className={styles.rewindText} aria-live="polite">
        <b>{stop.title}.</b> {stop.text.map((p, k) => (typeof p === 'string' ? <span key={k}>{p}</span> : <code key={k}>{p.code}</code>))}
      </p>
      {stop.at === 'start' ? (
        <Figure caption={stop.caption} framed={false}>
          <RewindStart />
        </Figure>
      ) : (
        <StoryMap at={stop.at} highlightNew={false} caption={stop.caption} />
      )}
    </div>
  )
}
