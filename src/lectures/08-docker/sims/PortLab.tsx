import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Button, Check, ControlGroup, Cross, DGroup, Diagram, DLabel, Goals, hashSeed, Packet, plural, Rough, RoughBox, Segmented, SimFrame, useSimulation, useWidth } from '../../../kit'
import { buildNow, createBuildLab, curlFromHost, removeContainer, setListenAddr, tryRunContainer, writeInContainer, type BuildLabState, type CurlOutcome } from '../../../engines/build/index.ts'
import styles from '../styles.module.css'

const FILES: [string, string, string] = ['datoteka', 'datoteke', 'datoteka']

/** a container ID that differs per `docker run` (derived from the engine's container id, never random) */
const containerHex = (id: string) => `${hashSeed(`ct:${id}`).toString(16).padStart(8, '0')}${hashSeed(`ct2:${id}`).toString(16).padStart(8, '0')}`.slice(0, 12)

type Bind = '127.0.0.1' | '0.0.0.0'
type Publish = 'none' | '8080:8000' | '8080:80'
type P = [number, number]

const BIND_OPTIONS: { value: Bind; label: string }[] = [
  { value: '127.0.0.1', label: '127.0.0.1 (zadano)' },
  { value: '0.0.0.0', label: '0.0.0.0' },
]
const PUBLISH_OPTIONS: { value: Publish; label: string }[] = [
  { value: 'none', label: 'bez -p' },
  { value: '8080:8000', label: '-p 8080:8000' },
  { value: '8080:80', label: '-p 8080:80' },
]

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  host: { x: number; y: number; w: number; h: number }
  term: { x: number; y: number; w: number; h: number }
  box: { x: number; y: number; w: number; h: number }
  /** the door in the container wall (centre) and which wall: left (wide) or top (narrow) */
  door: P
  vertical: boolean
  sign: P
  gun: { x: number; y: number; w: number; h: number }
  sheet: { x: number; y: number; w: number; h: number }
  /** tray paths */
  out: P
  refusedAt: P
  inside: P
  gunIn: P
  expose: P
  gone: P
}

const WIDE: Geo = {
  W: 820,
  H: 340,
  mono: 13,
  hand: 13,
  host: { x: 8, y: 14, w: 804, h: 316 },
  term: { x: 34, y: 118, w: 190, h: 86 },
  box: { x: 356, y: 58, w: 430, h: 250 },
  door: [356, 180],
  vertical: false,
  sign: [290, 132],
  gun: { x: 580, y: 196, w: 182, h: 76 },
  sheet: { x: 380, y: 92, w: 382, h: 40 },
  out: [226, 180],
  refusedAt: [300, 180],
  inside: [404, 180],
  gunIn: [580, 234],
  expose: [571, 296],
  gone: [571, 190],
}

const NARROW: Geo = {
  W: 340,
  H: 560,
  mono: 14,
  hand: 14,
  host: { x: 4, y: 14, w: 332, h: 540 },
  term: { x: 22, y: 62, w: 200, h: 82 },
  box: { x: 16, y: 236, w: 308, h: 280 },
  door: [120, 236],
  vertical: true,
  sign: [252, 196],
  gun: { x: 124, y: 362, w: 192, h: 76 },
  sheet: { x: 28, y: 458, w: 284, h: 44 },
  out: [120, 146],
  refusedAt: [120, 200],
  inside: [120, 300],
  gunIn: [124, 400],
  expose: [170, 540],
  gone: [170, 380],
}

interface Shot {
  id: number
  outcome: CurlOutcome
}

/** „Vrata u zidu”: klopa-api in a container, `-p` publishes a port, gunicorn must listen on 0.0.0.0; docker rm loses the writable layer. */
export function PortLab() {
  const reduce = useReducedMotion()
  const sim = useSimulation<BuildLabState>({
    init: () => {
      const s = createBuildLab({ preset: 'api-dobar', warm: true })
      setListenAddr(s, '127.0.0.1')
      buildNow(s)
      return s
    },
    step: () => undefined,
    autoStart: false,
  })
  const [bind, setBind] = useState<Bind>('127.0.0.1')
  const [publish, setPublish] = useState<Publish>('8080:8000')
  const [log, setLog] = useState<{ id: number; text: string; tone: 'cmd' | 'ok' | 'bad' | 'dim' }[]>([])
  const [shot, setShot] = useState<Shot | null>(null)
  const [seen, setSeen] = useState({ ok: false, reset: false, lost: false })
  const [lost, setLost] = useState<number | null>(null)
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 760
  const G = wide ? WIDE : NARROW
  const s = sim.state
  const c = s.containers.find((x) => x.running) ?? null
  const counter = useRef(0)
  const nextId = () => ++counter.current
  const say = (lines: { text: string; tone: 'cmd' | 'ok' | 'bad' | 'dim' }[]) => setLog((old) => [...old, ...lines.map((l) => ({ ...l, id: nextId() }))].slice(-6))

  const changeBind = (b: Bind) => {
    setBind(b)
    sim.mutate((x) => {
      setListenAddr(x, b)
      buildNow(x)
    })
    say([
      { text: `# Dockerfile: CMD ["gunicorn", ${b === '0.0.0.0' ? '"--bind", "0.0.0.0:8000", ' : ''}"klopa.wsgi"] → docker build (1 s)`, tone: 'dim' },
      ...(c ? [{ text: '# kontejner i dalje radi iz stare slike: docker rm -f, pa docker run', tone: 'dim' as const }] : []),
    ])
  }
  const changePublish = (p: Publish) => {
    setPublish(p)
    if (c) say([{ text: '# -p se zadaje pri pokretanju: vrijedi tek za novi kontejner', tone: 'dim' }])
  }
  const run = () => {
    const p: [number, number][] = publish === 'none' ? [] : publish === '8080:8000' ? [[8080, 8000]] : [[8080, 80]]
    const out: { err: string | null; id: string } = { err: null, id: '' }
    sim.mutate((x) => {
      const r = tryRunContainer(x, { publish: p, name: 'klopa-api' })
      if ('error' in r) out.err = r.error
      else out.id = r.container.id
    })
    setLost(null)
    setShot(null)
    say([{ text: `$ docker run -d --name klopa-api ${p.map(([h, cp]) => `-p ${h}:${cp} `).join('')}klopa-api:1.3.2`, tone: 'cmd' }, out.err ? { text: out.err, tone: 'bad' } : { text: `${containerHex(out.id)}…`, tone: 'dim' }])
  }
  const rm = () => {
    if (!c) return
    const out = { n: 0 }
    sim.mutate((x) => {
      out.n = removeContainer(x, c.id)
    })
    const n = out.n
    setLost(n)
    setShot(null)
    if (n > 0) setSeen((v) => ({ ...v, lost: true }))
    say([
      { text: '$ docker rm -f klopa-api', tone: 'cmd' },
      { text: n > 0 ? `klopa-api  (zapisivi sloj obrisan: ${plural(n, FILES)})` : 'klopa-api', tone: n > 0 ? 'bad' : 'dim' },
    ])
  }
  const curl = () => {
    const out: { res: { outcome: CurlOutcome; text: string } } = { res: { outcome: 'refused', text: '' } }
    sim.mutate((x) => {
      out.res = curlFromHost(x, 8080)
    })
    const res = out.res
    setShot({ id: nextId(), outcome: res.outcome })
    if (res.outcome === 'ok') setSeen((v) => ({ ...v, ok: true }))
    if (res.outcome === 'reset') setSeen((v) => ({ ...v, reset: true }))
    say([
      { text: '$ curl -i localhost:8080/healthz', tone: 'cmd' },
      { text: res.text, tone: res.outcome === 'ok' ? 'ok' : 'bad' },
    ])
  }
  const write = (path: string) => {
    if (!c) return
    sim.mutate((x) => void writeInContainer(x, c.id, path, 0.1))
    // the image runs as USER 10001: it may write to /tmp, but editing a root-owned file from the image (copy-up) needs -u root
    const asRoot = path.startsWith('/app/') ? '-u root ' : ''
    say([{ text: `$ docker exec ${asRoot}klopa-api sh -c 'echo … >> ${path}'`, tone: 'cmd' }])
  }

  const pub = c?.publish[0] ?? null
  const listen = c?.image.config.listen ?? null
  const local = listen?.addr === '127.0.0.1'
  // the tray's path for the last curl
  const path: P[] | null = shot ? (shot.outcome === 'refused' ? [G.out, G.refusedAt] : shot.outcome === 'reset' ? [G.out, G.door, G.inside] : [G.out, G.door, G.inside, G.gunIn]) : null
  const end = path ? path[path.length - 1] : null
  const dur = path ? Math.max(0.6, path.length * 0.45) : 0

  return (
    <SimFrame
      title="Vrata u zidu"
      subtitle={
        <>
          klopa-api (gunicorn na portu 8000) u kontejneru na Ivinom laptopu. Svaki <code>docker run</code> pokreće novi kontejner iz iste slike.
        </>
      }
      hint={
        <>
          dobijte odgovor <code>200 OK</code> na <code>localhost:8080</code>, a zatim zapišite datoteku u kontejner i obrišite ga.
        </>
      }
      minHeight={360}
      controls={
        <>
          <ControlGroup title="Slika (Dockerfile)">
            <Segmented label="gunicorn --bind" value={bind} options={BIND_OPTIONS} onChange={changeBind} size="sm" />
          </ControlGroup>
          <ControlGroup title="Kontejner">
            <Segmented label="docker run" value={publish} options={PUBLISH_OPTIONS} onChange={changePublish} size="sm" />
            {c ? (
              <Button variant="danger" onClick={rm}>
                docker rm -f
              </Button>
            ) : (
              <Button variant="primary" onClick={run}>
                docker run
              </Button>
            )}
          </ControlGroup>
          <ControlGroup title="S domaćina i iznutra">
            <Button variant="primary" onClick={curl}>
              curl localhost:8080
            </Button>
            <div className={styles.ctlRow}>
              <Button size="sm" onClick={() => write('/tmp/narudzbe.log')} disabled={!c}>
                Zapiši /tmp/narudzbe.log
              </Button>
              <Button size="sm" onClick={() => write('/app/manage.py')} disabled={!c}>
                Uredi manage.py
              </Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <div className={styles.statsGrid} style={{ marginTop: 0 }}>
          <Goals
            goals={[
              { text: 'Dobijte HTTP 200 OK na localhost:8080', done: seen.ok },
              { text: 'Izazovite „Connection reset by peer”', done: seen.reset },
              { text: 'Zapišite datoteku u kontejner pa ga obrišite', done: seen.lost },
            ]}
          />
          <div>
            <p className={styles.subHead}>Ivin terminal</p>
            <RoughBox className="k-pinned" stroke="var(--ink-2)" fillColor="var(--term-bg)" fillStyle="solid" pad={2} seed={7051}>
              <pre className={styles.curlOut} aria-live="polite">
                {log.length === 0 ? (
                  <span className={styles.dim}>$ _</span>
                ) : (
                  log.map((l) => (
                    <div key={l.id} className={l.tone === 'cmd' ? styles.prompt : l.tone === 'ok' ? styles.ok : l.tone === 'bad' ? styles.bad : styles.dim}>
                      {l.text}
                    </div>
                  ))
                )}
              </pre>
            </RoughBox>
          </div>
        </div>
      }
    >
      <div ref={ref} className={styles.port}>
        <div style={{ maxWidth: wide ? 880 : 420, margin: '0 auto', width: '100%' }}>
          <Diagram
            width={G.W}
            height={G.H}
            label={`Domaćin s terminalom i ${c ? `kontejnerom klopa-api; ${pub ? `port ${pub.host} preslikan na ${pub.container}` : 'bez objavljenog porta'}; gunicorn sluša na ${listen?.addr}:${listen?.port}` : 'bez kontejnera'}.`}
          >
            <DGroup x={G.host.x} y={G.host.y} w={G.host.w} h={G.host.h} label="domaćin: Ivin laptop" dashed={false} />
            {/* the terminal on the host */}
            <rect x={G.term.x} y={G.term.y} width={G.term.w} height={G.term.h} rx={6} style={{ fill: 'var(--term-bg)' }} />
            <Rough shape={{ k: 'rect', x: G.term.x, y: G.term.y, w: G.term.w, h: G.term.h }} seed={7101} strokeWidth={1.6} />
            <text x={G.term.x + 12} y={G.term.y + 32} className="k-svg-mono" style={{ fontSize: G.mono + 1, fill: 'var(--term-prompt)' }}>
              $ curl
            </text>
            <text x={G.term.x + 12} y={G.term.y + 58} className="k-svg-mono" style={{ fontSize: G.mono + 1, fill: 'var(--term-ink)' }}>
              localhost:8080
            </text>

            {c ? (
              <g>
                {/* the container: a food box with a lid */}
                <Rough shape={{ k: 'rect', x: G.box.x, y: G.box.y, w: G.box.w, h: G.box.h }} seed={7201} strokeWidth={1.9} fillColor={shot?.outcome === 'reset' ? 'var(--red)' : 'var(--hl-blue-ink)'} hachureAngle={-41} hachureGap={11} fillWeight={0.6} />
                <rect x={G.box.x + 2} y={G.box.y + 2} width={G.box.w - 4} height={26} style={{ fill: 'var(--paper)' }} />
                <Rough shape={{ k: 'line', x1: G.box.x, y1: G.box.y + 28, x2: G.box.x + G.box.w, y2: G.box.y + 28 }} seed={7203} strokeWidth={1.6} />
                <text x={G.box.x + 12} y={G.box.y + 20} className="k-svg-mono" style={{ fontSize: G.mono, fontWeight: 700 }}>
                  kontejner klopa-api · 1.3.2
                </text>
                {/* the door: a gap in the wall when a port is published */}
                {pub && (
                  <g>
                    {G.vertical ? <rect x={G.door[0] - 22} y={G.door[1] - 4} width={44} height={8} style={{ fill: 'var(--paper)' }} /> : <rect x={G.door[0] - 4} y={G.door[1] - 22} width={8} height={44} style={{ fill: 'var(--paper)' }} />}
                    {/* narrow: above the wall, right of the door – inside the box is where the curl's verdict goes */}
                    <DLabel x={G.vertical ? G.door[0] + 28 : G.door[0] + 12} y={G.vertical ? G.door[1] - 10 : G.door[1] + 38} text={`:${pub.container}`} mono size={G.mono} anchor="start" tone={pub.container === listen?.port ? 'green' : 'bad'} bold />
                    <Rough shape={{ k: 'rect', x: G.sign[0] - 62, y: G.sign[1] - 20, w: 124, h: 30 }} seed={7301} strokeWidth={1.1} stroke="var(--ink-2)" fillColor="var(--note-yellow)" fillStyle="solid" />
                    <text x={G.sign[0]} y={G.sign[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: G.mono + 1, fontWeight: 700, fill: 'var(--note-ink)' }}>
                      {pub.host} → {pub.container}
                    </text>
                  </g>
                )}
                {!pub && <DLabel x={G.sign[0]} y={G.sign[1]} text="zid bez vrata" size={G.hand} tone="bad" />}
                {/* writable layer */}
                <Rough shape={{ k: 'rect', x: G.sheet.x, y: G.sheet.y, w: G.sheet.w, h: G.sheet.h }} seed={7401} strokeWidth={1.5} stroke="var(--green)" dash="6 5" fillColor="var(--paper)" fillStyle="solid" />
                <text x={G.sheet.x + 10} y={G.sheet.y + G.sheet.h / 2 + 5} className="k-svg-mono" style={{ fontSize: G.mono, fill: c.writable.length ? 'var(--green)' : 'var(--ink-3)', fontWeight: 600 }}>
                  {c.writable.length ? c.writable.map((f) => `${f.path.replace('/app/', '')}${f.copyUp ? ' (kopija)' : ''}`).join(', ') : 'zapisivi sloj: prazan'}
                </text>
                {/* gunicorn and where it listens */}
                <Rough shape={{ k: 'rect', x: G.gun.x, y: G.gun.y, w: G.gun.w, h: G.gun.h }} seed={7501} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
                <text x={G.gun.x + 12} y={G.gun.y + 28} className="k-svg-mono" style={{ fontSize: G.mono + 1, fontWeight: 700 }}>
                  gunicorn
                </text>
                <text x={G.gun.x + 12} y={G.gun.y + 54} className="k-svg-mono" style={{ fontSize: G.mono, fill: local ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                  sluša: {listen?.addr}:{listen?.port}
                </text>
                {local && <DLabel x={G.gun.x + G.gun.w / 2} y={G.gun.y - 10} text="prima samo veze iznutra" size={G.hand} tone="bad" />}
                <DLabel x={G.expose[0]} y={G.expose[1]} text="EXPOSE 8000 = samo bilješka" size={G.hand} tone="neutral" />
              </g>
            ) : (
              <g>
                <Rough shape={{ k: 'rect', x: G.box.x, y: G.box.y, w: G.box.w, h: G.box.h }} seed={7201} strokeWidth={1.4} stroke="var(--ink-3)" dash="7 6" />
                <DLabel x={G.gone[0]} y={G.gone[1]} text={lost === null ? 'nema kontejnera – pritisnite „docker run”' : 'kontejner obrisan'} size={G.hand} />
                {lost !== null && lost > 0 && <DLabel x={G.gone[0]} y={G.gone[1] + 28} text={`izgubljeno iz zapisivog sloja: ${plural(lost, FILES)}`} size={G.hand} tone="bad" bold />}
              </g>
            )}

            {/* one curl = one tray */}
            {shot && path && end && (
              <g key={shot.id}>
                <Packet path={path} duration={dur} r={6} />
                <motion.g initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : dur, duration: 0.2 }}>
                  {/* the answer is noted above gunicorn's box (never over its lettering); errors where the tray stopped */}
                  {shot.outcome === 'ok' ? <Check x={G.gun.x + 12} y={G.gun.y - 20} size={10} seed={7601} /> : <Cross x={end[0] + 4} y={end[1] - 16} size={9} seed={7603} />}
                  <DLabel
                    x={shot.outcome === 'ok' ? G.gun.x + 30 : end[0] + 18}
                    y={shot.outcome === 'ok' ? G.gun.y - 12 : end[1] - 22}
                    text={shot.outcome === 'ok' ? '200 OK' : shot.outcome === 'reset' ? 'reset' : 'refused'}
                    mono
                    size={G.mono}
                    anchor="start"
                    tone={shot.outcome === 'ok' ? 'ok' : 'bad'}
                    bold
                  />
                </motion.g>
              </g>
            )}
          </Diagram>
        </div>
      </div>
    </SimFrame>
  )
}
