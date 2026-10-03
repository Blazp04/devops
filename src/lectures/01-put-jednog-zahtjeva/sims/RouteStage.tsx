/**
 * The route drawing shared by the localhost stepper, the step-by-step journey and the flagship lab:
 * Petra with her phone · the DNS resolver as a phone book · the internet as a cloud · the server (VPS) behind its
 * firewall wall with doors :443 / :8000, the proxy (Caddy) and the app (gunicorn) — or Lana's flat behind a home
 * router (NAT). A pure function of the trace and the playhead: the tray (= the request) is drawn where the
 * playhead says, travelling along pencil roads at constant speed.
 */
import { Cloud, DiagramDefs, Laptop, Lana, MiniLaptop, Petra, Rough, ServerFace, SvgStamp, diagramIds, pointAt } from '../../../kit'
import { IP, PLACES, type Trace } from '../model'
import { clockPlace, routePath, spotPoint, trayPoint, type Playhead, type StageGeo } from '../geometry'
import { AppBox, FirewallWall, HollowClock, HostFrame, PhoneBook, ProxyBox, RefusedBurst, Road, RouterDoodle, TraySprite } from './parts'

interface RouteStageProps {
  geo: StageGeo
  trace: Trace
  head: Playhead
  /** unique prefix for this drawing's defs (tray symbol, hatching) */
  idPrefix: string
  ariaLabel: string
  /** the scene without a tray or an active route (an explainer's first step) */
  quiet?: boolean
}

export function RouteStage({ geo: g, trace, head, idPrefix, ariaLabel, quiet }: RouteStageProps) {
  const ids = diagramIds(idPrefix)
  const { scenario, client, faults, place } = trace.params
  const f = g.font
  const seg = trace.segs[Math.min(head.seg, trace.segs.length - 1)]
  const finished = head.done
  const failed = trace.outcome !== 'ok'
  const laptop = scenario === 'laptop'
  const usesDns = !laptop && client === 'petra'
  const port = scenario === 'proxy' ? 443 : 8000
  const fromPetra = client !== 'lana-local'
  // the failure becomes visible once the playhead reaches the segment that fails (or the end)
  const failSeg = trace.segs.findIndex((s) => s.tone === 'bad')
  const failVisible = failed && failSeg >= 0 && (head.seg > failSeg || (head.seg === failSeg && head.frac > 0.98) || finished)
  const waiting = seg?.kind === 'wait' && !finished
  const lanaPath = routePath('lana-out', scenario, g)
  const failPt = !trace.failAt ? null : client === 'lana-local' ? lanaPath[lanaPath.length - 1] : spotPoint(trace.failAt, scenario, g)
  const clock = trace.failAt ? clockPlace(trace.failAt, g) : null
  const petraMood = finished && fromPetra ? (failed ? 'worry' : 'grin') : 'smile'
  const lanaMood = finished && !fromPetra ? (failed ? 'worry' : 'grin') : 'smile'

  // tray position and look
  const tp = trayPoint(trace, head.seg, head.frac, g, pointAt)
  const endTone = trace.outcome === 'ok' ? 'ok' : 'bad'
  const trayTone = finished ? (trace.outcome === 'timeout' ? 'req' : endTone) : (seg?.tone ?? 'req')
  // Lana's finished local request: the result line under the drawing says it (the label would cover the loop / ssh note)
  const trayLabel = finished ? (trace.outcome === 'timeout' || client === 'lana-local' ? undefined : seg?.label) : seg?.kind === 'wait' ? undefined : seg?.label

  // roads for this scenario
  const roads: [number, ReturnType<typeof routePath>][] = []
  if (usesDns) roads.push([1, routePath('dns-out', scenario, g)])
  if (client === 'petra') {
    if (laptop) roads.push([2, routePath('to-private', scenario, g)])
    else if (faults.stale) roads.push([3, routePath('to-old', scenario, g)])
    else roads.push([4, routePath(scenario === 'proxy' ? 'to-proxy' : 'to-app', scenario, g)])
  }
  if (!laptop && scenario === 'proxy') roads.push([5, routePath('proxy-app', scenario, g)])
  if (client === 'lana-local') roads.push([6, routePath('lana-out', scenario, g)])
  if (client === 'petra-localhost') roads.push([7, [...g.loopOut, ...g.loopBack.slice(1)]])
  const activeRoute = !quiet && !finished && seg?.route ? routePath(seg.route, scenario, g) : null

  const hostTitle = laptop ? 'Lanin stan · kućni Wi-Fi' : `VPS · ${PLACES[place].label}`
  const bind = faults.loopbackOnly ? '127.0.0.1:8000' : '0.0.0.0:8000'
  const nxStamp = failVisible && trace.outcome === 'nxdomain'

  return (
    <svg viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <DiagramDefs id={idPrefix} />

      {/* ---------- the cloud and the roads ---------- */}
      <Cloud x={g.cloud.x} y={g.cloud.y} w={g.cloud.w} h={g.cloud.h} seed={9901} />
      <text x={g.netLabel[0]} y={g.netLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
        internet
      </text>
      {roads.map(([k, pts]) => (
        <Road key={k} pts={pts} seed={9910 + k} faint />
      ))}
      {activeRoute && <Road key={`a${head.seg}`} pts={activeRoute} seed={9930 + head.seg} active />}

      {/* ---------- DNS resolver (phone book) ---------- */}
      {!laptop && (
        <g>
          <PhoneBook
            box={g.book}
            mono={f.mono}
            lines={faults.nxdomain ? ['klopa.example', nxStamp ? '' : 'ime ne postoji'] : ['klopa.example', `→ ${faults.stale ? IP.old : IP.vps}`]}
            struck={faults.nxdomain}
            warn={faults.stale ? 'stara' : undefined}
          />
          <text x={g.bookLabel[0]} y={g.bookLabel[1]} textAnchor={g.bookAnchor} className="k-svg-hand" style={{ fontSize: f.hand }}>
            DNS razrješivač
          </text>
          <text x={g.bookIp[0]} y={g.bookIp[1]} textAnchor={g.bookAnchor} className="k-svg-mono" style={{ fontSize: f.mono, fill: 'var(--ink-2)' }}>
            {IP.resolver}
          </text>
          {nxStamp && <SvgStamp x={g.book.x + g.book.w / 2} y={g.book.y + g.book.h * 0.62} text="NXDOMAIN" size={15} />}
        </g>
      )}

      {/* ---------- the old address (stale DNS record) ---------- */}
      {!laptop && faults.stale && (
        <g>
          <Rough shape={{ k: 'rect', x: g.old.x, y: g.old.y, w: g.old.w, h: g.old.h }} seed={9951} strokeWidth={1.5} stroke="var(--ink-3)" dash="5 5" />
          <text x={g.old.x + g.old.w / 2} y={g.old.y + 27} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f.mono }}>
            {IP.old}
          </text>
          <text x={g.old.x + g.old.w / 2} y={g.old.y + 53} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
            stara adresa
          </text>
        </g>
      )}

      {/* ---------- the server or Lana's flat ---------- */}
      <HostFrame box={g.host} seed={9960} />
      <text x={laptop ? g.titleLaptop[0] : g.title[0]} y={laptop ? g.titleLaptop[1] : g.title[1]} className="k-svg-display" style={{ fontSize: f.title }}>
        {hostTitle}
      </text>
      {!laptop && (
        <text x={g.titleMono[0]} y={g.titleMono[1]} className="k-svg-mono" style={{ fontSize: f.mono, fill: 'var(--ink-2)' }}>
          {IP.vps} · 2 vCPU · 2 GB
        </text>
      )}

      {laptop ? (
        <g>
          <RouterDoodle box={g.router} />
          <text x={g.routerLabel.x} y={g.routerLabel.y} textAnchor={g.routerLabel.anchor} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
            usmjerivač (NAT)
          </text>
          <Laptop
            x={g.laptop.x}
            y={g.laptop.y}
            w={g.laptop.w}
            seed={9971}
            screen={
              <g>
                <text x={9} y={24} className="k-svg-mono" style={{ fontSize: f.mono, fill: 'var(--term-ink)' }}>
                  gunicorn
                </text>
                <g transform={`translate(${g.laptop.w * 0.72} 44)`}>
                  <ServerFace mood={faults.appDown ? 'dead' : 'calm'} r={12} />
                </g>
              </g>
            }
          />
          <text x={g.laptopLabel[0]} y={g.laptopLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand }}>
            Lanin laptop
          </text>
          <text x={g.laptopIp[0]} y={g.laptopIp[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f.mono }}>
            {IP.laptop} · <tspan style={{ fill: 'var(--red)' }}>privatna</tspan>
          </text>
          <text x={g.laptopBind[0]} y={g.laptopBind[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f.mono, fill: faults.appDown ? 'var(--red)' : 'var(--ink-2)' }}>
            {faults.appDown ? 'gunicorn ne radi' : `gunicorn ${bind}`}
          </text>
          <Lana x={g.lana.x} y={g.lana.y} scale={g.lana.s} holding="mug" mood={lanaMood} />
          {client === 'lana-local' && (
            <text x={g.lanaLoopLabel[0]} y={g.lanaLoopLabel[1]} textAnchor="middle" className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
              127.0.0.1 = ovo računalo
            </text>
          )}
        </g>
      ) : (
        <g>
          <FirewallWall
            wall={g.wall}
            at={g.wallAt}
            from={g.wallFrom}
            to={g.wallTo}
            doors={[
              { pos: g.wall === 'left' ? g.door443[1] : g.door443[0], open: port === 443 && !faults.drop, dropped: port === 443 && faults.drop },
              { pos: g.wall === 'left' ? g.door8000[1] : g.door8000[0], open: port === 8000 && !faults.drop, dropped: port === 8000 && faults.drop },
            ]}
          />
          <text x={g.fwLabel[0]} y={g.fwLabel[1]} textAnchor={g.fwAnchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: faults.drop ? 'var(--red)' : 'var(--ink-2)' }}>
            {faults.drop ? 'vatrozid: DROP' : 'vatrozid'}
          </text>
          <text x={g.port443Label[0]} y={g.port443Label[1]} textAnchor={g.portAnchor} className="k-svg-mono" style={{ fontSize: f.mono, fill: port === 443 ? 'var(--ink)' : 'var(--ink-3)' }}>
            :443
          </text>
          <text x={g.port8000Label[0]} y={g.port8000Label[1]} textAnchor={g.portAnchor} className="k-svg-mono" style={{ fontSize: f.mono, fill: port === 8000 ? 'var(--ink)' : 'var(--ink-3)' }}>
            :8000
          </text>
          {scenario === 'proxy' && (
            <g>
              <ProxyBox box={g.proxy} name={f.name} mono={f.mono} />
              <text x={g.loLabel.x} y={g.loLabel.y} textAnchor={g.loLabel.anchor} className="k-svg-mono k-dhalo" style={{ fontSize: f.mono, fill: 'var(--pen)' }}>
                127.0.0.1
              </text>
            </g>
          )}
          <AppBox
            box={g.app}
            face={g.appFace}
            name={f.name}
            mono={f.mono}
            hand={f.hand}
            bind={bind}
            down={faults.appDown}
            note={faults.loopbackOnly && scenario === 'vps' ? 'sluša samo iznutra' : undefined}
          />
          {client === 'lana-local' && (
            <g>
              <MiniLaptop x={g.sshLaptop.x} y={g.sshLaptop.y} w={g.sshLaptop.w} h={g.sshLaptop.h} seed={9981} />
              <text x={g.sshLabel[0]} y={g.sshLabel[1]} className="k-svg-hand" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
                Lana · ssh
              </text>
            </g>
          )}
          {failVisible && trace.outcome === 'bad-gateway' && (
            <g>
              <RefusedBurst x={g.appTop[0]} y={g.appTop[1] - 4} r={13} />
              <SvgStamp x={g.proxy.x + g.proxy.w / 2} y={g.proxy.y + g.proxy.h + 18} text="502" size={16} />
            </g>
          )}
        </g>
      )}

      {/* ---------- Petra ---------- */}
      <Petra x={g.petra.x} y={g.petra.y} scale={g.petra.s} holding="phone" mood={petraMood} />
      <text x={g.petraLabel[0]} y={g.petraLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand }}>
        Petra
      </text>
      <text x={g.petraIp[0]} y={g.petraIp[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: f.mono, fill: 'var(--ink-2)' }}>
        {IP.petra}
      </text>
      {client === 'petra-localhost' && (
        <text x={g.loopLabel.x} y={g.loopLabel.y} textAnchor={g.loopLabel.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: 'var(--pen)' }}>
          {g.loopLabel.lines.map((l, i) => (
            <tspan key={i} x={g.loopLabel.x} dy={i ? f.hand * 1.05 : 0}>
              {l}
            </tspan>
          ))}
        </text>
      )}

      {/* ---------- failure glyphs ---------- */}
      {failPt && trace.outcome === 'refused' && failVisible && <RefusedBurst x={failPt[0] + (trace.failAt === 'door8000' && g.wall === 'left' ? -6 : 0)} y={failPt[1] - (g.wall === 'top' && trace.failAt === 'door8000' ? 6 : 0)} r={15} />}
      {clock && trace.outcome === 'timeout' && (waiting || finished) && (
        <g>
          <HollowClock x={clock.clock[0]} y={clock.clock[1]} r={17} progress={finished ? 1 : head.frac} expired={finished} />
          {finished && (
            <text x={clock.label[0]} y={clock.label[1]} textAnchor={clock.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: 'var(--red)' }}>
              istek vremena
            </text>
          )}
        </g>
      )}

      {/* ---------- the request ---------- */}
      {seg && !quiet && (
        <TraySprite
          x={tp[0]}
          y={tp[1]}
          w={g.tray}
          tone={trayTone}
          label={trayLabel}
          size={f.hand}
          trayHref={ids.tray}
          faded={finished && trace.outcome === 'timeout'}
          labelDy={-g.tray * 0.62}
        />
      )}
    </svg>
  )
}
