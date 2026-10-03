/**
 * Code as cargo paperwork: a YAML manifest on a shipping label, and the control tower's console.
 */
import { useEffect, useId, useState } from 'react'
import { tokenizeYaml } from './yaml-tokens'
import cs from './code.module.css'

const YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: klopa-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: klopa
  template:
    metadata:
      labels:
        app: klopa
    spec:
      containers:
        - name: api
          image: registry.klopa.example/klopa-api:1.4.0
          ports:
            - containerPort: 8080`

const LINES = YAML.split('\n')
const PREVIEW = 9

export function CodeBlock() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(YAML)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const shown = open ? LINES : LINES.slice(0, PREVIEW)
  return (
    <figure className={cs.manifest}>
      <i className={cs.br} data-c="tl" aria-hidden="true" />
      <i className={cs.br} data-c="tr" aria-hidden="true" />
      <i className={cs.br} data-c="bl" aria-hidden="true" />
      <i className={cs.br} data-c="br" aria-hidden="true" />
      <figcaption className={cs.label}>
        <span className={cs.stencilTitle}>
          deployment.yaml
          <small>klopa-api · YAML · {LINES.length} redaka</small>
        </span>
        <button type="button" className={cs.copy} onClick={copy} aria-live="polite">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {copied ? (
              <path d="M2.5 8.5 6 12l7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" />
            ) : (
              <>
                <rect x="5" y="5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M11 3V2H2v9h1" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </>
            )}
          </svg>
          {copied ? 'Kopirano' : 'Kopiraj'}
        </button>
      </figcaption>
      <div className={cs.codePanel}>
        <div className={cs.codeWrap} data-open={open ? '1' : '0'}>
          <pre className={cs.pre} id={id} tabIndex={0} aria-label="YAML Deployment klopa-api">
            <code>
              {shown.map((line, i) => (
                <span key={i} className={cs.line}>
                  <span className={cs.ln} aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {tokenizeYaml(line).map((tk, k) => (
                    <span key={k} className={cs[tk.t]}>
                      {tk.v}
                    </span>
                  ))}
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
          {!open && <div className={cs.fade} aria-hidden="true" />}
        </div>
        <button type="button" className={cs.expand} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={open ? 'm3 10 5-5 5 5' : 'm3 6 5 5 5-5'} fill="none" stroke="currentColor" strokeWidth="2.4" />
          </svg>
          {open ? 'Sakrij dio koda' : `Prikaži cijeli kod · još ${LINES.length - PREVIEW} redaka`}
        </button>
      </div>
    </figure>
  )
}

const PODS = [
  ['klopa-api-6c9f7b8d4-2xk8p', '1/1', 'Running', '0', '14m'],
  ['klopa-api-6c9f7b8d4-q7wzn', '1/1', 'Running', '0', '14m'],
  ['klopa-api-6c9f7b8d4-h5r2m', '0/1', 'CrashLoopBackOff', '6 (31s ago)', '9m'],
  ['klopa-api-7f5d9c6b8-tn4vd', '0/1', 'Pending', '0', '42s'],
]

export function TerminalBlock() {
  const pad = (s: string, n: number) => s.padEnd(n, ' ')
  return (
    <figure className={cs.term}>
      <figcaption className={cs.termBar}>
        <span className={cs.lamps} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        kontrolni toranj · terminal
      </figcaption>
      <div className={cs.termScroll}>
        <pre className={cs.termPre} tabIndex={0} aria-label="Izlaz naredbe kubectl get pods">
          <span className={cs.prompt}>$ </span>
          <span className={cs.cmd}>kubectl get pods -l app=klopa</span>
          {'\n'}
          <span className={cs.head}>{`${pad('NAME', 28)}${pad('READY', 7)}${pad('STATUS', 18)}${pad('RESTARTS', 13)}AGE`}</span>
          {'\n'}
          {PODS.map(([name, ready, status, restarts, age]) => (
            <span key={name}>
              {pad(name, 28)}
              {pad(ready, 7)}
              <span className={status === 'Running' ? cs.sOk : status === 'Pending' ? cs.sWarn : cs.sErr}>{pad(status, 18)}</span>
              {pad(restarts, 13)}
              {age}
              {'\n'}
            </span>
          ))}
          <span className={cs.prompt}>$ </span>
          <span className={cs.caret} aria-hidden="true" />
        </pre>
      </div>
      <p className={cs.termHint} aria-hidden="true">
        Povucite ulijevo za stupce RESTARTS i AGE →
      </p>
    </figure>
  )
}
