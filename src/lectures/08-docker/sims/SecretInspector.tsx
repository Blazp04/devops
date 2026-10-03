import { useMemo, useState, type ReactNode } from 'react'
import { Button, Check, ControlGroup, Cross, Envelope, plural, RoughBox, Segmented, SimFrame, Toggle } from '../../../kit'
import { fmtMB, searchImage, SMS_SECRET, type NpmTokenVia, type SecretExposure } from '../../../engines/build/index.ts'
import { secretLab, type SecretLab } from '../labView'
import styles from '../styles.module.css'

type Via = Exclude<NpmTokenVia, 'none'>

const VIA_OPTIONS: { value: Via; label: string; title: string }[] = [
  { value: 'copy-rm', label: 'COPY + RUN rm', title: 'COPY .npmrc, npm ci, RUN rm .npmrc' },
  { value: 'arg', label: 'ARG', title: 'ARG NPM_TOKEN i --build-arg' },
  { value: 'secret-mount', label: 'tajna (--mount)', title: 'RUN --mount=type=secret … npm ci' },
]

const QUICK = ['npm_', '.npmrc', 'SMS_API_KEY']

/** A secret is never printed whole, even when it leaked: the first characters, then ••••. */
const mask = (text: string, value: string) => text.split(value).join(`${value.slice(0, 6)}••••••`)

function Mark({ ok }: { ok: boolean }) {
  return (
    <svg className={styles.markSvg} viewBox="0 0 24 24" aria-hidden="true">
      {ok ? <Check x={12} y={13} size={7} seed={97} /> : <Cross x={12} y={12} size={6} seed={99} />}
    </svg>
  )
}

/** Why this variant leaks (or does not): one short sentence per cause, under the verdict. */
function Why({ via, multi, env, lab }: { via: Via; multi: boolean; env: boolean; lab: SecretLab }) {
  const npm = lab.exposures.filter((e) => e.secret.name !== SMS_SECRET.name)
  const npmHidden = npm.some((e) => e.where === 'layer' && e.hiddenByWhiteout)
  const npmVisible = lab.visibleSecretAt.some((p) => p.includes('.npmrc'))
  const envHidden = lab.exposures.some((e) => e.secret.name === SMS_SECRET.name && e.hiddenByWhiteout)
  const lines: ReactNode[] = []
  if (npmHidden)
    lines.push(
      <>
        <code>RUN rm .npmrc</code> dodaje samo oznaku brisanja: token i dalje leži u sloju <code>COPY .npmrc ./</code>.
      </>,
    )
  if (npmVisible)
    lines.push(
      <>
        A <code>COPY . .</code> ga je zatim ponovno kopirao iz konteksta izgradnje. U <code>.dockerignore</code> ga ne možemo staviti jer ga treba <code>COPY .npmrc ./</code>.
      </>,
    )
  if (npm.some((e) => e.where === 'history'))
    lines.push(
      <>
        Vrijednost iz <code>ARG NPM_TOKEN</code> upisana je u povijest slike uz svaku naredbu <code>RUN</code> nakon nje (<code>docker image history</code>).
      </>,
    )
  if (via === 'secret-mount')
    lines.push(
      <>
        Token je montiran samo dok traje <code>npm ci</code>: nije ni u jednom sloju ni u povijesti slike.
      </>,
    )
  else if (multi && npm.length === 0)
    lines.push(
      <>
        Token je ostao u fazi <code>build</code>, a u konačnu sliku idu samo nginx i gotove datoteke. Slojevi faze <code>build</code> ipak ostaju u predmemoriji graditelja (i CI-ja), pa je i ondje sigurnije <code>--mount=type=secret</code>.
      </>,
    )
  if (env && envHidden)
    lines.push(
      <>
        A <code>.env</code> s ključem za SMS leži u nižem sloju – <code>RUN rm .env</code> ga samo skriva.
      </>,
    )
  if (lines.length === 0) return null
  return (
    <ul className={styles.why} aria-label="Zašto">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  )
}

/** One search hit in words: which layer (and the instruction that made it), or `docker history` / `docker inspect`. */
function hitText(h: SecretExposure, lab: SecretLab): string {
  if (h.where === 'layer' && h.layerIndex !== null) {
    const what = lab.layerTexts[h.layerIndex] ?? ''
    return `sloj ${h.layerIndex + 1} (${what}): ${h.at ?? ''} – ${h.hiddenByWhiteout ? 'skriven oznakom brisanja, ali u slici' : 'vidljiv i u kontejneru'}`
  }
  return mask(h.how, h.secret.value)
}

/** „Tajna u sloju”: how a build-time token gets in, what `ls` shows, and what a search of the image finds. */
export function SecretInspector() {
  const [via, setVia] = useState<Via>('copy-rm')
  const [multi, setMulti] = useState(false)
  const [env, setEnv] = useState(false)
  const [query, setQuery] = useState('')
  const lab = useMemo(() => secretLab(via, multi, env), [via, multi, env])
  const hits = lab.image && query.trim() ? searchImage(lab.image, query) : null
  const n = lab.exposures.length
  const clean = n === 0
  return (
    <SimFrame
      title="Tajna u sloju"
      subtitle={
        <>
          klopa-web treba privatni npm paket, a <code>npm ci</code> zato treba token. Svaka promjena odmah ponovno gradi sliku (dobar redoslijed, seed 42).
        </>
      }
      hint="odaberite kako token ulazi u izgradnju, pa pretražite sliku – npr. „npm_”."
      minHeight={360}
      controls={
        <>
          <ControlGroup title="Kako token ulazi u izgradnju">
            <Segmented label="npm token" value={via} options={VIA_OPTIONS} onChange={setVia} size="sm" />
          </ControlGroup>
          <ControlGroup title="Dockerfile">
            <Toggle label="Višefazna izgradnja" checked={multi} onChange={setMulti} hint="u sliku ide samo nginx + dist" />
            {env ? (
              <Button variant="success" onClick={() => setEnv(false)}>
                Makni .env iz Dockerfilea
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setEnv(true)}>
                Kopiraj .env pa ga obriši
              </Button>
            )}
          </ControlGroup>
        </>
      }
    >
      <div className={styles.secret}>
        <div className={styles.verdictBig} data-ok={clean} role="status">
          <Mark ok={clean} />
          {clean ? 'U konačnoj slici nema tajne.' : `Tajna se iz slike može pročitati na ${plural(n, ['mjestu', 'mjesta', 'mjesta'])}.`}
        </div>
        <Why via={via} multi={multi} env={env} lab={lab} />
        <div className={styles.secretCols}>
          <div>
            <p className={styles.subHead}>Dockerfile</p>
            <ol className={styles.dfList} aria-label="Dockerfile; retci s tajnom su označeni">
              {lab.lines.map((l, i) => (
                <li key={`${i}-${l.text}`} data-hot={l.hot}>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
            <p className={styles.inspHint}>
              Slika: {lab.sizeMB === null ? '—' : fmtMB(lab.sizeMB)} · korisnik {lab.user}
            </p>
          </div>
          <div>
            <p className={styles.subHead}>
              <code>ls</code> u kontejneru
            </p>
            <RoughBox className="k-pinned" stroke="var(--ink-2)" fillColor="var(--term-bg)" fillStyle="solid" pad={2} seed={1851}>
              <pre className={styles.lsBox}>
                {lab.visible.map((p) => (
                  <span key={p} className={lab.visibleSecretAt.includes(p) ? styles.lsSecret : undefined}>
                    {p}
                    {lab.visibleSecretAt.includes(p) ? '   ← tajna!' : ''}
                    {'\n'}
                  </span>
                ))}
              </pre>
            </RoughBox>
            <p className={styles.inspHint}>Ovo vidi proces u kontejneru – spojeni pogled odozgo, bez skrivenih datoteka.</p>
          </div>
        </div>
        <div>
          <p className={styles.subHead}>pretraga slike</p>
          <p className={styles.inspHint}>
            Pretražite slojeve, <code>docker history</code> i <code>docker inspect</code>.
          </p>
          <div className={styles.search}>
            <label className={styles.searchLabel} htmlFor="l08-secret-q">
              traži:
            </label>
            <input id="l08-secret-q" className={styles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="npr. npm_" spellCheck={false} autoComplete="off" />
            {QUICK.map((q) => (
              <Button key={q} size="sm" variant="ghost" onClick={() => setQuery(q)}>
                {q}
              </Button>
            ))}
          </div>
          {hits !== null && (
            <ul className={styles.hits} aria-live="polite">
              {hits.length === 0 ? (
                <li style={{ color: 'var(--green)' }}>
                  <Mark ok /> nema pogodaka za „{query.trim()}”
                </li>
              ) : (
                hits.map((h, i) => (
                  <li key={`${h.how}-${i}`}>
                    <svg className={styles.envSvg} viewBox="0 0 64 46" aria-hidden="true">
                      <Envelope x={4} y={14} w={54} h={30} open dots seed={1805 + i} />
                    </svg>
                    <span>{hitText(h, lab)}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </SimFrame>
  )
}
